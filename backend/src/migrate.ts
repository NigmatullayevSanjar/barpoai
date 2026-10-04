import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPool } from './db.js';
import type pg from 'pg';
export async function migrate(pool: pg.Pool) {
  const db = await pool.connect();
  try {
    await db.query('SELECT pg_advisory_lock(739114)');
    await db.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const dir = fileURLToPath(new URL('../migrations/', import.meta.url));
    for (const name of (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort()) {
      if ((await db.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name])).rowCount)
        continue;
      await db.query('BEGIN');
      try {
        await db.query(await readFile(`${dir}/${name}`, 'utf8'));
        await db.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
        await db.query('COMMIT');
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await db.query('SELECT pg_advisory_unlock(739114)');
    db.release();
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pool = createPool(process.env.MIGRATION_DATABASE_URL);
  try {
    await migrate(pool);
    console.log('Migratsiyalar bajarildi.');
  } finally {
    await pool.end();
  }
}
