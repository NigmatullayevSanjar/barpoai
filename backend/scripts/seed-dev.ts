/**
 * Dev/test uchun hisoblar yaratadi: platforma egasi, bitta sinov korxona (tenant),
 * uning admini va har bir rol uchun bitta xodim. Parollar scrypt bilan hash qilinadi.
 *
 * Ishga tushirish:  SEED_PASSWORD=... npm run seed:dev   (parol faylga yozilmaydi va chiqarilmaydi)
 * Bazani tanlash:   DATABASE_URL yoki MIGRATION_DATABASE_URL (migratsiya/egasi ulanishi afzal — RLS'ni chetlab o'tadi).
 *
 * Idempotent: mavjud login/korxona qayta yaratilmaydi. Production bazaga tushmaslik uchun
 * NODE_ENV=production bo'lsa ALLOW_PROD_SEED=1 talab qilinadi.
 */
import { type Db, createPool, transaction } from '../src/db.js';
import { hashPassword } from '../src/security.js';
import { invariant } from '../src/errors.js';

const DEV_PASSWORD = process.env.SEED_PASSWORD ?? '';
const TENANT_KEY = 'DEV-TENANT-1';

invariant(DEV_PASSWORD.length >= 6, 'SEED_PASSWORD_REQUIRED_MIN_6', 400);
invariant(
  process.env.NODE_ENV !== 'production' || process.env.ALLOW_PROD_SEED === '1',
  'REFUSING_TO_SEED_PRODUCTION',
  400,
);

// Platformadan tashqari (tenant'siz) hisoblar.
const platform: { login: string; name: string; role: string }[] = [
  { login: 'owner', name: 'Platforma egasi', role: 'platform_owner' },
  { login: 'superadmin', name: 'Super admin', role: 'super_admin' },
  { login: 'support', name: 'Qo‘llab-quvvatlash', role: 'support' },
];

// Sinov korxona ichidagi xodimlar (tenant_admin'dan tashqari).
const employees: { login: string; name: string; role: string }[] = [
  { login: 'foreman', name: 'Prorab', role: 'foreman' },
  { login: 'brigadier', name: 'Brigadir', role: 'brigadier' },
  { login: 'warehouse', name: 'Omborchi', role: 'warehouse_manager' },
  { login: 'financier', name: 'Moliyachi', role: 'financier' },
  { login: 'accountant', name: 'Buxgalter', role: 'accountant' },
  { login: 'manager', name: 'Menejer', role: 'manager' },
  { login: 'pto', name: 'PTO injeneri', role: 'pto_engineer' },
];

const pool = createPool(process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL);
const created: string[] = [];
const skipped: string[] = [];

async function upsertUser(
  db: Db,
  u: { login: string; name: string; role: string; tenant_id: string | null },
) {
  const exists = (await db.query('SELECT 1 FROM users WHERE login=$1', [u.login])).rowCount;
  if (exists) {
    skipped.push(u.login);
    return;
  }
  await db.query(
    'INSERT INTO users(tenant_id,login,display_name,password_hash,role) VALUES($1,$2,$3,$4,$5)',
    [u.tenant_id, u.login, u.name, await hashPassword(DEV_PASSWORD), u.role],
  );
  created.push(u.login);
}

try {
  await transaction(pool, null, async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(739116)');

    for (const u of platform) await upsertUser(db, { ...u, tenant_id: null });

    // Sinov korxona: faol, 14 kunlik trial boshlangan holatda.
    let tenant = (await db.query('SELECT id FROM tenants WHERE registration_key=$1', [TENANT_KEY]))
      .rows[0];
    if (!tenant) {
      tenant = (
        await db.query(
          `INSERT INTO tenants(legal_name,registration_key,status,trial_started_at,trial_ends_at)
           VALUES('Sinov korxona',$1,'active',now(),now()+interval '14 days') RETURNING id`,
          [TENANT_KEY],
        )
      ).rows[0];
      created.push(`tenant:${TENANT_KEY}`);
    } else {
      skipped.push(`tenant:${TENANT_KEY}`);
    }

    await upsertUser(db, {
      login: 'admin',
      name: 'Korxona admini',
      role: 'tenant_admin',
      tenant_id: tenant.id,
    });
    for (const e of employees) await upsertUser(db, { ...e, tenant_id: tenant.id });
  });

  const all = [...platform, { login: 'admin', role: 'tenant_admin' }, ...employees];
  const width = Math.max(...all.map((u) => u.login.length));
  console.log('\nDev hisoblari tayyor. Umumiy parol: SEED_PASSWORD qiymati.\n');
  console.log('  %s   rol', 'login'.padEnd(width));
  console.log('  %s   ---', '-'.repeat(width));
  for (const u of all) console.log('  %s   %s', u.login.padEnd(width), u.role);
  console.log('\nYaratildi: %s', created.length ? created.join(', ') : '(yangi yo‘q)');
  if (skipped.length) console.log('Mavjud (o‘tkazib yuborildi): %s', skipped.join(', '));
  console.log();
} finally {
  await pool.end();
}
