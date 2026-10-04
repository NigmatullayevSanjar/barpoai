import { type Db, type Row, one, audit } from './db.js';
import { digest, token, hashPassword, verifyPassword } from './security.js';
import { invariant } from './errors.js';
export async function authenticate(db: Db, bearer: string | undefined) {
  invariant(bearer?.startsWith('Bearer ') && bearer.length < 256, 'UNAUTHORIZED', 401);
  const actor = (
    await db.query(
      `SELECT u.id,u.tenant_id,u.role,u.active,u.must_change_password,u.display_name,u.version,s.token_hash
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.active`,
      [digest(bearer!.slice(7))],
    )
  ).rows[0];
  invariant(actor, 'UNAUTHORIZED', 401);
  return actor as Row;
}
export async function tenantAccess(db: Db, actor: Row, recovery = false) {
  invariant(actor.tenant_id, 'TENANT_ACCOUNT_REQUIRED', 403);
  const tenant = await one(db, 'SELECT * FROM tenants WHERE id=$1 FOR SHARE', [actor.tenant_id]);
  invariant(tenant.status !== 'archived', 'TENANT_ARCHIVED', 403);
  if (recovery && actor.role === 'tenant_admin') return tenant;
  invariant(tenant.status === 'active', 'TENANT_BLOCKED', 403);
  invariant(
    (tenant.trial_ends_at && new Date(tenant.trial_ends_at).getTime() > Date.now()) ||
      (tenant.paid_until && new Date(tenant.paid_until).getTime() > Date.now()),
    'SUBSCRIPTION_REQUIRED',
    402,
  );
  return tenant;
}
export async function issueSession(db: Db, user: Row) {
  const raw = token();
  await db.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",
    [digest(raw), user.id],
  );
  return {
    access_token: raw,
    token_type: 'Bearer',
    expires_in: 43200,
    user: {
      id: user.id,
      tenant_id: user.tenant_id,
      role: user.role,
      display_name: user.display_name,
      must_change_password: user.must_change_password,
    },
  };
}
let dummyHash: Promise<string> | undefined;
export async function login(db: Db, input: { login: string; password: string }) {
  const user = (
    await db.query('SELECT * FROM users WHERE login=$1 FOR SHARE', [input.login.toLowerCase()])
  ).rows[0];
  dummyHash ??= hashPassword(token());
  const valid = await verifyPassword(input.password, user?.password_hash ?? (await dummyHash));
  invariant(user?.active && valid, 'INVALID_CREDENTIALS', 401);
  await audit(db, user, 'auth.login', user.id);
  return issueSession(db, user);
}
export async function registerInvite(
  db: Db,
  input: { token: string; login: string; password: string; display_name: string },
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
    `INSERT INTO users(tenant_id,login,display_name,password_hash,role) VALUES($1,$2,$3,$4,'tenant_admin') RETURNING *`,
    [tenant.id, input.login.toLowerCase(), input.display_name, await hashPassword(input.password)],
  );
  await db.query('UPDATE invites SET used_at=now() WHERE id=$1', [invite.id]);
  await db.query(
    "UPDATE tenants SET status='active',trial_started_at=now(),trial_ends_at=now()+interval '14 days',version=version+1 WHERE id=$1",
    [tenant.id],
  );
  await audit(db, user, 'tenant.signup', tenant.id);
  return issueSession(db, user);
}
