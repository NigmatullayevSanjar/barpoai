import { z } from 'zod';
import { type Endpoint } from './http.js';
import { one, audit } from './db.js';
import { login, registerInvite, issueSession, publicUser } from './auth.js';
import { digest, hashPassword, verifyPassword, verifyTelegram } from './security.js';
import { password, loginName, text, identifier, phone, pageQuery, uuid } from './schemas.js';
import { invariant } from './errors.js';
import { createLinkToken, telegramStatus, unlinkTelegram } from './telegram.js';
const authLimit = (max: number) => ({
  max: Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE ?? max),
  timeWindow: '1 minute',
});
export function authRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'POST',
    path: '/v1/auth/login',
    summary:
      'Login yoki telefon raqami bilan kirish; cookie va Bearer sessiya; bloklangan admin faqat billing/supportga kira oladi',
    public: true,
    session: 'set',
    rateLimit: authLimit(15),
    body: z.strictObject({ login: identifier, password: z.string().min(1).max(128) }),
    handler: async ({ db, body }) =>
      login(db, body as { login: string; password: string }, 'cookie'),
  });
  add({
    method: 'POST',
    path: '/v1/auth/invites/preview',
    summary: 'Linkni sarflamasdan tekshirish',
    public: true,
    rateLimit: authLimit(30),
    body: z.strictObject({ token: z.string().min(32).max(100) }),
    handler: async ({ db, body }) => {
      const invite = await one(
        db,
        `SELECT t.legal_name,i.expires_at FROM invites i JOIN tenants t ON t.id=i.tenant_id WHERE i.token_hash=$1 AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now() AND t.status='pending'`,
        [digest(body.token)],
      );
      return invite;
    },
  });
  add({
    method: 'POST',
    path: '/v1/auth/register',
    summary: 'Individual link orqali bir martalik admin signup',
    public: true,
    session: 'set',
    rateLimit: authLimit(10),
    body: z.strictObject({
      token: z.string().min(32).max(100),
      login: loginName,
      password,
      display_name: text,
      phone: phone.optional(),
    }),
    handler: async ({ db, body }) => registerInvite(db, body as any, 'cookie'),
  });
  add({
    method: 'GET',
    path: '/v1/auth/me',
    summary: 'Sessiya identifikatori va server roli',
    passwordChange: true,
    handler: async ({ db, actor }) => {
      const tenant = actor.tenant_id
        ? (await db.query('SELECT legal_name,status FROM tenants WHERE id=$1', [actor.tenant_id]))
            .rows[0]
        : null;
      return { ...publicUser(actor), tenant_name: tenant?.legal_name ?? null };
    },
  });
  add({
    method: 'POST',
    path: '/v1/auth/logout',
    summary: 'Joriy sessiyani bekor qilish',
    passwordChange: true,
    session: 'clear',
    handler: async ({ db, actor }) => {
      await db.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1', [
        actor.token_hash,
      ]);
      return { ok: true };
    },
  });
  add({
    method: 'POST',
    path: '/v1/auth/password',
    summary: 'Parol almashtirish va barcha sessiyalarni bekor qilish',
    passwordChange: true,
    session: 'clear',
    body: z.strictObject({ current_password: z.string().min(1).max(128), new_password: password }),
    handler: async ({ db, actor, body }) => {
      const user = await one(db, 'SELECT * FROM users WHERE id=$1 FOR UPDATE', [actor.id]);
      invariant(
        await verifyPassword(body.current_password, user.password_hash),
        'INVALID_CREDENTIALS',
        401,
      );
      await db.query(
        'UPDATE users SET password_hash=$2,must_change_password=false,version=version+1 WHERE id=$1',
        [actor.id, await hashPassword(body.new_password)],
      );
      await db.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1', [actor.id]);
      await audit(db, actor, 'auth.password_change', actor.id);
      return { ok: true, login_required: true };
    },
  });
  add({
    method: 'PATCH',
    path: '/v1/auth/profile',
    summary: 'O‘z profilini tahrirlash: ism va telefon',
    passwordChange: true,
    body: z.strictObject({ display_name: text, phone: phone.nullable() }),
    handler: async ({ db, actor, body }) => {
      const row = await one(
        db,
        'UPDATE users SET display_name=$2,phone=$3,version=version+1 WHERE id=$1 RETURNING *',
        [actor.id, body.display_name, body.phone],
      );
      await audit(db, actor, 'auth.profile_update', actor.id);
      return publicUser(row);
    },
  });
  add({
    method: 'POST',
    path: '/v1/auth/reset',
    summary: 'Bir martalik reset token bilan parolni tiklash',
    public: true,
    rateLimit: authLimit(10),
    body: z.strictObject({ token: z.string().min(32).max(100), new_password: password }),
    handler: async ({ db, body }) => {
      const reset = await one(db, 'SELECT * FROM password_resets WHERE token_hash=$1 FOR UPDATE', [
        digest(body.token),
      ]);
      invariant(
        !reset.used_at && new Date(reset.expires_at).getTime() > Date.now(),
        'RESET_EXPIRED',
        410,
      );
      const user = await one(db, 'SELECT * FROM users WHERE id=$1 AND active FOR UPDATE', [
        reset.user_id,
      ]);
      await db.query(
        'UPDATE users SET password_hash=$2,must_change_password=false,version=version+1 WHERE id=$1',
        [user.id, await hashPassword(body.new_password)],
      );
      await db.query(
        'UPDATE password_resets SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',
        [user.id],
      );
      await db.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1', [user.id]);
      await audit(db, user, 'auth.reset', user.id);
      return { ok: true };
    },
  });
  // ---------------------------------------------------------------- Telegram
  add({
    method: 'POST',
    path: '/v1/integrations/telegram/link',
    summary: 'Bir martalik, 5 daqiqalik Telegram ulash havolasi (deep link)',
    passwordChange: true,
    handler: async ({ db, actor }) => createLinkToken(db, actor),
  });
  add({
    method: 'GET',
    path: '/v1/integrations/telegram',
    summary: 'Joriy foydalanuvchining Telegram ulanish holati',
    passwordChange: true,
    handler: async ({ db, actor }) => telegramStatus(db, actor),
  });
  add({
    method: 'DELETE',
    path: '/v1/integrations/telegram',
    summary: 'Telegram akkauntni uzish; eski akkaunt boshqa amal bajara olmaydi',
    passwordChange: true,
    handler: async ({ db, actor }) => unlinkTelegram(db, actor),
  });
  const telegram = z.strictObject({
    id: z.string().regex(/^\d+$/),
    auth_date: z.string().regex(/^\d+$/),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    first_name: z.string().max(100).optional(),
    last_name: z.string().max(100).optional(),
    username: z.string().max(100).optional(),
    photo_url: z.string().max(1000).optional(),
  });
  add({
    method: 'POST',
    path: '/v1/auth/telegram/login',
    summary: 'Oldindan ulangan Telegram (Login Widget imzosi) bilan kirish',
    public: true,
    session: 'set',
    body: telegram,
    handler: async ({ db, body }) => {
      invariant(process.env.TELEGRAM_BOT_TOKEN, 'PROVIDER_NOT_CONFIGURED', 503);
      const id = verifyTelegram(body, process.env.TELEGRAM_BOT_TOKEN);
      const user = await one(
        db,
        'SELECT u.* FROM telegram_accounts a JOIN users u ON u.id=a.user_id WHERE a.telegram_user_id=$1 AND u.active',
        [id],
      );
      await audit(db, user, 'telegram.login', user.id);
      return issueSession(db, user, 'cookie');
    },
  });
  // ---------------------------------------------------------------- Bildirishnomalar
  add({
    method: 'GET',
    path: '/v1/me/notifications',
    summary: 'O‘z bildirishnomalari; unread soni bilan',
    passwordChange: true,
    query: pageQuery.extend({ unread: z.coerce.boolean().optional() }),
    handler: async ({ db, actor, query }) => {
      if (actor.tenant_id)
        await db.query("SELECT set_config('app.tenant_id',$1,true)", [actor.tenant_id]);
      const items = (
        await db.query(
          'SELECT id,kind,title,body,payload,project_id,read_at,created_at FROM notifications WHERE user_id=$1 AND ($2::boolean IS NOT TRUE OR read_at IS NULL) ORDER BY created_at DESC,id LIMIT $3 OFFSET $4',
          [actor.id, query.unread ?? false, query.limit, query.offset],
        )
      ).rows;
      const unread = await one(
        db,
        'SELECT count(*)::int unread FROM notifications WHERE user_id=$1 AND read_at IS NULL',
        [actor.id],
      );
      return { items, unread: unread.unread };
    },
  });
  add({
    method: 'POST',
    path: '/v1/me/notifications/read',
    summary: 'Bildirishnomalarni o‘qilgan deb belgilash (ids bo‘sh bo‘lsa hammasi)',
    passwordChange: true,
    body: z.strictObject({ ids: z.array(uuid).max(200).default([]) }),
    handler: async ({ db, actor, body }) => {
      if (actor.tenant_id)
        await db.query("SELECT set_config('app.tenant_id',$1,true)", [actor.tenant_id]);
      const result = await db.query(
        'UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL AND (cardinality($2::uuid[])=0 OR id=ANY($2::uuid[]))',
        [actor.id, body.ids],
      );
      return { ok: true, updated: result.rowCount };
    },
  });
}
