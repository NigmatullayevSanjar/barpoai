import { z } from 'zod';
import { type Endpoint } from './http.js';
import { type Db, type Row, one, audit } from './db.js';
import {
  uuid,
  text,
  date,
  area,
  idParams,
  pageQuery,
  searchQuery,
  likePattern,
  queryBool,
  version,
  password,
  loginName,
  reason,
  phone,
} from './schemas.js';
import {
  projectScope,
  assignedUser,
  permissions,
  tenantRoles,
  allowed,
  delegatableRole,
} from './permissions.js';
import { hashPassword, token, digest } from './security.js';
import { invariant } from './errors.js';
import { workFactSql } from './routes-dashboard.js';
import { creditBalance } from './billing.js';
import { money } from './money.js';
import { accessState } from './auth.js';
import { lockProjectPremises } from './premises.js';
import { notify } from './notify.js';
/** Yangi obyekt bilan avtomatik yaratiladigan ombor nomi (foydalanuvchida til ustuni yo'q, nom doimiy). */
export const MAIN_WAREHOUSE_NAME = 'Asosiy ombor';
export function companyRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'GET',
    path: '/v1/projects',
    summary:
      'Faqat biriktirilgan obyektlar; q — nom, kod, buyurtmachi, manzil bo‘yicha qidiruv; status filtri; karta uchun progress, mas‘ul, smeta va xarajat jami (narx huquqisiz kesiladi)',
    permission: 'projects.read',
    sensitive: true,
    query: searchQuery.extend({
      status: z.enum(['planning', 'active', 'paused', 'completed']).optional(),
    }),
    handler: async ({ db, actor, query }) => ({
      items: (
        await db.query(
          // Figma obyekt kartasi (2026-10-17): progress — dashboard bilan bir xil qoida (ish qatorlari bo'yicha qabul
          // qilingan progress o'rtachasi); mas'ul — biriktirilgan prorab, bo'lmasa menejer; smeta — joriy smetalar jami;
          // xarajat — jurnal `expense`. Pul maydonlari `sensitive` orqali narx huquqisiz kesiladi.
          `SELECT p.*,
                  (SELECT avg(least(100,100*${workFactSql}/l.effective_quantity))::numeric(5,1)::text FROM estimate_lines l JOIN estimates e ON e.id=l.estimate_id
                    WHERE l.tenant_id=p.tenant_id AND l.project_id=p.id AND l.kind<>'material' AND l.archived_at IS NULL AND e.archived_at IS NULL AND l.effective_quantity>0) progress_percent,
                  (SELECT u.display_name FROM project_assignments a JOIN users u ON u.tenant_id=a.tenant_id AND u.id=a.user_id
                    WHERE a.tenant_id=p.tenant_id AND a.project_id=p.id AND u.active AND u.role IN ('foreman','manager')
                    ORDER BY (u.role='foreman') DESC,u.display_name LIMIT 1) responsible_name,
                  (SELECT coalesce(sum(l.total),0)::text FROM estimate_lines l JOIN estimates e ON e.id=l.estimate_id
                    WHERE l.tenant_id=p.tenant_id AND l.project_id=p.id AND l.archived_at IS NULL AND e.archived_at IS NULL) plan_total,
                  (SELECT coalesce(sum(j.amount),0)::text FROM journal_entries j WHERE j.tenant_id=p.tenant_id AND j.project_id=p.id AND j.account='expense') fact_total
           FROM projects p WHERE p.tenant_id=$1 AND p.archived_at IS NULL AND ($2='tenant_admin' OR EXISTS(SELECT 1 FROM project_assignments a WHERE a.tenant_id=p.tenant_id AND a.project_id=p.id AND a.user_id=$3))
             AND ($6::text IS NULL OR p.name ILIKE $6 ESCAPE '\\' OR p.code ILIKE $6 ESCAPE '\\' OR p.customer_name ILIKE $6 ESCAPE '\\' OR p.address ILIKE $6 ESCAPE '\\')
             AND ($7::text IS NULL OR p.status=$7)
           ORDER BY p.created_at,p.id LIMIT $4 OFFSET $5`,
          [
            actor.tenant_id,
            actor.role,
            actor.id,
            query.limit,
            query.offset,
            query.q ? likePattern(query.q) : null,
            query.status ?? null,
          ],
        )
      ).rows,
    }),
  });
  const projectStatus = z.enum(['planning', 'active', 'paused', 'completed']);
  const projectBody = z.strictObject({
    name: text,
    code: z.string().trim().min(1).max(40).nullable().optional(),
    address: z.string().trim().max(500).nullable().optional(),
    customer_name: z.string().trim().max(200).nullable().optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    status: projectStatus.optional(),
    planned_start: date.nullable().optional(),
    planned_end: date.nullable().optional(),
    area_m2: area.nullable().optional(),
    // V-C (D23): brigada stavkasining standart foizi (smeta birlik narxidan), 0..100
    brigade_percent: z
      .string()
      .regex(/^(100|\d{1,2})(\.\d{1,2})?$/)
      .nullable()
      .optional(),
  });
  // Tugash boshlanishdan oldin bo'lmasin (ISO sanalar matn sifatida solishtiriladi); baza CHECK'i 409 o'rniga 400.
  const dateOrder = (start?: string | null, end?: string | null) =>
    invariant(!start || !end || end >= start, 'DATE_RANGE_INVALID', 400);
  add({
    method: 'POST',
    path: '/v1/projects',
    summary: 'Obyekt yaratish',
    permission: 'projects.write',
    body: projectBody,
    idempotent: true,
    handler: async ({ db, actor, body }) => {
      dateOrder(body.planned_start, body.planned_end);
      const row = await one(
        db,
        'INSERT INTO projects(tenant_id,name,code,address,customer_name,description,status,planned_start,planned_end,area_m2,brigade_percent) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
        [
          actor.tenant_id,
          body.name,
          body.code || null,
          body.address || null,
          body.customer_name || null,
          body.description || null,
          body.status ?? 'planning',
          body.planned_start ?? null,
          body.planned_end ?? null,
          body.area_m2 ?? null,
          body.brigade_percent ?? null,
        ],
      );
      await db.query('INSERT INTO project_assignments VALUES($1,$2,$3)', [
        actor.tenant_id,
        row.id,
        actor.id,
      ]);
      // Egasi qarori (2026-10-16): har yangi obyekt bilan "Asosiy ombor" va uning stock hisobi bir
      // tranzaksiyada yaratiladi (mavjud obyektlar uchun migratsiya 022).
      const mainWarehouse = await one(
        db,
        'INSERT INTO warehouses(tenant_id,project_id,name) VALUES($1,$2,$3) RETURNING id',
        [actor.tenant_id, row.id, MAIN_WAREHOUSE_NAME],
      );
      await db.query('INSERT INTO stock_accounts(tenant_id,project_id,warehouse_id) VALUES($1,$2,$3)', [
        actor.tenant_id,
        row.id,
        mainWarehouse.id,
      ]);
      await audit(db, actor, 'project.create', row.id);
      return row;
    },
  });
  add({
    method: 'PATCH',
    path: '/v1/projects/:id',
    summary:
      'Obyekt va alohida forecastni yangilash; image_file_id — shu obyektga yuklangan JPEG/PNG fayl (null — olib tashlash)',
    permission: 'projects.write',
    params: idParams,
    body: projectBody.extend({
      version,
      forecast_end: date.nullable().optional(),
      actual_start: date.nullable().optional(),
      actual_end: date.nullable().optional(),
      image_file_id: uuid.nullable().optional(),
    }),
    idempotent: true,
    handler: async ({ db, actor, body, params }) => {
      await projectScope(db, actor, params.id);
      // Qator avval qulflanadi: parallel tahrirda UPDATE 0 qator (404) emas, VERSION_CONFLICT (409) bo'ladi.
      const current = await one(
        db,
        'SELECT * FROM projects WHERE tenant_id=$1 AND id=$2 FOR NO KEY UPDATE',
        [actor.tenant_id, params.id],
      );
      invariant(current.version === body.version, 'VERSION_CONFLICT');
      dateOrder(body.planned_start, body.planned_end);
      dateOrder(body.actual_start, body.actual_end);
      // Yangi rasm: faqat shu obyektga yuklangan, hisobot/vazifaga bog'lanmagan, arxivlanmagan fayl.
      // O'zgarmagan id qayta tekshirilmaydi (arxivlangan eski rasm obyekt tahririni bloklamasin).
      if (body.image_file_id && body.image_file_id !== current.image_file_id)
        await one(
          db,
          'SELECT id FROM files WHERE tenant_id=$1 AND id=$2 AND project_id=$3 AND report_id IS NULL AND task_id IS NULL AND archived_at IS NULL FOR SHARE',
          [actor.tenant_id, body.image_file_id, params.id],
        );
      const row = await one(
        db,
        `UPDATE projects SET name=$3,code=$4,address=$5,customer_name=$6,description=$7,status=$8,planned_start=$9,planned_end=$10,
           forecast_end=$11,actual_start=$12,actual_end=$13,area_m2=$14,image_file_id=$15,brigade_percent=$16,version=version+1 WHERE id=$1 AND version=$2 RETURNING *`,
        [
          params.id,
          body.version,
          body.name,
          body.code || null,
          body.address || null,
          body.customer_name || null,
          body.description || null,
          body.status ?? current.status,
          body.planned_start ?? null,
          body.planned_end ?? null,
          body.forecast_end ?? null,
          body.actual_start ?? null,
          body.actual_end ?? null,
          body.area_m2 ?? null,
          body.image_file_id ?? null,
          body.brigade_percent ?? null,
        ],
      );
      await audit(db, actor, 'project.update', row.id);
      return row;
    },
  });
  const zoneKind = z.enum(['block', 'entrance', 'floor', 'other']);
  const zoneFloors = z.number().int().min(1).max(500).nullable().optional();
  // Blok bo'lmagan zonaga qavatlar soni jim tashlab yuborilmaydi: 400 VALIDATION_ERROR.
  const floorsOnlyForBlock = (b: { kind?: string; floors_count?: number | null }) =>
    b.kind === 'block' || b.floors_count == null;
  const floorsOnlyForBlockError = {
    path: ['floors_count'],
    message: 'Qavatlar soni faqat blok uchun',
  };
  // Blok kartasi maydonlari (019): berilmasa PATCH'da joriy qiymat qoladi, null — tozalash.
  const zoneProfile = {
    area_m2: area.nullable().optional(),
    planned_start: date.nullable().optional(),
    planned_end: date.nullable().optional(),
    actual_start: date.nullable().optional(),
    actual_end: date.nullable().optional(),
    image_file_id: uuid.nullable().optional(),
    responsible_ids: z.array(uuid).max(20).optional(),
  };
  type ZoneProfile = { [K in keyof typeof zoneProfile]?: z.infer<(typeof zoneProfile)[K]> };
  /** Sanalar tartibi, rasm (shu obyekt fayli) va mas'ullar (kompaniyaning faol xodimi) tekshiruvi. */
  async function checkZoneProfile(
    db: Db,
    actor: Row,
    projectId: string,
    body: ZoneProfile,
    current?: Row,
  ) {
    const pick = <K extends keyof ZoneProfile>(k: K) =>
      body[k] === undefined ? (current?.[k] ?? null) : body[k];
    dateOrder(pick('planned_start'), pick('planned_end'));
    dateOrder(pick('actual_start'), pick('actual_end'));
    if (body.image_file_id && body.image_file_id !== current?.image_file_id)
      await one(
        db,
        'SELECT id FROM files WHERE tenant_id=$1 AND id=$2 AND project_id=$3 AND report_id IS NULL AND task_id IS NULL AND archived_at IS NULL FOR SHARE',
        [actor.tenant_id, body.image_file_id, projectId],
      );
    if (body.responsible_ids?.length) {
      const ids = [...new Set(body.responsible_ids)];
      const found = await db.query(
        'SELECT id FROM users WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND active',
        [actor.tenant_id, ids],
      );
      invariant(found.rowCount === ids.length, 'NOT_FOUND', 404);
    }
    return pick;
  }
  async function setZoneResponsibles(
    db: Db,
    actor: Row,
    projectId: string,
    zoneId: string,
    ids?: string[],
  ) {
    if (ids === undefined) return;
    await db.query('DELETE FROM zone_responsibles WHERE tenant_id=$1 AND zone_id=$2', [
      actor.tenant_id,
      zoneId,
    ]);
    if (ids.length)
      await db.query(
        'INSERT INTO zone_responsibles(tenant_id,project_id,zone_id,user_id) SELECT $1,$2,$3,unnest($4::uuid[]) ON CONFLICT DO NOTHING',
        [actor.tenant_id, projectId, zoneId, ids],
      );
  }
  add({
    method: 'POST',
    path: '/v1/projects/:id/zones',
    summary:
      'O‘zgarmas parent bilan zona yaratish; floors_count faqat kind=block uchun (aks holda 400); blok kartasi: maydon, reja/fakt sanalari, rasm, mas’ullar',
    permission: 'projects.write',
    params: idParams,
    body: z
      .strictObject({
        name: text,
        parent_id: uuid.optional(),
        kind: zoneKind.optional(),
        floors_count: zoneFloors,
        ...zoneProfile,
      })
      .refine(floorsOnlyForBlock, floorsOnlyForBlockError),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      await projectScope(db, actor, params.id);
      const kind = body.kind ?? 'other';
      const pick = await checkZoneProfile(db, actor, params.id, body);
      const row = await one(
        db,
        `INSERT INTO zones(tenant_id,project_id,name,parent_id,kind,floors_count,area_m2,planned_start,planned_end,actual_start,actual_end,image_file_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [
          actor.tenant_id,
          params.id,
          body.name,
          body.parent_id ?? null,
          kind,
          body.floors_count ?? null,
          pick('area_m2'),
          pick('planned_start'),
          pick('planned_end'),
          pick('actual_start'),
          pick('actual_end'),
          pick('image_file_id'),
        ],
      );
      await setZoneResponsibles(db, actor, params.id, row.id, body.responsible_ids);
      await audit(db, actor, 'zone.create', row.id, { project_id: params.id });
      return row;
    },
  });
  add({
    method: 'PATCH',
    path: '/v1/projects/:id/zones/:zone_id',
    summary:
      'Zona nomi, turi, qavatlar soni va blok kartasini tahrirlash (version bilan); parent o‘zgarmaydi; berilmagan karta maydoni o‘zgarmaydi',
    permission: 'projects.write',
    params: z.strictObject({ id: uuid, zone_id: uuid }),
    body: z
      .strictObject({
        version,
        name: text,
        kind: zoneKind,
        floors_count: zoneFloors,
        ...zoneProfile,
      })
      .refine(floorsOnlyForBlock, floorsOnlyForBlockError),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      await projectScope(db, actor, params.id);
      // Turi o'zgarsa xonadonlar bloki qayta hisoblanadi: qulf tartibi xonadon yozuvlari bilan bir xil.
      await lockProjectPremises(db, params.id);
      // Sanalar matn sifatida: berilmagan maydon joriy qiymatini saqlaydi va yangisi bilan satr bo'yicha solishtiriladi.
      const zone = await one(
        db,
        `SELECT id,version,area_m2,image_file_id,planned_start::text,planned_end::text,actual_start::text,actual_end::text
           FROM zones WHERE tenant_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE`,
        [actor.tenant_id, params.id, params.zone_id],
      );
      invariant(zone.version === body.version, 'VERSION_CONFLICT');
      const pick = await checkZoneProfile(db, actor, params.id, body, zone);
      const row = await one(
        db,
        `UPDATE zones SET name=$2,kind=$3,floors_count=$4,area_m2=$6,planned_start=$7,planned_end=$8,actual_start=$9,actual_end=$10,
           image_file_id=$11,version=version+1 WHERE tenant_id=$5 AND id=$1 RETURNING *`,
        [
          zone.id,
          body.name,
          body.kind,
          body.floors_count ?? null,
          actor.tenant_id,
          pick('area_m2'),
          pick('planned_start'),
          pick('planned_end'),
          pick('actual_start'),
          pick('actual_end'),
          pick('image_file_id'),
        ],
      );
      await setZoneResponsibles(db, actor, params.id, row.id, body.responsible_ids);
      await audit(db, actor, 'zone.update', row.id, { project_id: params.id });
      return row;
    },
  });
  add({
    method: 'GET',
    path: '/v1/projects/:id/zones',
    summary: 'Obyekt zonalari',
    permission: 'projects.read',
    params: idParams,
    handler: async ({ db, actor, params }) => {
      await projectScope(db, actor, params.id);
      return {
        items: (
          await db.query(
            'SELECT * FROM zones WHERE tenant_id=$1 AND project_id=$2 ORDER BY name,id',
            [actor.tenant_id, params.id],
          )
        ).rows,
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/employees',
    summary:
      'Kompaniya xodimlari; hash hech qachon chiqmaydi; q — ism, login, telefon, lavozim; role va active filtrlari',
    permission: 'employees.read',
    query: searchQuery.extend({
      role: z.enum(tenantRoles).optional(),
      active: queryBool.optional(),
    }),
    handler: async ({ db, actor, query }) => ({
      // Figma "Xodimlar" KPI kartalari: jami, faol, nofaol (filtrsiz, sahifalashsiz).
      summary: await one(
        db,
        'SELECT count(*)::int total,count(*) FILTER(WHERE active)::int active,count(*) FILTER(WHERE NOT active)::int inactive FROM users WHERE tenant_id=$1',
        [actor.tenant_id],
      ),
      items: (
        await db.query(
          `SELECT u.id,u.login,u.display_name,u.phone,u.role,u.active,u.must_change_password,u.position,u.hired_at,u.version,u.created_at,
             (SELECT coalesce(json_agg(json_build_object('project_id',a.project_id,'project_name',p.name) ORDER BY p.name),'[]') FROM project_assignments a JOIN projects p ON p.id=a.project_id WHERE a.tenant_id=u.tenant_id AND a.user_id=u.id AND p.archived_at IS NULL) projects,
             EXISTS(SELECT 1 FROM telegram_accounts ta WHERE ta.user_id=u.id) telegram_linked
           FROM users u WHERE u.tenant_id=$1
             AND ($4::text IS NULL OR u.display_name ILIKE $4 ESCAPE '\\' OR u.login ILIKE $4 ESCAPE '\\' OR u.phone ILIKE $4 ESCAPE '\\' OR u.position ILIKE $4 ESCAPE '\\')
             AND ($5::text IS NULL OR u.role=$5) AND ($6::boolean IS NULL OR u.active=$6)
           ORDER BY u.display_name,u.id LIMIT $2 OFFSET $3`,
          [
            actor.tenant_id,
            query.limit,
            query.offset,
            query.q ? likePattern(query.q) : null,
            query.role ?? null,
            query.active ?? null,
          ],
        )
      ).rows,
    }),
  });
  const employeeRole = z.enum([
    'foreman',
    'brigadier',
    'warehouse_manager',
    'financier',
    'accountant',
    'manager',
  ]);
  add({
    method: 'POST',
    path: '/v1/employees',
    summary: 'Xodim va almashtirilishi majburiy boshlang‘ich parol',
    permission: 'employees.manage',
    action: 'create',
    body: z.strictObject({
      login: loginName,
      password,
      display_name: text,
      role: employeeRole,
      phone: phone.optional(),
      position: z.string().trim().max(120).nullable().optional(),
      hired_at: date.nullable().optional(),
      project_ids: z.array(uuid).max(50).optional(),
    }),
    idempotent: true,
    handler: async ({ db, actor, body }) => {
      await delegatableRole(db, actor, body.role);
      const row = await one(
        db,
        'INSERT INTO users(tenant_id,login,password_hash,display_name,role,must_change_password,phone,position,hired_at) VALUES($1,$2,$3,$4,$5,true,$6,$7,$8) RETURNING id,login,role,display_name,phone,position,hired_at,must_change_password,version',
        [
          actor.tenant_id,
          body.login.toLowerCase(),
          await hashPassword(body.password),
          body.display_name,
          body.role,
          body.phone ?? null,
          body.position || null,
          body.hired_at ?? null,
        ],
      );
      for (const projectId of body.project_ids ?? []) {
        await projectScope(db, actor, projectId);
        await db.query('INSERT INTO project_assignments VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [
          actor.tenant_id,
          projectId,
          row.id,
        ]);
        if (body.role === 'brigadier')
          await db.query(
            'INSERT INTO stock_accounts(tenant_id,project_id,custodian_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
            [actor.tenant_id, projectId, row.id],
          );
      }
      await audit(db, actor, 'employee.create', row.id);
      return row;
    },
  });
  add({
    method: 'PATCH',
    path: '/v1/employees/:id',
    summary: 'Rol yoki holat o‘zgarishi sessiyalarni bekor qiladi',
    permission: 'employees.manage',
    params: idParams,
    body: z.strictObject({
      version,
      display_name: text,
      role: employeeRole,
      active: z.boolean(),
      phone: phone.nullable().optional(),
      position: z.string().trim().max(120).nullable().optional(),
      hired_at: date.nullable().optional(),
    }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      const user = await one(db, 'SELECT * FROM users WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
        actor.tenant_id,
        params.id,
      ]);
      invariant(user.role !== 'tenant_admin', 'OWNERSHIP_TRANSFER_REQUIRED');
      invariant(user.version === body.version, 'VERSION_CONFLICT');
      await delegatableRole(db, actor, body.role);
      invariant(
        actor.role === 'tenant_admin' || actor.id !== user.id,
        'SELF_ROLE_CHANGE_FORBIDDEN',
        403,
      );
      if (!body.active || user.role !== body.role) {
        const held = await db.query(
          'SELECT 1 FROM stock_accounts a JOIN stock_balances b ON b.tenant_id=a.tenant_id AND b.account_id=a.id WHERE a.tenant_id=$1 AND a.custodian_id=$2 AND (b.quantity>0 OR b.reserved>0) LIMIT 1',
          [actor.tenant_id, user.id],
        );
        const tasks = await db.query(
          "SELECT 1 FROM tasks WHERE tenant_id=$1 AND (assignee_id=$2 OR reviewer_id=$2) AND status<>'accepted' LIMIT 1",
          [actor.tenant_id, user.id],
        );
        invariant(!held.rowCount && !tasks.rowCount, 'HANDOVER_REQUIRED');
      }
      const row = await one(
        db,
        `UPDATE users SET display_name=$3,role=$4,active=$5,phone=CASE WHEN $6::boolean THEN $7 ELSE phone END,
           position=CASE WHEN $8::boolean THEN $9 ELSE position END,hired_at=CASE WHEN $10::boolean THEN $11 ELSE hired_at END,version=version+1
         WHERE tenant_id=$1 AND id=$2 RETURNING id,display_name,role,active,phone,position,hired_at,version`,
        [
          actor.tenant_id,
          user.id,
          body.display_name,
          body.role,
          body.active,
          body.phone !== undefined,
          body.phone ?? null,
          body.position !== undefined,
          body.position || null,
          body.hired_at !== undefined,
          body.hired_at ?? null,
        ],
      );
      // Rol yoki faollik o'zgarsa sessiyalar bekor qilinadi; ism/telefon tahriri xodimni chiqarib yubormaydi.
      if (!body.active || user.role !== body.role)
        await db.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1', [user.id]);
      await audit(db, actor, 'employee.update', user.id);
      return row;
    },
  });
  add({
    method: 'POST',
    path: '/v1/employees/:id/assignments',
    summary: 'Xodimga obyekt va ombor doirasi',
    permission: 'employees.manage',
    params: idParams,
    body: z.strictObject({ project_id: uuid, warehouse_id: uuid.optional() }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      await projectScope(db, actor, body.project_id);
      const target = await one(
        db,
        'SELECT id,role FROM users WHERE tenant_id=$1 AND id=$2 AND active',
        [actor.tenant_id, params.id],
      );
      await db.query('INSERT INTO project_assignments VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [
        actor.tenant_id,
        body.project_id,
        params.id,
      ]);
      // Brigadir uchun obyektdagi shaxsiy material hisobi avtomatik ochiladi.
      if (target.role === 'brigadier')
        await db.query(
          'INSERT INTO stock_accounts(tenant_id,project_id,custodian_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [actor.tenant_id, body.project_id, params.id],
        );
      if (body.warehouse_id) {
        await one(db, 'SELECT 1 FROM warehouses WHERE tenant_id=$1 AND id=$2 AND project_id=$3', [
          actor.tenant_id,
          body.warehouse_id,
          body.project_id,
        ]);
        await db.query(
          'INSERT INTO warehouse_assignments VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [actor.tenant_id, body.warehouse_id, params.id],
        );
      }
      await audit(db, actor, 'employee.assign', params.id, {
        project_id: body.project_id,
        warehouse_id: body.warehouse_id,
      });
      return { ok: true };
    },
  });
  add({
    method: 'POST',
    path: '/v1/employees/:id/permissions',
    summary: 'Individual grant/deny; platforma vakolati berilmaydi',
    permission: 'employees.manage',
    params: idParams,
    body: z.strictObject({
      permission: z.enum(permissions),
      effect: z.enum(['grant', 'deny', 'inherit']),
    }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      invariant(actor.role === 'tenant_admin' && actor.id !== params.id, 'FORBIDDEN', 403);
      const user = await one(db, 'SELECT role FROM users WHERE tenant_id=$1 AND id=$2', [
        actor.tenant_id,
        params.id,
      ]);
      invariant(user.role !== 'tenant_admin', 'FORBIDDEN', 403);
      invariant(body.permission !== 'employees.manage', 'NON_DELEGABLE_PERMISSION', 403);
      if (body.effect === 'grant')
        invariant(
          await allowed(db, actor, body.permission),
          'DELEGATION_EXCEEDS_OWN_PERMISSIONS',
          403,
        );
      if (body.effect === 'inherit')
        await db.query(
          'DELETE FROM permission_overrides WHERE tenant_id=$1 AND user_id=$2 AND permission=$3',
          [actor.tenant_id, params.id, body.permission],
        );
      else
        await db.query(
          'INSERT INTO permission_overrides VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,user_id,permission) DO UPDATE SET effect=excluded.effect',
          [actor.tenant_id, params.id, body.permission, body.effect],
        );
      await audit(db, actor, 'employee.permission', params.id, body);
      return { ok: true };
    },
  });
  add({
    method: 'POST',
    path: '/v1/employees/:id/reset',
    summary: 'Xodimga bir martalik reset token; parol qaytarilmaydi',
    permission: 'employees.manage',
    params: idParams,
    handler: async ({ db, actor, params }) => {
      const user = await one(
        db,
        'SELECT id,role FROM users WHERE tenant_id=$1 AND id=$2 AND active',
        [actor.tenant_id, params.id],
      );
      invariant(user.role !== 'tenant_admin', 'FORBIDDEN', 403);
      await db.query(
        'UPDATE password_resets SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',
        [params.id],
      );
      const raw = token();
      await db.query("INSERT INTO password_resets VALUES($1,$2,now()+interval '30 minutes',NULL)", [
        digest(raw),
        params.id,
      ]);
      await db.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1', [params.id]);
      await audit(db, actor, 'employee.reset', params.id);
      return { token: raw, expires_in: 1800 };
    },
  });
  add({
    method: 'GET',
    path: '/v1/billing',
    page: 'billing',
    action: 'read',
    summary: 'Bloklangan admin uchun ham obuna, invoys va to‘lov tarixi',
    recovery: true,
    handler: async ({ db, actor }) => ({
      tenant: await one(
        db,
        'SELECT legal_name,status,trial_started_at,trial_ends_at,paid_until FROM tenants WHERE id=$1',
        [actor.tenant_id],
      ).then((row) => ({ ...row, ...accessState(row) })),
      subscription:
        (
          await db.query(
            'SELECT s.*,p.code,p.version,p.monthly_price,p.limits FROM subscriptions s JOIN plan_versions p ON p.id=s.plan_version_id WHERE s.tenant_id=$1',
            [actor.tenant_id],
          )
        ).rows[0] ?? null,
      invoices: (
        await db.query(
          `SELECT i.*,coalesce((SELECT sum(CASE WHEN e.kind='refund' THEN -e.amount ELSE e.amount END) FROM billing_entries e WHERE e.invoice_id=i.id),0)::text covered
           FROM billing_invoices i WHERE i.tenant_id=$1 ORDER BY i.period_start DESC`,
          [actor.tenant_id],
        )
      ).rows,
      credit_balance: money(await creditBalance(db, actor.tenant_id)),
      entries: (
        await db.query(
          'SELECT id,invoice_id,kind,amount,created_at FROM billing_entries WHERE tenant_id=$1 ORDER BY created_at DESC',
          [actor.tenant_id],
        )
      ).rows,
    }),
  });
  add({
    method: 'POST',
    path: '/v1/support-requests',
    page: 'billing',
    action: 'create',
    summary: 'Bloklangan admin uchun support yoki tarif almashtirish so‘rovi',
    recovery: true,
    body: z.strictObject({ kind: z.enum(['support', 'plan_change']), message: reason }),
    handler: async ({ db, actor, body }) => {
      const row = await one(
        db,
        'INSERT INTO support_requests(tenant_id,user_id,kind,message) VALUES($1,$2,$3,$4) RETURNING id,status,created_at',
        [actor.tenant_id, actor.id, body.kind, body.message],
      );
      // Platforma xodimlariga (super admin, support, egasi) bildirishnoma: ilova ichida + Telegram (ulangan bo'lsa).
      const tenant = await one(db, 'SELECT legal_name FROM tenants WHERE id=$1', [actor.tenant_id]);
      const staff = (
        await db.query(
          "SELECT id FROM users WHERE tenant_id IS NULL AND active AND role IN ('super_admin','support','platform_owner')",
        )
      ).rows;
      const title =
        body.kind === 'plan_change'
          ? `Tarif almashtirish so‘rovi: ${tenant.legal_name}`
          : `Yangi murojaat: ${tenant.legal_name}`;
      for (const s of staff)
        await notify(db, {
          tenant_id: null,
          user_id: s.id,
          kind: 'support.request',
          title,
          body: `${actor.display_name}: ${body.message.slice(0, 300)}${body.message.length > 300 ? '…' : ''}`,
          payload: { support_request_id: row.id, tenant_id: actor.tenant_id, kind: body.kind },
          dedup_key: `support.request:${row.id}:${s.id}`,
        });
      return row;
    },
  });
}
