import { z } from 'zod';
import { type Endpoint } from './http.js';
import { one, audit } from './db.js';
import {
  uuid,
  text,
  idParams,
  pageQuery,
  version,
  reason,
  qty,
  amount,
  date,
  estimateInput,
  stockInput,
  financeInput,
} from './schemas.js';
import {
  projectScope,
  accountScope,
  permit,
  financialPages,
  pageAllowed,
  allowed,
} from './permissions.js';
import { invariant } from './errors.js';
import { digest } from './security.js';
import { writeEstimate, validateEstimate, parseWorkbook, resolveImportNames } from './estimates.js';
import { createStock, transitionStock, reverseStock, reconcileStock } from './inventory.js';
import { postFinance, reverseFinance } from './finance.js';
import { money } from './money.js';
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
    summary: 'Kompaniya materialini yaratish (ombor kirimi yoki smeta import huquqi bilan)',
    body: z.strictObject({ name: text, unit_id: text, catalog_id: uuid.optional() }),
    idempotent: true,
    handler: async ({ db, actor, body }) => {
      invariant(
        (await allowed(db, actor, 'stock.receive')) ||
          (await allowed(db, actor, 'estimates.import')),
        'FORBIDDEN',
        403,
      );
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
    summary: 'Kompaniya materiallari (narxsiz; obyekt ko‘rish huquqi yetarli)',
    permission: 'projects.read',
    query: pageQuery,
    handler: async ({ db, actor, query }) => ({
      items: (
        await db.query(
          'SELECT * FROM materials WHERE tenant_id=$1 AND archived_at IS NULL ORDER BY name,id LIMIT $2 OFFSET $3',
          [actor.tenant_id, query.limit, query.offset],
        )
      ).rows,
    }),
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
    summary: 'Obyekt smetalari',
    permission: 'estimates.read',
    query: projectQuery,
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      return {
        items: (
          await db.query(
            `SELECT e.*,u.display_name created_by_name,
               (SELECT count(*)::int FROM estimate_lines l WHERE l.tenant_id=e.tenant_id AND l.estimate_id=e.id AND l.archived_at IS NULL) line_count,
               (SELECT coalesce(sum(l.total),0)::text FROM estimate_lines l WHERE l.tenant_id=e.tenant_id AND l.estimate_id=e.id AND l.archived_at IS NULL) total,
               (SELECT coalesce(sum(l.total) FILTER(WHERE l.kind='material'),0)::text FROM estimate_lines l WHERE l.tenant_id=e.tenant_id AND l.estimate_id=e.id AND l.archived_at IS NULL) material_total,
               (SELECT coalesce(sum(l.total) FILTER(WHERE l.kind<>'material'),0)::text FROM estimate_lines l WHERE l.tenant_id=e.tenant_id AND l.estimate_id=e.id AND l.archived_at IS NULL) work_total
             FROM estimates e LEFT JOIN users u ON u.id=e.created_by
             WHERE e.tenant_id=$1 AND e.project_id=$2 AND e.archived_at IS NULL ORDER BY e.created_at DESC,e.id LIMIT $3 OFFSET $4`,
            [actor.tenant_id, query.project_id, query.limit, query.offset],
          )
        ).rows,
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/estimates/:id',
    summary: 'Joriy smeta va oylik qatorlar',
    permission: 'estimates.read',
    params: idParams,
    sensitive: true,
    handler: async ({ db, actor, params }) => {
      const estimate = await one(db, 'SELECT * FROM estimates WHERE tenant_id=$1 AND id=$2', [
        actor.tenant_id,
        params.id,
      ]);
      await projectScope(db, actor, estimate.project_id);
      return {
        ...estimate,
        lines: (
          await db.query(
            `SELECT l.*,m.name material_name,z.name zone_name,
               coalesce((SELECT jsonb_agg(jsonb_build_object('month',mo.month,'quantity',mo.quantity::text) ORDER BY mo.month) FROM estimate_months mo WHERE mo.tenant_id=l.tenant_id AND mo.line_id=l.id),'[]') months,
               CASE WHEN l.kind='material'
                 THEN (SELECT coalesce(sum(c.accepted_quantity),0)::text FROM stock_commands c WHERE c.tenant_id=l.tenant_id AND c.estimate_line_id=l.id AND c.kind='consumption' AND c.status IN ('posted','partial'))
                 ELSE (SELECT coalesce(sum(p.quantity),0)::text FROM progress_entries p WHERE p.tenant_id=l.tenant_id AND p.estimate_line_id=l.id) END fact_quantity,
               CASE WHEN l.kind='material'
                 THEN (SELECT coalesce(-sum(j.amount),0)::text FROM journal_entries j JOIN stock_commands c ON c.tenant_id=j.tenant_id AND c.id=j.stock_command_id WHERE j.tenant_id=l.tenant_id AND c.estimate_line_id=l.id AND c.kind='consumption' AND j.account='inventory')
                 ELSE NULL END fact_value
             FROM estimate_lines l LEFT JOIN materials m ON m.id=l.material_id LEFT JOIN zones z ON z.id=l.zone_id
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
      file_base64: z.string().max(2800000),
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
      await validateEstimate(db, actor, input);
      const row = await one(
        db,
        "INSERT INTO import_previews(tenant_id,project_id,created_by,payload,digest,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '1 hour') RETURNING id,digest,expires_at",
        [
          actor.tenant_id,
          body.project_id,
          actor.id,
          JSON.stringify(input),
          digest(JSON.stringify(input)),
        ],
      );
      return { ...row, preview: input };
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
    handler: async ({ db, actor, params, body }) => {
      const preview = await one(
        db,
        'SELECT * FROM import_previews WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [actor.tenant_id, params.id],
      );
      await projectScope(db, actor, preview.project_id);
      invariant(preview.created_by === actor.id || actor.role === 'tenant_admin', 'FORBIDDEN', 403);
      invariant(body.digest === preview.digest, 'PREVIEW_CHANGED');
      if (preview.committed_estimate_id) return { id: preview.committed_estimate_id };
      invariant(new Date(preview.expires_at).getTime() > Date.now(), 'PREVIEW_EXPIRED', 410);
      const estimate = await writeEstimate(db, actor, preview.payload);
      await db.query('UPDATE import_previews SET committed_estimate_id=$2 WHERE id=$1', [
        params.id,
        estimate.id,
      ]);
      return estimate;
    },
  });
  add({
    method: 'POST',
    path: '/v1/counterparties',
    summary: 'Yetkazib beruvchi, pudratchi yoki mijoz',
    permission: 'finance.post',
    page: 'counterparties',
    body: z.strictObject({ name: text, kind: z.enum(['supplier', 'contractor', 'customer']) }),
    idempotent: true,
    handler: async ({ db, actor, body }) =>
      one(db, 'INSERT INTO counterparties(tenant_id,name,kind) VALUES($1,$2,$3) RETURNING *', [
        actor.tenant_id,
        body.name,
        body.kind,
      ]),
  });
  add({
    method: 'GET',
    path: '/v1/counterparties',
    summary: 'Kompaniya kontragentlari',
    permission: 'finance.read',
    page: 'counterparties',
    query: pageQuery,
    handler: async ({ db, actor, query }) => ({
      items: (
        await db.query(
          'SELECT * FROM counterparties WHERE tenant_id=$1 ORDER BY name,id LIMIT $2 OFFSET $3',
          [actor.tenant_id, query.limit, query.offset],
        )
      ).rows,
    }),
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
    summary: 'Faqat ruxsat berilgan moliyaviy sahifalarga tegishli hujjatlar',
    query: projectQuery,
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
      return {
        items: (
          await db.query(
            "SELECT f.* FROM finance_documents f WHERE f.tenant_id=$1 AND f.project_id=$2 AND f.kind=ANY($5::text[]) AND (f.kind<>'reversal' OR EXISTS(SELECT 1 FROM finance_documents original WHERE original.tenant_id=f.tenant_id AND original.id=f.reverses_id AND original.kind=ANY($5::text[]))) ORDER BY f.created_at DESC,f.id LIMIT $3 OFFSET $4",
            [actor.tenant_id, query.project_id, query.limit, query.offset, kinds],
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
    summary: 'Obyektning oylik budjetlari',
    permission: 'finance.read',
    page: 'budgets',
    query: projectQuery,
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      return {
        items: (
          await db.query(
            'SELECT * FROM budgets WHERE tenant_id=$1 AND project_id=$2 ORDER BY month LIMIT $3 OFFSET $4',
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
