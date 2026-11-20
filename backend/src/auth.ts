import { randomInt } from 'node:crypto';
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
/**
 * Trial/to'lov holati ko'rsatish uchun. «overdue» — muddat tugagan, lekin hali faol: worker keyingi siklda
 * bloklaydi (D33, blockUnpaid) yoki platforma egasi shu uzilish uchun qo'lda ochgan.
 */
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
  input: { domain?: string; login: string; password: string },
  channel: 'bearer' | 'cookie' = 'bearer',
) {
  // D43: kompaniya xodimi domen bilan kiradi (login kompaniya ichida yagona); domensiz — faqat platforma xodimlari.
  // Noma'lum domen ham oddiy INVALID_CREDENTIALS: domen yoki login mavjudligi oshkor qilinmaydi.
  const domain = input.domain?.trim().toLowerCase() || null;
  const tenantId = domain
    ? ((await db.query('SELECT id FROM tenants WHERE domain=$1', [domain])).rows[0]?.id ?? null)
    : null;
  const byPhone = isPhone(input.login);
  const user =
    domain && !tenantId
      ? undefined
      : (
          await db.query(
            `SELECT * FROM users WHERE ${byPhone ? 'phone' : 'login'}=$1 AND tenant_id IS NOT DISTINCT FROM $2 FOR SHARE`,
            [byPhone ? normalizePhone(input.login) : input.login.toLowerCase(), tenantId],
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
 * Urinish hisobi, kodni solishtirish va challenge'ni yopish bitta UPDATE — parallel so'rovlar qator qulfida
 * navbatga turadi, shuning uchun 5 tadan ortiq kod solishtirilmaydi. Xato urinish ham saqlanishi shart:
 * natija `failure` bilan qaytadi (throw so'rov tranzaksiyasini qaytarib, hisobni o'chirardi).
 */
export async function verifyLoginCode(db: Db, input: { challenge: string; code: string }) {
  const row = (
    await db.query(
      `UPDATE login_codes SET attempts=attempts+1,used_at=CASE WHEN code_hash=$2 OR attempts+1>=5 THEN now() ELSE used_at END
       WHERE challenge_hash=$1 AND used_at IS NULL AND expires_at>now()
       RETURNING user_id,channel,attempts,code_hash=$2 AS ok`,
      [digest(input.challenge), digest(input.code)],
    )
  ).rows[0];
  if (!row || (!row.ok && row.attempts >= 5))
    return { failure: { code: 'LOGIN_CODE_EXPIRED', status: 410 } };
  if (!row.ok) return { failure: { code: 'LOGIN_CODE_INVALID', status: 401 } };
  const user = await one(db, 'SELECT * FROM users WHERE id=$1', [row.user_id]);
  invariant(user.active, 'INVALID_CREDENTIALS', 401);
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
  // Oldindan biriktirilgan tarifning birinchi davri sinov tugashidan boshlanadi (invoys sinovdan keyin).
  await db.query(
    'UPDATE subscriptions s SET next_period_start=greatest(s.next_period_start,t.trial_ends_at) FROM tenants t WHERE t.id=s.tenant_id AND s.tenant_id=$1',
    [tenant.id],
  );
  await audit(db, user, 'tenant.signup', tenant.id);
  return issueSession(db, user, channel);
}
