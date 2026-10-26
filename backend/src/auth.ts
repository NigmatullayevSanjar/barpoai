import { randomInt } from 'node:crypto';
import type pg from 'pg';
import { type Db, type Row, one, audit } from './db.js';
import { digest, token, hashPassword, verifyPassword } from './security.js';
import { invariant } from './errors.js';
// telegram.ts bu modulni import qiladi (tenantAccess); aylanma importdan qochish uchun kerak bo'lganda yuklanadi.
const telegram = () => import('./telegram.js');
export const SESSION_SECONDS = 12 * 3600;
export const SESSION_COOKIE = 'barpo_session';
export async function authenticate(db: Db, bearer: string | undefined, cookie?: string) {
  const raw = bearer?.startsWith('Bearer ') ? bearer.slice(7) : cookie;
  invariant(raw && raw.length < 256, 'UNAUTHORIZED', 401);
  const actor = (
    await db.query(
      `SELECT u.id,u.tenant_id,u.role,u.active,u.must_change_password,u.display_name,u.phone,u.version,s.token_hash,s.channel,
        EXISTS(SELECT 1 FROM telegram_accounts t WHERE t.user_id=u.id) telegram_linked
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.active`,
      [digest(raw)],
    )
  ).rows[0];
  invariant(actor, 'UNAUTHORIZED', 401);
  return actor as Row;
}
/** Trial/to'lov holati faqat ko'rsatish uchun; avtomatik bloklash yo'q — platforma egasi qo'lda hal qiladi. */
export function accessState(tenant: Row, now = Date.now()) {
  const day = 86400000;
  const trialEnd = tenant.trial_ends_at ? new Date(tenant.trial_ends_at).getTime() : null;
  const paidUntil = tenant.paid_until ? new Date(tenant.paid_until).getTime() : null;
  const coveredUntil = Math.max(trialEnd ?? 0, paidUntil ?? 0) || null;
  const state =
    tenant.status !== 'active'
      ? tenant.status
      : !trialEnd
        ? 'pending'
        : paidUntil && paidUntil > now
          ? 'paid'
          : trialEnd > now
            ? 'trial'
            : 'overdue';
  return {
    access_state: state,
    covered_until: coveredUntil ? new Date(coveredUntil).toISOString() : null,
    days_left: coveredUntil && coveredUntil > now ? Math.ceil((coveredUntil - now) / day) : 0,
    days_overdue: coveredUntil && coveredUntil <= now ? Math.floor((now - coveredUntil) / day) : 0,
  };
}
export async function tenantAccess(db: Db, actor: Row, recovery = false) {
  invariant(actor.tenant_id, 'TENANT_ACCOUNT_REQUIRED', 403);
  const tenant = await one(db, 'SELECT * FROM tenants WHERE id=$1 FOR SHARE', [actor.tenant_id]);
  invariant(tenant.status !== 'archived', 'TENANT_ARCHIVED', 403);
  if (recovery && actor.role === 'tenant_admin') return tenant;
  invariant(tenant.status === 'active', 'TENANT_BLOCKED', 403);
  return tenant;
}
export async function issueSession(db: Db, user: Row, channel: 'bearer' | 'cookie' = 'bearer') {
  const raw = token();
  await db.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at,channel) VALUES($1,$2,now()+interval '12 hours',$3)",
    [digest(raw), user.id, channel],
  );
  return {
    access_token: raw,
    token_type: 'Bearer',
    expires_in: SESSION_SECONDS,
    user: publicUser(user),
  };
}
export function publicUser(user: Row) {
  return {
    id: user.id,
    tenant_id: user.tenant_id,
    role: user.role,
    display_name: user.display_name,
    phone: user.phone ?? null,
    must_change_password: user.must_change_password,
  };
}
export const isPhone = (value: string) => /^(\+?998)?[0-9]{9}$/.test(value.replace(/[\s()-]/g, ''));
export const normalizePhone = (value: string) => '+998' + value.replace(/[\s()-]/g, '').slice(-9);
let dummyHash: Promise<string> | undefined;
export async function login(
  db: Db,
  input: { login: string; password: string },
  channel: 'bearer' | 'cookie' = 'bearer',
) {
  const byPhone = isPhone(input.login);
  const user = (
    await db.query(
      byPhone
        ? 'SELECT * FROM users WHERE phone=$1 FOR SHARE'
        : 'SELECT * FROM users WHERE login=$1 FOR SHARE',
      [byPhone ? normalizePhone(input.login) : input.login.toLowerCase()],
    )
  ).rows[0];
  dummyHash ??= hashPassword(token());
  const valid = await verifyPassword(input.password, user?.password_hash ?? (await dummyHash));
  invariant(user?.active && valid, 'INVALID_CREDENTIALS', 401);
  // Ikki bosqichli kirish (2026-10-13): platforma egasi va super admin Telegram'ga ulangan bo'lsa, sessiya
  // faqat botga yuborilgan 6 xonali kod tasdiqlangach beriladi. Ulanmagan bo'lsa oddiy kirish (profil ogohlantiradi).
  if (TWO_FACTOR_ROLES.includes(user.role)) {
    const tg = (
      await db.query('SELECT telegram_user_id FROM telegram_accounts WHERE user_id=$1', [user.id])
    ).rows[0];
    if (tg && (await telegram()).telegramConfigured())
      return startLoginChallenge(db, user, tg.telegram_user_id, channel);
  }
  await audit(db, user, 'auth.login', user.id, { channel });
  return issueSession(db, user, channel);
}
export const TWO_FACTOR_ROLES = ['platform_owner', 'super_admin'];
/**
 * D21 (2026-10-22): super admin uchun 2FA majburiy. Bot sozlangan bo'lsa-yu Telegram ulanmagan bo'lsa, sessiya faqat
 * profil va Telegramni ulash uchun (parol almashtirish marshrutlari); boshqa hamma so'rov TWO_FACTOR_SETUP_REQUIRED.
 */
