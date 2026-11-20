import { z } from 'zod';
import { type Endpoint } from './http.js';
import { one, audit, type Db, type Row } from './db.js';
import { uuid, phone, version, date, queryBool } from './schemas.js';
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
import { accountingDaySql, accountingMonthSql, journalWithDocSql } from './finance.js';

const TZ = 'Asia/Tashkent';
const todaySql = (col: string) =>
  `(${col} AT TIME ZONE '${TZ}')::date=(now() AT TIME ZONE '${TZ}')::date`;
/** Ish qatori bo'yicha tasdiqlangan progress (tuzatishlar bilan). */
// `workFactSql` endi estimates.ts da (vazifalar marshruti ham ishlatadi; dashboard ↔ work aylanma importi bo'lmasin).
export { workFactSql } from './estimates.js';
import { workFactSql } from './estimates.js';
/** Rol doirasidagi stock hisoblari (ombor mudiri — biriktirilgan omborlar, brigadir — o'z hisobi). */
const accountScopeSql = `($3<>'brigadier' OR a.custodian_id=$4) AND ($3<>'warehouse_manager' OR a.warehouse_id IS NULL OR EXISTS(SELECT 1 FROM warehouse_assignments w WHERE w.tenant_id=a.tenant_id AND w.warehouse_id=a.warehouse_id AND w.user_id=$4))`;
/** Xarajat yozuvlari ($1 tenant, $2 obyektlar): tur va hisob sanasi. Hujjat — `document_date`, ombor sarfida hujjat sanasi yo'q,
 *  shuning uchun yozuvning Toshkent sanasi. Storno asl hujjat turida hisoblanadi. Yetkazib beruvchi invoysi xarajat emas (clearing). */
const expenseSql = `SELECT j.amount,CASE WHEN j.stock_command_id IS NOT NULL THEN 'material' ELSE coalesce(o.kind,f.kind) END kind,
    ${accountingDaySql} AS day
  FROM journal_entries j LEFT JOIN finance_documents f ON f.tenant_id=j.tenant_id AND f.id=j.finance_document_id
       LEFT JOIN finance_documents o ON o.tenant_id=f.tenant_id AND o.id=f.reverses_id
  WHERE j.tenant_id=$1 AND j.project_id=ANY($2::uuid[]) AND j.account='expense'`;
const expenseKinds = ['material', 'labor', 'equipment', 'service'];

