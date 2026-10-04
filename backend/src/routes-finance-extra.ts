import { z } from 'zod';
import { type Endpoint } from './http.js';
import { one, audit, type Db, type Row } from './db.js';
import {
  uuid,
  idParams,
  pageQuery,
  positiveAmount,
  amount,
  date,
  text,
  version,
  reason,
} from './schemas.js';
import { projectScope, allowed, pageAllowed } from './permissions.js';
import { invariant } from './errors.js';
import { postFinance } from './finance.js';
import { notify, projectRecipients } from './notify.js';
import { dec, money } from './money.js';

const payableKinds = ['supplier_invoice', 'opening_debt', 'labor', 'equipment', 'service'];
/** Hujjatning to'lanmagan qoldig'i: amount − bog'langan (teskari qilinmagan) to'lovlar. */
const outstandingSql = `(f.amount-coalesce((SELECT sum(p.amount) FROM finance_documents p WHERE p.tenant_id=f.tenant_id AND p.allocated_invoice_id=f.id AND NOT EXISTS(SELECT 1 FROM finance_documents r WHERE r.tenant_id=p.tenant_id AND r.reverses_id=p.id)),0))`;
const notReversedSql = `NOT EXISTS(SELECT 1 FROM finance_documents r WHERE r.tenant_id=f.tenant_id AND r.reverses_id=f.id)`;

async function projectIds(db: Db, actor: Row) {
  return (
    await db.query(
      `SELECT p.id FROM projects p WHERE p.tenant_id=$1 AND p.archived_at IS NULL AND ($2='tenant_admin' OR EXISTS(SELECT 1 FROM project_assignments a WHERE a.tenant_id=p.tenant_id AND a.project_id=p.id AND a.user_id=$3))`,
      [actor.tenant_id, actor.role, actor.id],
    )
  ).rows.map((r) => r.id as string);
}
async function ensureEmployeeCounterparty(db: Db, actor: Row, employeeId: string) {
  const user = await one(db, 'SELECT id,display_name FROM users WHERE tenant_id=$1 AND id=$2', [
    actor.tenant_id,
    employeeId,
  ]);
  return one(
    db,
    `INSERT INTO counterparties(tenant_id,name,kind,employee_id) VALUES($1,$2,'employee',$3)
     ON CONFLICT(tenant_id,employee_id) WHERE employee_id IS NOT NULL DO UPDATE SET name=excluded.name RETURNING id`,
    [actor.tenant_id, user.display_name, employeeId],
  );
}