export const twoFactorSetupRequired = (actor: Row, configured: boolean) =>
  actor.role === 'super_admin' && !actor.telegram_linked && configured;
const CODE_SECONDS = 300;
/** Kodni yozadi va botga yuboradi; javobda sessiya emas, challenge (5 daqiqa). Eski ochiq kodlar bekor qilinadi. */
async function startLoginChallenge(
  db: Db,
  user: Row,
  chatId: string,
  channel: 'bearer' | 'cookie',
) {
  await db.query('UPDATE login_codes SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [
    user.id,
  ]);
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const challenge = token();
  await db.query(
    'INSERT INTO login_codes(user_id,challenge_hash,code_hash,channel,expires_at) VALUES($1,$2,$3,$4,now()+make_interval(secs=>$5))',
    [user.id, digest(challenge), digest(code), channel, CODE_SECONDS],
  );
  await (
    await telegram()
  ).sendMessage(
    chatId,
    `BARPO AI — kirish kodi: ${code}\n\nKod ${CODE_SECONDS / 60} daqiqa amal qiladi. Agar siz kirmayotgan bo‘lsangiz, parolni darhol almashtiring.`,
  );
  await audit(db, user, 'auth.login_code_sent', user.id, { channel });
  return { two_factor: true as const, challenge, expires_in: CODE_SECONDS, user: publicUser(user) };
}
/**
 * Kodni tekshiradi: 5 marta xato — challenge bekor; to'g'ri bo'lsa sessiya (kanal challenge'dan).
 * Xato urinish `pool` orqali alohida yoziladi: so'rov tranzaksiyasi xato bilan ROLLBACK bo'ladi, hisob esa saqlanishi shart.
 */
export async function verifyLoginCode(
  db: Db,
  pool: pg.Pool,
  input: { challenge: string; code: string },
) {
  const row = (
    await db.query(
      'SELECT c.*,u.active FROM login_codes c JOIN users u ON u.id=c.user_id WHERE c.challenge_hash=$1',
      [digest(input.challenge)],
    )
  ).rows[0];
  invariant(
    row && !row.used_at && new Date(row.expires_at).getTime() > Date.now(),
    'LOGIN_CODE_EXPIRED',
    410,
  );
  invariant(row.active, 'INVALID_CREDENTIALS', 401);
  const ok = digest(input.code) === row.code_hash;
  if (!ok) {
    const attempts = (
      await pool.query(
        'UPDATE login_codes SET attempts=attempts+1,used_at=CASE WHEN attempts+1>=5 THEN now() ELSE used_at END WHERE id=$1 RETURNING attempts',
        [row.id],
      )
    ).rows[0].attempts as number;
    invariant(
      false,
      attempts >= 5 ? 'LOGIN_CODE_EXPIRED' : 'LOGIN_CODE_INVALID',
      attempts >= 5 ? 410 : 401,
    );
  }
  const claimed = await db.query(
    'UPDATE login_codes SET used_at=now() WHERE id=$1 AND used_at IS NULL',
    [row.id],
  );
  invariant(claimed.rowCount === 1, 'LOGIN_CODE_EXPIRED', 410);
  const user = await one(db, 'SELECT * FROM users WHERE id=$1', [row.user_id]);
  await audit(db, user, 'auth.login', user.id, { channel: row.channel, two_factor: true });
  return issueSession(db, user, row.channel);
}
export async function registerInvite(
  db: Db,
  input: { token: string; login: string; password: string; display_name: string; phone?: string },
  channel: 'bearer' | 'cookie' = 'bearer',
) {
  // Lock the tenant before its invite, same order as block/reissue commands.
  const candidate = await one(db, 'SELECT tenant_id FROM invites WHERE token_hash=$1', [
    digest(input.token),
  ]);
  const tenant = await one(db, 'SELECT * FROM tenants WHERE id=$1 FOR UPDATE', [
    candidate.tenant_id,
  ]);
  invariant(tenant.status === 'pending' && !tenant.trial_started_at, 'INVITE_UNAVAILABLE', 410);
  const invite = await one(db, 'SELECT * FROM invites WHERE token_hash=$1 FOR UPDATE', [
    digest(input.token),
  ]);
  invariant(
    !invite.used_at && !invite.revoked_at && new Date(invite.expires_at).getTime() > Date.now(),
    'INVITE_UNAVAILABLE',
    410,
  );
  const user = await one(
    db,
    `INSERT INTO users(tenant_id,login,display_name,password_hash,role,phone) VALUES($1,$2,$3,$4,'tenant_admin',$5) RETURNING *`,
    [
      tenant.id,
      input.login.toLowerCase(),
      input.display_name,
      await hashPassword(input.password),
      input.phone ?? null,
    ],
  );
  await db.query('UPDATE invites SET used_at=now() WHERE id=$1', [invite.id]);
  await db.query(
    "UPDATE tenants SET status='active',trial_started_at=now(),trial_ends_at=now()+interval '14 days',version=version+1 WHERE id=$1",
    [tenant.id],
  );
  await audit(db, user, 'tenant.signup', tenant.id);
  return issueSession(db, user, channel);
}