async function companyView(db: Db, actor: Row) {
  const row = await one(
    db,
    'SELECT id,legal_name,domain,address,phone,settings,status,trial_started_at,trial_ends_at,paid_until,created_at,version FROM tenants WHERE id=$1',
    [actor.tenant_id],
  );
  return {
    id: row.id,
    legal_name: row.legal_name,
    // D43: xodimlar kirishda kiritadigan domen (o'zgartirish faqat platforma egasida)
    domain: row.domain,
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
async function dashboard(db: Db, actor: Row, query: Row) {
  invariant(actor.tenant_id, 'FORBIDDEN', 403);
  const projects = query.project_id
    ? [(await projectScope(db, actor, query.project_id)).id as string]
    : await projectIds(db, actor);
  // Davr: joriy oy bilan tugaydigan N ta to'liq oy (Toshkent), [from, until).
  const months = Number(query.months);
  const period = await one(
    db,
    `SELECT to_char(s,'YYYY-MM-DD') "from",to_char(s+make_interval(months=>$1),'YYYY-MM-DD') until,to_char((s+make_interval(months=>$1))::date-1,'YYYY-MM-DD') "to"
     FROM (SELECT (date_trunc('month',now() AT TIME ZONE '${TZ}')-make_interval(months=>$1-1))::date s) x`,
    [months],
  );
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
  const range: unknown[] = [...scope, period.from, period.until];
  const result: Row = {
    generated_at: new Date().toISOString(),
    project_id: query.project_id ?? null,
    period: { months, from: period.from, to: period.to },
    projects: null,
    tasks: null,
    reports: null,
    stock: null,
    costs: null,
    finance: null,
    employees: null,
  };
  if (canProjects) {
    const items = (
      await db.query(
        `SELECT p.id,p.name,p.code,p.status,p.planned_start,p.actual_start,p.planned_end,p.forecast_end,
                /* Mas'ul: obyektga biriktirilgan prorab, bo'lmasa menejer (Figma "Mas'ul shaxs" ustuni) */
                (SELECT u.display_name FROM project_assignments a JOIN users u ON u.tenant_id=a.tenant_id AND u.id=a.user_id
                  WHERE a.tenant_id=p.tenant_id AND a.project_id=p.id AND u.active AND u.role IN ('foreman','manager')
                  ORDER BY (u.role='foreman') DESC,u.display_name LIMIT 1) responsible_name,
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
      `SELECT count(*)::int total,
              count(*) FILTER(WHERE status='accepted')::int accepted,
              count(*) FILTER(WHERE status<>'accepted')::int open,
              count(*) FILTER(WHERE status<>'accepted' AND deadline<now())::int overdue,
              count(*) FILTER(WHERE status<>'accepted' AND ${todaySql('deadline')})::int due_today,
              count(*) FILTER(WHERE status='submitted' AND reviewer_id=$3)::int awaiting_my_review,
              count(*) FILTER(WHERE status IN ('todo','in_progress','returned') AND assignee_id=$3)::int my_open,
              /* audit oynasi audit_tenant(tenant_id,created_at) indeksi bo'yicha bir marta o'qiladi */
              (SELECT count(DISTINCT t.id)::int FROM audit_events a JOIN tasks t ON t.tenant_id=a.tenant_id AND t.id=a.resource_id
                WHERE a.tenant_id=$1 AND a.action='task.accepted' AND a.created_at>=($5::date::timestamp AT TIME ZONE '${TZ}') AND a.created_at<($6::date::timestamp AT TIME ZONE '${TZ}')
                  AND t.status='accepted' AND t.project_id=ANY($2::uuid[]) AND t.archived_at IS NULL AND ($4 OR t.assignee_id=$3 OR t.reviewer_id=$3)) accepted_period
       FROM tasks WHERE tenant_id=$1 AND project_id=ANY($2::uuid[]) AND archived_at IS NULL AND ($4 OR assignee_id=$3 OR reviewer_id=$3)`,
      [...scope, actor.id, manageTasks, period.from, period.until],
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
    const overdueItems = (
      await db.query(
        `SELECT t.id,t.title,t.status,t.priority,t.deadline,t.project_id,p.name project_name,u.display_name assignee_name,(t.assignee_id=$3) mine
         FROM tasks t JOIN projects p ON p.id=t.project_id JOIN users u ON u.id=t.assignee_id
         WHERE t.tenant_id=$1 AND t.project_id=ANY($2::uuid[]) AND t.archived_at IS NULL AND t.status<>'accepted' AND t.deadline<now()
           AND ($4 OR t.assignee_id=$3 OR t.reviewer_id=$3)
         ORDER BY t.deadline,t.created_at LIMIT 6`,
        [...scope, actor.id, manageTasks],
      )
    ).rows;
    result.tasks = { ...counts, items, overdue_items: overdueItems };
  }
  if (canReports) {
    const counts = await one(
      db,
      `SELECT count(*) FILTER(WHERE status='submitted')::int pending_review,
              count(*) FILTER(WHERE status='returned' AND author_id=$3)::int my_returned,
              count(*) FILTER(WHERE report_date>=$5::date AND report_date<$6::date)::int in_period
       FROM reports WHERE tenant_id=$1 AND project_id=ANY($2::uuid[]) AND archived_at IS NULL AND ($4 OR author_id=$3)`,
      [...scope, actor.id, reviewReports, period.from, period.until],
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
              (SELECT count(DISTINCT r.group_id)::int FROM material_requests r WHERE r.tenant_id=$1 AND r.project_id=ANY($2::uuid[]) AND r.status='pending') pending_requests,
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
    // Oylik kirim/chiqim soni (ombor mudiri grafigi): rol doirasidagi hisoblar, Toshkent sanasi. Kirim — ombor/hisobga
    // kirgan kirim, boshlang'ich qoldiq va qaytarish; chiqim — hisobdan jo'natish va sarf. Summalar emas, sonlar.
    const stockMonthly = (
      await db.query(
        `WITH acc AS (SELECT a.id FROM stock_accounts a WHERE a.tenant_id=$1 AND a.project_id=ANY($2::uuid[]) AND ${accountScopeSql}),
              m AS (SELECT generate_series($5::date,$6::date-1,interval '1 month')::date AS month),
              c AS (SELECT c.kind,c.status,c.from_account_id,c.to_account_id,date_trunc('month',(c.created_at AT TIME ZONE '${TZ}'))::date AS month
                    FROM stock_commands c WHERE c.tenant_id=$1 AND c.project_id=ANY($2::uuid[]))
         SELECT to_char(m.month,'YYYY-MM-DD') AS month,
                (SELECT count(*)::int FROM c WHERE c.month=m.month AND c.kind IN ('receipt','opening','return') AND c.status='posted' AND c.to_account_id IN (SELECT id FROM acc)) receipts,
                (SELECT count(*)::int FROM c WHERE c.month=m.month AND c.kind IN ('transfer','consumption') AND c.status IN ('posted','partial') AND c.from_account_id IN (SELECT id FROM acc)) issues
         FROM m ORDER BY m.month`,
        [...params, period.from, period.until],
      )
    ).rows;
    const recent = (
      await db.query(
        `WITH acc AS (SELECT a.id FROM stock_accounts a WHERE a.tenant_id=$1 AND a.project_id=ANY($2::uuid[]) AND ${accountScopeSql})
         SELECT c.id,c.kind,c.status,c.quantity::text quantity,m.name material_name,m.unit_id,c.created_at,p.name project_name,
                coalesce(wf.name,uf.display_name) from_name,coalesce(wt.name,ut.display_name) to_name,cb.display_name created_by_name
         FROM stock_commands c JOIN materials m ON m.id=c.material_id JOIN projects p ON p.id=c.project_id
              LEFT JOIN stock_accounts af ON af.id=c.from_account_id LEFT JOIN warehouses wf ON wf.id=af.warehouse_id LEFT JOIN users uf ON uf.id=af.custodian_id
              LEFT JOIN stock_accounts at ON at.id=c.to_account_id LEFT JOIN warehouses wt ON wt.id=at.warehouse_id LEFT JOIN users ut ON ut.id=at.custodian_id
              LEFT JOIN users cb ON cb.id=c.created_by
         WHERE c.tenant_id=$1 AND c.project_id=ANY($2::uuid[])
           AND (c.from_account_id IN (SELECT id FROM acc) OR c.to_account_id IN (SELECT id FROM acc))
         ORDER BY c.created_at DESC,c.id LIMIT 6`,
        params,
      )
    ).rows;
    result.stock = {
      ...counts,
      inventory_value: prices ? money(counts.inventory_value) : null,
      low_items: low,
      monthly: stockMonthly,
      recent,
    };
  }
  // Xarajat bloki (`costs`): narx huquqi bo'lganlarga (bosh muhandis ham); `finance` (kassa, qarz, to'lovlar) faqat finance.read bilan.
  if (canFinance || prices) {
    const journal = await one(
      db,
      `SELECT coalesce(sum(amount) FILTER(WHERE account='expense'),0)::text actual_cost,
              coalesce(sum(amount) FILTER(WHERE account='cash'),0)::text net_cash_flow,
              (-coalesce(sum(amount) FILTER(WHERE account='payable'),0))::text supplier_debt,
              coalesce(sum(amount) FILTER(WHERE account='advance'),0)::text advances,
              (-coalesce(sum(amount) FILTER(WHERE account='income'),0))::text income
       FROM journal_entries WHERE tenant_id=$1 AND project_id=ANY($2::uuid[])`,
      scope,
    );
    const budget = await one(
      db,
      `SELECT coalesce(sum(amount),0)::text AS total,coalesce(sum(amount) FILTER(WHERE month>=$3::date AND month<$4::date),0)::text AS period FROM budgets WHERE tenant_id=$1 AND project_id=ANY($2::uuid[])`,
      range,
    );
    const plan = await one(
      db,
      `SELECT coalesce(sum(l.total),0)::text total FROM estimate_lines l JOIN estimates e ON e.id=l.estimate_id WHERE l.tenant_id=$1 AND l.project_id=ANY($2::uuid[]) AND l.archived_at IS NULL AND e.archived_at IS NULL`,
      scope,
    );
    // Oylar: reja (smeta oylik taqsimoti), budjet va fakt xarajat (hisob sanasi bo'yicha).
    const monthly = (
      await db.query(
        `WITH m AS (SELECT generate_series($3::date,$4::date-1,interval '1 month')::date AS month),
              exp AS (${expenseSql}),
              plan AS (SELECT em.month,sum(em.quantity*l.unit_price) v FROM estimate_months em JOIN estimate_lines l ON l.tenant_id=em.tenant_id AND l.id=em.line_id JOIN estimates e ON e.id=l.estimate_id
                       WHERE em.tenant_id=$1 AND l.project_id=ANY($2::uuid[]) AND l.archived_at IS NULL AND e.archived_at IS NULL AND em.month>=$3::date AND em.month<$4::date GROUP BY em.month),
              budget AS (SELECT month,sum(amount) v FROM budgets WHERE tenant_id=$1 AND project_id=ANY($2::uuid[]) AND month>=$3::date AND month<$4::date GROUP BY month),
              fact AS (SELECT date_trunc('month',day)::date AS month,sum(amount) v FROM exp WHERE day>=$3::date AND day<$4::date GROUP BY 1)
         SELECT to_char(m.month,'YYYY-MM-DD') AS month,coalesce(plan.v,0)::text plan,coalesce(budget.v,0)::text budget,coalesce(fact.v,0)::text fact
         FROM m LEFT JOIN plan ON plan.month=m.month LEFT JOIN budget ON budget.month=m.month LEFT JOIN fact ON fact.month=m.month ORDER BY m.month`,
        range,
      )
    ).rows.map((r) => ({
      month: r.month,
      plan: money(r.plan),
      budget: money(r.budget),
      fact: money(r.fact),
    }));
    // Turlar: har xarajat yozuvi bir marta; ulush foizi serverda (davr jamiga nisbatan).
    const kindRows = (
      await db.query(
        `WITH exp AS (${expenseSql}) SELECT kind,sum(amount)::text amount FROM exp WHERE day>=$3::date AND day<$4::date GROUP BY kind`,
        range,
      )
    ).rows;
    const periodExpense = kindRows.reduce((s, r) => s.add(r.amount), dec('0'));
    // Ulush musbat turlar yig'indisiga nisbatan (storno yoki ortiqcha inventarizatsiya turni manfiy qilishi mumkin).
    const positive = kindRows.reduce(
      (s, r) => (dec(r.amount).gt(0) ? s.add(r.amount) : s),
      dec('0'),
    );
    const byKind = [
      ...expenseKinds,
      ...kindRows.map((r) => r.kind).filter((k) => !expenseKinds.includes(k)),
    ].map((kind) => {
      const amount = dec(kindRows.find((r) => r.kind === kind)?.amount ?? '0');
      return {
        kind,
        amount: money(amount),
        share_percent:
          positive.gt(0) && !amount.isNegative() ? amount.div(positive).mul(100).toFixed(1) : null,
      };
    });
    // Budjetdan oshgan obyektlar — "Budjetlar" sahifasidagi ta'rif: budjet kiritilgan oylar bo'yicha fakt xarajat
    // (hisob sanasi oyi, O12) yig'indisi shu oylar budjeti yig'indisidan katta.
    const overBudget = (
      await db.query(
        `WITH b AS (SELECT project_id,month,amount FROM budgets WHERE tenant_id=$1 AND project_id=ANY($2::uuid[])),
              a AS (SELECT j.project_id,${accountingMonthSql} AS month,sum(j.amount) v FROM ${journalWithDocSql}
                    WHERE j.tenant_id=$1 AND j.project_id=ANY($2::uuid[]) AND j.account='expense' GROUP BY 1,2)
         SELECT p.id,p.name,p.code,sum(b.amount)::text budget,coalesce(sum(a.v),0)::text actual
         FROM b JOIN projects p ON p.tenant_id=$1 AND p.id=b.project_id LEFT JOIN a ON a.project_id=b.project_id AND a.month=b.month
         GROUP BY p.id HAVING coalesce(sum(a.v),0)>sum(b.amount) ORDER BY coalesce(sum(a.v),0)-sum(b.amount) DESC`,
        scope,
      )
    ).rows.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      budget: money(r.budget),
      actual: money(r.actual),
      over: money(dec(r.actual).minus(r.budget)),
    }));
    const costs = {
      budget_total: money(budget.total),
      period_budget: money(budget.period),
      plan_total: money(plan.total),
      actual_cost: money(journal.actual_cost),
      period_expense: money(periodExpense),
      remaining_budget: money(dec(budget.total).minus(journal.actual_cost)),
      monthly,
      by_kind: byKind,
      over_budget: overBudget,
    };
    if (prices) result.costs = costs;
    if (canFinance) {
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
        ...costs,
        net_cash_flow: money(journal.net_cash_flow),
        supplier_debt: money(journal.supplier_debt),
        advances: money(journal.advances),
        income: money(journal.income),
        payment_requests: requests,
        overdue_payables: { count: overdue.count, amount: money(overdue.amount) },
      };
    }
  }
  if (canEmployees) {
    const rows = (
      await db.query(
        `SELECT role,count(*)::int n FROM users u WHERE tenant_id=$1 AND active
           AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM project_assignments a WHERE a.tenant_id=u.tenant_id AND a.user_id=u.id AND a.project_id=$2)) GROUP BY role`,
        [actor.tenant_id, query.project_id ?? null],
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
const dashboardQuery = z.object({
  project_id: uuid.optional(),
  months: z.enum(['3', '6', '12']).default('6'),
});
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
      'Bosh sahifa: obyektlar, vazifalar, hisobotlar, ombor, xarajat (narx huquqi), moliya va xodimlar bloklari — faqat ruxsat bo‘lgan bloklar, qolganlari null; obyekt va davr (3/6/12 oy) filtri',
    query: dashboardQuery,
    handler: ({ db, actor, query }) => dashboard(db, actor, query),
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
      mine: queryBool.optional(),
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
              { header: 'Reja (smeta)', key: 'plan_quantity' },
              { header: 'Kirim', key: 'received_quantity' },
              { header: 'Rejadan oshgan', key: 'over_plan', width: 14 },
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
                plan_quantity: cell(b.plan_quantity),
                received_quantity: account?.kind === 'warehouse' ? cell(b.received_quantity) : null,
                over_plan: b.over_plan ? 'ha' : '',
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
