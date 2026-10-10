import { z } from 'zod';
import { type Endpoint } from './http.js';
import { type Db, type Row, one, audit } from './db.js';
import { uuid, area, pageQuery, likePattern, queryBool, version } from './schemas.js';
import { projectScope } from './permissions.js';
import { invariant } from './errors.js';
import { xlsxFile } from './xlsx.js';
import {
  premiseKinds,
  templateHeaders,
  kindLabels,
  projectZones,
  floorAllowed,
  readPremisesWorkbook,
  planPremisesImport,
  applyPremisesPlan,
} from './premises.js';
/** Xonadonlar (Bosqich 3): ro'yxat, CRUD, arxiv va Excel import. Ruxsat zonalar bilan bir xil: projects.read / projects.write. */
export function premiseRoutes(add: (r: Endpoint) => void) {
  const params = z.strictObject({ id: uuid, premise_id: uuid });
  const input = {
    number: z.string().trim().min(1).max(20),
    kind: z.enum(premiseKinds),
    zone_id: uuid.nullable(),
    floor: z.number().int().min(-10).max(500).nullable(),
    rooms: z.number().int().min(0).max(50).nullable(),
    area_m2: area,
  };
  // Zona shu obyektniki bo'lishi va qavat blok qavatlaridan oshmasligi.
  async function checkPlace(db: Db, actor: Row, projectId: string, body: Row) {
    const zones = await projectZones(db, actor, projectId);
    invariant(
      body.zone_id === null || zones.some((z) => z.id === body.zone_id),
      'ZONE_NOT_FOUND',
      400,
    );
    invariant(floorAllowed(zones, body.zone_id, body.floor), 'FLOOR_ABOVE_BLOCK', 400);
  }
  const lockPremise = async (db: Db, actor: Row, p: Row) =>
    one(db, 'SELECT * FROM premises WHERE tenant_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE', [
      actor.tenant_id,
      p.id,
      p.premise_id,
    ]);
  add({
    method: 'GET',
    path: '/v1/projects/:id/premises',
    summary:
      'Obyekt xonadonlari; q — raqam; block_id (yoki none — bloksiz), floor, kind, archived filtrlari; jami soni va maydoni filtr bo‘yicha serverda',
    permission: 'projects.read',
    params: z.strictObject({ id: uuid }),
    query: pageQuery.extend({
      q: z.string().trim().max(20).optional(),
      block_id: z.union([uuid, z.literal('none')]).optional(),
      floor: z.coerce.number().int().min(-10).max(500).optional(),
      kind: z.enum(premiseKinds).optional(),
      archived: queryBool.default(false),
    }),
    handler: async ({ db, actor, params, query }) => {
      await projectScope(db, actor, params.id);
      const where = `p.tenant_id=$1 AND p.project_id=$2 AND (p.archived_at IS NOT NULL)=$3
        AND ($4::text IS NULL OR p.number ILIKE $4 ESCAPE '\\')
        AND ($5::text IS NULL OR ($5='none' AND p.block_zone_id IS NULL) OR p.block_zone_id::text=$5)
        AND ($6::int IS NULL OR p.floor=$6) AND ($7::text IS NULL OR p.kind=$7)`;
      const args = [
        actor.tenant_id,
        params.id,
        query.archived,
        query.q ? likePattern(query.q) : null,
        query.block_id ?? null,
        query.floor ?? null,
        query.kind ?? null,
      ];
      const items = (
        await db.query(
          `SELECT p.*,z.name zone_name,z.kind zone_kind,b.name block_name FROM premises p
             LEFT JOIN zones z ON z.tenant_id=p.tenant_id AND z.id=p.zone_id
             LEFT JOIN zones b ON b.tenant_id=p.tenant_id AND b.id=p.block_zone_id
           WHERE ${where}
           ORDER BY b.name NULLS FIRST,p.block_zone_id NULLS FIRST,p.floor NULLS FIRST,length(p.number),p.number,p.id
           LIMIT $8 OFFSET $9`,
          [...args, query.limit, query.offset],
        )
      ).rows;
      const totals = await one(
        db,
        `SELECT count(*)::int total_count,coalesce(sum(p.area_m2),0)::numeric(20,2)::text total_area_m2 FROM premises p WHERE ${where}`,
        args,
      );
      return { items, ...totals };
    },
  });
  add({
    method: 'POST',
    path: '/v1/projects/:id/premises',
    summary:
      'Xonadon yaratish; raqam blok ichida (blok yo‘q bo‘lsa obyekt ichida) takrorlanmaydi — PREMISE_NUMBER_CONFLICT',
    permission: 'projects.write',
    params: z.strictObject({ id: uuid }),
    body: z.strictObject(input),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      await projectScope(db, actor, params.id);
      await checkPlace(db, actor, params.id, body);
      const row = await one(
        db,
        'INSERT INTO premises(tenant_id,project_id,zone_id,number,kind,floor,rooms,area_m2,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
        [
          actor.tenant_id,
          params.id,
          body.zone_id,
          body.number,
          body.kind,
          body.floor,
          body.rooms,
          body.area_m2,
          actor.id,
        ],
      );
      await audit(db, actor, 'premise.create', row.id, { project_id: params.id });
      return row;
    },
  });
  add({
    method: 'PATCH',
    path: '/v1/projects/:id/premises/:premise_id',
    summary: 'Xonadonni to‘liq almashtirish (version bilan); arxivlangan xonadon tahrirlanmaydi',
    permission: 'projects.write',
    params,
    body: z.strictObject({ version, ...input }),
    idempotent: true,
    handler: async ({ db, actor, params: p, body }) => {
      await projectScope(db, actor, p.id);
      const premise = await lockPremise(db, actor, p);
      invariant(premise.version === body.version, 'VERSION_CONFLICT');
      invariant(!premise.archived_at, 'PREMISE_ARCHIVED');
      await checkPlace(db, actor, p.id, body);
      const row = await one(
        db,
        `UPDATE premises SET zone_id=$3,number=$4,kind=$5,floor=$6,rooms=$7,area_m2=$8,version=version+1,updated_at=now()
           WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        [
          actor.tenant_id,
          premise.id,
          body.zone_id,
          body.number,
          body.kind,
          body.floor,
          body.rooms,
          body.area_m2,
        ],
      );
      await audit(db, actor, 'premise.update', row.id, { project_id: p.id });
      return row;
    },
  });
  for (const [verb, archived] of [
    ['archive', true],
    ['unarchive', false],
  ] as const)
    add({
      method: 'POST',
      path: `/v1/projects/:id/premises/:premise_id/${verb}`,
      summary: archived
        ? 'Xonadonni arxivlash (o‘chirilmaydi); raqami bo‘shaydi'
        : 'Arxivdan qaytarish; raqam band bo‘lsa PREMISE_NUMBER_CONFLICT',
      permission: 'projects.write',
      params,
      body: z.strictObject({ version }),
      idempotent: true,
      handler: async ({ db, actor, params: p, body }) => {
        await projectScope(db, actor, p.id);
        const premise = await lockPremise(db, actor, p);
        invariant(premise.version === body.version, 'VERSION_CONFLICT');
        invariant(
          Boolean(premise.archived_at) !== archived,
          archived ? 'PREMISE_ARCHIVED' : 'PREMISE_NOT_ARCHIVED',
        );
        const row = await one(
          db,
          `UPDATE premises SET archived_at=${archived ? 'now()' : 'NULL'},version=version+1,updated_at=now()
             WHERE tenant_id=$1 AND id=$2 RETURNING *`,
          [actor.tenant_id, premise.id],
        );
        await audit(db, actor, `premise.${verb}`, row.id, { project_id: p.id });
        return row;
      },
    });
  add({
    method: 'GET',
    path: '/v1/projects/:id/premises/template',
    summary:
      'Import shabloni (xlsx, base64): Blok, Kirish, Qavat, Raqam, Tur, Xonalar, Maydon; ikkinchi varaqda tur qiymatlari',
    permission: 'projects.read',
    params: z.strictObject({ id: uuid }),
    query: z.strictObject({ lang: z.enum(['uz', 'ru']).default('uz') }),
    handler: async ({ db, actor, params, query }) => {
      await projectScope(db, actor, params.id);
      const lang = query.lang as 'uz' | 'ru';
      const keys = ['block', 'entrance', 'floor', 'number', 'kind', 'rooms', 'area'];
      return xlsxFile(
        [
          {
            name: lang === 'uz' ? 'Xonadonlar' : 'Помещения',
            columns: templateHeaders[lang].map((header, i) => ({ header, key: keys[i]! })),
            rows: [],
          },
          {
            name: lang === 'uz' ? 'Turlar' : 'Типы',
            columns: [{ header: templateHeaders[lang][4], key: 'kind', width: 20 }],
            rows: premiseKinds.map((k) => ({ kind: kindLabels[lang][k] })),
          },
        ],
        lang === 'uz' ? 'xonadonlar_shablon' : 'pomeshcheniya_shablon',
      );
    },
  });
  add({
    method: 'POST',
    path: '/v1/projects/:id/premises/import/preview',
    summary:
      'Shablon bo‘yicha import rejasi: har qator create/update/unchanged/error, xatolar varaqdagi qator raqami bilan; xato bo‘lsa id=null (commit qilinmaydi)',
    permission: 'projects.write',
    params: z.strictObject({ id: uuid }),
    body: z.strictObject({ file_base64: z.string().max(2800000) }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      await projectScope(db, actor, params.id);
      const parsed = await readPremisesWorkbook(body.file_base64);
      const plan = await planPremisesImport(db, actor, params.id, parsed);
      if (plan.summary.error > 0) return { ...plan, id: null, digest: null, expires_at: null };
      const row = await one(
        db,
        "INSERT INTO import_previews(tenant_id,project_id,created_by,payload,digest,expires_at,kind) VALUES($1,$2,$3,$4,$5,now()+interval '1 hour','premises') RETURNING id,digest,expires_at",
        [actor.tenant_id, params.id, actor.id, JSON.stringify(parsed), plan.digest],
      );
      return { ...row, ...plan };
    },
  });
  add({
    method: 'POST',
    path: '/v1/projects/:id/premises/import/:preview_id/commit',
    summary:
      'Import rejasini yozish; reja preview’dan keyin o‘zgargan bo‘lsa PREVIEW_CHANGED; qayta commit avvalgi natijani qaytaradi',
    permission: 'projects.write',
    params: z.strictObject({ id: uuid, preview_id: uuid }),
    body: z.strictObject({ digest: z.string().length(64) }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      await projectScope(db, actor, params.id);
      const preview = await one(
        db,
        "SELECT * FROM import_previews WHERE tenant_id=$1 AND project_id=$2 AND id=$3 AND kind='premises' FOR UPDATE",
        [actor.tenant_id, params.id, params.preview_id],
      );
      invariant(preview.created_by === actor.id || actor.role === 'tenant_admin', 'FORBIDDEN', 403);
      invariant(body.digest === preview.digest, 'PREVIEW_CHANGED');
      if (preview.result) return preview.result;
      invariant(new Date(preview.expires_at).getTime() > Date.now(), 'PREVIEW_EXPIRED', 410);
      const plan = await planPremisesImport(db, actor, params.id, preview.payload);
      invariant(plan.digest === preview.digest, 'PREVIEW_CHANGED');
      await applyPremisesPlan(db, actor, params.id, plan.rows);
      const result = { ...plan.summary };
      await db.query('UPDATE import_previews SET result=$2 WHERE id=$1', [
        preview.id,
        JSON.stringify(result),
      ]);
      await audit(db, actor, 'premises.import', preview.id, { project_id: params.id, ...result });
      return result;
    },
  });
}
