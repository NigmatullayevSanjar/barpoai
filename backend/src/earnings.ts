import { type Endpoint } from './http.js';
import { one, type Db } from './db.js';
import { idParams } from './schemas.js';
import { dec, money } from './money.js';

/**
 * V-C (D23): brigada akkord hisobi. Progress yozuvining summasi (`pe` — progress_entries):
 * (qabul qilingan hajm + tuzatishlar) × qabulda qotirilgan stavka. Stavka null — summa hisoblanmaydi.
 */
export const earningSql = `round((pe.quantity+coalesce((SELECT sum(c.quantity_delta) FROM progress_corrections c WHERE c.tenant_id=pe.tenant_id AND c.progress_entry_id=pe.id),0))*pe.labor_rate,2)`;
/**
 * D32 (2026-11-05): qator guruhi — bitta smeta reviziyasida bir xil kategoriya va zonadagi qatorlar (Form 5: ish qatori
 * va uning resurslari). Agregat ko'rsatkichlar (`g` — estimate_lines): ish qatori bormi (mehnat, normasiz), mehnat
 * resurslari (normali) bormi, ularning jami va guruh ish hajmi.
 */
export const rateGroupSql = `bool_or(g.kind='labor' AND g.norm IS NULL) has_work,bool_or(g.kind='labor' AND g.norm IS NOT NULL) has_labor,
  sum(g.total) FILTER(WHERE g.kind='labor' AND g.norm IS NOT NULL) labor_cost,sum(g.effective_quantity) FILTER(WHERE g.kind='labor' AND g.norm IS NULL) work_quantity`;
/**
 * Avtomatik akkord stavkasi (`l` — qator, `gr` — uning guruhi `rateGroupSql`, `p` — obyekt), so'm/birlik; null — belgilanmagan.
 * Akkord faqat ish qatorida (D32): ish qatori bor guruhdagi resurs qatori (normali) stavkasiz. Narxsiz ish qatori —
 * guruh mehnat resurslari jami / ish hajmi × obyekt foizi; mehnat narxi yo'q — null (qo'lda yoziladi). Qolganlari —
 * V-C: smeta birlik narxi × obyekt foizi. Narx reviziyada o'zgarsa, stavka ham o'zgaradi (qabul qilinganlar qotirilgan).
 */
export const autoRateSql = `CASE WHEN l.kind='material' OR (l.norm IS NOT NULL AND gr.has_work) THEN NULL
  WHEN l.kind='labor' AND l.norm IS NULL AND gr.has_labor AND l.unit_price=0
    THEN CASE WHEN gr.labor_cost>0 AND gr.work_quantity>0 THEN round(gr.labor_cost/gr.work_quantity*p.brigade_percent/100,2) END
  ELSE round(l.unit_price*p.brigade_percent/100,2) END`;
/** Qatorning amaldagi stavkasi: qo'lda yozilgan `labor_rate`, bo'lmasa avtomatik; material qatorida null. */
export const lineRateSql = `CASE WHEN l.kind='material' THEN NULL ELSE coalesce(l.labor_rate,${autoRateSql}) END`;
/** Bitta qator guruhi (`l` ning o'z reviziyasi — arxivlangan qatorlar bir vaqtda arxivlanadi). */
export const lineGroupJoinSql = `LEFT JOIN LATERAL (SELECT ${rateGroupSql} FROM estimate_lines g
  WHERE g.tenant_id=l.tenant_id AND g.estimate_id=l.estimate_id AND g.category=l.category AND g.zone_id IS NOT DISTINCT FROM l.zone_id
    AND g.archived_at IS NOT DISTINCT FROM l.archived_at) gr ON true`;
/** Davrga kirgan summa (`progress_payroll`, append-only): progress yozuvi bo'yicha yig'indi. */
export const payrollAmountSql = `coalesce((SELECT sum(x.amount) FROM progress_payroll x WHERE x.tenant_id=pe.tenant_id AND x.progress_entry_id=pe.id),0)`;
/** Davrga hali kirmagan qism: joriy summa − davrga yozilgan summa (to'lovdan keyingi tuzatishlar ham shu yerda). */
export const pendingEarningSql = `(${earningSql}-${payrollAmountSql})`;

