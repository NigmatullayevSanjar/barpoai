import type pg from 'pg';
import { type Db, type Row, one, transaction, audit } from './db.js';
import { dec, money } from './money.js';
import { notify } from './notify.js';

/** Davr uzunligi (egasi qarori, 2026-10-04): trial tugagan kundan boshlab 30 kunlik zanjir. */
export const PERIOD_DAYS = 30;
/** Invoys davr boshlanishidan necha kun oldin avtomatik chiqariladi. */
export const INVOICE_LEAD_DAYS = 3;
const DAY = 86400000;
export const periodEnd = (start: Date | string) =>
  new Date(new Date(start).getTime() + PERIOD_DAYS * DAY);

/** Faqat to'liq qoplangan va trialdan uzluksiz davrlar zanjiri paid_until ni uzaytiradi; refund qisqartiradi. */
export async function recomputeCoverage(db: Db, tenantId: string) {
  await db.query(
    `WITH RECURSIVE covered AS (
      SELECT i.period_start,i.period_end FROM billing_invoices i LEFT JOIN billing_entries e ON e.invoice_id=i.id WHERE i.tenant_id=$1 GROUP BY i.id HAVING coalesce(sum(CASE WHEN e.kind='refund' THEN -e.amount ELSE e.amount END),0)>=i.amount
    ), chain AS (
      SELECT trial_ends_at AS until FROM tenants WHERE id=$1
      UNION SELECT c.period_end FROM covered c JOIN chain x ON c.period_start<=x.until AND c.period_end>x.until
    ) UPDATE tenants SET paid_until=(SELECT max(until) FROM chain) WHERE id=$1`,
    [tenantId],
  );
}
export async function creditBalance(db: Db, tenantId: string) {
  const row = await one(
    db,
    'SELECT coalesce(sum(amount),0)::text balance FROM billing_credits WHERE tenant_id=$1',
    [tenantId],
  );
  return dec(row.balance);
}
/** Kredit qoldig'ini to'lanmagan invoyslarga (eng eskisidan) qo'llaydi; har qo'llash billing_entries(kind=credit) + billing_credits(applied). */
export async function applyCredit(db: Db, tenantId: string, actorId: string | null) {
  let balance = await creditBalance(db, tenantId);
  if (balance.lte(0)) return;
  const open = (
    await db.query(
      `SELECT i.id,i.amount,(i.amount-coalesce((SELECT sum(CASE WHEN e.kind='refund' THEN -e.amount ELSE e.amount END) FROM billing_entries e WHERE e.invoice_id=i.id),0))::text outstanding
       FROM billing_invoices i WHERE i.tenant_id=$1 ORDER BY i.period_start`,
      [tenantId],
    )
  ).rows.filter((i) => dec(i.outstanding).gt(0));
  for (const invoice of open) {
    if (balance.lte(0)) break;
    const applied = dec(invoice.outstanding).lt(balance) ? dec(invoice.outstanding) : balance;
    const entry = await one(
      db,
      `INSERT INTO billing_entries(tenant_id,invoice_id,kind,amount,external_ref,reason,created_by)
       VALUES($1,$2,'credit',$3,$4,'Oldingi ortiqcha to‘lov krediti qo‘llandi',$5) RETURNING id`,
      [
        tenantId,
        invoice.id,
        money(applied),
        `credit:${invoice.id}:${crypto.randomUUID()}`,
        actorId,
      ],
    );
    await db.query(
      "INSERT INTO billing_credits(tenant_id,kind,amount,entry_id,invoice_id,note,created_by) VALUES($1,'applied',$2,$3,$4,'Invoysga qo‘llandi',$5)",
      [tenantId, money(applied.neg()), entry.id, invoice.id, actorId],
    );
    balance = balance.minus(applied);
  }
  await recomputeCoverage(db, tenantId);
}
async function tenantAdmins(db: Db, tenantId: string) {
  return (
    await db.query("SELECT id FROM users WHERE tenant_id=$1 AND role='tenant_admin' AND active", [
      tenantId,
    ])
  ).rows.map((r) => r.id as string);
}
/** Invoys yaratish (qo'lda yoki avtomatik): tarif narxi snapshoti, kredit avtomatik qo'llanadi, admin xabardor qilinadi. */
export async function issueInvoice(
  db: Db,
  input: {
    tenant_id: string;
    plan_version_id: string;
    period_start: Date;
    period_end?: Date;
    due_at?: Date;
    source: 'manual' | 'auto';
    actor?: Row;
  },
) {
  const plan = await one(db, 'SELECT * FROM plan_versions WHERE id=$1', [input.plan_version_id]);
  const row = await one(
    db,
    'INSERT INTO billing_invoices(tenant_id,plan_version_id,period_start,period_end,due_at,amount,source) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [
      input.tenant_id,
      input.plan_version_id,
      input.period_start,
      input.period_end ?? periodEnd(input.period_start),
      input.due_at ?? input.period_start,
      plan.monthly_price,
      input.source,
    ],
  );
  // Keyingi avtomatik davr shu invoys tugashidan boshlanadi (qo'lda chiqarilgan davr ham zanjirni suradi).
  await db.query(
    'UPDATE subscriptions SET next_period_start=greatest(next_period_start,$2) WHERE tenant_id=$1',
    [input.tenant_id, row.period_end],
  );
  if (input.actor)
    await audit(db, input.actor, 'billing.invoice', row.id, { source: input.source });
  else
    await db.query(
      "INSERT INTO audit_events(tenant_id,actor_id,action,resource_id,details) VALUES($1,NULL,'billing.invoice',$2,$3)",
      [input.tenant_id, row.id, { source: input.source }],
    );
  await applyCredit(db, input.tenant_id, input.actor?.id ?? null);
  const period = `${new Date(row.period_start).toISOString().slice(0, 10)} — ${new Date(row.period_end).toISOString().slice(0, 10)}`;
  // Platforma egasi so'rovida tenant konteksti yo'q; bildirishnoma (FORCE RLS) uchun vaqtincha o'rnatiladi.
  const previousTenant =
    (await db.query("SELECT current_setting('app.tenant_id',true) v")).rows[0].v ?? '';
  await db.query("SELECT set_config('app.tenant_id',$1,true)", [input.tenant_id]);
  for (const admin of await tenantAdmins(db, input.tenant_id))
    await notify(db, {
      tenant_id: input.tenant_id,
      user_id: admin,
      kind: 'billing.invoice',
      title: '🧾 Yangi obuna invoysi',
      body: `Tarif: ${plan.code} v${plan.version}\nDavr: ${period}\nSumma: ${money(plan.monthly_price)} UZS\nTo‘lov muddati: ${new Date(row.due_at).toISOString().slice(0, 10)}`,
      payload: { invoice_id: row.id },
      dedup_key: `billing.invoice:${row.id}:${admin}`,
    });
  await db.query("SELECT set_config('app.tenant_id',$1,true)", [previousTenant]);
  return row;
}
/**
 * Avtomatik invoyslash: faol kompaniyalar uchun navbatdagi 30 kunlik davr boshlanishiga
 * INVOICE_LEAD_DAYS kun qolganda (yoki o'tib ketgan bo'lsa) bitta invoys chiqariladi.
 * Muddati o'tgan qoplanmagan invoys uchun adminga bir martalik ogohlantirish; blok yo'q.
 */
