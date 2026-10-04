import { createPool } from './db.js';
import { buildApp } from './app.js';
import { invariant } from './errors.js';
invariant(process.env.DATABASE_URL, 'DATABASE_URL_REQUIRED', 500);
const pool = createPool();
// Production must never use the migration owner/superuser credential.
if (process.env.NODE_ENV === 'production') {
  const result = await pool.query(
    'SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user',
  );
  invariant(!result.rows[0].rolsuper && !result.rows[0].rolbypassrls, 'UNSAFE_DATABASE_ROLE', 500);
}
const { app } = await buildApp(pool, true);
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
await app.listen({ host: process.env.HOST ?? '127.0.0.1', port: Number(process.env.PORT ?? 3001) });
