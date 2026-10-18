import { z } from 'zod';
import { type Endpoint } from './http.js';
import { one, audit } from './db.js';
import { uuid, date, idParams, pageQuery, searchQuery, likePattern, queryBool } from './schemas.js';
import { accessState } from './auth.js';
import { invariant } from './errors.js';
import { notify } from './notify.js';
import { creditBalance } from './billing.js';
import { money } from './money.js';
// Rollar (D15, 2026-10-13): egasi — biznes amallari; super_admin va support — o'qish (readers); xodimlar va audit — super_admin.
const owner = ['platform_owner'];
const readers = ['platform_owner', 'super_admin', 'support'];
/** Platforma egasi va texnik xodimlar uchun o'qish/ko'rish endpointlari (frontend kartalari uchun). */
export function platformExtraRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'GET',
    path: '/v1/platform/tenants/:id',
    summary: 'Kompaniya kartasi: holat, admin, tarif, invoyslar va to‘lovlar',
    platform: readers,
    params: idParams,
    handler: async ({ db, actor, params }) => {
      const tenant = await one(
        db,
        'SELECT t.*,a.alias FROM tenants t LEFT JOIN tenant_aliases a ON a.tenant_id=t.id AND a.owner_id=$2 WHERE t.id=$1',
        [params.id, actor.id],
      );
      const admin = (
        await db.query(
          "SELECT id,login,display_name,phone,created_at FROM users WHERE tenant_id=$1 AND role='tenant_admin' AND active LIMIT 1",
          [params.id],
        )
      ).rows[0];
      const users = await one(
        db,
        'SELECT count(*) FILTER(WHERE active)::int active,count(*)::int total FROM users WHERE tenant_id=$1',
        [params.id],
      );
      const subscription =
        (
          await db.query(
            'SELECT s.*,p.code,p.version,p.monthly_price,p.limits FROM subscriptions s JOIN plan_versions p ON p.id=s.plan_version_id WHERE s.tenant_id=$1',
            [params.id],
          )
        ).rows[0] ?? null;
      const invoices = (
        await db.query(
          `SELECT i.*,p.code plan_code,coalesce((SELECT sum(CASE WHEN e.kind='refund' THEN -e.amount ELSE e.amount END) FROM billing_entries e WHERE e.invoice_id=i.id),0)::text covered
           FROM billing_invoices i JOIN plan_versions p ON p.id=i.plan_version_id WHERE i.tenant_id=$1 ORDER BY i.period_start DESC`,
          [params.id],
        )
      ).rows;
      const entries = (
        await db.query(
          'SELECT id,invoice_id,kind,amount,external_ref,reason,created_at FROM billing_entries WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200',
          [params.id],
        )
      ).rows;
      const credits = (
        await db.query(
          'SELECT id,kind,amount::text,invoice_id,note,created_at FROM billing_credits WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100',
          [params.id],
        )
      ).rows;
      const invite = (
        await db.query(
          'SELECT id,expires_at,created_at FROM invites WHERE tenant_id=$1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at>now()',
          [params.id],
        )
      ).rows[0];
      return {
        ...tenant,
        ...accessState(tenant),
        admin: admin ?? null,
        users,
        subscription,
        invoices,
        entries,
        credits,
        credit_balance: money(await creditBalance(db, params.id)),
        pending_invite: invite ?? null,
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/platform/billing/invoices',
    summary: 'Barcha SaaS invoyslar, qoplanish va kompaniya nomi bilan; q — kompaniya nomi',
    platform: readers,
    query: searchQuery.extend({ tenant_id: uuid.optional(), unpaid: queryBool.optional() }),
    handler: async ({ db, query }) => ({
      items: (
        await db.query(
          `SELECT i.*,t.legal_name,p.code plan_code,coalesce(c.covered,0)::text covered,(i.amount-coalesce(c.covered,0))::text outstanding
           FROM billing_invoices i JOIN tenants t ON t.id=i.tenant_id JOIN plan_versions p ON p.id=i.plan_version_id
           LEFT JOIN LATERAL (SELECT sum(CASE WHEN e.kind='refund' THEN -e.amount ELSE e.amount END) covered FROM billing_entries e WHERE e.invoice_id=i.id) c ON true
           WHERE ($1::uuid IS NULL OR i.tenant_id=$1) AND ($2::boolean IS NOT TRUE OR coalesce(c.covered,0)<i.amount)
             AND ($5::text IS NULL OR t.legal_name ILIKE $5 ESCAPE '\\' OR p.code ILIKE $5 ESCAPE '\\')
           ORDER BY i.due_at DESC,i.id LIMIT $3 OFFSET $4`,
          [
            query.tenant_id ?? null,
            query.unpaid ?? false,
            query.limit,
            query.offset,
            query.q ? likePattern(query.q) : null,
          ],
        )
      ).rows,
    }),
  });
  add({
    method: 'GET',
    path: '/v1/platform/billing/debtors',
    summary:
      'Qarzdor kompaniyalar — qoplanmagan invoyslar bo‘yicha jami, muddati o‘tgan va joriy qarz, eng eski muddat; overdue=true — faqat muddati o‘tganlar; q — kompaniya nomi yoki kaliti',
    platform: readers,
    query: searchQuery.extend({ overdue: queryBool.optional() }),
    handler: async ({ db, query }) => ({
      items: (
        await db.query(
          // Qarz ta'rifi billing/summary (debt_split) bilan bir xil: invoys summasi minus to'lov/kredit (refund ayiriladi);
          // muddati o'tgan — due_at<now(). Kompaniya holati (access_state) alohida — trial/paid_until bo'yicha.
          `WITH d AS (
             SELECT i.tenant_id,count(*)::int invoices,round(sum(i.amount-coalesce(c.covered,0)),2) debt,
                    round(coalesce(sum(i.amount-coalesce(c.covered,0)) FILTER(WHERE i.due_at<now()),0),2) overdue,
                    round(coalesce(sum(i.amount-coalesce(c.covered,0)) FILTER(WHERE i.due_at>=now()),0),2) current,
                    min(i.due_at) FILTER(WHERE i.due_at<now()) oldest_due_at
             FROM billing_invoices i
             LEFT JOIN LATERAL (SELECT sum(CASE WHEN e.kind='refund' THEN -e.amount ELSE e.amount END) covered FROM billing_entries e WHERE e.invoice_id=i.id) c ON true
             WHERE coalesce(c.covered,0)<i.amount GROUP BY i.tenant_id)
           SELECT t.id tenant_id,t.legal_name,t.registration_key,t.status,t.trial_ends_at,t.paid_until,
                  (SELECT p.code FROM subscriptions s JOIN plan_versions p ON p.id=s.plan_version_id WHERE s.tenant_id=t.id) plan_code,
                  (SELECT display_name FROM users u WHERE u.tenant_id=t.id AND u.role='tenant_admin' AND u.active LIMIT 1) admin_name,
                  d.invoices,d.debt::text debt,d.overdue::text overdue,d.current::text current,d.oldest_due_at,
                  CASE WHEN d.oldest_due_at IS NULL THEN 0 ELSE floor(extract(epoch FROM now()-d.oldest_due_at)/86400)::int END overdue_days
           FROM d JOIN tenants t ON t.id=d.tenant_id
           WHERE ($1::boolean IS NOT TRUE OR d.overdue>0)
             AND ($4::text IS NULL OR t.legal_name ILIKE $4 ESCAPE '\\' OR t.registration_key ILIKE $4 ESCAPE '\\')
           ORDER BY d.overdue DESC,d.debt DESC,t.legal_name,t.id LIMIT $2 OFFSET $3`,
          [
            query.overdue ?? false,
            query.limit,
            query.offset,
            query.q ? likePattern(query.q) : null,
          ],
        )
      ).rows.map((row) => ({ ...row, ...accessState(row) })),
    }),
  });
  add({
    method: 'GET',
    path: '/v1/platform/staff',
    summary: 'Platforma xodimlari ro‘yxati (Telegram ulanganligi bilan — 2FA holati)',
    platform: ['super_admin'],
    handler: async ({ db }) => ({
      items: (
        await db.query(
          `SELECT u.id,u.login,u.display_name,u.role,u.active,u.must_change_password,u.created_at,
                  (a.user_id IS NOT NULL) telegram_linked
           FROM users u LEFT JOIN telegram_accounts a ON a.user_id=u.id
           WHERE u.tenant_id IS NULL ORDER BY u.role,u.display_name`,
        )
      ).rows,
    }),
  });
  add({
    method: 'PATCH',
    path: '/v1/platform/staff/:id',
    summary:
      'Platforma xodimini faolsizlantirish/faollashtirish yoki rolini o‘zgartirish (super_admin ↔ support); sessiyalari bekor qilinadi; o‘zini va platforma egasini o‘zgartirib bo‘lmaydi',
    platform: ['super_admin'],
    params: idParams,
    body: z.strictObject({ active: z.boolean(), role: z.enum(['super_admin', 'support']) }),
    handler: async ({ db, actor, params, body }) => {
      const user = await one(
        db,
        'SELECT * FROM users WHERE id=$1 AND tenant_id IS NULL FOR UPDATE',
        [params.id],
      );
      invariant(user.id !== actor.id && user.role !== 'platform_owner', 'FORBIDDEN', 403);
      const row = await one(
        db,
        'UPDATE users SET active=$2,role=$3,version=version+1 WHERE id=$1 RETURNING id,login,display_name,role,active,must_change_password,created_at',
        [user.id, body.active, body.role],
      );
      if (!body.active || body.role !== user.role)
        await db.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1', [user.id]);
      await audit(db, actor, 'platform.staff.update', user.id, {
        before: { active: user.active, role: user.role },
        after: { active: row.active, role: row.role },
      });
      return row;
    },
  });
  add({
    method: 'GET',
    path: '/v1/platform/audit',
    summary:
      'Platforma auditi: platforma xodimlari amallari (tarif, obuna, bloklash, xodimlar, parol tiklash, kirish) — action, actor_id, sana filtrlari',
    platform: ['super_admin', 'platform_owner'],
    query: pageQuery.extend({
      action: z.string().trim().max(60).optional(),
      actor_id: uuid.optional(),
      from: date.optional(),
      to: date.optional(),
    }),
    handler: async ({ db, query }) => {
      const where = `a.tenant_id IS NULL AND ($1::text IS NULL OR a.action ILIKE $1||'%') AND ($2::uuid IS NULL OR a.actor_id=$2)
        AND ($3::date IS NULL OR a.created_at>=$3) AND ($4::date IS NULL OR a.created_at<($4::date+1))`;
      const params = [
        query.action || null,
        query.actor_id ?? null,
        query.from ?? null,
        query.to ?? null,
      ];
      const items = (
        await db.query(
          `SELECT a.id,a.actor_id,u.display_name actor_name,u.role actor_role,a.action,a.resource_id,a.details,a.created_at
           FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id WHERE ${where} ORDER BY a.created_at DESC,a.id LIMIT $5 OFFSET $6`,
          [...params, query.limit, query.offset],
        )
      ).rows;
      const total = await one(
        db,
        `SELECT count(*)::int total FROM audit_events a WHERE ${where}`,
        params,
      );
      return { items, total: total.total };
    },
  });
  add({
    method: 'PATCH',
    path: '/v1/platform/support/:id',
    summary:
      'Murojaatni yopish yoki qayta ochish; javob yozilsa murojaat egasiga bildirishnoma ketadi',
    platform: ['support', 'platform_owner', 'super_admin'],
    params: idParams,
    body: z.strictObject({
      status: z.enum(['open', 'closed']),
      response: z.string().trim().min(2).max(2000).optional(),
    }),
    handler: async ({ db, actor, params, body }) => {
      const row = await one(
        db,
        `UPDATE support_requests SET status=$2,
           response=coalesce($3,response),responded_by=CASE WHEN $3 IS NULL THEN responded_by ELSE $4 END,
           responded_at=CASE WHEN $3 IS NULL THEN responded_at ELSE now() END
         WHERE id=$1 RETURNING *`,
        [params.id, body.status, body.response ?? null, actor.id],
      );
      await audit(db, actor, `support.${body.status}`, row.id, {
        responded: Boolean(body.response),
      });
      if (body.response) {
        await db.query("SELECT set_config('app.tenant_id',$1,true)", [row.tenant_id]);
        await notify(db, {
          tenant_id: row.tenant_id,
          user_id: row.user_id,
          kind: 'support.response',
          title: 'BARPO AI support javobi',
          body: `${row.message.slice(0, 120)}${row.message.length > 120 ? '…' : ''}\n\nJavob: ${body.response}`,
          payload: { support_request_id: row.id, status: body.status },
        });
        await db.query("SELECT set_config('app.tenant_id','',true)");
      }
      return row;
    },
  });
}
