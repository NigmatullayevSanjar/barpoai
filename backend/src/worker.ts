import { createPool, transaction, one } from './db.js';
import { tenantAccess } from './auth.js';
import { allowed, projectScope } from './permissions.js';
import { invariant } from './errors.js';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
export async function workOnce(pool: pg.Pool) {
  const tenants = (await pool.query("SELECT id FROM tenants WHERE status='active'")).rows;
  for (const tenant of tenants)
    await transaction(pool, tenant.id, async (db) => {
      const job = (
        await db.query(
          "SELECT * FROM outbox WHERE tenant_id=$1 AND status='pending' AND available_at<=now() ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1",
          [tenant.id],
        )
      ).rows[0];
      if (!job) return;
      try {
        await tenantAccess(db, { tenant_id: tenant.id });
        const user = await one(
          db,
          'SELECT id,tenant_id,role,active,telegram_id FROM users WHERE tenant_id=$1 AND id=$2 AND active',
          [tenant.id, job.recipient_id],
        );
        await projectScope(db, user, job.project_id);
        invariant(await allowed(db, user, 'stock.read'), 'FORBIDDEN', 403);
        invariant(
          process.env.TELEGRAM_BOT_TOKEN && user.telegram_id,
          'TELEGRAM_NOT_CONFIGURED',
          503,
        );
        invariant(job.kind === 'stock.low', 'UNSUPPORTED_JOB', 503);
        const response = await fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: user.telegram_id,
              text: 'BARPO AI: ombordagi material qoldig‘i minimal chegaradan past. Tafsilotlarni platformada ko‘ring.',
            }),
            signal: AbortSignal.timeout(8000),
          },
        );
        const result = (await response.json()) as { ok?: boolean };
        invariant(response.ok && result.ok, 'TELEGRAM_DELIVERY_FAILED', 503);
        await db.query(
          "UPDATE outbox SET status='done',attempts=attempts+1,error_code=NULL WHERE id=$1",
          [job.id],
        );
      } catch (error: any) {
        await db.query(
          "UPDATE outbox SET attempts=attempts+1,status=CASE WHEN attempts>=7 THEN 'dead' ELSE 'pending' END,available_at=now()+make_interval(secs=>least(3600,power(2,attempts)::integer*15)),error_code=$2 WHERE id=$1",
          [job.id, error.code ?? 'DELIVERY_FAILED'],
        );
      }
    });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pool = createPool();
  let stopping = false;
  for (const sig of ['SIGINT', 'SIGTERM'] as const)
    process.on(sig, () => {
      stopping = true;
    });
  while (!stopping) {
    try {
      await workOnce(pool);
    } catch {
      console.error('Worker cycle failed');
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  await pool.end();
}
