import { z } from 'zod';
import { type Endpoint } from './http.js';
import { one, audit } from './db.js';
import { login, registerInvite, issueSession } from './auth.js';
import { digest, hashPassword, verifyPassword, verifyTelegram } from './security.js';
import { password, loginName, text } from './schemas.js';
import { invariant } from './errors.js';
export function authRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'POST',
    path: '/v1/auth/login',
    summary: 'Login; bloklangan admin faqat billing/supportga kira oladi',
    public: true,
    body: z.strictObject({ login: loginName, password: z.string().min(1).max(128) }),
    handler: async ({ db, body }) => login(db, body as { login: string; password: string }),
  });
  add({
    method: 'POST',
    path: '/v1/auth/invites/preview',
    summary: 'Linkni sarflamasdan tekshirish',
    public: true,
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
    body: z.strictObject({
      token: z.string().min(32).max(100),
      login: loginName,
      password,
      display_name: text,
    }),
    handler: async ({ db, body }) => registerInvite(db, body as any),
  });
  add({
    method: 'GET',
    path: '/v1/auth/me',
    summary: 'Sessiya identifikatori va server roli',
    passwordChange: true,
    handler: async ({ actor }) => ({
      id: actor.id,
      tenant_id: actor.tenant_id,
      role: actor.role,
      display_name: actor.display_name,
      must_change_password: actor.must_change_password,
    }),
  });
  add({
    method: 'POST',
    path: '/v1/auth/logout',
    summary: 'Joriy sessiyani bekor qilish',
    passwordChange: true,
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
    method: 'POST',
    path: '/v1/auth/reset',
    summary: 'Bir martalik reset token bilan parolni tiklash',
    public: true,
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
    path: '/v1/auth/telegram/link',
    summary: 'Mavjud xodimga Telegram identity bog‘lash',
    body: telegram,
    handler: async ({ db, actor, body }) => {
      invariant(process.env.TELEGRAM_BOT_TOKEN, 'PROVIDER_NOT_CONFIGURED', 503);
      const id = verifyTelegram(body, process.env.TELEGRAM_BOT_TOKEN);
      await db.query('UPDATE users SET telegram_id=$2 WHERE id=$1', [actor.id, id]);
      await audit(db, actor, 'telegram.link', actor.id);
      return { ok: true };
    },
  });
  add({
    method: 'POST',
    path: '/v1/auth/telegram/login',
    summary: 'Oldindan bog‘langan Telegram bilan login',
    public: true,
    body: telegram,
    handler: async ({ db, body }) => {
      invariant(process.env.TELEGRAM_BOT_TOKEN, 'PROVIDER_NOT_CONFIGURED', 503);
      const id = verifyTelegram(body, process.env.TELEGRAM_BOT_TOKEN);
      const user = await one(db, 'SELECT * FROM users WHERE telegram_id=$1 AND active', [id]);
      await audit(db, user, 'telegram.login', user.id);
      return issueSession(db, user);
    },
  });
}
