import { z } from 'zod';
import { type Endpoint } from './http.js';
import { one, audit } from './db.js';
import { uuid, idParams, pageQuery } from './schemas.js';
import { accessState } from './auth.js';
import { notify } from './notify.js';
import { creditBalance } from './billing.js';
import { money } from './money.js';
const owner = ['platform_owner'];
/** Platforma egasi va texnik xodimlar uchun o'qish/ko'rish endpointlari (frontend kartalari uchun). */
export function platformExtraRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'GET',
    path: '/v1/platform/tenants/:id',
    summary: 'Kompaniya kartasi: holat, admin, tarif, invoyslar va to‘lovlar',
    platform: owner,
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
    summary: 'Barcha SaaS invoyslar, qoplanish va kompaniya nomi bilan',
    platform: owner,
    query: pageQuery.extend({ tenant_id: uuid.optional(), unpaid: z.coerce.boolean().optional() }),
    handler: async ({ db, query }) => ({
      items: (
        await db.query(
          `SELECT i.*,t.legal_name,p.code plan_code,coalesce(c.covered,0)::text covered,(i.amount-coalesce(c.covered,0))::text outstanding
           FROM billing_invoices i JOIN tenants t ON t.id=i.tenant_id JOIN plan_versions p ON p.id=i.plan_version_id
           LEFT JOIN LATERAL (SELECT sum(CASE WHEN e.kind='refund' THEN -e.amount ELSE e.amount END) covered FROM billing_entries e WHERE e.invoice_id=i.id) c ON true
           WHERE ($1::uuid IS NULL OR i.tenant_id=$1) AND ($2::boolean IS NOT TRUE OR coalesce(c.covered,0)<i.amount)
           ORDER BY i.due_at DESC,i.id LIMIT $3 OFFSET $4`,
          [query.tenant_id ?? null, query.unpaid ?? false, query.limit, query.offset],
        )
      ).rows,
    }),
  });
  add({
    method: 'GET',
    path: '/v1/platform/staff',
    summary: 'Platforma xodimlari ro‘yxati',
    platform: ['super_admin'],
    handler: async ({ db }) => ({
      items: (
        await db.query(
          'SELECT id,login,display_name,role,active,must_change_password,created_at FROM users WHERE tenant_id IS NULL ORDER BY role,display_name',
        )
      ).rows,
    }),
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