/** Xodimning (brigadirning) akkord hisobi: obyektlar kesimida va jami; hisob serverda, decimal satr. */
export async function employeeEarnings(db: Db, tenantId: string, employeeId: string) {
  const projects = (
    await db.query(
      `WITH e AS (
         SELECT r.project_id,${earningSql} amount,${payrollAmountSql} payroll_amount,r.report_date
         FROM progress_entries pe JOIN reports r ON r.tenant_id=pe.tenant_id AND r.id=pe.report_id
         WHERE pe.tenant_id=$1 AND r.author_id=$2 AND pe.labor_rate IS NOT NULL),
       pr AS (SELECT project_id,sum(amount) earned,
                     coalesce(sum(amount) FILTER(WHERE date_trunc('month',report_date)=date_trunc('month',current_date)),0) earned_month,
                     sum(payroll_amount) in_payroll FROM e GROUP BY project_id),
       pay AS (SELECT pp.project_id,coalesce(sum(x.net) FILTER(WHERE x.status='paid'),0) paid,coalesce(sum(x.net) FILTER(WHERE x.status='posted'),0) posted_unpaid
               FROM payroll_entries x JOIN payroll_periods pp ON pp.tenant_id=x.tenant_id AND pp.id=x.period_id
               WHERE x.tenant_id=$1 AND x.employee_id=$2 GROUP BY pp.project_id),
       adv AS (SELECT j.project_id,sum(j.amount) advances FROM journal_entries j JOIN counterparties c ON c.tenant_id=j.tenant_id AND c.id=j.counterparty_id
               WHERE j.tenant_id=$1 AND c.employee_id=$2 AND j.account='advance' GROUP BY j.project_id)
       SELECT p.id project_id,p.name project_name,coalesce(pr.earned,0)::numeric(20,2)::text earned,coalesce(pr.earned_month,0)::numeric(20,2)::text earned_month,
              coalesce(pr.in_payroll,0)::numeric(20,2)::text in_payroll,coalesce(pay.paid,0)::numeric(20,2)::text paid,
              coalesce(pay.posted_unpaid,0)::numeric(20,2)::text posted_unpaid,coalesce(adv.advances,0)::numeric(20,2)::text advances,
              (coalesce(pr.earned,0)-coalesce(pr.in_payroll,0)+coalesce(pay.posted_unpaid,0)-coalesce(adv.advances,0))::numeric(20,2)::text balance
       FROM projects p LEFT JOIN pr ON pr.project_id=p.id LEFT JOIN pay ON pay.project_id=p.id LEFT JOIN adv ON adv.project_id=p.id
       WHERE p.tenant_id=$1 AND (pr.project_id IS NOT NULL OR pay.project_id IS NOT NULL OR adv.project_id IS NOT NULL) ORDER BY p.name`,
      [tenantId, employeeId],
    )
  ).rows;
  const entries = (
    await db.query(
      `SELECT pe.id,r.report_date,r.project_id,p.name project_name,l.description,l.unit_id,
              (pe.quantity+coalesce((SELECT sum(c.quantity_delta) FROM progress_corrections c WHERE c.tenant_id=pe.tenant_id AND c.progress_entry_id=pe.id),0))::text quantity,
              pe.labor_rate::text labor_rate,CASE WHEN pe.labor_rate IS NULL THEN NULL ELSE ${earningSql}::text END amount,
              ${payrollAmountSql}::numeric(20,2)::text payroll_amount,
              (SELECT max(pp.month)::text FROM progress_payroll x JOIN payroll_entries y ON y.tenant_id=x.tenant_id AND y.id=x.payroll_entry_id
                 JOIN payroll_periods pp ON pp.tenant_id=y.tenant_id AND pp.id=y.period_id WHERE x.tenant_id=pe.tenant_id AND x.progress_entry_id=pe.id) payroll_month
       FROM progress_entries pe JOIN reports r ON r.tenant_id=pe.tenant_id AND r.id=pe.report_id
         JOIN estimate_lines l ON l.tenant_id=pe.tenant_id AND l.id=pe.estimate_line_id JOIN projects p ON p.id=r.project_id
       WHERE pe.tenant_id=$1 AND r.author_id=$2 ORDER BY r.report_date DESC,r.created_at DESC LIMIT 50`,
      [tenantId, employeeId],
    )
  ).rows;
  const sum = (key: string) => money(projects.reduce((a, p) => a.plus(p[key]), dec('0')));
  return {
    totals: {
      earned: sum('earned'),
      earned_month: sum('earned_month'),
      in_payroll: sum('in_payroll'),
      paid: sum('paid'),
      posted_unpaid: sum('posted_unpaid'),
      advances: sum('advances'),
      balance: sum('balance'),
    },
    projects,
    entries,
  };
}

export function earningsRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'GET',
    path: '/v1/me/earnings',
    summary:
      'Mening akkord hisobim: ishlab topilgan, davrga kirgan, to‘langan, avanslar, qoldiq — obyektlar kesimida',
    handler: ({ db, actor }) => employeeEarnings(db, actor.tenant_id, actor.id),
  });
  add({
    method: 'GET',
    path: '/v1/employees/:id/earnings',
    summary: 'Xodimning (brigadirning) akkord hisobi — moliya ko‘rinishi',
    permission: 'finance.read',
    action: 'read',
    params: idParams,
    handler: async ({ db, actor, params }) => {
      await one(db, 'SELECT id FROM users WHERE tenant_id=$1 AND id=$2', [
        actor.tenant_id,
        params.id,
      ]);
      return employeeEarnings(db, actor.tenant_id, params.id);
    },
  });
}
