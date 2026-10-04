import { z } from 'zod';
import { type Endpoint } from './http.js';
import { one, audit, type Db, type Row } from './db.js';
import { uuid, phone, version, date } from './schemas.js';
import { allowed, pageAllowed, projectScope } from './permissions.js';
import { invariant } from './errors.js';
import { accessState } from './auth.js';
import { notificationCategories } from './notify.js';
import {
  projectIds,
  payableKinds,
  outstandingSql,
  notReversedSql,
  planActual,
} from './routes-finance-extra.js';
import { listTasks, listAudit, auditQuery } from './routes-work.js';
import { stockOverview } from './routes-stock-extra.js';
import { xlsxFile, cell } from './xlsx.js';
import { dec, money } from './money.js';

const TZ = 'Asia/Tashkent';
const todaySql = (col: string) =>
  `(${col} AT TIME ZONE '${TZ}')::date=(now() AT TIME ZONE '${TZ}')::date`;
/** Ish qatori bo'yicha tasdiqlangan progress (tuzatishlar bilan). */
const workFactSql = `(coalesce((SELECT sum(pe.quantity) FROM progress_entries pe WHERE pe.tenant_id=l.tenant_id AND pe.estimate_line_id=l.id),0)
  +coalesce((SELECT sum(c.quantity_delta) FROM progress_corrections c JOIN progress_entries pe ON pe.tenant_id=c.tenant_id AND pe.id=c.progress_entry_id WHERE pe.tenant_id=l.tenant_id AND pe.estimate_line_id=l.id),0))`;
/** Rol doirasidagi stock hisoblari (ombor mudiri — biriktirilgan omborlar, brigadir — o'z hisobi). */
const accountScopeSql = `($3<>'brigadier' OR a.custodian_id=$4) AND ($3<>'warehouse_manager' OR a.warehouse_id IS NULL OR EXISTS(SELECT 1 FROM warehouse_assignments w WHERE w.tenant_id=a.tenant_id AND w.warehouse_id=a.warehouse_id AND w.user_id=$4))`;

async function companyView(db: Db, actor: Row) {
  const row = await one(
    db,
    'SELECT id,legal_name,address,phone,settings,status,trial_started_at,trial_ends_at,paid_until,created_at,version FROM tenants WHERE id=$1',
    [actor.tenant_id],
  );
  return {
    id: row.id,
    legal_name: row.legal_name,
    address: row.address,
    phone: row.phone,
    created_at: row.created_at,
    version: row.version,
    status: row.status,
    access: accessState(row),
    settings: {
      telegram: Object.fromEntries(
        notificationCategories.map((c) => [c, row.settings?.telegram?.[c] !== false]),
      ),
    },
  };
}