export function financeExtraRoutes(add: (r: Endpoint) => void) {
  // ---------------------------------------------------------------- Kontragent va kassa rekvizitlari
  add({
    method: 'PATCH',
    path: '/v1/counterparties/:id',
    summary: 'Kontragent rekvizitlarini yangilash yoki arxivlash',
    permission: 'finance.post',
    page: 'counterparties',
    action: 'update',
    params: idParams,
    body: z.strictObject({
      version,
      name: text,
      kind: z.enum(['supplier', 'contractor', 'customer', 'employee']),
      inn: z.string().trim().max(20).nullable().optional(),
      phone: z.string().trim().max(40).nullable().optional(),
      contact: z.string().trim().max(200).nullable().optional(),
      bank_details: z.string().trim().max(1000).nullable().optional(),
      note: z.string().trim().max(1000).nullable().optional(),
      archived: z.boolean().optional(),
    }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      const current = await one(
        db,
        'SELECT * FROM counterparties WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [actor.tenant_id, params.id],
      );
      invariant(current.version === body.version, 'VERSION_CONFLICT');
      const row = await one(
        db,
        `UPDATE counterparties SET name=$3,kind=$4,inn=$5,phone=$6,contact=$7,bank_details=$8,note=$9,archived_at=CASE WHEN $10::boolean THEN coalesce(archived_at,now()) ELSE NULL END,version=version+1
         WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        [
          actor.tenant_id,
          params.id,
          body.name,
          body.kind,
          body.inn ?? null,
          body.phone ?? null,
          body.contact ?? null,
          body.bank_details ?? null,
          body.note ?? null,
          body.archived ?? false,
        ],
      );
      await audit(db, actor, 'counterparty.update', params.id);
      return row;
    },
  });
  add({
    method: 'GET',
    path: '/v1/counterparties/:id/statement',
    summary: 'Kontragent bilan solishtirish: hujjatlar, to‘lovlar va yurib boruvchi qoldiq',
    permission: 'finance.read',
    page: 'reconciliation',
    params: idParams,
    query: z.object({ project_id: uuid.optional(), from: date.optional(), to: date.optional() }),
    handler: async ({ db, actor, params, query }) => {
      const counterparty = await one(
        db,
        'SELECT * FROM counterparties WHERE tenant_id=$1 AND id=$2',
        [actor.tenant_id, params.id],
      );
      const projects = await projectIds(db, actor);
      const rows = (
        await db.query(
          `SELECT f.id,f.kind,f.amount::text,f.document_date,f.due_date,f.description,f.reference,f.project_id,p.name project_name,
                  coalesce(sum(j.amount) FILTER(WHERE j.account='payable'),0)::text payable_delta,
                  coalesce(sum(j.amount) FILTER(WHERE j.account='advance'),0)::text advance_delta,
                  coalesce(sum(j.amount) FILTER(WHERE j.account='cash'),0)::text cash_delta
           FROM finance_documents f JOIN projects p ON p.id=f.project_id LEFT JOIN journal_entries j ON j.tenant_id=f.tenant_id AND j.finance_document_id=f.id
           WHERE f.tenant_id=$1 AND f.counterparty_id=$2 AND f.project_id=ANY($3::uuid[]) AND ($4::uuid IS NULL OR f.project_id=$4)
             AND ($5::date IS NULL OR f.document_date>=$5) AND ($6::date IS NULL OR f.document_date<=$6)
           GROUP BY f.id,p.name ORDER BY f.document_date,f.created_at`,
          [
            actor.tenant_id,
            params.id,
            projects,
            query.project_id ?? null,
            query.from ?? null,
            query.to ?? null,
          ],
        )
      ).rows;
      let balance = dec('0');
      const items = rows.map((r) => {
        // Kontragent oldidagi qarzimiz: payable manfiy yoziladi, shuning uchun -payable; avans bizning aktivimiz.
        balance = balance.minus(r.payable_delta).minus(r.advance_delta);
        return { ...r, running_debt: money(balance) };
      });
      const totals = await one(
        db,
        `SELECT (-coalesce(sum(amount) FILTER(WHERE account='payable'),0))::text debt,coalesce(sum(amount) FILTER(WHERE account='advance'),0)::text advance
         FROM journal_entries WHERE tenant_id=$1 AND counterparty_id=$2 AND project_id=ANY($3::uuid[])`,
        [actor.tenant_id, params.id, projects],
      );
      return { counterparty, items, totals };
    },
  });
  add({
    method: 'PATCH',
    path: '/v1/cash-accounts/:id',
    summary: 'Bank/kassa hisobini yangilash yoki arxivlash',
    permission: 'finance.post',
    page: 'bank_cash',
    action: 'update',
    params: idParams,
    body: z.strictObject({
      version,
      name: text,
      kind: z.enum(['bank', 'cash']),
      account_number: z.string().trim().max(60).nullable().optional(),
      bank_name: z.string().trim().max(120).nullable().optional(),
      archived: z.boolean().optional(),
    }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      const current = await one(
        db,
        'SELECT * FROM cash_accounts WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [actor.tenant_id, params.id],
      );
      invariant(current.version === body.version, 'VERSION_CONFLICT');
      const row = await one(
        db,
        'UPDATE cash_accounts SET name=$3,kind=$4,account_number=$5,bank_name=$6,archived_at=CASE WHEN $7::boolean THEN coalesce(archived_at,now()) ELSE NULL END,version=version+1 WHERE tenant_id=$1 AND id=$2 RETURNING *',
        [
          actor.tenant_id,
          params.id,
          body.name,
          body.kind,
          body.account_number ?? null,
          body.bank_name ?? null,
          body.archived ?? false,
        ],
      );
      await audit(db, actor, 'cash_account.update', params.id);
      return row;
    },
  });
  add({
    method: 'GET',
    path: '/v1/finance/cash-balances',
    summary: 'Bank va kassa hisoblari qoldiqlari (foydalanuvchi obyektlari bo‘yicha)',
    permission: 'finance.read',
    page: 'bank_cash',
    handler: async ({ db, actor }) => {
      const projects = await projectIds(db, actor);
      return {
        items: (
          await db.query(
            `SELECT c.*,coalesce((SELECT sum(j.amount) FROM journal_entries j WHERE j.tenant_id=c.tenant_id AND j.cash_account_id=c.id AND j.account='cash' AND j.project_id=ANY($2::uuid[])),0)::text balance
             FROM cash_accounts c WHERE c.tenant_id=$1 ORDER BY c.archived_at NULLS FIRST,c.kind,c.name`,
            [actor.tenant_id, projects],
          )
        ).rows,
      };
    },
  });
  // ---------------------------------------------------------------- Yig'ma ko'rsatkichlar
  add({
    method: 'GET',
    path: '/v1/finance/summary',
    summary: 'Moliya yig‘masi: tannarx, pul, qarz, avans, oylik xarajat va budjet taqqosi',
    permission: 'finance.read',
    query: z.object({ project_id: uuid.optional() }),
    handler: async ({ db, actor, query }) => {
      const projects = query.project_id
        ? [(await projectScope(db, actor, query.project_id)).id as string]
        : await projectIds(db, actor);
      const totals = await one(
        db,
        `SELECT coalesce(sum(amount) FILTER(WHERE account='expense'),0)::text actual_cost,
                coalesce(sum(amount) FILTER(WHERE account='inventory'),0)::text inventory_value,
                coalesce(sum(amount) FILTER(WHERE account='cash'),0)::text net_cash_flow,
                (-coalesce(sum(amount) FILTER(WHERE account='payable'),0))::text supplier_debt,
                coalesce(sum(amount) FILTER(WHERE account='advance'),0)::text advances,
                (-coalesce(sum(amount) FILTER(WHERE account='income'),0))::text income
         FROM journal_entries WHERE tenant_id=$1 AND project_id=ANY($2::uuid[])`,
        [actor.tenant_id, projects],
      );
      const allocated = await one(
        db,
        `SELECT coalesce(sum(f.amount) FILTER(WHERE f.kind='allocation'),0)::text allocations,coalesce(sum(f.amount) FILTER(WHERE f.kind='purchase_order'),0)::text purchase_orders
         FROM finance_documents f WHERE f.tenant_id=$1 AND f.project_id=ANY($2::uuid[]) AND ${notReversedSql}`,
        [actor.tenant_id, projects],
      );
      const monthly = (
        await db.query(
          `WITH months AS (
             SELECT to_char(date_trunc('month',created_at),'YYYY-MM-01')::date month,
                    coalesce(sum(amount) FILTER(WHERE account='expense'),0) expense,
                    coalesce(sum(amount) FILTER(WHERE account='cash' AND amount<0),0) cash_out,
                    coalesce(sum(amount) FILTER(WHERE account='cash' AND amount>0),0) cash_in
             FROM journal_entries WHERE tenant_id=$1 AND project_id=ANY($2::uuid[]) GROUP BY 1),
           budget AS (SELECT month,sum(amount) amount FROM budgets WHERE tenant_id=$1 AND project_id=ANY($2::uuid[]) GROUP BY month)
           SELECT coalesce(m.month,b.month) month,coalesce(m.expense,0)::text expense,coalesce(m.cash_out,0)::text cash_out,coalesce(m.cash_in,0)::text cash_in,coalesce(b.amount,0)::text budget
           FROM months m FULL JOIN budget b ON b.month=m.month ORDER BY 1`,
          [actor.tenant_id, projects],
        )
      ).rows;
      const byKind = (
        await db.query(
          `SELECT f.kind,count(*)::int count,coalesce(sum(f.amount),0)::text amount FROM finance_documents f WHERE f.tenant_id=$1 AND f.project_id=ANY($2::uuid[]) AND ${notReversedSql} GROUP BY f.kind ORDER BY f.kind`,
          [actor.tenant_id, projects],
        )
      ).rows;
      const topDebt = (
        await db.query(
          `SELECT c.id,c.name,c.kind,(-coalesce(sum(j.amount) FILTER(WHERE j.account='payable'),0))::text debt,coalesce(sum(j.amount) FILTER(WHERE j.account='advance'),0)::text advance
           FROM journal_entries j JOIN counterparties c ON c.id=j.counterparty_id WHERE j.tenant_id=$1 AND j.project_id=ANY($2::uuid[]) GROUP BY c.id HAVING sum(j.amount) FILTER(WHERE j.account IN ('payable','advance'))<>0 ORDER BY 4 DESC LIMIT 10`,
          [actor.tenant_id, projects],
        )
      ).rows;
      const byProject = (
        await db.query(
          `SELECT p.id,p.name,p.code,coalesce(sum(j.amount) FILTER(WHERE j.account='expense'),0)::text actual_cost,(-coalesce(sum(j.amount) FILTER(WHERE j.account='payable'),0))::text debt,
                  (SELECT coalesce(sum(b.amount),0)::text FROM budgets b WHERE b.tenant_id=p.tenant_id AND b.project_id=p.id) budget
           FROM projects p LEFT JOIN journal_entries j ON j.tenant_id=p.tenant_id AND j.project_id=p.id WHERE p.tenant_id=$1 AND p.id=ANY($2::uuid[]) GROUP BY p.id ORDER BY p.name`,
          [actor.tenant_id, projects],
        )
      ).rows;
      return {
        ...totals,
        ...allocated,
        monthly,
        by_kind: byKind,
        top_debt: topDebt,
        by_project: byProject,
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/finance/payables',
    summary: 'To‘lanmagan hujjatlar (qoldig‘i bor), muddati bilan',
    permission: 'finance.read',
    page: 'invoices',
    query: pageQuery.extend({
      project_id: uuid.optional(),
      counterparty_id: uuid.optional(),
      overdue: z.coerce.boolean().optional(),
    }),
    handler: async ({ db, actor, query }) => {
      const projects = query.project_id
        ? [(await projectScope(db, actor, query.project_id)).id as string]
        : await projectIds(db, actor);
      return {
        items: (
          await db.query(
            `SELECT f.id,f.kind,f.amount::text,f.document_date,f.due_date,f.description,f.reference,f.project_id,p.name project_name,c.id counterparty_id,c.name counterparty_name,${outstandingSql}::text outstanding,
                    (f.due_date IS NOT NULL AND f.due_date<current_date AND ${outstandingSql}>0) overdue
             FROM finance_documents f JOIN projects p ON p.id=f.project_id LEFT JOIN counterparties c ON c.id=f.counterparty_id
             WHERE f.tenant_id=$1 AND f.project_id=ANY($2::uuid[]) AND f.kind=ANY($3::text[]) AND ${notReversedSql} AND ${outstandingSql}>0
               AND ($4::uuid IS NULL OR f.counterparty_id=$4) AND ($5::boolean IS NOT TRUE OR (f.due_date IS NOT NULL AND f.due_date<current_date))
             ORDER BY f.due_date NULLS LAST,f.document_date LIMIT $6 OFFSET $7`,
            [
              actor.tenant_id,
              projects,
              payableKinds,
              query.counterparty_id ?? null,
              query.overdue ?? false,
              query.limit,
              query.offset,
            ],
          )
        ).rows,
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/finance/calendar',
    summary:
      'To‘lov kalendari: muddati bo‘yicha to‘lanmagan hujjatlar va tasdiqlangan to‘lov so‘rovlari',
    permission: 'finance.read',
    page: 'payment_calendar',
    query: z.object({ project_id: uuid.optional(), from: date, to: date }),
    handler: async ({ db, actor, query }) => {
      const projects = query.project_id
        ? [(await projectScope(db, actor, query.project_id)).id as string]
        : await projectIds(db, actor);
      const documents = (
        await db.query(
          `SELECT f.id,f.kind,f.due_date,f.description,f.reference,p.name project_name,c.name counterparty_name,${outstandingSql}::text outstanding
           FROM finance_documents f JOIN projects p ON p.id=f.project_id LEFT JOIN counterparties c ON c.id=f.counterparty_id
           WHERE f.tenant_id=$1 AND f.project_id=ANY($2::uuid[]) AND f.kind=ANY($3::text[]) AND ${notReversedSql} AND ${outstandingSql}>0 AND f.due_date BETWEEN $4 AND $5
           ORDER BY f.due_date`,
          [actor.tenant_id, projects, payableKinds, query.from, query.to],
        )
      ).rows;
      const requests = (
        await db.query(
          `SELECT r.id,r.amount::text,r.due_date,r.purpose,r.status,p.name project_name,c.name counterparty_name
           FROM payment_requests r JOIN projects p ON p.id=r.project_id JOIN counterparties c ON c.id=r.counterparty_id
           WHERE r.tenant_id=$1 AND r.project_id=ANY($2::uuid[]) AND r.status IN ('pending','approved') AND r.due_date BETWEEN $3 AND $4 ORDER BY r.due_date`,
          [actor.tenant_id, projects, query.from, query.to],
        )
      ).rows;
      const overdue = await one(
        db,
        `SELECT coalesce(sum(${outstandingSql}),0)::text amount,count(*)::int count FROM finance_documents f WHERE f.tenant_id=$1 AND f.project_id=ANY($2::uuid[]) AND f.kind=ANY($3::text[]) AND ${notReversedSql} AND ${outstandingSql}>0 AND f.due_date<current_date`,
        [actor.tenant_id, projects, payableKinds],
      );
      return { documents, requests, overdue };
    },
  });
  // ---------------------------------------------------------------- To'lov so'rovlari
  add({
    method: 'POST',
    path: '/v1/finance/payment-requests',
    summary: 'To‘lov so‘rovi: kontragent, summa, muddat, maqsad; ixtiyoriy bog‘langan hujjat',
    page: 'payment_requests',
    action: 'create',
    body: z.strictObject({
      project_id: uuid,
      counterparty_id: uuid,
      document_id: uuid.optional(),
      amount: positiveAmount,
      due_date: date.optional(),
      purpose: reason,
    }),
    idempotent: true,
    handler: async ({ db, actor, body }) => {
      await projectScope(db, actor, body.project_id);
      await one(db, 'SELECT id FROM counterparties WHERE tenant_id=$1 AND id=$2', [
        actor.tenant_id,
        body.counterparty_id,
      ]);
      if (body.document_id) {
        const doc = await one(
          db,
          `SELECT f.*,${outstandingSql}::text outstanding FROM finance_documents f WHERE f.tenant_id=$1 AND f.id=$2`,
          [actor.tenant_id, body.document_id],
        );
        invariant(
          payableKinds.includes(doc.kind) &&
            doc.counterparty_id === body.counterparty_id &&
            doc.project_id === body.project_id,
          'INVOICE_MISMATCH',
        );
        invariant(dec(body.amount).lte(doc.outstanding), 'OVERPAYMENT_USE_ADVANCE');
      }
      const row = await one(
        db,
        'INSERT INTO payment_requests(tenant_id,project_id,counterparty_id,document_id,amount,due_date,purpose,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
        [
          actor.tenant_id,
          body.project_id,
          body.counterparty_id,
          body.document_id ?? null,
          body.amount,
          body.due_date ?? null,
          body.purpose,
          actor.id,
        ],
      );
      const project = await one(db, 'SELECT name FROM projects WHERE id=$1', [body.project_id]);
      for (const user of await projectRecipients(
        db,
        actor.tenant_id,
        body.project_id,
        ['financier', 'accountant'],
        actor.id,
      ))
        await notify(db, {
          tenant_id: actor.tenant_id,
          user_id: user,
          project_id: body.project_id,
          kind: 'payment.request',
          title: '💳 Yangi to‘lov so‘rovi',
          body: `Obyekt: ${project.name}\nSumma: ${money(body.amount)} UZS\nMaqsad: ${body.purpose}\nSo‘ragan: ${actor.display_name}`,
          payload: { request_id: row.id },
          dedup_key: `payment.request:${row.id}:${user}`,
        });
      await audit(db, actor, 'payment_request.create', row.id);
      return row;
    },
  });
  add({
    method: 'GET',
    path: '/v1/finance/payment-requests',
    summary: 'To‘lov so‘rovlari ro‘yxati',
    permission: 'finance.read',
    page: 'payment_requests',
    query: pageQuery.extend({
      project_id: uuid.optional(),
      status: z.enum(['pending', 'approved', 'rejected', 'paid', 'cancelled']).optional(),
    }),
    handler: async ({ db, actor, query }) => {
      const projects = query.project_id
        ? [(await projectScope(db, actor, query.project_id)).id as string]
        : await projectIds(db, actor);
      return {
        items: (
          await db.query(
            `SELECT r.*,r.amount::text,p.name project_name,c.name counterparty_name,u.display_name requested_by_name,a.display_name approved_by_name,f.kind document_kind,f.description document_description
             FROM payment_requests r JOIN projects p ON p.id=r.project_id JOIN counterparties c ON c.id=r.counterparty_id JOIN users u ON u.id=r.requested_by
             LEFT JOIN users a ON a.id=r.approved_by LEFT JOIN finance_documents f ON f.id=r.document_id
             WHERE r.tenant_id=$1 AND r.project_id=ANY($2::uuid[]) AND ($3::text IS NULL OR r.status=$3)
             ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,r.due_date NULLS LAST,r.created_at DESC LIMIT $4 OFFSET $5`,
            [actor.tenant_id, projects, query.status ?? null, query.limit, query.offset],
          )
        ).rows,
      };
    },
  });
  add({
    method: 'POST',
    path: '/v1/finance/payment-requests/:id/actions',
    summary:
      'Tasdiqlash (update), rad etish, bekor qilish yoki to‘lash (payment hujjati yaratiladi)',
    page: 'payment_requests',
    action: 'update',
    params: idParams,
    body: z.strictObject({
      version,
      action: z.enum(['approve', 'reject', 'cancel', 'pay']),
      cash_account_id: uuid.optional(),
      note: z.string().trim().max(1000).optional(),
      document_date: date.optional(),
    }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      const r = await one(
        db,
        'SELECT * FROM payment_requests WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [actor.tenant_id, params.id],
      );
      await projectScope(db, actor, r.project_id);
      invariant(r.version === body.version, 'VERSION_CONFLICT');
      const transitions: Record<string, string[]> = {
        pending: ['approve', 'reject', 'cancel'],
        approved: ['pay', 'reject', 'cancel'],
      };
      invariant(transitions[r.status]?.includes(body.action), 'INVALID_TRANSITION');
      if (body.action === 'cancel')
        invariant(r.requested_by === actor.id || actor.role === 'tenant_admin', 'FORBIDDEN', 403);
      if (body.action === 'approve' || body.action === 'reject')
        invariant(
          actor.role === 'tenant_admin' ||
            ((await allowed(db, actor, 'finance.allocate')) && actor.id !== r.requested_by),
          'FORBIDDEN',
          403,
        );
      let payment: Row | null = null;
      if (body.action === 'pay') {
        invariant(body.cash_account_id, 'CASH_ACCOUNT_REQUIRED', 400);
        invariant(r.document_id, 'PAYMENT_ALLOCATION_REQUIRED', 400);
        invariant(
          await pageAllowed(db, actor, 'bank_cash', 'create'),
          'PAGE_ACTION_FORBIDDEN',
          403,
        );
        payment = await postFinance(db, actor, {
          project_id: r.project_id,
          kind: 'payment',
          amount: money(r.amount),
          counterparty_id: r.counterparty_id,
          cash_account_id: body.cash_account_id,
          allocated_invoice_id: r.document_id,
          description: `To‘lov so‘rovi: ${r.purpose}`,
          document_date: body.document_date ?? new Date().toISOString().slice(0, 10),
          reference: `PR-${String(r.id).slice(0, 8)}`,
        });
      }
      const status = (
        { approve: 'approved', reject: 'rejected', cancel: 'cancelled', pay: 'paid' } as Record<
          string,
          string
        >
      )[body.action as string]!;
      const row = await one(
        db,
        `UPDATE payment_requests SET status=$2,approved_by=CASE WHEN $3 IN ('approved','rejected') THEN $4 ELSE approved_by END,approved_at=CASE WHEN $3 IN ('approved','rejected') THEN now() ELSE approved_at END,
           decision_note=coalesce($5,decision_note),payment_document_id=coalesce($6,payment_document_id),version=version+1 WHERE id=$1 RETURNING *`,
        [params.id, status, status, actor.id, body.note ?? null, payment?.id ?? null],
      );
      if (body.action !== 'cancel')
        await notify(db, {
          tenant_id: actor.tenant_id,
          user_id: r.requested_by,
          project_id: r.project_id,
          kind: `payment.request.${status}`,
          title:
            status === 'paid'
              ? '✅ To‘lov amalga oshirildi'
              : status === 'approved'
                ? '👍 To‘lov so‘rovi tasdiqlandi'
                : '❌ To‘lov so‘rovi rad etildi',
          body: `Summa: ${money(r.amount)} UZS\nMaqsad: ${r.purpose}${body.note ? `\nIzoh: ${body.note}` : ''}`,
          payload: { request_id: r.id },
          dedup_key: `payment.request.${status}:${r.id}`,
        });
      await audit(db, actor, `payment_request.${status}`, params.id, { note: body.note ?? null });
      return { ...row, payment };
    },
  });
  // ---------------------------------------------------------------- Ish haqi
  add({
    method: 'GET',
    path: '/v1/finance/payroll',
    summary: 'Ish haqi davrlari va yozuvlari',
    permission: 'finance.read',
    page: 'payroll',
    query: z.object({ project_id: uuid }),
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      const periods = (
        await db.query(
          `SELECT pp.*,u.display_name posted_by_name,
                  (SELECT count(*)::int FROM payroll_entries e WHERE e.tenant_id=pp.tenant_id AND e.period_id=pp.id) entries,
                  (SELECT coalesce(sum(e.net),0)::text FROM payroll_entries e WHERE e.tenant_id=pp.tenant_id AND e.period_id=pp.id) total,
                  (SELECT coalesce(sum(e.net) FILTER(WHERE e.status='paid'),0)::text FROM payroll_entries e WHERE e.tenant_id=pp.tenant_id AND e.period_id=pp.id) paid
           FROM payroll_periods pp LEFT JOIN users u ON u.id=pp.posted_by WHERE pp.tenant_id=$1 AND pp.project_id=$2 ORDER BY pp.month DESC`,
          [actor.tenant_id, query.project_id],
        )
      ).rows;
      const entries = (
        await db.query(
          `SELECT e.*,e.base_salary::text,e.bonus::text,e.deduction::text,e.net::text,u.display_name employee_name,u.role employee_role
           FROM payroll_entries e JOIN payroll_periods pp ON pp.id=e.period_id JOIN users u ON u.id=e.employee_id
           WHERE e.tenant_id=$1 AND pp.project_id=$2 ORDER BY pp.month DESC,u.display_name`,
          [actor.tenant_id, query.project_id],
        )
      ).rows;
      return { periods, entries };
    },
  });
  add({
    method: 'POST',
    path: '/v1/finance/payroll/periods',
    summary: 'Oylik ish haqi davri ochish',
    permission: 'finance.post',
    page: 'payroll',
    body: z.strictObject({ project_id: uuid, month: date }),
    idempotent: true,
    handler: async ({ db, actor, body }) => {
      await projectScope(db, actor, body.project_id);
      invariant(body.month.endsWith('-01'), 'MONTH_FIRST_DAY_REQUIRED', 400);
      const row = await one(
        db,
        'INSERT INTO payroll_periods(tenant_id,project_id,month) VALUES($1,$2,$3) RETURNING *',
        [actor.tenant_id, body.project_id, body.month],
      );
      await audit(db, actor, 'payroll.period.create', row.id);
      return row;
    },
  });
  add({
    method: 'POST',
    path: '/v1/finance/payroll/periods/:id/entries',
    summary: 'Davrga xodim yozuvi qo‘shish yoki yangilash (davr ochiq bo‘lsa)',
    permission: 'finance.post',
    page: 'payroll',
    params: idParams,
    body: z.strictObject({
      employee_id: uuid,
      position: z.string().trim().max(120).nullable().optional(),
      base_salary: amount,
      bonus: amount.default('0'),
      deduction: amount.default('0'),
      note: z.string().trim().max(500).nullable().optional(),
    }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      const period = await one(
        db,
        'SELECT * FROM payroll_periods WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [actor.tenant_id, params.id],
      );
      await projectScope(db, actor, period.project_id);
      invariant(period.status === 'open', 'PAYROLL_PERIOD_CLOSED');
      await one(db, 'SELECT id FROM users WHERE tenant_id=$1 AND id=$2 AND active', [
        actor.tenant_id,
        body.employee_id,
      ]);
      invariant(
        dec(body.base_salary).add(body.bonus).minus(body.deduction).gte(0),
        'NEGATIVE_NET_SALARY',
        400,
      );
      const row = await one(
        db,
        `INSERT INTO payroll_entries(tenant_id,period_id,employee_id,position,base_salary,bonus,deduction,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT(tenant_id,period_id,employee_id) DO UPDATE SET position=excluded.position,base_salary=excluded.base_salary,bonus=excluded.bonus,deduction=excluded.deduction,note=excluded.note,version=payroll_entries.version+1
         RETURNING *,base_salary::text,bonus::text,deduction::text,net::text`,
        [
          actor.tenant_id,
          params.id,
          body.employee_id,
          body.position ?? null,
          body.base_salary,
          body.bonus,
          body.deduction,
          body.note ?? null,
        ],
      );
      await audit(db, actor, 'payroll.entry', row.id);
      return row;
    },
  });
  add({
    method: 'DELETE',
    path: '/v1/finance/payroll/entries/:id',
    summary: 'Ochiq davrdagi yozuvni o‘chirish',
    permission: 'finance.post',
    page: 'payroll',
    action: 'delete',
    params: idParams,
    idempotent: true,
    handler: async ({ db, actor, params }) => {
      const entry = await one(
        db,
        'SELECT e.*,pp.status period_status,pp.project_id FROM payroll_entries e JOIN payroll_periods pp ON pp.id=e.period_id WHERE e.tenant_id=$1 AND e.id=$2 FOR UPDATE OF e',
        [actor.tenant_id, params.id],
      );
      await projectScope(db, actor, entry.project_id);
      invariant(entry.period_status === 'open', 'PAYROLL_PERIOD_CLOSED');
      await db.query('DELETE FROM payroll_entries WHERE tenant_id=$1 AND id=$2', [
        actor.tenant_id,
        params.id,
      ]);
      return { ok: true };
    },
  });
  add({
    method: 'POST',
    path: '/v1/finance/payroll/periods/:id/post',
    summary:
      'Davrni yopish: har xodim uchun labor xarajati va qarz (counterparty=employee) yoziladi',
    permission: 'finance.post',
    page: 'payroll',
    action: 'update',
    params: idParams,
    body: z.strictObject({ version, document_date: date.optional() }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      const period = await one(
        db,
        'SELECT * FROM payroll_periods WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [actor.tenant_id, params.id],
      );
      await projectScope(db, actor, period.project_id);
      invariant(period.version === body.version, 'VERSION_CONFLICT');
      invariant(period.status === 'open', 'PAYROLL_PERIOD_CLOSED');
      const entries = (
        await db.query(
          'SELECT * FROM payroll_entries WHERE tenant_id=$1 AND period_id=$2 AND net>0 ORDER BY created_at',
          [actor.tenant_id, params.id],
        )
      ).rows;
      invariant(entries.length > 0, 'PAYROLL_EMPTY', 400);
      const monthLabel = String(period.month).slice(0, 7);
      for (const e of entries) {
        const counterparty = await ensureEmployeeCounterparty(db, actor, e.employee_id);
        const doc = await postFinance(db, actor, {
          project_id: period.project_id,
          kind: 'labor',
          amount: money(e.net),
          counterparty_id: counterparty.id,
          description: `Ish haqi ${monthLabel}: oklad ${money(e.base_salary)}, bonus ${money(e.bonus)}, ushlanma ${money(e.deduction)}`,
          document_date: body.document_date ?? new Date().toISOString().slice(0, 10),
          reference: `PAYROLL-${monthLabel}`,
        });
        await db.query(
          "UPDATE payroll_entries SET labor_document_id=$2,status='posted',version=version+1 WHERE id=$1",
          [e.id, doc.id],
        );
      }
      const row = await one(
        db,
        "UPDATE payroll_periods SET status='posted',posted_at=now(),posted_by=$2,version=version+1 WHERE id=$1 RETURNING *",
        [params.id, actor.id],
      );
      await audit(db, actor, 'payroll.period.post', params.id, { entries: entries.length });
      return row;
    },
  });
  add({
    method: 'POST',
    path: '/v1/finance/payroll/entries/:id/pay',
    summary: 'Xodimga ish haqini to‘lash (payment hujjati, labor hujjatiga bog‘lanadi)',
    permission: 'finance.post',
    page: 'payroll',
    action: 'update',
    params: idParams,
    body: z.strictObject({ version, cash_account_id: uuid, document_date: date.optional() }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      const entry = await one(
        db,
        'SELECT e.*,pp.project_id FROM payroll_entries e JOIN payroll_periods pp ON pp.id=e.period_id WHERE e.tenant_id=$1 AND e.id=$2 FOR UPDATE OF e',
        [actor.tenant_id, params.id],
      );
      await projectScope(db, actor, entry.project_id);
      invariant(entry.version === body.version, 'VERSION_CONFLICT');
      invariant(entry.status === 'posted' && entry.labor_document_id, 'INVALID_TRANSITION');
      invariant(await pageAllowed(db, actor, 'bank_cash', 'create'), 'PAGE_ACTION_FORBIDDEN', 403);
      const counterparty = await ensureEmployeeCounterparty(db, actor, entry.employee_id);
      const payment = await postFinance(db, actor, {
        project_id: entry.project_id,
        kind: 'payment',
        amount: money(entry.net),
        counterparty_id: counterparty.id,
        cash_account_id: body.cash_account_id,
        allocated_invoice_id: entry.labor_document_id,
        description: 'Ish haqi to‘lovi',
        document_date: body.document_date ?? new Date().toISOString().slice(0, 10),
      });
      const row = await one(
        db,
        "UPDATE payroll_entries SET payment_document_id=$2,status='paid',version=version+1 WHERE id=$1 RETURNING *,net::text",
        [params.id, payment.id],
      );
      await audit(db, actor, 'payroll.entry.pay', params.id);
      return row;
    },
  });
  // ---------------------------------------------------------------- Reja–fakt va prognoz
  add({
    method: 'GET',
    path: '/v1/finance/plan-actual',
    summary:
      'Reja–fakt: smeta (joriy reviziyalar) va haqiqiy xarajat/sarf — tur, kategoriya va oy kesimida',
    permission: 'finance.read',
    page: 'plan_actual',
    query: z.object({ project_id: uuid }),
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      const byKind = (
        await db.query(
          `WITH plan AS (SELECT l.kind,sum(l.total) plan_value,sum(l.effective_quantity) plan_qty FROM estimate_lines l JOIN estimates e ON e.id=l.estimate_id WHERE l.tenant_id=$1 AND l.project_id=$2 AND l.archived_at IS NULL AND e.archived_at IS NULL GROUP BY l.kind),
           fact_material AS (SELECT coalesce(-sum(j.amount),0) v FROM journal_entries j JOIN stock_commands c ON c.id=j.stock_command_id WHERE j.tenant_id=$1 AND j.project_id=$2 AND j.account='inventory' AND c.kind IN ('consumption','adjustment') AND j.amount<0),
           fact_docs AS (SELECT f.kind,sum(f.amount) v FROM finance_documents f WHERE f.tenant_id=$1 AND f.project_id=$2 AND f.kind IN ('labor','equipment','service') AND ${notReversedSql} GROUP BY f.kind)
           SELECT k.kind,coalesce(p.plan_value,0)::text plan_value,coalesce(p.plan_qty,0)::text plan_qty,
                  CASE k.kind WHEN 'material' THEN (SELECT v FROM fact_material) ELSE coalesce((SELECT v FROM fact_docs d WHERE d.kind=k.kind),0) END::text fact_value
           FROM (VALUES ('material'),('labor'),('equipment'),('service')) k(kind) LEFT JOIN plan p ON p.kind=k.kind`,
          [actor.tenant_id, query.project_id],
        )
      ).rows;
      const lines = (
        await db.query(
          `SELECT l.id,l.kind,l.category,l.description,l.unit_id,l.effective_quantity::text plan_qty,l.total::text plan_value,z.name zone_name,e.name estimate_name,
                  CASE WHEN l.kind='material'
                    THEN (SELECT coalesce(sum(c.accepted_quantity),0)::text FROM stock_commands c WHERE c.tenant_id=l.tenant_id AND c.estimate_line_id=l.id AND c.kind='consumption' AND c.status IN ('posted','partial'))
                    ELSE (SELECT coalesce(sum(p.quantity),0)::text FROM progress_entries p WHERE p.tenant_id=l.tenant_id AND p.estimate_line_id=l.id) END fact_qty,
                  CASE WHEN l.kind='material'
                    THEN (SELECT coalesce(-sum(j.amount),0)::text FROM journal_entries j JOIN stock_commands c ON c.tenant_id=j.tenant_id AND c.id=j.stock_command_id WHERE j.tenant_id=l.tenant_id AND c.estimate_line_id=l.id AND c.kind='consumption' AND j.account='inventory')
                    ELSE NULL END fact_value
           FROM estimate_lines l JOIN estimates e ON e.id=l.estimate_id LEFT JOIN zones z ON z.id=l.zone_id
           WHERE l.tenant_id=$1 AND l.project_id=$2 AND l.archived_at IS NULL AND e.archived_at IS NULL ORDER BY e.name,l.position,l.id`,
          [actor.tenant_id, query.project_id],
        )
      ).rows;
      const monthly = (
        await db.query(
          `WITH plan AS (SELECT m.month,sum(m.quantity*l.unit_price) v FROM estimate_months m JOIN estimate_lines l ON l.tenant_id=m.tenant_id AND l.id=m.line_id JOIN estimates e ON e.id=l.estimate_id WHERE m.tenant_id=$1 AND l.project_id=$2 AND l.archived_at IS NULL AND e.archived_at IS NULL GROUP BY m.month),
           fact AS (SELECT to_char(date_trunc('month',created_at),'YYYY-MM-01')::date month,sum(amount) v FROM journal_entries WHERE tenant_id=$1 AND project_id=$2 AND account='expense' GROUP BY 1),
           budget AS (SELECT month,amount FROM budgets WHERE tenant_id=$1 AND project_id=$2)
           SELECT coalesce(p.month,f.month,b.month) month,coalesce(p.v,0)::text plan_value,coalesce(f.v,0)::text fact_value,coalesce(b.amount,0)::text budget
           FROM plan p FULL JOIN fact f ON f.month=p.month FULL JOIN budget b ON b.month=coalesce(p.month,f.month) ORDER BY 1`,
          [actor.tenant_id, query.project_id],
        )
      ).rows;
      return { by_kind: byKind, lines, monthly };
    },
  });
  add({
    method: 'GET',
    path: '/v1/finance/forecast',
    summary:
      'Prognoz: oylik o‘rtacha xarajat, qolgan budjet/smeta va tugash sanasiga yetish-yetmaslik',
    permission: 'finance.read',
    page: 'forecast',
    query: z.object({ project_id: uuid }),
    handler: async ({ db, actor, query }) => {
      const project = await projectScope(db, actor, query.project_id);
      const plan = await one(
        db,
        `SELECT coalesce(sum(l.total),0)::text plan_total FROM estimate_lines l JOIN estimates e ON e.id=l.estimate_id WHERE l.tenant_id=$1 AND l.project_id=$2 AND l.archived_at IS NULL AND e.archived_at IS NULL`,
        [actor.tenant_id, query.project_id],
      );
      const fact = await one(
        db,
        `SELECT coalesce(sum(amount) FILTER(WHERE account='expense'),0)::text actual_cost,min(created_at) first_at FROM journal_entries WHERE tenant_id=$1 AND project_id=$2`,
        [actor.tenant_id, query.project_id],
      );
      const months = (
        await db.query(
          `SELECT to_char(date_trunc('month',created_at),'YYYY-MM-01') month,sum(amount)::text expense FROM journal_entries WHERE tenant_id=$1 AND project_id=$2 AND account='expense' GROUP BY 1 ORDER BY 1 DESC LIMIT 3`,
          [actor.tenant_id, query.project_id],
        )
      ).rows;
      const budget = await one(
        db,
        'SELECT coalesce(sum(amount),0)::text total FROM budgets WHERE tenant_id=$1 AND project_id=$2',
        [actor.tenant_id, query.project_id],
      );
      const burn = months.length
        ? months.reduce((s, m) => s.add(m.expense), dec('0')).div(months.length)
        : dec('0');
      const end = project.forecast_end ?? project.planned_end;
      const monthsLeft = end
        ? Math.max(0, (new Date(end).getTime() - Date.now()) / (30.44 * 86400000))
        : null;
      const remainingPlan = dec(plan.plan_total).minus(fact.actual_cost);
      const projected = monthsLeft === null ? null : burn.mul(monthsLeft);
      return {
        plan_total: plan.plan_total,
        budget_total: budget.total,
        actual_cost: fact.actual_cost,
        remaining_plan: money(remainingPlan),
        monthly_burn: money(burn),
        months_used: months.length,
        months_left: monthsLeft === null ? null : Math.round(monthsLeft * 10) / 10,
        projected_remaining_spend: projected === null ? null : money(projected),
        projected_total: projected === null ? null : money(dec(fact.actual_cost).add(projected)),
        projected_variance:
          projected === null
            ? null
            : money(dec(plan.plan_total).minus(dec(fact.actual_cost).add(projected))),
        months_of_runway: burn.isZero()
          ? null
          : Math.round(remainingPlan.div(burn).toNumber() * 10) / 10,
        end_date: end,
        recent: months,
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/finance/reports',
    summary:
      'Moliyaviy hisobotlar: oylik pul oqimi (hisoblar bo‘yicha), obyekt xarajatlari, qarz yoshi',
    permission: 'finance.read',
    page: 'financial_reports',
    query: z.object({ from: date, to: date, project_id: uuid.optional() }),
    handler: async ({ db, actor, query }) => {
      const projects = query.project_id
        ? [(await projectScope(db, actor, query.project_id)).id as string]
        : await projectIds(db, actor);
      const cashFlow = (
        await db.query(
          `SELECT to_char(date_trunc('month',j.created_at),'YYYY-MM-01') month,c.name account,c.kind,coalesce(sum(j.amount) FILTER(WHERE j.amount>0),0)::text inflow,coalesce(sum(-j.amount) FILTER(WHERE j.amount<0),0)::text outflow
         FROM journal_entries j JOIN cash_accounts c ON c.id=j.cash_account_id WHERE j.tenant_id=$1 AND j.project_id=ANY($2::uuid[]) AND j.account='cash' AND j.created_at::date BETWEEN $3 AND $4 GROUP BY 1,2,3 ORDER BY 1,2`,
          [actor.tenant_id, projects, query.from, query.to],
        )
      ).rows;
      const expenses = (
        await db.query(
          `SELECT p.name project,to_char(date_trunc('month',j.created_at),'YYYY-MM-01') month,
                coalesce(sum(j.amount) FILTER(WHERE j.stock_command_id IS NOT NULL),0)::text material,coalesce(sum(j.amount) FILTER(WHERE j.finance_document_id IS NOT NULL),0)::text other,sum(j.amount)::text total
         FROM journal_entries j JOIN projects p ON p.id=j.project_id WHERE j.tenant_id=$1 AND j.project_id=ANY($2::uuid[]) AND j.account='expense' AND j.created_at::date BETWEEN $3 AND $4 GROUP BY 1,2 ORDER BY 1,2`,
          [actor.tenant_id, projects, query.from, query.to],
        )
      ).rows;
      const aging = (
        await db.query(
          `SELECT c.name counterparty,
                coalesce(sum(${outstandingSql}) FILTER(WHERE f.due_date IS NULL OR f.due_date>=current_date),0)::text current,
                coalesce(sum(${outstandingSql}) FILTER(WHERE f.due_date<current_date AND f.due_date>=current_date-30),0)::text d30,
                coalesce(sum(${outstandingSql}) FILTER(WHERE f.due_date<current_date-30 AND f.due_date>=current_date-90),0)::text d90,
                coalesce(sum(${outstandingSql}) FILTER(WHERE f.due_date<current_date-90),0)::text older,
                coalesce(sum(${outstandingSql}),0)::text total
         FROM finance_documents f JOIN counterparties c ON c.id=f.counterparty_id WHERE f.tenant_id=$1 AND f.project_id=ANY($2::uuid[]) AND f.kind=ANY($5::text[]) AND ${notReversedSql} AND ${outstandingSql}>0 GROUP BY c.name ORDER BY 6 DESC`,
          [actor.tenant_id, projects, query.from, query.to, payableKinds],
        )
      ).rows;
      const income = await one(
        db,
        `SELECT (-coalesce(sum(amount),0))::text income FROM journal_entries WHERE tenant_id=$1 AND project_id=ANY($2::uuid[]) AND account='income' AND created_at::date BETWEEN $3 AND $4`,
        [actor.tenant_id, projects, query.from, query.to],
      );
      return { cash_flow: cashFlow, expenses, aging, income: income.income };
    },
  });
}
