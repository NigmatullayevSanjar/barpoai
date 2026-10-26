import { z } from 'zod';
import { type Endpoint } from './http.js';
import { one, audit, type Row } from './db.js';
import {
  uuid,
  text,
  reason,
  version,
  positiveAmount,
  amount,
  timestamp,
  idParams,
  pageQuery,
  searchQuery,
  likePattern,
  password,
  loginName,
  phone,
  date,
} from './schemas.js';
import { token, digest, hashPassword } from './security.js';
import { invariant } from './errors.js';
import { dec } from './money.js';
import { accessState } from './auth.js';
import { issueInvoice, applyCredit, recomputeCoverage, periodEnd } from './billing.js';
import { telegramConfigured, botHealth } from './telegram.js';
import { platformPermit, platformStaff } from './platform-permissions.js';
// Rollar (egasi qarori D21, 2026-10-22; D15 o'rniga): ko'rish — barcha platforma xodimlari; har amal o'z ruxsati bilan
// (platform-permissions.ts). Super admin standartda egasining barcha amallariga ega, support — murojaatlar,
// diagnostika va kompaniya foydalanuvchisiga parol tiklash. Egasiga tegishli cheklovlar kodda qat'iy.
const staff = platformStaff;
const readers = platformStaff;
/** tenants.phone CHECK (+998XXXXXXXXX): schemas.phone 9 raqamga keltiradi, prefiks shu yerda qo'shiladi. */
const e164 = (p: string) => '+998' + p.replace(/^\+?998/, '');
const legalForm = z.enum(['mchj', 'aj', 'yatt', 'qk', 'other']);
/** Figma F6 kompaniya profili maydonlari (yaratish va tahrirlashda bir xil). */
const tenantProfile = {
  contact_name: z.string().trim().max(200).optional(),
  email: z.email().max(200).optional(),
  phone: phone.optional(),
  address: z.string().trim().max(500).optional(),
  legal_form: legalForm.optional(),
};
export function platformRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'POST',
    path: '/v1/platform/subscriptions',
    summary:
      'Korxonaga tarif versiyasi biriktirish; davr boshlanishi berilmasa trial tugashi yoki oxirgi qoplangan sana',
    platform: staff,
    platformPermission: 'plans.manage',
    body: z.strictObject({
      tenant_id: uuid,
      plan_version_id: uuid,
      next_period_start: timestamp.optional(),
    }),
    handler: async ({ db, actor, body }) => {
      const tenant = await one(db, 'SELECT trial_ends_at,paid_until FROM tenants WHERE id=$1', [
        body.tenant_id,
      ]);
      const start =
        body.next_period_start ??
        new Date(
          Math.max(
            tenant.trial_ends_at ? new Date(tenant.trial_ends_at).getTime() : 0,
            tenant.paid_until ? new Date(tenant.paid_until).getTime() : 0,
            Date.now(),
          ),
        ).toISOString();
      const row = await one(
        db,
        'INSERT INTO subscriptions(tenant_id,plan_version_id,next_period_start) VALUES($1,$2,$3) ON CONFLICT(tenant_id) DO UPDATE SET plan_version_id=excluded.plan_version_id,next_period_start=excluded.next_period_start RETURNING *',
        [body.tenant_id, body.plan_version_id, start],
      );
      await audit(db, actor, 'subscription.set', body.tenant_id);
      return row;
    },
  });
  add({
    method: 'GET',
    path: '/v1/platform/tenants',
    summary:
      'Korxonalar, egaga tegishli alias va trial/to‘lov holati (avtomatik blok yo‘q); q — nom, kalit, alias; state — access_state filtri',
    platform: readers,
    query: searchQuery.extend({
      state: z.enum(['pending', 'trial', 'paid', 'overdue', 'blocked', 'archived']).optional(),
      // Figma F6 "Kompaniyalar": tarif kodi bo'yicha filtr
      plan: text.optional(),
    }),
    handler: async ({ db, actor, query }) => ({
      items: (
        await db.query(
          // state CASE ifodasi auth.ts dagi accessState() bilan bir xil tartibda.
          `SELECT t.*,a.alias,(SELECT count(*)::int FROM users u WHERE u.tenant_id=t.id AND u.active) active_users,
            (SELECT display_name FROM users u WHERE u.tenant_id=t.id AND u.role='tenant_admin' AND u.active LIMIT 1) admin_name,
            (SELECT p.code FROM subscriptions s JOIN plan_versions p ON p.id=s.plan_version_id WHERE s.tenant_id=t.id) plan_code
           FROM tenants t LEFT JOIN tenant_aliases a ON a.tenant_id=t.id AND a.owner_id=$1
           WHERE ($4::text IS NULL OR t.legal_name ILIKE $4 ESCAPE '\\' OR t.registration_key ILIKE $4 ESCAPE '\\' OR a.alias ILIKE $4 ESCAPE '\\'
                  OR EXISTS(SELECT 1 FROM users u WHERE u.tenant_id=t.id AND u.role='tenant_admin' AND u.active AND u.display_name ILIKE $4 ESCAPE '\\'))
             AND ($5::text IS NULL OR (CASE WHEN t.status<>'active' THEN t.status WHEN t.trial_ends_at IS NULL THEN 'pending'
                  WHEN t.paid_until>now() THEN 'paid' WHEN t.trial_ends_at>now() THEN 'trial' ELSE 'overdue' END)=$5)
             AND ($6::text IS NULL OR EXISTS(SELECT 1 FROM subscriptions s JOIN plan_versions p ON p.id=s.plan_version_id WHERE s.tenant_id=t.id AND p.code=$6))
           ORDER BY t.created_at,t.id LIMIT $2 OFFSET $3`,
          [
            actor.id,
            query.limit,
            query.offset,
            query.q ? likePattern(query.q) : null,
            query.state ?? null,
            query.plan ?? null,
          ],
        )
      ).rows.map((row) => ({ ...row, ...accessState(row) })),
    }),
  });
  add({
    method: 'POST',
    path: '/v1/platform/tenants',
    summary:
      'Yangi korxona yaratish (Figma F6 uch qadam: profil, alias, boshlang‘ich tarif — bitta so‘rovda); trial signupda boshlanadi',
    platform: staff,
    platformPermission: 'tenants.manage',
    body: z.strictObject({
      legal_name: text,
      registration_key: text,
      ...tenantProfile,
      alias: text.optional(),
      plan_version_id: uuid.optional(),
      next_period_start: timestamp.optional(),
    }),
    handler: async ({ db, actor, body }) => {
      const row = await one(
        db,
        'INSERT INTO tenants(legal_name,registration_key,contact_name,email,phone,address,legal_form) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [
          body.legal_name,
          body.registration_key,
          body.contact_name || null,
          body.email || null,
          body.phone ? e164(body.phone) : null,
          body.address || null,
          body.legal_form ?? null,
        ],
      );
      if (body.alias)
        await db.query(
          'INSERT INTO tenant_aliases(owner_id,tenant_id,alias) VALUES($1,$2,$3) ON CONFLICT(owner_id,tenant_id) DO UPDATE SET alias=excluded.alias',
          [actor.id, row.id, body.alias],
        );
      if (body.plan_version_id) {
        await db.query(
          'INSERT INTO subscriptions(tenant_id,plan_version_id,next_period_start) VALUES($1,$2,$3)',
          [row.id, body.plan_version_id, body.next_period_start ?? new Date().toISOString()],
        );
        await audit(db, actor, 'subscription.set', row.id);
      }
      await audit(db, actor, 'tenant.create', row.id);
      return row;
    },
  });
  add({
    method: 'PATCH',
    path: '/v1/platform/tenants/:id/profile',
    summary:
      'Kompaniya profilini tahrirlash (Figma F6): nom, mas‘ul shaxs, e-mail, telefon, manzil, shakl, alias',
    platform: staff,
    platformPermission: 'tenants.manage',
    params: idParams,
    body: z.strictObject({
      version,
      legal_name: text,
      ...tenantProfile,
      alias: z.string().trim().max(500).optional(),
    }),
    handler: async ({ db, actor, params, body }) => {
      const t = await one(db, 'SELECT * FROM tenants WHERE id=$1 FOR UPDATE', [params.id]);
      invariant(t.version === body.version, 'VERSION_CONFLICT');
      const row = await one(
        db,
        `UPDATE tenants SET legal_name=$2,contact_name=$3,email=$4,phone=$5,address=$6,legal_form=$7,version=version+1
         WHERE id=$1 RETURNING *`,
        [
          params.id,
          body.legal_name,
          body.contact_name || null,
          body.email || null,
          body.phone ? e164(body.phone) : null,
          body.address || null,
          body.legal_form ?? null,
        ],
      );
      if (body.alias !== undefined) {
        if (body.alias)
          await db.query(
            'INSERT INTO tenant_aliases(owner_id,tenant_id,alias) VALUES($1,$2,$3) ON CONFLICT(owner_id,tenant_id) DO UPDATE SET alias=excluded.alias',
            [actor.id, params.id, body.alias],
          );
        else
          await db.query('DELETE FROM tenant_aliases WHERE owner_id=$1 AND tenant_id=$2', [
            actor.id,
            params.id,
          ]);
      }
      await audit(db, actor, 'tenant.profile', params.id);
      return row;
    },
  });
  add({
    method: 'POST',
    path: '/v1/platform/tenants/:id/invites',
    summary: 'Bir martalik individual taklif; oldingi link bekor qilinadi',
    platform: staff,
    platformPermission: 'tenants.manage',
    params: idParams,
    handler: async ({ db, actor, params }) => {
      const tenant = await one(db, 'SELECT * FROM tenants WHERE id=$1 FOR UPDATE', [params.id]);
      invariant(tenant.status === 'pending' && !tenant.trial_started_at, 'INVITE_UNAVAILABLE');
      await db.query(
        'UPDATE invites SET revoked_at=now() WHERE tenant_id=$1 AND used_at IS NULL AND revoked_at IS NULL',
        [params.id],
      );
      const raw = token();
      const invite = await one(
        db,
        "INSERT INTO invites(tenant_id,token_hash,expires_at,created_by) VALUES($1,$2,now()+interval '72 hours',$3) RETURNING id,expires_at",
        [params.id, digest(raw), actor.id],
      );
      await audit(db, actor, 'invite.issue', invite.id);
      return {
        ...invite,
        token: raw,
        registration_url: `${process.env.APP_ORIGIN ?? 'http://localhost:5173'}/register#token=${raw}`,
      };
    },
  });
  add({
    method: 'PATCH',
    path: '/v1/platform/tenants/:id',
    summary: 'Bloklash, arxivlash va qayta ochish',
    platform: staff,
    platformPermission: 'tenants.block',
    params: idParams,
    body: z.strictObject({ status: z.enum(['active', 'blocked', 'archived']), version, reason }),
    handler: async ({ db, actor, params, body }) => {
      const t = await one(db, 'SELECT * FROM tenants WHERE id=$1 FOR UPDATE', [params.id]);
      invariant(t.version === body.version, 'VERSION_CONFLICT');
      invariant(t.status !== 'pending', 'SIGNUP_REQUIRED');
      const row = await one(
        db,
        'UPDATE tenants SET status=$2,block_reason=$3,version=version+1 WHERE id=$1 RETURNING *',
        [params.id, body.status, body.reason],
      );
      if (body.status !== 'active') {
        await db.query(
          'UPDATE invites SET revoked_at=now() WHERE tenant_id=$1 AND used_at IS NULL',
          [params.id],
        );
        await db.query(
          'UPDATE sessions SET revoked_at=now() WHERE user_id IN(SELECT id FROM users WHERE tenant_id=$1)',
          [params.id],
        );
      }
      await audit(db, actor, `tenant.${body.status}`, params.id, { reason: body.reason });
      return row;
    },
  });
  add({
    method: 'POST',
    path: '/v1/platform/tenants/:id/alias',
    summary: 'Rasmiy nomdan mustaqil private alias',
    platform: staff,
    platformPermission: 'tenants.manage',
    params: idParams,
    body: z.strictObject({ alias: text }),
    handler: async ({ db, actor, params, body }) => {
      await db.query(
        'INSERT INTO tenant_aliases(owner_id,tenant_id,alias) VALUES($1,$2,$3) ON CONFLICT(owner_id,tenant_id) DO UPDATE SET alias=excluded.alias',
        [actor.id, params.id, body.alias],
      );
      return { alias: body.alias };
    },
  });
  add({
    method: 'POST',
    path: '/v1/platform/plans',
    summary: 'O‘zgarmas tarif versiyasi yaratish',
    platform: staff,
    platformPermission: 'plans.manage',
    body: z.strictObject({
      code: text,
      version,
      monthly_price: amount,
      limits: z.record(z.string(), z.number().int().nonnegative()).default({}),
    }),
    handler: async ({ db, body, actor }) => {
      const row = await one(
        db,
        'INSERT INTO plan_versions(code,version,monthly_price,limits) VALUES($1,$2,$3,$4) RETURNING *',
        [body.code, body.version, body.monthly_price, body.limits],
      );
      await audit(db, actor, 'plan.create', row.id);
      return row;
    },
  });
  add({
    method: 'GET',
    path: '/v1/platform/plans',
    summary:
      'Tarif versiyalari; har versiya bo‘yicha kompaniyalar va faol foydalanuvchilar soni (Figma F6 kartalar)',
    platform: readers,
    handler: async ({ db }) => ({
      items: (
        await db.query(
          `SELECT p.*,(SELECT count(*)::int FROM subscriptions s WHERE s.plan_version_id=p.id) tenants,
                  (SELECT count(*)::int FROM users u JOIN subscriptions s ON s.tenant_id=u.tenant_id WHERE s.plan_version_id=p.id AND u.active) users
           FROM plan_versions p ORDER BY p.code,p.version`,
        )
      ).rows,
    }),
  });
  add({
    method: 'PATCH',
    path: '/v1/platform/plans/:id',
    summary:
      'Tarifni tahrirlash: kod, oylik narx va limitlar; yangi narx keyingi invoysdan, chiqarilgan invoyslar o‘zgarmaydi',
    platform: staff,
    platformPermission: 'plans.manage',
    params: idParams,
    body: z.strictObject({
      code: text,
      monthly_price: amount,
      limits: z.record(z.string(), z.number().int().nonnegative()).default({}),
    }),
    handler: async ({ db, body, actor, params }) => {
      const before = await one(db, 'SELECT * FROM plan_versions WHERE id=$1 FOR UPDATE', [
        params.id,
      ]);
      const row = await one(
        db,
        'UPDATE plan_versions SET code=$2,monthly_price=$3,limits=$4 WHERE id=$1 RETURNING *',
        [params.id, body.code, body.monthly_price, body.limits],
      );
      await audit(db, actor, 'plan.update', row.id, {
        before: { code: before.code, monthly_price: before.monthly_price, limits: before.limits },
        after: { code: row.code, monthly_price: row.monthly_price, limits: row.limits },
      });
      return row;
    },
  });
  add({
    method: 'POST',
    path: '/v1/platform/users/:id/reset',
    summary:
      'Bir martalik 30 daqiqalik reset havolasi: kompaniya foydalanuvchisiga (admin ham) — users.reset; platforma xodimiga — staff.manage; platforma egasini faqat super admin tiklaydi (D21); o‘zini emas',
    platform: staff,
    params: idParams,
    handler: async ({ db, actor, params }) => {
      const user = await one(db, 'SELECT id,role,tenant_id FROM users WHERE id=$1 AND active', [
        params.id,
      ]);
      invariant(user.id !== actor.id, 'FORBIDDEN', 403);
      if (user.tenant_id) await platformPermit(db, actor, 'users.reset');
      else {
        await platformPermit(db, actor, 'staff.manage');
        // Egasini super admin tiklaydi (havola unga ko'rsatiladi); super adminni — egasi yoki boshqa super admin.
        invariant(
          user.role === 'platform_owner'
            ? actor.role === 'super_admin'
            : user.role !== 'super_admin' || ['platform_owner', 'super_admin'].includes(actor.role),
          'FORBIDDEN',
          403,
        );
      }
      await db.query(
        'UPDATE password_resets SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',
        [user.id],
      );
      const raw = token();
      await db.query("INSERT INTO password_resets VALUES($1,$2,now()+interval '30 minutes',NULL)", [
        digest(raw),
        user.id,
      ]);
      await db.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1', [user.id]);
      await audit(db, actor, 'platform.user_reset', user.id);
      return { token: raw, expires_in: 1800 };
    },
  });
  add({
    method: 'POST',
    path: '/v1/platform/billing/invoices',
    summary:
      'Tarifdan SaaS invoys qo‘lda yaratish (standart davr 30 kun); mavjud kredit avtomatik qo‘llanadi',
    platform: staff,
    platformPermission: 'billing.manage',
    body: z.strictObject({
      tenant_id: uuid,
      plan_version_id: uuid,
      period_start: timestamp,
      period_end: timestamp.optional(),
      due_at: timestamp.optional(),
    }),
    handler: async ({ db, body, actor }) => {
      await one(db, 'SELECT id FROM tenants WHERE id=$1 FOR UPDATE', [body.tenant_id]);
      return issueInvoice(db, {
        tenant_id: body.tenant_id,
        plan_version_id: body.plan_version_id,
        period_start: new Date(body.period_start),
        period_end: body.period_end ? new Date(body.period_end) : periodEnd(body.period_start),
        due_at: body.due_at ? new Date(body.due_at) : new Date(body.period_start),
        source: 'manual',
        actor,
      });
    },
  });
  add({
    method: 'POST',
    path: '/v1/platform/billing/entries',
    summary:
      'SaaS to‘lov, kredit yoki refund; invoysdan ortiqcha to‘lov kompaniya kreditiga o‘tadi va keyingi invoysga qo‘llanadi',
    platform: staff,
    platformPermission: 'billing.manage',
    body: z.strictObject({
      invoice_id: uuid,
      kind: z.enum(['payment', 'credit', 'refund']),
      amount: positiveAmount,
      external_ref: text,
      reason,
    }),
    handler: async ({ db, body, actor }) => {
      const candidate = await one(db, 'SELECT tenant_id FROM billing_invoices WHERE id=$1', [
        body.invoice_id,
      ]);
      await one(db, 'SELECT id FROM tenants WHERE id=$1 FOR UPDATE', [candidate.tenant_id]);
      const invoice = await one(db, 'SELECT * FROM billing_invoices WHERE id=$1 FOR UPDATE', [
        body.invoice_id,
      ]);
      const old = (
        await db.query('SELECT * FROM billing_entries WHERE external_ref=$1', [body.external_ref])
      ).rows[0];
      if (old) {
        invariant(
          old.invoice_id === body.invoice_id &&
            old.kind === body.kind &&
            dec(old.amount).eq(body.amount),
          'IDEMPOTENCY_CONFLICT',
        );
        return old;
      }
      const totals = await one(
        db,
        "SELECT coalesce(sum(CASE WHEN kind='refund' THEN -amount ELSE amount END),0)::text covered,coalesce(sum(CASE WHEN kind='payment' THEN amount WHEN kind='refund' THEN -amount ELSE 0 END),0)::text cash FROM billing_entries WHERE invoice_id=$1",
        [invoice.id],
      );
      // Qo‘lda kredit (chegirma) va refund chegaralanadi; haqiqiy to‘lov to‘liq yoziladi, ortiqchasi kreditga o‘tadi.
      invariant(
        body.kind === 'refund'
          ? dec(body.amount).lte(totals.cash)
          : body.kind === 'payment' || dec(totals.covered).add(body.amount).lte(invoice.amount),
        'BILLING_AMOUNT_EXCEEDED',
      );
      const row = await one(
        db,
        'INSERT INTO billing_entries(tenant_id,invoice_id,kind,amount,external_ref,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [
          invoice.tenant_id,
          invoice.id,
          body.kind,
          body.amount,
          body.external_ref,
          body.reason,
          actor.id,
        ],
      );
      const excess =
        body.kind === 'payment'
          ? dec(totals.covered).add(body.amount).minus(invoice.amount)
          : dec('0');
      if (excess.gt(0))
        await db.query(
          "INSERT INTO billing_credits(tenant_id,kind,amount,entry_id,invoice_id,note,created_by) VALUES($1,'overpayment',$2,$3,$4,$5,$6)",
          [
            invoice.tenant_id,
            excess.toFixed(2),
            row.id,
            invoice.id,
            `Ortiqcha to‘lov (${body.external_ref})`,
            actor.id,
          ],
        );
      await recomputeCoverage(db, invoice.tenant_id);
      await applyCredit(db, invoice.tenant_id, actor.id);
      await audit(db, actor, `billing.${body.kind}`, row.id, {
        reason: body.reason,
        credit: excess.gt(0) ? excess.toFixed(2) : undefined,
      });
      return { ...row, credit: excess.gt(0) ? excess.toFixed(2) : '0.00' };
    },
  });
  add({
    method: 'GET',
    path: '/v1/platform/billing/summary',
    summary:
      'Invoys, pul tushumi, qarz va kredit qoldig‘i; Figma F6: kompaniya sonlari, 6 oylik dinamika, qarz taqsimoti, so‘nggi operatsiyalar, xodimlar taqsimoti',
    platform: readers,
    handler: async ({ db }) => {
      const base = await one(
        db,
        `WITH inv AS(SELECT coalesce(sum(i.amount),0) amount,coalesce(sum(greatest(0,i.amount-coalesce(c.covered,0))),0) debt
                  FROM billing_invoices i LEFT JOIN LATERAL (SELECT sum(CASE WHEN e.kind='refund' THEN -e.amount ELSE e.amount END) covered FROM billing_entries e WHERE e.invoice_id=i.id) c ON true),
              e AS(SELECT coalesce(sum(amount) FILTER(WHERE kind='payment'),0) payment,coalesce(sum(amount) FILTER(WHERE kind='refund'),0) refund FROM billing_entries),
              cr AS(SELECT coalesce(sum(amount),0) balance FROM billing_credits)
         SELECT inv.amount::text invoiced,e.payment::text cash_received,e.refund::text refunded,inv.debt::text debt,cr.balance::text credit_balance,NULL::text profit FROM inv,e,cr`,
      );
      // Holatlar auth.ts accessState() tartibida: faol bo'lmasa — status; trial yo'q — pending; to'langan; sinov; muddati o'tgan.
      const counts = await one(
        db,
        `SELECT count(*)::int tenants,
                (SELECT count(*)::int FROM users u WHERE u.active AND u.tenant_id IS NOT NULL) employees,
                count(*) FILTER(WHERE status='active' AND trial_ends_at IS NOT NULL AND paid_until>now())::int paid,
                count(*) FILTER(WHERE status='active' AND trial_ends_at IS NOT NULL AND NOT coalesce(paid_until>now(),false) AND trial_ends_at>now())::int trial,
                count(*) FILTER(WHERE status='active' AND trial_ends_at IS NULL)::int pending,
                count(*) FILTER(WHERE status='active' AND trial_ends_at IS NOT NULL AND NOT coalesce(paid_until>now(),false) AND trial_ends_at<=now())::int overdue,
                count(*) FILTER(WHERE status='blocked')::int blocked
         FROM tenants`,
      );
      const monthly = (
        await db.query(
          `WITH months AS (SELECT generate_series(date_trunc('month',now())-interval '5 months',date_trunc('month',now()),interval '1 month') m)
           SELECT to_char(m,'YYYY-MM-01') AS month,
                  coalesce((SELECT sum(i.amount) FROM billing_invoices i WHERE date_trunc('month',i.period_start)=m),0)::text invoiced,
                  coalesce((SELECT sum(CASE WHEN e.kind='refund' THEN -e.amount ELSE e.amount END) FROM billing_entries e WHERE e.kind IN ('payment','refund') AND date_trunc('month',e.created_at)=m),0)::text received
           FROM months ORDER BY m`,
        )
      ).rows;
      const debtSplit = await one(
        db,
        `SELECT coalesce(sum(greatest(0,i.amount-coalesce(c.covered,0))) FILTER(WHERE i.due_at<now()),0)::text overdue,
                coalesce(sum(greatest(0,i.amount-coalesce(c.covered,0))) FILTER(WHERE i.due_at>=now()),0)::text current,
                CASE WHEN sum(greatest(0,i.amount-coalesce(c.covered,0)))>0 THEN round(100*coalesce(sum(greatest(0,i.amount-coalesce(c.covered,0))) FILTER(WHERE i.due_at<now()),0)/sum(greatest(0,i.amount-coalesce(c.covered,0))),1)::text END overdue_share,
                CASE WHEN sum(greatest(0,i.amount-coalesce(c.covered,0)))>0 THEN round(100*coalesce(sum(greatest(0,i.amount-coalesce(c.covered,0))) FILTER(WHERE i.due_at>=now()),0)/sum(greatest(0,i.amount-coalesce(c.covered,0))),1)::text END current_share
         FROM billing_invoices i LEFT JOIN LATERAL (SELECT sum(CASE WHEN e.kind='refund' THEN -e.amount ELSE e.amount END) covered FROM billing_entries e WHERE e.invoice_id=i.id) c ON true`,
      );
      const recent = (
        await db.query(
          `SELECT e.id,e.kind,e.amount::text,e.created_at,t.legal_name FROM billing_entries e JOIN tenants t ON t.id=e.tenant_id ORDER BY e.created_at DESC LIMIT 8`,
        )
      ).rows;
      const roles = (
        await db.query(
          `SELECT role,count(*)::int count FROM users WHERE active AND tenant_id IS NOT NULL GROUP BY role ORDER BY 2 DESC,1`,
        )
      ).rows;
      return { ...base, counts, monthly, debt_split: debtSplit, recent, roles };
    },
  });
  add({
    method: 'GET',
    path: '/v1/platform/billing/report',
    summary:
      'Oylik buxgalter hisoboti (Figma F6): oy ichidagi to‘lov/kredit/qaytarish yozuvlari yurib boruvchi qoldiq bilan va daromad–zarar jami',
    platform: readers,
    query: z.object({ month: date }),
    handler: async ({ db, query }) => {
      const entries = (
        await db.query(
          `SELECT e.id,e.created_at,e.kind,e.amount::text,e.external_ref,e.reason,t.legal_name,
                  sum(CASE WHEN e.kind='payment' THEN e.amount WHEN e.kind='refund' THEN -e.amount ELSE 0 END) OVER (ORDER BY e.created_at,e.id)::text running
           FROM billing_entries e JOIN tenants t ON t.id=e.tenant_id
           WHERE e.created_at>=date_trunc('month',$1::date) AND e.created_at<date_trunc('month',$1::date)+interval '1 month'
           ORDER BY e.created_at,e.id`,
          [query.month],
        )
      ).rows;
      const totals = await one(
        db,
        `WITH s AS (SELECT coalesce(sum(amount) FILTER(WHERE kind='payment'),0) income,coalesce(sum(amount) FILTER(WHERE kind='refund'),0) expense
                    FROM billing_entries WHERE created_at>=date_trunc('month',$1::date) AND created_at<date_trunc('month',$1::date)+interval '1 month')
         SELECT income::text,expense::text,(income-expense)::text net,CASE WHEN income>0 THEN round(100*(income-expense)/income,1)::text END margin FROM s`,
        [query.month],
      );
      return { month: query.month, entries, totals };
    },
  });
  add({
    method: 'GET',
    path: '/v1/platform/support',
    summary: 'Support va tarif almashtirish so‘rovlari (javob bilan); status filtri',
    platform: readers,
    query: pageQuery.extend({ status: z.enum(['open', 'closed']).optional() }),
    handler: async ({ db, query }) => ({
      items: (
        await db.query(
          'SELECT s.*,t.legal_name,u.display_name FROM support_requests s JOIN tenants t ON t.id=s.tenant_id JOIN users u ON u.id=s.user_id WHERE ($3::text IS NULL OR s.status=$3) ORDER BY s.status,s.created_at DESC,s.id LIMIT $1 OFFSET $2',
          [query.limit, query.offset, query.status ?? null],
        )
      ).rows,
    }),
  });
  add({
    method: 'GET',
    path: '/v1/platform/diagnostics',
    summary:
      'Texnik holat: baza, worker navbati, so‘nggi 5xx xatolar, integratsiyalar; tenant moliyasi ochilmaydi',
    platform: staff,
    platformPermission: 'diagnostics.read',
    handler: async ({ db }) => {
      const started = Date.now();
      const dbRow = await one(
        db,
        'SELECT now() server_time,(SELECT max(name) FROM schema_migrations) last_migration',
        [],
      );
      const latency = Date.now() - started;
      const tenants = (
        await db.query('SELECT id,legal_name,status FROM tenants ORDER BY created_at')
      ).rows;
      // Outbox FORCE RLS ostida: har kompaniya konteksti alohida o'rnatilib yig'iladi.
      const worker = { pending: 0, dead: 0, done_24h: 0, oldest_pending_at: null as string | null };
      const deadJobs: Row[] = [];
      for (const tenant of [...tenants.map((t) => t.id as string), null]) {
        await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenant ?? '']);
        const s = await one(
          db,
          `SELECT count(*) FILTER(WHERE status='pending')::int pending,count(*) FILTER(WHERE status='dead')::int dead,
                  count(*) FILTER(WHERE status='done' AND created_at>now()-interval '24 hours')::int done_24h,
                  min(available_at) FILTER(WHERE status='pending') oldest
           FROM outbox WHERE tenant_id IS NOT DISTINCT FROM $1`,
          [tenant],
        );
        worker.pending += s.pending;
        worker.dead += s.dead;
        worker.done_24h += s.done_24h;
        if (
          s.oldest &&
          (!worker.oldest_pending_at || s.oldest < new Date(worker.oldest_pending_at))
        )
          worker.oldest_pending_at = s.oldest.toISOString();
        for (const job of (
          await db.query(
            `SELECT id,kind,status,attempts,error_code,created_at,available_at FROM outbox
             WHERE tenant_id IS NOT DISTINCT FROM $1 AND (status='dead' OR (status='pending' AND attempts>0)) ORDER BY created_at DESC LIMIT 20`,
            [tenant],
          )
        ).rows)
          deadJobs.push({
            ...job,
            tenant_name: tenants.find((t) => t.id === tenant)?.legal_name ?? null,
          });
      }
      await db.query("SELECT set_config('app.tenant_id','',true)");
      deadJobs.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      const errors = await one(
        db,
        "SELECT count(*) FILTER(WHERE created_at>now()-interval '24 hours')::int last_24h,count(*)::int total FROM error_events",
        [],
      );
      const recentErrors = (
        await db.query(
          'SELECT id,request_id,method,path,status,code,message,created_at FROM error_events ORDER BY created_at DESC LIMIT 20',
        )
      ).rows;
      const sessions = await one(
        db,
        'SELECT count(*)::int active FROM sessions WHERE revoked_at IS NULL AND expires_at>now()',
        [],
      );
      const telegram = await one(db, 'SELECT count(*)::int linked FROM telegram_accounts', []);
      const byStatus = (status: string) => tenants.filter((t) => t.status === status).length;
      // Figma F6 "Xatoliklar" va "Integratsiyalar": haftalik dinamika, kod bo'yicha jurnal, tashqi xizmatlar holati.
      const daily = (
        await db.query(
          `WITH d AS (SELECT generate_series(current_date-6,current_date,interval '1 day')::date AS day)
           SELECT to_char(d.day,'YYYY-MM-DD') AS day,(SELECT count(*)::int FROM error_events e WHERE e.created_at::date=d.day) count FROM d ORDER BY d.day`,
        )
      ).rows;
      const byCode = (
        await db.query(
          `SELECT code,count(*)::int count,max(created_at) last_at,(array_agg(path ORDER BY created_at DESC))[1] path,(array_agg(message ORDER BY created_at DESC))[1] message
           FROM error_events WHERE created_at>now()-interval '7 days' GROUP BY code ORDER BY 2 DESC,1 LIMIT 20`,
        )
      ).rows;
      const cbu = await one(
        db,
        "SELECT max(rate_date)::text last_date,coalesce(max(rate_date)>=current_date-7,false) ok FROM exchange_rates WHERE currency='USD'",
        [],
      );
      const bot = telegramConfigured() ? await botHealth(db) : null;
      const integrations = [
        {
          key: 'telegram',
          configured: telegramConfigured(),
          ok: Boolean(bot && bot.polling_ok && !bot.conflict),
          last_at: bot?.last_ok_at ?? null,
          detail: bot?.last_error ?? null,
        },
        { key: 'cbu', configured: true, ok: cbu.ok, last_at: cbu.last_date, detail: null },
      ];
      return {
        database: {
          ok: true,
          latency_ms: latency,
          server_time: dbRow.server_time,
          last_migration: dbRow.last_migration,
        },
        worker: { ...worker, failed_jobs: deadJobs.slice(0, 20) },
        errors: { ...errors, items: recentErrors, daily, by_code: byCode },
        sessions_active: sessions.active,
        telegram: { configured: telegramConfigured(), linked_accounts: telegram.linked, bot },
        integrations,
        tenants: {
          active: byStatus('active'),
          pending: byStatus('pending'),
          blocked: byStatus('blocked'),
          archived: byStatus('archived'),
        },
        break_glass_enabled: false,
        integrations_release_ready: false,
      };
    },
  });
  add({
    method: 'POST',
    path: '/v1/platform/staff',
    summary:
      'Platforma xodimini yaratish (egasi yoki staff.manage ruxsati bor xodim); super adminni faqat egasi yoki super admin yaratadi',
    platform: staff,
    platformPermission: 'staff.manage',
    body: z.strictObject({
      login: loginName,
      password,
      display_name: text,
      role: z.enum(['super_admin', 'support']),
    }),
    handler: async ({ db, actor, body }) => {
      invariant(
        body.role !== 'super_admin' || ['platform_owner', 'super_admin'].includes(actor.role),
        'FORBIDDEN',
        403,
      );
      const row = await one(
        db,
        'INSERT INTO users(login,password_hash,display_name,role,must_change_password) VALUES($1,$2,$3,$4,true) RETURNING id,login,role,display_name',
        [body.login.toLowerCase(), await hashPassword(body.password), body.display_name, body.role],
      );
      await audit(db, actor, 'platform.staff.create', row.id);
      return row;
    },
  });
}