/** Bosh sahifa bloklari. Har blok faqat tegishli ruxsat bo'lsa hisoblanadi; manbalar docs/BARPO_DASHBOARD_METRICS.md. */
async function dashboard(db: Db, actor: Row) {
  invariant(actor.tenant_id, 'FORBIDDEN', 403);
  const projects = await projectIds(db, actor);
  // Bitta pg mijozida ketma-ket so'rovlar (parallel query navbati pg@9 da olib tashlanadi).
  const canProjects = await pageAllowed(db, actor, 'projects', 'read');
  const canTasks = await allowed(db, actor, 'tasks.read');
  const manageTasks = await allowed(db, actor, 'tasks.manage');
  const canReports = await allowed(db, actor, 'reports.read');
  const reviewReports = await allowed(db, actor, 'reports.review');
  const canStock = await allowed(db, actor, 'stock.read');
  const canFinance = await allowed(db, actor, 'finance.read');
  const prices = await allowed(db, actor, 'prices.read');
  const canEmployees = await pageAllowed(db, actor, 'employees', 'read');
  const scope: unknown[] = [actor.tenant_id, projects];
  const result: Row = {
    generated_at: new Date().toISOString(),
    projects: null,
    tasks: null,
    reports: null,
    stock: null,
    finance: null,
    employees: null,
  };
  if (canProjects) {
    const items = (
      await db.query(
        `SELECT p.id,p.name,p.code,p.status,p.planned_end,p.forecast_end,
                (SELECT count(*)::int FROM tasks t WHERE t.tenant_id=p.tenant_id AND t.project_id=p.id AND t.archived_at IS NULL AND t.status<>'accepted') open_tasks,
                (SELECT count(*)::int FROM tasks t WHERE t.tenant_id=p.tenant_id AND t.project_id=p.id AND t.archived_at IS NULL AND t.status<>'accepted' AND t.deadline<now()) overdue_tasks,
                (SELECT count(*)::int FROM reports r WHERE r.tenant_id=p.tenant_id AND r.project_id=p.id AND r.archived_at IS NULL AND r.status='submitted') pending_reports,
                (SELECT avg(least(100,100*${workFactSql}/l.effective_quantity))::numeric(5,1)::text FROM estimate_lines l JOIN estimates e ON e.id=l.estimate_id
                  WHERE l.tenant_id=p.tenant_id AND l.project_id=p.id AND l.kind<>'material' AND l.archived_at IS NULL AND e.archived_at IS NULL AND l.effective_quantity>0) progress_percent,
                (p.status<>'completed' AND (p.planned_end<current_date OR p.forecast_end>p.planned_end)) behind_schedule
         FROM projects p WHERE p.tenant_id=$1 AND p.id=ANY($2::uuid[]) AND p.archived_at IS NULL
         ORDER BY (p.status='active') DESC,p.name`,
        scope,
      )
    ).rows;
    result.projects = {
      total: items.length,
      active: items.filter((p) => p.status === 'active').length,
      completed: items.filter((p) => p.status === 'completed').length,
      behind_schedule: items.filter((p) => p.behind_schedule).length,
      items,
    };
  }
  if (canTasks) {
    const counts = await one(
      db,
      `SELECT count(*) FILTER(WHERE status<>'accepted')::int open,
              count(*) FILTER(WHERE status<>'accepted' AND deadline<now())::int overdue,
              count(*) FILTER(WHERE status<>'accepted' AND ${todaySql('deadline')})::int due_today,
              count(*) FILTER(WHERE status='submitted' AND reviewer_id=$3)::int awaiting_my_review,
              count(*) FILTER(WHERE status IN ('todo','in_progress','returned') AND assignee_id=$3)::int my_open,
              count(*) FILTER(WHERE status='accepted' AND created_at>now()-interval '30 days')::int accepted_30d
       FROM tasks WHERE tenant_id=$1 AND project_id=ANY($2::uuid[]) AND archived_at IS NULL AND ($4 OR assignee_id=$3 OR reviewer_id=$3)`,
      [...scope, actor.id, manageTasks],
    );
    const items = (
      await db.query(
        `SELECT t.id,t.title,t.status,t.priority,t.deadline,t.project_id,p.name project_name,(t.assignee_id=$3) mine,
                (t.deadline IS NOT NULL AND t.deadline<now()) overdue
         FROM tasks t JOIN projects p ON p.id=t.project_id
         WHERE t.tenant_id=$1 AND t.project_id=ANY($2::uuid[]) AND t.archived_at IS NULL AND t.status<>'accepted' AND (t.assignee_id=$3 OR t.reviewer_id=$3)
         ORDER BY t.deadline NULLS LAST,t.created_at LIMIT 6`,
        [...scope, actor.id],
      )
    ).rows;
    result.tasks = { ...counts, items };
  }
  if (canReports) {
    const counts = await one(
      db,
      `SELECT count(*) FILTER(WHERE status='submitted')::int pending_review,
              count(*) FILTER(WHERE status='returned' AND author_id=$3)::int my_returned,
              count(*) FILTER(WHERE created_at>now()-interval '7 days')::int last_7d
       FROM reports WHERE tenant_id=$1 AND project_id=ANY($2::uuid[]) AND archived_at IS NULL AND ($4 OR author_id=$3)`,
      [...scope, actor.id, reviewReports],
    );
    result.reports = { ...counts, pending_review: reviewReports ? counts.pending_review : null };
  }
  if (canStock) {
    const params = [...scope, actor.role, actor.id];
    const counts = await one(
      db,
      `WITH acc AS (SELECT a.id FROM stock_accounts a WHERE a.tenant_id=$1 AND a.project_id=ANY($2::uuid[]) AND ${accountScopeSql})
       SELECT (SELECT count(*)::int FROM stock_balances b WHERE b.tenant_id=$1 AND b.account_id IN (SELECT id FROM acc) AND b.minimum_quantity>0 AND b.quantity-b.reserved<b.minimum_quantity) low,
              (SELECT count(DISTINCT b.material_id)::int FROM stock_balances b WHERE b.tenant_id=$1 AND b.account_id IN (SELECT id FROM acc) AND b.quantity>0) materials,
              (SELECT coalesce(sum(b.value),0)::text FROM stock_balances b WHERE b.tenant_id=$1 AND b.account_id IN (SELECT id FROM acc) AND b.quantity>0) inventory_value,
              (SELECT count(*)::int FROM material_requests r WHERE r.tenant_id=$1 AND r.project_id=ANY($2::uuid[]) AND r.status='pending') pending_requests,
              (SELECT count(*)::int FROM stock_commands c WHERE c.tenant_id=$1 AND c.project_id=ANY($2::uuid[]) AND c.kind='transfer' AND c.status IN ('pending','partial','disputed')) pending_transfers,
              (SELECT count(*)::int FROM stock_commands c WHERE c.tenant_id=$1 AND c.project_id=ANY($2::uuid[]) AND c.kind='receipt' AND c.status='posted' AND ${todaySql('c.created_at')}) today_receipts,
              (SELECT count(*)::int FROM stock_commands c WHERE c.tenant_id=$1 AND c.project_id=ANY($2::uuid[]) AND c.kind='consumption' AND c.status IN ('posted','partial') AND ${todaySql('c.created_at')}) today_consumptions`,
      params,
    );
    const low = (
      await db.query(
        `SELECT m.name material_name,m.unit_id,coalesce(w.name,u.display_name) account_name,p.name project_name,(b.quantity-b.reserved)::text available,b.minimum_quantity::text minimum_quantity
         FROM stock_balances b JOIN stock_accounts a ON a.id=b.account_id JOIN materials m ON m.id=b.material_id JOIN projects p ON p.id=a.project_id
              LEFT JOIN warehouses w ON w.id=a.warehouse_id LEFT JOIN users u ON u.id=a.custodian_id
         WHERE b.tenant_id=$1 AND a.project_id=ANY($2::uuid[]) AND ${accountScopeSql} AND b.minimum_quantity>0 AND b.quantity-b.reserved<b.minimum_quantity
         ORDER BY (b.quantity-b.reserved)/b.minimum_quantity LIMIT 6`,
        params,
      )
    ).rows;
    result.stock = {
      ...counts,
      inventory_value: prices ? money(counts.inventory_value) : null,
      low_items: low,
    };
  }
  if (canFinance) {
    const journal = await one(
      db,
      `SELECT coalesce(sum(amount) FILTER(WHERE account='expense'),0)::text actual_cost,
              coalesce(sum(amount) FILTER(WHERE account='expense' AND date_trunc('month',created_at)=date_trunc('month',now())),0)::text month_expense,
              coalesce(sum(amount) FILTER(WHERE account='cash'),0)::text net_cash_flow,
              (-coalesce(sum(amount) FILTER(WHERE account='payable'),0))::text supplier_debt,
              coalesce(sum(amount) FILTER(WHERE account='advance'),0)::text advances,
              (-coalesce(sum(amount) FILTER(WHERE account='income'),0))::text income
       FROM journal_entries WHERE tenant_id=$1 AND project_id=ANY($2::uuid[])`,
      scope,
    );
    const budget = await one(
      db,
      `SELECT coalesce(sum(amount),0)::text AS total,coalesce(sum(amount) FILTER(WHERE month=date_trunc('month',current_date)::date),0)::text AS month FROM budgets WHERE tenant_id=$1 AND project_id=ANY($2::uuid[])`,
      scope,
    );
    const plan = await one(
      db,
      `SELECT coalesce(sum(l.total),0)::text total FROM estimate_lines l JOIN estimates e ON e.id=l.estimate_id WHERE l.tenant_id=$1 AND l.project_id=ANY($2::uuid[]) AND l.archived_at IS NULL AND e.archived_at IS NULL`,
      scope,
    );
    const requests = await one(
      db,
      `SELECT count(*) FILTER(WHERE status='pending')::int pending,count(*) FILTER(WHERE status='approved')::int approved FROM payment_requests WHERE tenant_id=$1 AND project_id=ANY($2::uuid[])`,
      scope,
    );
    const overdue = await one(
      db,
      `SELECT coalesce(sum(${outstandingSql}),0)::text amount,count(*)::int count FROM finance_documents f WHERE f.tenant_id=$1 AND f.project_id=ANY($2::uuid[]) AND f.kind=ANY($3::text[]) AND ${notReversedSql} AND ${outstandingSql}>0 AND f.due_date<current_date`,
      [...scope, payableKinds],
    );
    result.finance = {
      budget_total: money(budget.total),
      budget_month: money(budget.month),
      plan_total: money(plan.total),
      actual_cost: money(journal.actual_cost),
      month_expense: money(journal.month_expense),
      remaining_budget: money(dec(budget.total).minus(journal.actual_cost)),
      net_cash_flow: money(journal.net_cash_flow),
      supplier_debt: money(journal.supplier_debt),
      advances: money(journal.advances),
      income: money(journal.income),
      payment_requests: requests,
      overdue_payables: { count: overdue.count, amount: money(overdue.amount) },
    };
  }
  if (canEmployees) {
    const rows = (
      await db.query(
        'SELECT role,count(*)::int n FROM users WHERE tenant_id=$1 AND active GROUP BY role',
        [actor.tenant_id],
      )
    ).rows;
    result.employees = {
      active: rows.reduce((s, r) => s + r.n, 0),
      by_role: Object.fromEntries(rows.map((r) => [r.role, r.n])),
    };
  }
  return result;
}