export async function issueDueInvoices(pool: pg.Pool, now = new Date()) {
  const due = (
    await pool.query(
      `SELECT s.tenant_id,s.plan_version_id,s.next_period_start FROM subscriptions s JOIN tenants t ON t.id=s.tenant_id
       WHERE t.status='active' AND s.next_period_start<=$1::timestamptz+make_interval(days=>$2)
         AND NOT EXISTS(SELECT 1 FROM billing_invoices i WHERE i.tenant_id=s.tenant_id AND i.period_start=s.next_period_start)`,
      [now, INVOICE_LEAD_DAYS],
    )
  ).rows;
  let issued = 0;
  for (const s of due) {
    await transaction(pool, s.tenant_id, async (db) => {
      await one(db, 'SELECT id FROM tenants WHERE id=$1 FOR UPDATE', [s.tenant_id]);
      const exists = await db.query(
        'SELECT 1 FROM billing_invoices WHERE tenant_id=$1 AND period_start=$2',
        [s.tenant_id, s.next_period_start],
      );
      if (exists.rowCount) return;
      await issueInvoice(db, {
        tenant_id: s.tenant_id,
        plan_version_id: s.plan_version_id,
        period_start: new Date(s.next_period_start),
        source: 'auto',
      });
      issued++;
    });
  }
  const overdue = (
    await pool.query(
      `SELECT i.id,i.tenant_id,i.due_at,i.amount,(i.amount-coalesce(c.covered,0))::text outstanding FROM billing_invoices i JOIN tenants t ON t.id=i.tenant_id
       LEFT JOIN LATERAL (SELECT sum(CASE WHEN e.kind='refund' THEN -e.amount ELSE e.amount END) covered FROM billing_entries e WHERE e.invoice_id=i.id) c ON true
       WHERE t.status='active' AND i.due_at<$1 AND coalesce(c.covered,0)<i.amount`,
      [now],
    )
  ).rows;
  for (const i of overdue)
    await transaction(pool, i.tenant_id, async (db) => {
      for (const admin of await tenantAdmins(db, i.tenant_id))
        await notify(db, {
          tenant_id: i.tenant_id,
          user_id: admin,
          kind: 'billing.overdue',
          title: '⚠️ Obuna to‘lovi muddati o‘tdi',
          body: `To‘lanmagan summa: ${money(i.outstanding)} UZS\nMuddat: ${new Date(i.due_at).toISOString().slice(0, 10)}\nKirish platforma egasi qaroriga qadar ochiq qoladi.`,
          payload: { invoice_id: i.id },
          dedup_key: `billing.overdue:${i.id}:${admin}`,
        });
    });
  return issued;
}
