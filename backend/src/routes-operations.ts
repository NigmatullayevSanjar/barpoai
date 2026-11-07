import { z } from 'zod';
import { type Endpoint } from './http.js';
import { one, audit, type Db, type Row } from './db.js';
import {
  uuid,
  text,
  idParams,
  pageQuery,
  searchQuery,
  searchText,
  likePattern,
  queryBool,
  version,
  reason,
  qty,
  amount,
  date,
  estimateInput,
  stockInput,
  financeInput,
} from './schemas.js';
import { payableKinds, outstandingSql, notReversedSql } from './routes-finance-extra.js';
import {
  projectScope,
  accountScope,
  permit,
  financialPages,
  pageAllowed,
  allowed,
} from './permissions.js';
import { invariant } from './errors.js';
import {
  writeEstimate,
  parseWorkbook,
  resolveImportNames,
  storeImportPreview,
  commitImportPreview,
  sameWorkSql,
  ESTIMATE_FILE_BYTES,
  base64Length,
} from './estimates.js';
import { createStock, transitionStock, reverseStock, reconcileStock, similarMaterials } from './inventory.js';
import { postFinance, reverseFinance, accountingMonthSql, journalWithDocSql } from './finance.js';
import { money } from './money.js';
import { autoRateSql, rateGroupSql } from './earnings.js';
import { estimatePriceSummary } from './estimate-price.js';
/** Egasi qarori (2026-10-16): admin materiallarni faqat ko'radi; smeta muharriridagi "Yangi material" ham. */
async function canCreateMaterial(db: Db, actor: Row) {
  invariant(
    actor.role !== 'tenant_admin' &&
      ((await allowed(db, actor, 'stock.receive')) ||
        (await allowed(db, actor, 'estimates.import'))),
    'FORBIDDEN',
    403,
  );
}
export function operationRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'POST',
    path: '/v1/stock/accounts/:id/reconcile',
    summary: 'Inventarizatsiya natijasini immutable adjustment bilan yozish',
    permission: 'stock.reverse',
    action: 'update',
    params: idParams,
    body: z.strictObject({
      material_id: uuid,
      counted_quantity: qty,
      unit_cost: amount.optional(),
      reason,
    }),
    idempotent: true,
    sensitive: true,
    handler: async ({ db, actor, params, body }) => reconcileStock(db, actor, params.id, body),
  });
  const projectQuery = pageQuery.extend({ project_id: uuid });
  add({
    method: 'GET',
    path: '/v1/catalog',
    summary: 'Global katalog; kompaniya narxlari va qoldiqlarisiz',
    permission: 'projects.read',
    handler: async ({ db }) => ({
      units: (await db.query('SELECT * FROM units ORDER BY id')).rows,
      categories: (await db.query('SELECT * FROM catalog_categories ORDER BY name')).rows,
      materials: (
        await db.query(
          'SELECT * FROM catalog_materials WHERE archived_at IS NULL ORDER BY name LIMIT 1000',
        )
      ).rows,
    }),
  });
  add({
    method: 'POST',
    path: '/v1/materials',
    summary:
      'Kompaniya materialini yaratish (ombor kirimi yoki smeta import huquqi bilan; mijoz admini faqat ko‘radi)',
    body: z.strictObject({ name: text, unit_id: text, catalog_id: uuid.optional() }),
    idempotent: true,
    handler: async ({ db, actor, body }) => {
      await canCreateMaterial(db, actor);
      await one(db, 'SELECT 1 FROM units WHERE id=$1', [body.unit_id]);
      return one(
        db,
        'INSERT INTO materials(tenant_id,name,unit_id,catalog_id) VALUES($1,$2,$3,$4) RETURNING *',
        [actor.tenant_id, body.name, body.unit_id, body.catalog_id ?? null],
      );
    },
  });
  add({
    method: 'GET',
    path: '/v1/materials',
    summary:
      'Kompaniya materiallari (narxsiz; obyekt ko‘rish huquqi yetarli); q — nom yoki muqobil nom bo‘yicha qidiruv (alias — topilgan muqobil nom)',
    permission: 'projects.read',
    query: searchQuery,
    handler: async ({ db, actor, query }) => ({
      items: (
        await db.query(
          `SELECT m.*,(SELECT a.name FROM material_aliases a WHERE a.tenant_id=m.tenant_id AND a.material_id=m.id AND a.name ILIKE $4 ESCAPE '\\'
                         AND m.name NOT ILIKE $4 ESCAPE '\\' ORDER BY a.name LIMIT 1) alias
           FROM materials m WHERE m.tenant_id=$1 AND m.archived_at IS NULL
             AND ($4::text IS NULL OR m.name ILIKE $4 ESCAPE '\\'
                  OR EXISTS(SELECT 1 FROM material_aliases a WHERE a.tenant_id=m.tenant_id AND a.material_id=m.id AND a.name ILIKE $4 ESCAPE '\\'))
           ORDER BY m.name,m.id LIMIT $2 OFFSET $3`,
          [actor.tenant_id, query.limit, query.offset, query.q ? likePattern(query.q) : null],
        )
      ).rows,
    }),
  });
  add({
    method: 'GET',
    path: '/v1/materials/similar',
    summary:
      'Yangi material nomi uchun o‘xshashlar (D32): obyekt smetasidagi materiallar va nomi/muqobil nomi aynan mos materiallar; eng ko‘pi 5',
    permission: 'projects.read',
    query: z.strictObject({ project_id: uuid, name: text }),
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      const rows = (
        await db.query(
          `SELECT m.id,m.name,m.unit_id,
             coalesce((SELECT array_agg(a.name ORDER BY a.name) FROM material_aliases a WHERE a.tenant_id=m.tenant_id AND a.material_id=m.id),'{}') aliases
           FROM materials m WHERE m.tenant_id=$1 AND m.archived_at IS NULL AND (
             lower(m.name)=lower($3)
             OR EXISTS(SELECT 1 FROM material_aliases a WHERE a.tenant_id=m.tenant_id AND a.material_id=m.id AND lower(a.name)=lower($3))
             OR EXISTS(SELECT 1 FROM estimate_lines l JOIN estimates e ON e.tenant_id=l.tenant_id AND e.id=l.estimate_id
                       WHERE l.tenant_id=m.tenant_id AND l.material_id=m.id AND l.project_id=$2 AND l.archived_at IS NULL AND e.archived_at IS NULL))`,
          [actor.tenant_id, query.project_id, query.name],
        )
      ).rows;
      return { items: similarMaterials(query.name, rows) };
    },
  });
  add({
    method: 'POST',
    path: '/v1/materials/:id/aliases',
    summary:
      'Nakladnoy nomini mavjud materialga muqobil nom qilib bog‘lash (D32; yangi material huquqi bilan); nom materialning o‘zi bo‘lsa — o‘zgarishsiz',
    params: idParams,
    body: z.strictObject({ name: text }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      await canCreateMaterial(db, actor);
      const material = await one(
        db,
        'SELECT * FROM materials WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL',
        [actor.tenant_id, params.id],
      );
      if (material.name.toLowerCase() === body.name.toLowerCase()) return material;
      const taken = (
        await db.query('SELECT material_id FROM material_aliases WHERE tenant_id=$1 AND lower(name)=lower($2)', [
          actor.tenant_id,
          body.name,
        ])
      ).rows[0];
      invariant(!taken || taken.material_id === material.id, 'ALREADY_EXISTS', 409);
      if (!taken)
        await db.query('INSERT INTO material_aliases(tenant_id,material_id,name,created_by) VALUES($1,$2,$3,$4)', [
          actor.tenant_id,
          material.id,
          body.name,
          actor.id,
        ]);
      return material;
    },
  });
  add({
    method: 'POST',
    path: '/v1/warehouses',
    summary: 'Obyekt ombori va stock account yaratish',
    permission: 'projects.write',
    body: z.strictObject({ project_id: uuid, name: text }),
    idempotent: true,
    handler: async ({ db, actor, body }) => {
      await projectScope(db, actor, body.project_id);
      const warehouse = await one(
        db,
        'INSERT INTO warehouses(tenant_id,project_id,name) VALUES($1,$2,$3) RETURNING *',
        [actor.tenant_id, body.project_id, body.name],
      );
      const account = await one(
        db,
        'INSERT INTO stock_accounts(tenant_id,project_id,warehouse_id) VALUES($1,$2,$3) RETURNING *',
        [actor.tenant_id, body.project_id, warehouse.id],
      );
      return { warehouse, account };
    },
  });
  add({
    method: 'POST',
    path: '/v1/stock/custody',
    summary: 'Biriktirilgan brigadirning obyekt qoldiq hisobi',
    permission: 'employees.manage',
    action: 'create',
    body: z.strictObject({ project_id: uuid, custodian_id: uuid }),
    idempotent: true,
    handler: async ({ db, actor, body }) => {
      await projectScope(db, actor, body.project_id);
      await one(
        db,
        "SELECT u.id FROM users u JOIN project_assignments a ON a.tenant_id=u.tenant_id AND a.user_id=u.id WHERE u.tenant_id=$1 AND u.id=$2 AND u.role='brigadier' AND u.active AND a.project_id=$3",
        [actor.tenant_id, body.custodian_id, body.project_id],
      );
      return one(
        db,
        'INSERT INTO stock_accounts(tenant_id,project_id,custodian_id) VALUES($1,$2,$3) ON CONFLICT(tenant_id,project_id,custodian_id) DO UPDATE SET custodian_id=excluded.custodian_id RETURNING *',
        [actor.tenant_id, body.project_id, body.custodian_id],
      );
    },
  });
  add({
    method: 'GET',
    path: '/v1/stock/accounts',
    summary: 'Ruxsatli ombor va brigadir hisoblari',
    permission: 'stock.read',
    query: projectQuery,
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      const rows = (
        await db.query(
          `SELECT a.* FROM stock_accounts a WHERE a.tenant_id=$1 AND a.project_id=$2 AND ($3<>'brigadier' OR a.custodian_id=$4) AND ($3<>'warehouse_manager' OR a.warehouse_id IS NULL OR EXISTS(SELECT 1 FROM warehouse_assignments w WHERE w.tenant_id=a.tenant_id AND w.warehouse_id=a.warehouse_id AND w.user_id=$4)) ORDER BY a.id LIMIT $5 OFFSET $6`,
          [actor.tenant_id, query.project_id, actor.role, actor.id, query.limit, query.offset],
        )
      ).rows;
      return { items: rows };
    },
  });
  add({
    method: 'GET',
    path: '/v1/stock/accounts/:id/balances',
    summary: 'Book, rezerv va mavjud qoldiq',
    permission: 'stock.read',
    params: idParams,
    sensitive: true,
    handler: async ({ db, actor, params }) => {
      await accountScope(db, actor, params.id);
      return {
        items: (
          await db.query(
            'SELECT b.*, (quantity-reserved)::text available FROM stock_balances b WHERE tenant_id=$1 AND account_id=$2 ORDER BY material_id',
            [actor.tenant_id, params.id],
          )
        ).rows,
      };
    },
  });
  add({
    method: 'POST',
    path: '/v1/stock/commands',
    summary: 'Kirim, jo‘natish, sarf taklifi yoki qaytarish',
    page: 'stock',
    action: 'create',
    body: stockInput,
    idempotent: true,
    sensitive: true,
    handler: async ({ db, actor, body }) => createStock(db, actor, body),
  });
  add({
    method: 'POST',
    path: '/v1/stock/commands/:id/actions',
    summary: 'Qisman qabul, sarfni tekshirish, qoldiqni bekor qilish yoki dispute',
    page: 'stock',
    action: 'update',
    params: idParams,
    body: z.strictObject({
      version,
      action: z.enum(['accept', 'review', 'cancel', 'dispute']),
      quantity: qty.optional(),
      reason: reason.optional(),
    }),
    idempotent: true,
    sensitive: true,
    handler: async ({ db, actor, params, body }) => transitionStock(db, actor, params.id, body),
  });
  add({
    method: 'POST',
    path: '/v1/stock/commands/:id/reverse',
    summary: 'Yangi yozuv bilan stock reversal',
    permission: 'stock.reverse',
    params: idParams,
    body: z.strictObject({ reason }),
    idempotent: true,
    sensitive: true,
    handler: async ({ db, actor, params, body }) => reverseStock(db, actor, params.id, body.reason),
  });
  add({
    method: 'POST',
    path: '/v1/stock/accounts/:id/minimum',
    summary: 'Minimal material qoldig‘i',
    permission: 'stock.send',
    action: 'update',
    params: idParams,
    body: z.strictObject({ material_id: uuid, quantity: qty }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      await accountScope(db, actor, params.id);
      return one(
        db,
        'UPDATE stock_balances SET minimum_quantity=$4 WHERE tenant_id=$1 AND account_id=$2 AND material_id=$3 RETURNING account_id,material_id,minimum_quantity',
        [actor.tenant_id, params.id, body.material_id, body.quantity],
      );
    },
  });
  add({
    method: 'POST',
    path: '/v1/estimates',
    summary: 'Oddiy yoki norma/oylik taqsimot bilan smeta; approvalsiz',
    permission: 'estimates.import',
    body: estimateInput,
    idempotent: true,
    sensitive: true,
    handler: async ({ db, actor, body }) => writeEstimate(db, actor, body),
  });
  add({
    method: 'GET',
    path: '/v1/estimates',
    summary:
      'Obyekt smetalari; narx huquqi bo‘lmasa summalar kesiladi; q — nom yoki muallif bo‘yicha qidiruv; summary — obyekt bo‘yicha jami (sahifalashsiz)',
    permission: 'estimates.read',
    sensitive: true,
    query: projectQuery.extend({ q: searchText }),
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      // Figma KPI kartalari uchun: obyektning barcha arxivlanmagan smetalari soni, qatorlari va jamlari (serverda).
      const summary = await one(
        db,
        `SELECT count(DISTINCT e.id)::int count,count(l.id)::int line_count,
                coalesce(sum(l.total),0)::text total,coalesce(sum(l.total) FILTER(WHERE l.kind='material'),0)::text material_total
         FROM estimates e LEFT JOIN estimate_lines l ON l.tenant_id=e.tenant_id AND l.estimate_id=e.id AND l.archived_at IS NULL
         WHERE e.tenant_id=$1 AND e.project_id=$2 AND e.archived_at IS NULL`,
        [actor.tenant_id, query.project_id],
      );
      return {
        summary,
        items: (
          await db.query(
            `SELECT e.*,u.display_name created_by_name,
               (SELECT count(*)::int FROM estimate_lines l WHERE l.tenant_id=e.tenant_id AND l.estimate_id=e.id AND l.archived_at IS NULL) line_count,
               (SELECT coalesce(sum(l.total),0)::text FROM estimate_lines l WHERE l.tenant_id=e.tenant_id AND l.estimate_id=e.id AND l.archived_at IS NULL) total,
               (SELECT coalesce(sum(l.total) FILTER(WHERE l.kind='material'),0)::text FROM estimate_lines l WHERE l.tenant_id=e.tenant_id AND l.estimate_id=e.id AND l.archived_at IS NULL) material_total,
               (SELECT coalesce(sum(l.total) FILTER(WHERE l.kind<>'material'),0)::text FROM estimate_lines l WHERE l.tenant_id=e.tenant_id AND l.estimate_id=e.id AND l.archived_at IS NULL) work_total
             FROM estimates e LEFT JOIN users u ON u.id=e.created_by
             WHERE e.tenant_id=$1 AND e.project_id=$2 AND e.archived_at IS NULL
               AND ($5::text IS NULL OR e.name ILIKE $5 ESCAPE '\\' OR u.display_name ILIKE $5 ESCAPE '\\')
             ORDER BY e.created_at DESC,e.id LIMIT $3 OFFSET $4`,
            [
              actor.tenant_id,
              query.project_id,
              query.limit,
              query.offset,
              query.q ? likePattern(query.q) : null,
            ],
          )
        ).rows,
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/estimate-lines',
    summary:
      'Obyektning joriy smeta qatorlari (vazifaga bog‘lash tanlovi): nom, birlik, reja hajmi, smeta nomi; narxsiz; q — nom, smeta, kategoriya, norma kodi yoki bo‘lim',
    permission: 'estimates.read',
    query: searchQuery.extend({ project_id: uuid }),
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      return {
        items: (
          await db.query(
            `SELECT l.id,l.estimate_id,e.name estimate_name,l.kind,l.description,l.unit_id,l.effective_quantity::text effective_quantity,l.category,l.norm_code,l.section_name,z.name zone_name
             FROM estimate_lines l JOIN estimates e ON e.tenant_id=l.tenant_id AND e.id=l.estimate_id LEFT JOIN zones z ON z.id=l.zone_id
             WHERE l.tenant_id=$1 AND l.project_id=$2 AND l.archived_at IS NULL AND e.archived_at IS NULL
               AND ($3::text IS NULL OR l.description ILIKE $3 ESCAPE '\\' OR e.name ILIKE $3 ESCAPE '\\' OR coalesce(l.category,'') ILIKE $3 ESCAPE '\\'
                    OR coalesce(l.norm_code,'') ILIKE $3 ESCAPE '\\' OR coalesce(l.section_name,'') ILIKE $3 ESCAPE '\\')
             ORDER BY e.name,l.position,l.id LIMIT $4 OFFSET $5`,
            [actor.tenant_id, query.project_id, query.q ? likePattern(query.q) : null, query.limit, query.offset],
          )
        ).rows,
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/estimates/:id',
    summary:
      'Joriy smeta (sarlavha va sozlamalar bilan) va oylik qatorlar; price_summary — smeta narxi zanjiri (S3); totals — umumiy, material/ish jami va tur, kategoriya, zona, bo‘lim bo‘yicha guruhlar (decimal)',
    permission: 'estimates.read',
    params: idParams,
    sensitive: true,
    handler: async ({ db, actor, params }) => {
      const estimate = await one(db, 'SELECT * FROM estimates WHERE tenant_id=$1 AND id=$2', [
        actor.tenant_id,
        params.id,
      ]);
      await projectScope(db, actor, estimate.project_id);
      // Guruh jamlari serverda hisoblanadi (frontend arifmetika qilmaydi). Pul maydonlari `total` va
      // `value` nomida — narx huquqi bo'lmasa redactPrices ularni kesadi, `key`/`count` qoladi.
      const groups = (
        await db.query(
          `WITH l AS (
             SELECT l.kind,coalesce(l.category,'') category,coalesce(z.name,'') zone,coalesce(l.section_name,'') section,l.total,
               CASE WHEN l.kind='material'
                 THEN (SELECT coalesce(-sum(j.amount),0) FROM journal_entries j JOIN stock_commands c ON c.tenant_id=j.tenant_id AND c.id=j.stock_command_id WHERE j.tenant_id=l.tenant_id AND ${sameWorkSql('c.estimate_line_id')} AND c.kind='consumption' AND j.account='inventory')
                 ELSE 0 END fact_value
             FROM estimate_lines l LEFT JOIN zones z ON z.id=l.zone_id
             WHERE l.tenant_id=$1 AND l.estimate_id=$2 AND l.archived_at IS NULL)
           SELECT 'kind' grp,kind key,count(*)::int count,sum(total)::numeric(20,2)::text total,sum(fact_value)::numeric(20,2)::text value FROM l GROUP BY kind
           UNION ALL SELECT 'category',category,count(*)::int,sum(total)::numeric(20,2)::text,sum(fact_value)::numeric(20,2)::text FROM l GROUP BY category
           UNION ALL SELECT 'zone',zone,count(*)::int,sum(total)::numeric(20,2)::text,sum(fact_value)::numeric(20,2)::text FROM l GROUP BY zone
           UNION ALL SELECT 'section',section,count(*)::int,sum(total)::numeric(20,2)::text,sum(fact_value)::numeric(20,2)::text FROM l GROUP BY section`,
          [actor.tenant_id, params.id],
        )
      ).rows;
      // Narx huquqi bo'lmasa summa bo'yicha tartib ham oshkor bo'lmasin: nom bo'yicha saralanadi.
      const byCost = await allowed(db, actor, 'prices.read');
      const pick = (grp: string) =>
        groups
          .filter((g) => g.grp === grp)
          .sort(
            (a, b) =>
              (byCost ? Number(b.total) - Number(a.total) : 0) || String(a.key).localeCompare(b.key),
          )
          .map(({ key, count, total, value }) => ({ key, count, total, value }));
      const totals = await one(
        db,
        `SELECT coalesce(sum(l.total),0)::numeric(20,2)::text total,
                coalesce(sum(l.total) FILTER(WHERE l.kind='material'),0)::numeric(20,2)::text material_total,
                coalesce(sum(l.total) FILTER(WHERE l.kind<>'material'),0)::numeric(20,2)::text work_total
         FROM estimate_lines l WHERE l.tenant_id=$1 AND l.estimate_id=$2 AND l.archived_at IS NULL`,
        [actor.tenant_id, params.id],
      );
      return {
        ...estimate,
        // S3 (D36–D39): smeta narxi zanjiri — qator jamlari va plan_total o'zgarmaydi; narx huquqisiz butunlay kesiladi
        price_summary: await estimatePriceSummary(db, actor.tenant_id, estimate),
        totals: {
          ...totals,
          by_kind: pick('kind'),
          by_category: pick('category'),
          by_zone: pick('zone'),
          by_section: pick('section'),
        },
        // D32: `auto_labor_rate` — avtomatik akkord stavkasi; guruh ko'rsatkichlari bir marta hisoblanadi (4 000+ qator)
        lines: (
          await db.query(
            `SELECT l.*,m.name material_name,z.name zone_name,
               coalesce((SELECT jsonb_agg(jsonb_build_object('month',mo.month,'quantity',mo.quantity::text) ORDER BY mo.month) FROM estimate_months mo WHERE mo.tenant_id=l.tenant_id AND mo.line_id=l.id),'[]') months,
               CASE WHEN l.kind='material'
                 THEN (SELECT coalesce(sum(c.accepted_quantity),0)::text FROM stock_commands c WHERE c.tenant_id=l.tenant_id AND ${sameWorkSql('c.estimate_line_id')} AND c.kind='consumption' AND c.status IN ('posted','partial'))
                 ELSE (SELECT (coalesce(sum(p.quantity),0)+coalesce((SELECT sum(c.quantity_delta) FROM progress_corrections c JOIN progress_entries pe ON pe.tenant_id=c.tenant_id AND pe.id=c.progress_entry_id WHERE pe.tenant_id=l.tenant_id AND ${sameWorkSql('pe.estimate_line_id')}),0))::text FROM progress_entries p WHERE p.tenant_id=l.tenant_id AND ${sameWorkSql('p.estimate_line_id')}) END fact_quantity,
               CASE WHEN l.kind='material'
                 THEN (SELECT coalesce(-sum(j.amount),0)::text FROM journal_entries j JOIN stock_commands c ON c.tenant_id=j.tenant_id AND c.id=j.stock_command_id WHERE j.tenant_id=l.tenant_id AND ${sameWorkSql('c.estimate_line_id')} AND c.kind='consumption' AND j.account='inventory')
                 ELSE NULL END fact_value,
               (${autoRateSql})::text auto_labor_rate
             FROM estimate_lines l LEFT JOIN materials m ON m.id=l.material_id LEFT JOIN zones z ON z.id=l.zone_id
               JOIN projects p ON p.tenant_id=l.tenant_id AND p.id=l.project_id
               LEFT JOIN (SELECT g.category,coalesce(g.zone_id::text,'') zone_key,${rateGroupSql} FROM estimate_lines g
                          WHERE g.tenant_id=$1 AND g.estimate_id=$2 AND g.archived_at IS NULL AND g.category IS NOT NULL
                          GROUP BY g.category,coalesce(g.zone_id::text,'')) gr
                 ON gr.category=l.category AND gr.zone_key=coalesce(l.zone_id::text,'')
             WHERE l.tenant_id=$1 AND l.estimate_id=$2 AND l.archived_at IS NULL ORDER BY l.position,l.id`,
            [actor.tenant_id, params.id],
          )
        ).rows,
      };
    },
  });
  add({
    method: 'PATCH',
    path: '/v1/estimates/:id',
    summary: 'Smetaning yangi immutable reviziyasi; eski qatorlar fakt bog‘lanishi uchun qoladi',
    permission: 'estimates.edit',
    params: idParams,
    body: estimateInput.extend({ version }),
    idempotent: true,
    sensitive: true,
    handler: async ({ db, actor, params, body }) => {
      const existing = await one(
        db,
        'SELECT * FROM estimates WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE',
        [actor.tenant_id, params.id],
      );
      invariant(existing.revision === body.version, 'VERSION_CONFLICT');
      const { version: _, ...input } = body;
      return writeEstimate(db, actor, input, existing);
    },
  });
  add({
    method: 'DELETE',
    path: '/v1/estimates/:id',
    summary: 'Smetani arxivlash; fakt va tarix o‘chmaydi',
    permission: 'estimates.edit',
    params: idParams,
    body: z.strictObject({ version, reason }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      const estimate = await one(
        db,
        'SELECT * FROM estimates WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [actor.tenant_id, params.id],
      );
      await projectScope(db, actor, estimate.project_id);
      invariant(estimate.revision === body.version, 'VERSION_CONFLICT');
      await db.query('UPDATE estimates SET archived_at=now(),revision=revision+1 WHERE id=$1', [
        params.id,
      ]);
      await audit(db, actor, 'estimate.archive', params.id, { reason: body.reason });
      return { ok: true };
    },
  });
  add({
    method: 'POST',
    path: '/v1/estimate-imports/preview',
    summary: 'Excel mapping, formula va oylik/norma validatsiyasi',
    permission: 'estimates.import',
    body: z.strictObject({
      project_id: uuid,
      name: text,
      file_base64: z.string().max(base64Length(ESTIMATE_FILE_BYTES)),
      mapping: z.partialRecord(
        z.enum([
          'kind',
          'description',
          'unit_id',
          'quantity',
          'unit_price',
          'material_id',
          'zone_id',
          'norm',
          'work_quantity',
          'loss_percent',
          'material_name',
          'zone_name',
          'category',
          'note',
          'norm_code',
          'resource_code',
          'section_name',
          'supplied_by',
        ]),
        text,
      ),
      defaults: z
        .strictObject({
          kind: z.enum(['material', 'labor', 'equipment', 'service']).optional(),
          unit_id: text.optional(),
        })
        .optional(),
    }),
    bodyLimit: 16 * 1024 * 1024,
    idempotent: true,
    sensitive: true,
    handler: async ({ db, actor, body }) => {
      const parsed = await parseWorkbook(body.file_base64, body.mapping);
      for (const line of parsed) {
        if (body.defaults?.kind && !line.kind) line.kind = body.defaults.kind;
        if (body.defaults?.unit_id && !line.unit_id) line.unit_id = body.defaults.unit_id;
      }
      const resolved = await resolveImportNames(db, actor, body.project_id, parsed);
      invariant(resolved.errors.length === 0, 'IMPORT_NAMES_UNRESOLVED', 400, resolved.errors);
      const input = {
        project_id: body.project_id,
        name: body.name,
        lines: resolved.lines,
      };
      // Qator qiymatlari xatosi Excel qator raqami bilan (lines.N.maydon → N-qatorning `_row`), texnik matnsiz.
      const { row, lines, total } = await storeImportPreview(
        db,
        actor,
        input,
        (n) => parsed[n]?._row ?? n + 2,
      );
      return {
        ...row,
        preview: { ...input, lines },
        total,
        created: resolved.created,
        converted: resolved.converted,
      };
    },
  });
  add({
    method: 'POST',
    path: '/v1/estimate-imports/:id/commit',
    summary: 'Previewdan yangi smeta; eskisini yashirin almashtirmaydi',
    permission: 'estimates.import',
    params: idParams,
    body: z.strictObject({ digest: z.string().length(64) }),
    idempotent: true,
    sensitive: true,
    handler: async ({ db, actor, params, body }) =>
      commitImportPreview(db, actor, params.id, body.digest),
  });
  add({
    method: 'POST',
    path: '/v1/counterparties',
    summary: 'Yetkazib beruvchi, subpudratchi yoki mijoz',
    permission: 'finance.post',
    page: 'counterparties',
    body: z.strictObject({
      name: text,
      kind: z.enum(['supplier', 'contractor', 'customer', 'employee']),
      inn: z.string().trim().max(20).optional(),
      phone: z.string().trim().max(40).optional(),
      contact: z.string().trim().max(200).optional(),
      bank_details: z.string().trim().max(1000).optional(),
      note: z.string().trim().max(1000).optional(),
    }),
    idempotent: true,
    handler: async ({ db, actor, body }) =>
      one(
        db,
        'INSERT INTO counterparties(tenant_id,name,kind,inn,phone,contact,bank_details,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
        [
          actor.tenant_id,
          body.name,
          body.kind,
          body.inn || null,
          body.phone || null,
          body.contact || null,
          body.bank_details || null,
          body.note || null,
        ],
      ),
  });
  add({
    method: 'GET',
    path: '/v1/counterparties',
    summary: 'Kompaniya kontragentlari; q — nom, INN, telefon, kontakt; archived=false — faqat faollar',
    permission: 'finance.read',
    page: 'counterparties',
    query: searchQuery.extend({
      archived: queryBool.optional(),
      kind: z.enum(['supplier', 'contractor', 'customer', 'employee']).optional(),
    }),
    handler: async ({ db, actor, query }) => {
      // Figma F5 "Kontragentlar bilan hisob-kitob": qarz, avans, muddati o'tgan qarz va oxirgi operatsiya —
      // foydalanuvchi obyektlari doirasida; summary (KPI) shu filtr bilan, sahifalashsiz.
      const scoped = (a: string) =>
        `($2='tenant_admin' OR EXISTS(SELECT 1 FROM project_assignments pa WHERE pa.tenant_id=${a}.tenant_id AND pa.project_id=${a}.project_id AND pa.user_id=$3))`;
      const select = `SELECT c.*,
             (-coalesce((SELECT sum(j.amount) FROM journal_entries j WHERE j.tenant_id=c.tenant_id AND j.counterparty_id=c.id AND j.account='payable' AND ${scoped('j')}),0))::numeric(20,2)::text debt,
             coalesce((SELECT sum(j.amount) FROM journal_entries j WHERE j.tenant_id=c.tenant_id AND j.counterparty_id=c.id AND j.account='advance' AND ${scoped('j')}),0)::numeric(20,2)::text advance,
             coalesce((SELECT sum(${outstandingSql}) FROM finance_documents f WHERE f.tenant_id=c.tenant_id AND f.counterparty_id=c.id AND f.kind=ANY($7::text[]) AND ${notReversedSql} AND ${outstandingSql}>0 AND f.due_date<current_date AND ${scoped('f')}),0)::numeric(20,2)::text overdue,
             (SELECT max(f.document_date) FROM finance_documents f WHERE f.tenant_id=c.tenant_id AND f.counterparty_id=c.id AND ${scoped('f')}) last_activity
           FROM counterparties c WHERE c.tenant_id=$1
             AND ($4::text IS NULL OR c.name ILIKE $4 ESCAPE '\\' OR c.inn ILIKE $4 ESCAPE '\\' OR c.phone ILIKE $4 ESCAPE '\\' OR c.contact ILIKE $4 ESCAPE '\\')
             AND ($5::boolean IS NULL OR (c.archived_at IS NOT NULL)=$5)
             AND ($6::text IS NULL OR c.kind=$6)`;
      const params = [
        actor.tenant_id,
        actor.role,
        actor.id,
        query.q ? likePattern(query.q) : null,
        query.archived ?? null,
        query.kind ?? null,
        payableKinds,
      ];
      return {
        summary: await one(
          db,
          `SELECT coalesce(sum(s.debt::numeric),0)::text debt,coalesce(sum(s.advance::numeric),0)::text advance,coalesce(sum(s.overdue::numeric),0)::text overdue FROM (${select}) s`,
          params,
        ),
        items: (
          await db.query(`${select} ORDER BY c.archived_at NULLS FIRST,c.name,c.id LIMIT $8 OFFSET $9`, [
            ...params,
            query.limit,
            query.offset,
          ])
        ).rows,
      };
    },
  });
  add({
    method: 'POST',
    path: '/v1/cash-accounts',
    summary: 'UZS bank yoki kassa hisobi',
    permission: 'finance.post',
    page: 'bank_cash',
    body: z.strictObject({ name: text, kind: z.enum(['bank', 'cash']) }),
    idempotent: true,
    handler: async ({ db, actor, body }) =>
      one(db, 'INSERT INTO cash_accounts(tenant_id,name,kind) VALUES($1,$2,$3) RETURNING *', [
        actor.tenant_id,
        body.name,
        body.kind,
      ]),
  });
  add({
    method: 'GET',
    path: '/v1/cash-accounts',
    summary: 'Kompaniya bank va kassa hisoblari',
    permission: 'finance.read',
    page: 'bank_cash',
    query: pageQuery,
    handler: async ({ db, actor, query }) => ({
      items: (
        await db.query(
          'SELECT * FROM cash_accounts WHERE tenant_id=$1 ORDER BY name,id LIMIT $2 OFFSET $3',
          [actor.tenant_id, query.limit, query.offset],
        )
      ).rows,
    }),
  });
  add({
    method: 'POST',
    path: '/v1/finance/documents',
    summary: 'Ajratma, invoys, haqiqiy xarajat va pul harakatlari',
    pageFor: (body) => financialPages[body.kind]!,
    action: 'create',
    body: financeInput,
    idempotent: true,
    handler: async ({ db, actor, body }) => postFinance(db, actor, body),
  });
  add({
    method: 'GET',
    path: '/v1/finance/documents',
    summary:
      'Faqat ruxsat berilgan moliyaviy sahifalarga tegishli hujjatlar; nomlar, qoldiq va filtrlar bilan',
    query: projectQuery.extend({
      kind: z.string().max(200).optional(),
      counterparty_id: uuid.optional(),
      from: date.optional(),
      to: date.optional(),
      // unpaid=true — faqat qoldig'i bor, qaytarilmagan qarz hujjatlari (invoyslar sahifasi).
      unpaid: queryBool.optional(),
      // Figma F5 "Bank va kassa": bank yoki kassa hisobidagi operatsiyalar segmenti.
      cash_kind: z.enum(['bank', 'cash']).optional(),
    }),
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      const kinds: string[] = [];
      for (const [kind, page] of Object.entries(financialPages))
        if (
          (await pageAllowed(db, actor, page!, 'read')) &&
          (await allowed(db, actor, 'finance.read', 'read', page))
        )
          kinds.push(kind);
      invariant(kinds.length, 'FORBIDDEN', 403);
      const wanted = query.kind
        ? String(query.kind)
            .split(',')
            .filter((k: string) => kinds.includes(k))
        : kinds;
      // Figma F5: ro'yxat va KPI (summary) bir xil filtr bilan; summary sahifalashsiz.
      const paidSql = `coalesce((SELECT sum(p.amount) FROM finance_documents p WHERE p.tenant_id=f.tenant_id AND p.allocated_invoice_id=f.id AND NOT EXISTS(SELECT 1 FROM finance_documents r WHERE r.tenant_id=p.tenant_id AND r.reverses_id=p.id)),0)`;
      const where = `f.tenant_id=$1 AND f.project_id=$2 AND f.kind=ANY($3::text[])
               AND (f.kind<>'reversal' OR EXISTS(SELECT 1 FROM finance_documents original WHERE original.tenant_id=f.tenant_id AND original.id=f.reverses_id AND original.kind=ANY($3::text[])))
               AND ($4::uuid IS NULL OR f.counterparty_id=$4) AND ($5::date IS NULL OR f.document_date>=$5) AND ($6::date IS NULL OR f.document_date<=$6)
               AND ($7::boolean IS NOT TRUE OR (f.kind=ANY($8::text[]) AND ${notReversedSql} AND ${outstandingSql}>0))
               AND ($9::text IS NULL OR ca.kind=$9)`;
      const params = [
        actor.tenant_id,
        query.project_id,
        wanted.length ? wanted : ['__none__'],
        query.counterparty_id ?? null,
        query.from ?? null,
        query.to ?? null,
        query.unpaid ?? false,
        payableKinds,
        query.cash_kind ?? null,
      ];
      return {
        summary: await one(
          db,
          `SELECT count(*)::int count,
                  coalesce(sum(f.amount) FILTER(WHERE f.kind<>'reversal' AND ${notReversedSql}),0)::text total,
                  coalesce(sum(${outstandingSql}) FILTER(WHERE f.kind=ANY($8::text[]) AND ${notReversedSql}),0)::text outstanding,
                  count(*) FILTER(WHERE f.kind=ANY($8::text[]) AND ${notReversedSql} AND ${outstandingSql}<=0)::int paid_count,
                  count(*) FILTER(WHERE f.kind=ANY($8::text[]) AND ${notReversedSql} AND ${outstandingSql}>0 AND (f.due_date IS NULL OR f.due_date>=current_date))::int open_count,
                  count(*) FILTER(WHERE f.kind=ANY($8::text[]) AND ${notReversedSql} AND ${outstandingSql}>0 AND f.due_date<current_date)::int overdue_count
           FROM finance_documents f LEFT JOIN cash_accounts ca ON ca.id=f.cash_account_id WHERE ${where}`,
          params,
        ),
        items: (
          await db.query(
            `SELECT f.*,f.amount::text,c.name counterparty_name,c.kind counterparty_kind,ca.name cash_account_name,ca.kind cash_account_kind,ta.name target_cash_account_name,u.display_name created_by_name,z.name zone_name,
                    m.name matched_material_name,inv.description allocated_invoice_description,inv.kind allocated_invoice_kind,
                    CASE WHEN f.kind IN ('supplier_invoice','opening_debt','labor','equipment','service') THEN (f.amount-${paidSql})::text END outstanding,
                    CASE WHEN f.kind IN ('supplier_invoice','opening_debt','labor','equipment','service') THEN ${paidSql}::text END paid,
                    CASE WHEN f.kind IN ('supplier_invoice','opening_debt','labor','equipment','service') THEN
                      (CASE WHEN ${notReversedSql} AND NOT EXISTS(SELECT 1 FROM payroll_entries pe WHERE pe.tenant_id=f.tenant_id AND pe.labor_document_id=f.id)
                        THEN greatest(0,least(f.amount-${paidSql},(SELECT coalesce(sum(j.amount),0) FROM journal_entries j WHERE j.tenant_id=f.tenant_id AND j.project_id=f.project_id AND j.counterparty_id=f.counterparty_id AND j.account='advance')))
                        ELSE 0 END)::numeric(20,2)::text END advance_offsettable,
                    EXISTS(SELECT 1 FROM finance_documents r WHERE r.tenant_id=f.tenant_id AND r.reverses_id=f.id) reversed
             FROM finance_documents f
             LEFT JOIN counterparties c ON c.id=f.counterparty_id LEFT JOIN cash_accounts ca ON ca.id=f.cash_account_id LEFT JOIN cash_accounts ta ON ta.id=f.target_cash_account_id
             LEFT JOIN users u ON u.id=f.created_by LEFT JOIN zones z ON z.id=f.zone_id
             LEFT JOIN stock_commands sc ON sc.id=f.matched_receipt_id LEFT JOIN materials m ON m.id=sc.material_id
             LEFT JOIN finance_documents inv ON inv.id=f.allocated_invoice_id
             WHERE ${where}
             ORDER BY f.document_date DESC,f.created_at DESC,f.id LIMIT $10 OFFSET $11`,
            [...params, query.limit, query.offset],
          )
        ).rows,
      };
    },
  });
  add({
    method: 'POST',
    path: '/v1/finance/documents/:id/reverse',
    summary: 'Moliyaviy reversal; manba sahifasining delete ruxsati tekshiriladi',
    params: idParams,
    body: z.strictObject({ reason }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) =>
      reverseFinance(db, actor, params.id, body.reason),
  });
  add({
    method: 'POST',
    path: '/v1/budgets',
    summary: 'Obyektning oylik budjeti',
    permission: 'finance.allocate',
    page: 'budgets',
    body: z.strictObject({ project_id: uuid, month: date, amount }),
    idempotent: true,
    handler: async ({ db, actor, body }) => {
      await projectScope(db, actor, body.project_id);
      invariant(body.month.endsWith('-01'), 'MONTH_FIRST_DAY_REQUIRED', 400);
      return one(
        db,
        'INSERT INTO budgets(tenant_id,project_id,month,amount) VALUES($1,$2,$3,$4) RETURNING *',
        [actor.tenant_id, body.project_id, body.month, body.amount],
      );
    },
  });
  add({
    method: 'PATCH',
    path: '/v1/budgets',
    summary: 'Oylik budjetni version va update ruxsati bilan yangilash',
    permission: 'finance.allocate',
    page: 'budgets',
    action: 'update',
    body: z.strictObject({ project_id: uuid, month: date, amount, version }),
    idempotent: true,
    handler: async ({ db, actor, body }) => {
      await projectScope(db, actor, body.project_id);
      const current = await one(
        db,
        'SELECT version FROM budgets WHERE tenant_id=$1 AND project_id=$2 AND month=$3 FOR UPDATE',
        [actor.tenant_id, body.project_id, body.month],
      );
      invariant(current.version === body.version, 'VERSION_CONFLICT');
      return one(
        db,
        'UPDATE budgets SET amount=$4,version=version+1 WHERE tenant_id=$1 AND project_id=$2 AND month=$3 RETURNING *',
        [actor.tenant_id, body.project_id, body.month, body.amount],
      );
    },
  });
  add({
    method: 'GET',
    path: '/v1/budgets',
    summary: 'Obyektning oylik budjetlari; har oy uchun fakt xarajat, qoldiq va foiz; yillik yig‘ma va summary',
    permission: 'finance.read',
    page: 'budgets',
    query: projectQuery,
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      // Figma F5 "Budjetlar boshqaruvi": Yillik/Oylik ko'rinish va KPI — hamma yig'indilar serverda.
      const fact = `fact AS (SELECT ${accountingMonthSql} AS month,sum(j.amount) v FROM ${journalWithDocSql} WHERE j.tenant_id=$1 AND j.project_id=$2 AND j.account='expense' GROUP BY 1)`;
      const pct = (amount: string, actual: string) =>
        `CASE WHEN ${amount}>0 THEN round(100*${actual}/${amount},1)::text END`;
      return {
        summary: await one(
          db,
          `WITH ${fact} SELECT coalesce(sum(b.amount),0)::numeric(20,2)::text amount,coalesce(sum(coalesce(f.v,0)),0)::numeric(20,2)::text actual,
                  (coalesce(sum(b.amount),0)-coalesce(sum(coalesce(f.v,0)),0))::numeric(20,2)::text remaining,${pct('coalesce(sum(b.amount),0)', 'coalesce(sum(coalesce(f.v,0)),0)')} percent
           FROM budgets b LEFT JOIN fact f ON f.month=b.month WHERE b.tenant_id=$1 AND b.project_id=$2`,
          [actor.tenant_id, query.project_id],
        ),
        yearly: (
          await db.query(
            `WITH ${fact},years AS (SELECT extract(year FROM b.month)::int AS year,sum(b.amount) AS amount,sum(coalesce(f.v,0)) AS actual,count(*)::int AS months
                                  FROM budgets b LEFT JOIN fact f ON f.month=b.month WHERE b.tenant_id=$1 AND b.project_id=$2 GROUP BY 1)
             SELECT year,months,amount::numeric(20,2)::text amount,actual::numeric(20,2)::text actual,(amount-actual)::numeric(20,2)::text remaining,${pct('amount', 'actual')} percent
             FROM years ORDER BY year`,
            [actor.tenant_id, query.project_id],
          )
        ).rows,
        items: (
          await db.query(
            `WITH ${fact} SELECT b.*,b.amount::text,coalesce(f.v,0)::numeric(20,2)::text actual,(b.amount-coalesce(f.v,0))::numeric(20,2)::text remaining,${pct('b.amount', 'coalesce(f.v,0)')} percent
             FROM budgets b LEFT JOIN fact f ON f.month=b.month WHERE b.tenant_id=$1 AND b.project_id=$2 ORDER BY b.month LIMIT $3 OFFSET $4`,
            [actor.tenant_id, query.project_id, query.limit, query.offset],
          )
        ).rows,
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/projects/:id/dashboard',
    summary: 'Tannarx, cash flow, qarz; material sarfi progress deb olinmaydi',
    permission: 'finance.read',
    params: idParams,
    handler: async ({ db, actor, params }) => {
      await projectScope(db, actor, params.id);
      const row = await one(
        db,
        `SELECT coalesce(sum(amount) FILTER(WHERE account='expense'),0)::text actual_cost,coalesce(sum(amount) FILTER(WHERE account='cash'),0)::text net_cash_flow,(-coalesce(sum(amount) FILTER(WHERE account='payable'),0))::text supplier_debt,coalesce(sum(amount) FILTER(WHERE account='advance'),0)::text advances FROM journal_entries WHERE tenant_id=$1 AND project_id=$2`,
        [actor.tenant_id, params.id],
      );
      return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, money(value)]));
    },
  });
}
