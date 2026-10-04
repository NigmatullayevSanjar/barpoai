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
  password,
  loginName,
} from './schemas.js';
import { token, digest, hashPassword } from './security.js';
import { invariant } from './errors.js';
import { dec } from './money.js';
import { accessState } from './auth.js';
import { telegramConfigured } from './telegram.js';
const owner = ['platform_owner'];
export function platformRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'POST',
    path: '/v1/platform/subscriptions',
    summary: 'Korxonaga aniq tarif versiyasi biriktirish',
    platform: owner,
    body: z.strictObject({ tenant_id: uuid, plan_version_id: uuid, next_period_start: timestamp }),
    handler: async ({ db, actor, body }) => {
      const row = await one(
        db,
        'INSERT INTO subscriptions(tenant_id,plan_version_id,next_period_start) VALUES($1,$2,$3) ON CONFLICT(tenant_id) DO UPDATE SET plan_version_id=excluded.plan_version_id,next_period_start=excluded.next_period_start RETURNING *',
        [body.tenant_id, body.plan_version_id, body.next_period_start],
      );
      await audit(db, actor, 'subscription.set', body.tenant_id);
      return row;
    },
  });
  add({
    method: 'GET',
    path: '/v1/platform/tenants',
    summary: 'Korxonalar, egaga tegishli alias va trial/to‘lov holati (avtomatik blok yo‘q)',
    platform: owner,
    query: pageQuery,
    handler: async ({ db, actor, query }) => ({
      items: (
        await db.query(
          `SELECT t.*,a.alias,(SELECT count(*)::int FROM users u WHERE u.tenant_id=t.id AND u.active) active_users,
            (SELECT display_name FROM users u WHERE u.tenant_id=t.id AND u.role='tenant_admin' AND u.active LIMIT 1) admin_name,
            (SELECT p.code FROM subscriptions s JOIN plan_versions p ON p.id=s.plan_version_id WHERE s.tenant_id=t.id) plan_code
           FROM tenants t LEFT JOIN tenant_aliases a ON a.tenant_id=t.id AND a.owner_id=$1 ORDER BY t.created_at,t.id LIMIT $2 OFFSET $3`,
          [actor.id, query.limit, query.offset],
        )
      ).rows.map((row) => ({ ...row, ...accessState(row) })),
    }),
  });
  add({
    method: 'POST',
    path: '/v1/platform/tenants',
    summary: 'Yangi korxona yaratish; trial signupda boshlanadi',
    platform: owner,
    body: z.strictObject({ legal_name: text, registration_key: text }),
    handler: async ({ db, actor, body }) => {
      const row = await one(
        db,
        'INSERT INTO tenants(legal_name,registration_key) VALUES($1,$2) RETURNING *',
        [body.legal_name, body.registration_key],
      );
      await audit(db, actor, 'tenant.create', row.id);
      return row;
    },
  });
  add({
    method: 'POST',
    path: '/v1/platform/tenants/:id/invites',
    summary: 'Bir martalik individual taklif; oldingi link bekor qilinadi',
    platform: owner,
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
    platform: owner,
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
    platform: owner,
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
    platform: owner,
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
    summary: 'Tarif versiyalari',
    platform: owner,
    handler: async ({ db }) => ({
      items: (await db.query('SELECT * FROM plan_versions ORDER BY code,version')).rows,
    }),
  });
  add({
    method: 'POST',
    path: '/v1/platform/billing/invoices',
    summary: 'Tarifdan oylik SaaS invoys yaratish',
    platform: owner,
    body: z.strictObject({
      tenant_id: uuid,
      plan_version_id: uuid,
      period_start: timestamp,
      period_end: timestamp,
      due_at: timestamp,
    }),
    handler: async ({ db, body, actor }) => {
      const plan = await one(db, 'SELECT * FROM plan_versions WHERE id=$1', [body.plan_version_id]);
      const row = await one(
        db,
        'INSERT INTO billing_invoices(tenant_id,plan_version_id,period_start,period_end,due_at,amount) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
        [
          body.tenant_id,
          body.plan_version_id,
          body.period_start,
          body.period_end,
          body.due_at,
          plan.monthly_price,
        ],
      );
      await audit(db, actor, 'billing.invoice', row.id);
      return row;
    },
  });
  add({
    method: 'POST',
    path: '/v1/platform/billing/entries',
    summary: 'SaaS to‘lov, kredit yoki refund; real callbackdan alohida manual hisob',
    platform: owner,
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
      invariant(
        body.kind === 'refund'
          ? dec(body.amount).lte(totals.cash)
          : dec(totals.covered).add(body.amount).lte(invoice.amount),
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
      // Only contiguous, fully covered periods extend access; a refund shortens coverage.
      await db.query(
        `WITH RECURSIVE covered AS (
      SELECT i.period_start,i.period_end FROM billing_invoices i LEFT JOIN billing_entries e ON e.invoice_id=i.id WHERE i.tenant_id=$1 GROUP BY i.id HAVING coalesce(sum(CASE WHEN e.kind='refund' THEN -e.amount ELSE e.amount END),0)>=i.amount
    ), chain AS (
      SELECT trial_ends_at AS until FROM tenants WHERE id=$1
      UNION SELECT c.period_end FROM covered c JOIN chain x ON c.period_start<=x.until AND c.period_end>x.until
    ) UPDATE tenants SET paid_until=(SELECT max(until) FROM chain) WHERE id=$1`,
        [invoice.tenant_id],
      );
      await audit(db, actor, `billing.${body.kind}`, row.id, { reason: body.reason });
      return row;
    },
  });
  add({
    method: 'GET',
    path: '/v1/platform/billing/summary',
    summary: 'Invoys, pul tushumi va qarz alohida',
    platform: owner,
    handler: async ({ db }) =>
      one(
        db,
        `WITH inv AS(SELECT coalesce(sum(amount),0) amount FROM billing_invoices),e AS(SELECT coalesce(sum(amount) FILTER(WHERE kind='payment'),0) payment,coalesce(sum(amount) FILTER(WHERE kind='refund'),0) refund,coalesce(sum(amount) FILTER(WHERE kind='credit'),0) credit FROM billing_entries) SELECT inv.amount::text invoiced,e.payment::text cash_received,e.refund::text refunded,(inv.amount-e.payment-e.credit+e.refund)::text debt,NULL::text profit FROM inv,e`,
      ),
  });
  add({
    method: 'GET',
    path: '/v1/platform/support',
    summary: 'Support va tarif almashtirish so‘rovlari (javob bilan)',
    platform: ['support', 'platform_owner', 'super_admin'],
    query: pageQuery,
    handler: async ({ db, query }) => ({
      items: (
        await db.query(
          'SELECT s.*,t.legal_name,u.display_name FROM support_requests s JOIN tenants t ON t.id=s.tenant_id JOIN users u ON u.id=s.user_id ORDER BY s.status,s.created_at DESC,s.id LIMIT $1 OFFSET $2',
          [query.limit, query.offset],
        )
      ).rows,
    }),
  });
  add({
    method: 'GET',
    path: '/v1/platform/diagnostics',
    summary:
      'Texnik holat: baza, worker navbati, so‘nggi 5xx xatolar, integratsiyalar; tenant moliyasi ochilmaydi',
    platform: ['super_admin', 'support'],
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
      return {
        database: {
          ok: true,
          latency_ms: latency,
          server_time: dbRow.server_time,
          last_migration: dbRow.last_migration,
        },
        worker: { ...worker, failed_jobs: deadJobs.slice(0, 20) },
        errors: { ...errors, items: recentErrors },
        sessions_active: sessions.active,
        telegram: { configured: telegramConfigured(), linked_accounts: telegram.linked },
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
    summary: 'Super admin texnik xodim yaratadi',
    platform: ['super_admin'],
    body: z.strictObject({
      login: loginName,
      password,
      display_name: text,
      role: z.enum(['super_admin', 'support']),
    }),
    handler: async ({ db, actor, body }) => {
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