const projectQuery = z.object({ project_id: uuid });
export function dashboardRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'GET',
    path: '/v1/company',
    summary: 'Kompaniya profili, Telegram bildirishnoma sozlamalari va obuna holati',
    page: 'settings',
    action: 'read',
    handler: ({ db, actor }) => companyView(db, actor),
  });
  add({
    method: 'PATCH',
    path: '/v1/company',
    summary:
      'Kompaniya nomi, manzili, telefoni va bildirishnoma toifalarini saqlash (optimistic version)',
    page: 'settings',
    action: 'update',
    idempotent: true,
    body: z.strictObject({
      legal_name: z.string().trim().min(2).max(200).optional(),
      address: z.string().trim().max(500).nullable().optional(),
      phone: phone.nullable().optional(),
      settings: z
        .strictObject({ telegram: z.partialRecord(z.enum(notificationCategories), z.boolean()) })
        .optional(),
      version,
    }),
    handler: async ({ db, actor, body }) => {
      const current = await one(db, 'SELECT * FROM tenants WHERE id=$1 FOR UPDATE', [
        actor.tenant_id,
      ]);
      invariant(current.version === body.version, 'VERSION_CONFLICT');
      const settings = body.settings
        ? {
            ...current.settings,
            telegram: { ...(current.settings?.telegram ?? {}), ...body.settings.telegram },
          }
        : current.settings;
      await db.query(
        'UPDATE tenants SET legal_name=$2,address=$3,phone=$4,settings=$5,version=version+1 WHERE id=$1',
        [
          actor.tenant_id,
          body.legal_name ?? current.legal_name,
          body.address === undefined ? current.address : body.address || null,
          body.phone === undefined ? current.phone : body.phone,
          settings,
        ],
      );
      await audit(db, actor, 'company.settings', actor.tenant_id, {
        changed: Object.keys(body).filter((k) => k !== 'version'),
      });
      return companyView(db, actor);
    },
  });
  add({
    method: 'GET',
    path: '/v1/dashboard',
    summary:
      'Bosh sahifa: obyektlar, vazifalar, hisobotlar, ombor, moliya va xodimlar bloklari — faqat ruxsat bo‘lgan bloklar, qolganlari null',
    handler: ({ db, actor }) => dashboard(db, actor),
  });
  // ---------------------------------------------------------------- Excel eksportlar
  add({
    method: 'GET',
    path: '/v1/finance/plan-actual/export',
    summary: 'Reja–fakt Excel: qatorlar, zonalar va oylar; narx huquqi bo‘lmasa summalar yo‘q',
    permission: 'finance.read',
    page: 'plan_actual',
    query: projectQuery,
    handler: async ({ db, actor, query }) => {
      const project = await projectScope(db, actor, query.project_id);
      const prices = await allowed(db, actor, 'prices.read');
      const d = await planActual(db, actor, query.project_id);
      const valueCols = prices
        ? [
            { header: 'Reja (UZS)', key: 'plan_value' },
            { header: 'Fakt (UZS)', key: 'fact_value' },
          ]
        : [];
      await audit(db, actor, 'export.plan_actual', query.project_id);
      return xlsxFile(
        [
          {
            name: 'Qatorlar',
            columns: [
              { header: 'Turi', key: 'kind', width: 12 },
              { header: 'Smeta', key: 'estimate_name', width: 20 },
              { header: 'Kategoriya', key: 'category', width: 18 },
              { header: 'Nomi', key: 'description', width: 40 },
              { header: 'Zona', key: 'zone_name' },
              { header: 'Birlik', key: 'unit_id', width: 8 },
              { header: 'Reja miqdor', key: 'plan_qty' },
              { header: 'Fakt miqdor', key: 'fact_qty' },
              { header: 'Bajarilish %', key: 'percent' },
              ...valueCols,
            ],
            rows: d.lines.map((l) => ({
              ...l,
              category: l.category ?? '',
              zone_name: l.zone_name ?? '',
              plan_qty: cell(l.plan_qty),
              fact_qty: cell(l.fact_qty),
              percent:
                Number(l.plan_qty) > 0
                  ? Math.round((Number(l.fact_qty) / Number(l.plan_qty)) * 100)
                  : '',
              plan_value: cell(l.plan_value),
              fact_value: cell(l.fact_value),
            })),
          },
          {
            name: 'Zonalar',
            columns: [
              { header: 'Zona', key: 'zone_name', width: 20 },
              { header: 'Turi', key: 'kind', width: 12 },
              { header: 'Qatorlar', key: 'lines', width: 10 },
              { header: 'Reja miqdor', key: 'plan_qty' },
              { header: 'Fakt miqdor', key: 'fact_qty' },
              { header: 'Bajarilish %', key: 'percent' },
              ...(prices ? [{ header: 'Reja (UZS)', key: 'plan_value' }] : []),
            ],
            rows: d.by_zone.map((z) => ({
              ...z,
              plan_qty: cell(z.plan_qty),
              fact_qty: cell(z.fact_qty),
              percent: cell(z.percent),
              plan_value: cell(z.plan_value),
            })),
          },
          {
            name: 'Oylar',
            columns: [
              { header: 'Oy', key: 'month', width: 12 },
              ...(prices
                ? [
                    { header: 'Reja (UZS)', key: 'plan_value' },
                    { header: 'Budjet (UZS)', key: 'budget' },
                    { header: 'Fakt (UZS)', key: 'fact_value' },
                  ]
                : []),
            ],
            rows: d.monthly.map((m) => ({
              month: String(m.month).slice(0, 7),
              plan_value: cell(m.plan_value),
              budget: cell(m.budget),
              fact_value: cell(m.fact_value),
            })),
          },
        ],
        `${project.code ?? project.name}-reja-fakt`,
      );
    },
  });
  add({
    method: 'GET',
    path: '/v1/tasks/export',
    summary: 'Vazifalar ro‘yxati Excel (ruxsat doirasida, filtrlar bilan)',
    permission: 'tasks.read',
    query: z.object({
      project_id: uuid,
      status: z
        .enum(['todo', 'in_progress', 'submitted', 'returned', 'accepted', 'open'])
        .optional(),
      mine: z.coerce.boolean().optional(),
    }),
    handler: async ({ db, actor, query }) => {
      const project = await projectScope(db, actor, query.project_id);
      const { items } = await listTasks(db, actor, { ...query, limit: 5000, offset: 0 });
      await audit(db, actor, 'export.tasks', query.project_id, { status: query.status ?? null });
      return xlsxFile(
        [
          {
            name: 'Vazifalar',
            columns: [
              { header: 'Vazifa', key: 'title', width: 40 },
              { header: 'Holat', key: 'status', width: 14 },
              { header: 'Muhimlik', key: 'priority', width: 12 },
              { header: 'Zona', key: 'zone_name' },
              { header: 'Bajaruvchi', key: 'assignee_name', width: 22 },
              { header: 'Tekshiruvchi', key: 'reviewer_name', width: 22 },
              { header: 'Muddat', key: 'deadline', width: 20 },
              { header: 'Muddati o‘tgan', key: 'overdue', width: 14 },
              { header: 'Yaratilgan', key: 'created_at', width: 20 },
            ],
            rows: items.map((t) => ({
              ...t,
              zone_name: t.zone_name ?? '',
              deadline: t.deadline ? new Date(t.deadline) : '',
              overdue: t.overdue ? 'ha' : '',
              created_at: new Date(t.created_at),
            })),
          },
        ],
        `${project.code ?? project.name}-vazifalar`,
      );
    },
  });
  add({
    method: 'GET',
    path: '/v1/stock/overview/export',
    summary:
      'Ombor qoldiqlari Excel (rol doirasidagi hisoblar; narx huquqi bo‘lmasa qiymat ustuni yo‘q)',
    permission: 'stock.read',
    query: projectQuery,
    handler: async ({ db, actor, query }) => {
      const project = await projectScope(db, actor, query.project_id);
      const prices = await allowed(db, actor, 'prices.read');
      const d = await stockOverview(db, actor, query.project_id);
      await audit(db, actor, 'export.stock', query.project_id);
      return xlsxFile(
        [
          {
            name: 'Qoldiqlar',
            columns: [
              { header: 'Hisob', key: 'account', width: 26 },
              { header: 'Material', key: 'material_name', width: 32 },
              { header: 'Birlik', key: 'unit_id', width: 8 },
              { header: 'Miqdor', key: 'quantity' },
              { header: 'Band', key: 'reserved' },
              { header: 'Mavjud', key: 'available' },
              { header: 'Minimum', key: 'minimum_quantity' },
              { header: 'Kam qolgan', key: 'low', width: 12 },
              ...(prices ? [{ header: 'Qiymat (UZS)', key: 'value' }] : []),
            ],
            rows: d.balances.map((b) => {
              const account = d.accounts.find((a) => a.id === b.account_id);
              return {
                account: account
                  ? `${account.kind === 'custody' ? 'Brigada' : 'Ombor'}: ${account.name}`
                  : '',
                material_name: b.material_name,
                unit_id: b.unit_id,
                quantity: cell(b.quantity),
                reserved: cell(b.reserved),
                available: cell(b.available),
                minimum_quantity: cell(b.minimum_quantity),
                low: b.low ? 'ha' : '',
                value: cell(b.value),
              };
            }),
          },
        ],
        `${project.code ?? project.name}-ombor`,
      );
    },
  });
  add({
    method: 'GET',
    path: '/v1/audit/export',
    summary: 'Audit jurnali Excel (kompaniya admini, filtrlar bilan, 5000 tagacha yozuv)',
    permission: 'audit.read',
    adminOnly: true,
    query: auditQuery
      .omit({ limit: true, offset: true })
      .extend({ from: date.optional(), to: date.optional() }),
    handler: async ({ db, actor, query }) => {
      const { items } = await listAudit(db, actor, { ...query, limit: 5000, offset: 0 });
      await audit(db, actor, 'export.audit', null, { action: query.action ?? null });
      return xlsxFile(
        [
          {
            name: 'Audit',
            columns: [
              { header: 'Vaqt', key: 'created_at', width: 20 },
              { header: 'Kim', key: 'actor_name', width: 24 },
              { header: 'Rol', key: 'actor_role', width: 16 },
              { header: 'Amal', key: 'action', width: 28 },
              { header: 'Resurs', key: 'resource_id', width: 38 },
              { header: 'Tafsilot', key: 'details', width: 60 },
            ],
            rows: items.map((a) => ({
              created_at: new Date(a.created_at),
              actor_name: a.actor_name ?? '',
              actor_role: a.actor_role ?? '',
              action: a.action,
              resource_id: a.resource_id ?? '',
              details: JSON.stringify(a.details),
            })),
          },
        ],
        'audit',
      );
    },
  });
}
