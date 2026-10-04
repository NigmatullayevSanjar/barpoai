import { createPool, transaction, one } from './db.js';
import { tenantAccess } from './auth.js';
import { invariant } from './errors.js';
import { sendMessage, telegramConfigured, pollOnce } from './telegram.js';
import { notify } from './notify.js';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
/** Outbox: har tenant uchun bittadan, platforma (tenant_id NULL) uchun ham bitta vazifa. */
export async function workOnce(pool: pg.Pool) {
  const tenants = (await pool.query("SELECT id FROM tenants WHERE status='active'")).rows.map(
    (r) => r.id as string,
  );
  for (const tenant of [...tenants, null])
    await transaction(pool, tenant, async (db) => {
      const job = (
        await db.query(
          "SELECT * FROM outbox WHERE tenant_id IS NOT DISTINCT FROM $1 AND status='pending' AND available_at<=now() ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1",
          [tenant],
        )
      ).rows[0];
      if (!job) return;
      try {
        if (tenant) await tenantAccess(db, { tenant_id: tenant });
        const user = await one(
          db,
          'SELECT u.id,u.tenant_id,u.role,u.active,a.telegram_user_id FROM users u LEFT JOIN telegram_accounts a ON a.user_id=u.id WHERE u.id=$1 AND u.active',
          [job.recipient_id],
        );
        invariant(['stock.low', 'notification'].includes(job.kind), 'UNSUPPORTED_JOB', 503);
        if (!user.telegram_user_id) {
          // Telegram ulanmagan: ilova ichidagi bildirishnoma yetarli, vazifa yopiladi.
          await db.query(
            "UPDATE outbox SET status='done',attempts=attempts+1,error_code='NO_TELEGRAM' WHERE id=$1",
            [job.id],
          );
          return;
        }
        invariant(telegramConfigured(), 'TELEGRAM_NOT_CONFIGURED', 503);
        const text =
          job.kind === 'stock.low'
            ? 'BARPO AI: ombordagi material qoldig‘i minimal chegaradan past. Tafsilotlarni platformada ko‘ring.'
            : `${job.payload.title}\n\n${job.payload.body}`;
        await sendMessage(user.telegram_user_id, text);
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
/** Deadline eslatmalari: 24 soat qolganda va muddati o'tganda, har kuni bir marta. */
export async function remindDeadlines(pool: pg.Pool) {
  const tenants = (await pool.query("SELECT id FROM tenants WHERE status='active'")).rows;
  for (const tenant of tenants)
    await transaction(pool, tenant.id, async (db) => {
      const rows = (
        await db.query(
          `SELECT t.id,t.title,t.deadline,t.assignee_id,t.reviewer_id,t.project_id,p.name project,
                  (t.deadline<now()) overdue, to_char(now() AT TIME ZONE 'Asia/Tashkent','YYYY-MM-DD') today
           FROM tasks t JOIN projects p ON p.id=t.project_id
           WHERE t.tenant_id=$1 AND t.archived_at IS NULL AND t.status<>'accepted' AND t.deadline IS NOT NULL AND t.deadline<now()+interval '24 hours'`,
          [tenant.id],
        )
      ).rows;
      for (const task of rows) {
        const when = new Date(task.deadline).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
        const recipients = task.overdue ? [task.assignee_id, task.reviewer_id] : [task.assignee_id];
        for (const user of recipients)
          await notify(db, {
            tenant_id: tenant.id,
            user_id: user,
            project_id: task.project_id,
            kind: task.overdue ? 'task.overdue' : 'task.deadline',
            title: task.overdue ? '⏰ Vazifa muddati o‘tdi' : '⚠️ Deadline yaqinlashmoqda',
            body: `Obyekt: ${task.project}\nVazifa: ${task.title}\nMuddat: ${when}`,
            payload: { task_id: task.id },
            dedup_key: `${task.overdue ? 'task.overdue' : 'task.deadline'}:${task.id}:${user}:${task.today}`,
          });
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
  let lastReminder = 0;
  // Bot long polling alohida sikl: getUpdates 20 soniyagacha kutadi.
  const botLoop = (async () => {
    while (!stopping) {
      try {
        if (!(await pollOnce(pool)))
          await new Promise((r) => setTimeout(r, telegramConfigured() ? 1000 : 15000));
      } catch (error: any) {
        console.error('Telegram polling failed', error?.code ?? error?.message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();
  while (!stopping) {
    try {
      await workOnce(pool);
      if (Date.now() - lastReminder > 10 * 60 * 1000) {
        await remindDeadlines(pool);
        lastReminder = Date.now();
      }
    } catch (error: any) {
      console.error('Worker cycle failed', error?.code ?? error?.message);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  await botLoop;
  await pool.end();
}
