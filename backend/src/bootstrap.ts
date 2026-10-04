import { createPool, transaction } from './db.js';
import { hashPassword } from './security.js';
import { invariant } from './errors.js';
const login = process.env.BOOTSTRAP_LOGIN?.toLowerCase(),
  password = process.env.BOOTSTRAP_PASSWORD;
const role = process.env.BOOTSTRAP_ROLE ?? 'platform_owner';
invariant(['platform_owner', 'super_admin'].includes(role), 'INVALID_BOOTSTRAP_ROLE', 400);
invariant(
  login && password && password.length >= 12,
  'BOOTSTRAP_LOGIN_AND_STRONG_PASSWORD_REQUIRED',
  400,
);
const pool = createPool(process.env.MIGRATION_DATABASE_URL);
try {
  await transaction(pool, null, async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(739115)');
    invariant(
      !(await db.query('SELECT 1 FROM users WHERE role=$1', [role])).rowCount,
      'BOOTSTRAP_ROLE_ALREADY_EXISTS',
    );
    await db.query('INSERT INTO users(login,display_name,password_hash,role) VALUES($1,$2,$3,$4)', [
      login,
      role === 'platform_owner' ? 'Platforma egasi' : 'Texnik administrator',
      await hashPassword(password),
      role,
    ]);
  });
  console.log('Platforma egasi yaratildi.');
} finally {
  await pool.end();
}
