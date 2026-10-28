/**
 * QA ma'lumotlarini tozalash: `QA-` kaliti bilan yaratilgan sinov kompaniyasini barcha yozuvlari bilan o'chiradi.
 *
 *   npm run qa:cleanup -- QA-20261028-1       bitta kompaniya (registration_key)
 *   npm run qa:cleanup -- --all-qa            barcha `QA-` kompaniyalar
 *
 * Faqat `QA-` bilan boshlanadigan kalit qabul qilinadi — haqiqiy kompaniya o'chirilmaydi. O'zgarmas ledger
 * (journal_entries, stock_ledger, progress_entries ...) trigger bilan himoyalangan, shuning uchun o'chirish
 * `session_replication_role=replica` (superuser — `MIGRATION_DATABASE_URL`, docker compose'dagi barpo_owner) bilan
 * bitta tranzaksiyada bajariladi: `tenant_id` ustuni bor hamma jadval, sessiyalar, foydalanuvchilar, kompaniya
 * qatori va diskdagi yuklangan fayllar. Production bazada ishlamaydi (NODE_ENV=production → rad).
 */
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Db, createPool, transaction } from '../src/db.js';
import { invariant } from '../src/errors.js';

/** backend/.env dagi qiymatlar (mavjud env ustun). */
export function loadEnv(file = resolve(process.cwd(), '.env')) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const key = line.slice(0, line.indexOf('=')).trim();
    const value = line
      .slice(line.indexOf('=') + 1)
      .trim()
      .replace(/^"(.*)"$/, '$1');
    if (!(key in process.env)) process.env[key] = value;
  }
}

export async function cleanupTenant(db: Db, registrationKey: string) {
  invariant(registrationKey.startsWith('QA-'), 'ONLY_QA_TENANTS_CAN_BE_DELETED', 400);
  const tenant = (
    await db.query('SELECT id FROM tenants WHERE registration_key=$1', [registrationKey])
  ).rows[0];
  if (!tenant) return { registration_key: registrationKey, deleted: false, tables: 0, files: 0 };
  await db.query('SET LOCAL session_replication_role = replica');
  const files = (await db.query('SELECT storage_key FROM files WHERE tenant_id=$1', [tenant.id]))
    .rows;
  await db.query(
    'DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE tenant_id=$1)',
    [tenant.id],
  );
  const tables = (
    await db.query(
      `SELECT DISTINCT c.table_name FROM information_schema.columns c JOIN information_schema.tables t
         ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
       WHERE c.table_schema='public' AND c.column_name='tenant_id' ORDER BY 1`,
    )
  ).rows.map((r) => r.table_name as string);
  for (const table of tables)
    await db.query(`DELETE FROM "${table.replace(/"/g, '""')}" WHERE tenant_id=$1`, [tenant.id]);
  await db.query('DELETE FROM tenants WHERE id=$1', [tenant.id]);
  const storage = resolve(process.env.STORAGE_DIR ?? './storage');
  let removed = 0;
  for (const f of files) {
    const path = resolve(storage, f.storage_key);
    if (path.startsWith(storage) && existsSync(path)) {
      unlinkSync(path);
      removed++;
    }
  }
  return {
    registration_key: registrationKey,
    deleted: true,
    tables: tables.length,
    files: removed,
  };
}

const isMain = process.argv[1]?.endsWith('qa-cleanup.ts');
if (isMain) {
  loadEnv();
  invariant(process.env.NODE_ENV !== 'production', 'REFUSING_TO_CLEAN_PRODUCTION', 400);
  const arg = process.argv[2];
  invariant(arg, 'USAGE: npm run qa:cleanup -- <QA-registration-key> | --all-qa', 400);
  const url = process.env.MIGRATION_DATABASE_URL;
  invariant(url, 'MIGRATION_DATABASE_URL_REQUIRED', 400);
  const pool = createPool(url);
  try {
    const keys =
      arg === '--all-qa'
        ? (
            await pool.query(
              "SELECT registration_key FROM tenants WHERE registration_key LIKE 'QA-%' ORDER BY 1",
            )
          ).rows.map((r) => r.registration_key as string)
        : [arg];
    const results = [];
    for (const key of keys)
      results.push(await transaction(pool, null, (db) => cleanupTenant(db, key)));
    console.log(JSON.stringify({ cleaned: results }, null, 2));
  } finally {
    await pool.end();
  }
}
