import { z } from 'zod';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { type Endpoint } from './http.js';
import { one, audit, type Db, type Row } from './db.js';
import {
  uuid,
  text,
  idParams,
  pageQuery,
  version,
  reason,
  qty,
  date,
  timestamp,
} from './schemas.js';
import { projectScope, assignedUser, allowed } from './permissions.js';
import { notify, projectRecipients } from './notify.js';
import { invariant } from './errors.js';
/** Ruxsat doirasidagi vazifalar ro'yxati; eksport ham shu so'rovdan foydalanadi. */
export async function listTasks(db: Db, actor: Row, query: Row) {
  await projectScope(db, actor, query.project_id);
  return {
    items: (
      await db.query(
        `SELECT t.*,a.display_name assignee_name,r.display_name reviewer_name,z.name zone_name,
                (t.deadline IS NOT NULL AND t.deadline<now() AND t.status<>'accepted') overdue,
                (SELECT count(*)::int FROM files f WHERE f.tenant_id=t.tenant_id AND f.task_id=t.id AND f.archived_at IS NULL) file_count
         FROM tasks t JOIN users a ON a.id=t.assignee_id JOIN users r ON r.id=t.reviewer_id LEFT JOIN zones z ON z.id=t.zone_id
         WHERE t.tenant_id=$1 AND t.project_id=$2 AND t.archived_at IS NULL AND (($3 AND NOT $7::boolean) OR t.assignee_id=$4 OR t.reviewer_id=$4)
           AND ($8::text IS NULL OR ($8='open' AND t.status<>'accepted') OR t.status=$8)
         ORDER BY CASE t.status WHEN 'accepted' THEN 1 ELSE 0 END,t.deadline NULLS LAST,t.created_at LIMIT $5 OFFSET $6`,
        [
          actor.tenant_id,
          query.project_id,
          await allowed(db, actor, 'tasks.manage'),
          actor.id,
          query.limit,
          query.offset,
          query.mine ?? false,
          query.status ?? null,
        ],
      )
    ).rows,
  };
}
export const auditQuery = pageQuery.extend({
  action: z.string().trim().max(100).optional(),
  actor_id: uuid.optional(),
  from: date.optional(),
  to: date.optional(),
});
/** Audit yozuvlari: amal prefiksi, ijrochi va sana bo'yicha filtr; jami son bilan. */
export async function listAudit(db: Db, actor: Row, query: Row) {
  const where = `a.tenant_id=$1 AND ($2::text IS NULL OR a.action ILIKE $2||'%') AND ($3::uuid IS NULL OR a.actor_id=$3)
    AND ($4::date IS NULL OR a.created_at>=$4) AND ($5::date IS NULL OR a.created_at<($5::date+1))`;
  const params = [
    actor.tenant_id,
    query.action || null,
    query.actor_id ?? null,
    query.from ?? null,
    query.to ?? null,
  ];
  const items = (
    await db.query(
      `SELECT a.id,a.actor_id,u.display_name actor_name,u.role actor_role,a.action,a.resource_id,a.details,a.created_at
       FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id WHERE ${where} ORDER BY a.created_at DESC,a.id LIMIT $6 OFFSET $7`,
      [...params, query.limit, query.offset],
    )
  ).rows;
  const total = await one(
    db,
    `SELECT count(*)::int total FROM audit_events a WHERE ${where}`,
    params,
  );
  return { items, total: total.total };
}
export function workRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'POST',
    path: '/v1/tasks',
    summary: 'Vazifa yaratish; assignee va reviewer obyekt doirasida',
    permission: 'tasks.manage',
    action: 'create',
    body: z.strictObject({
      project_id: uuid,
      zone_id: uuid.optional(),
      title: text,
      assignee_id: uuid,
      reviewer_id: uuid,
      priority: z.enum(['low', 'normal', 'high', 'urgent']),
      deadline: timestamp.optional(),
      description: z.string().trim().max(4000).optional(),
    }),
    idempotent: true,
    handler: async ({ db, actor, body }) => {
      await projectScope(db, actor, body.project_id);
      await assignedUser(db, actor.tenant_id, body.project_id, body.assignee_id);
      await assignedUser(db, actor.tenant_id, body.project_id, body.reviewer_id);
      invariant(body.assignee_id !== body.reviewer_id, 'SELF_REVIEW_FORBIDDEN');
      const row = await one(
        db,
        'INSERT INTO tasks(tenant_id,project_id,zone_id,title,assignee_id,reviewer_id,priority,deadline,created_by,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
        [
          actor.tenant_id,
          body.project_id,
          body.zone_id ?? null,
          body.title,
          body.assignee_id,
          body.reviewer_id,
          body.priority,
          body.deadline ?? null,
          actor.id,
          body.description || null,
        ],
      );
      await audit(db, actor, 'task.create', row.id);
      const project = await one(db, 'SELECT name FROM projects WHERE id=$1', [body.project_id]);
      await notify(db, {
        tenant_id: actor.tenant_id,
        user_id: body.assignee_id,
        project_id: body.project_id,
        kind: 'task.assigned',
        title: '📋 Yangi vazifa',
        body: `Obyekt: ${project.name}\nVazifa: ${body.title}\nMuddat: ${body.deadline ? new Date(body.deadline).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' }) : '—'}`,
        payload: { task_id: row.id },
        dedup_key: `task.assigned:${row.id}`,
      });
      return row;
    },
  });
  add({
    method: 'GET',
    path: '/v1/tasks',
    summary: 'Faqat ruxsatli vazifalar; ishtirokchi nomlari, zona va muddati o‘tganlik bilan',
    permission: 'tasks.read',
    query: pageQuery.extend({
      project_id: uuid,
      status: z
        .enum(['todo', 'in_progress', 'submitted', 'returned', 'accepted', 'open'])
        .optional(),
      mine: z.coerce.boolean().optional(),
    }),
    handler: ({ db, actor, query }) => listTasks(db, actor, query),
  });
  add({
    method: 'POST',
    path: '/v1/tasks/:id/transition',
    summary: 'Vazifa bajarish, yuborish, qaytarish va qabul qilish',
    page: 'tasks',
    action: 'update',
    params: idParams,
    body: z.strictObject({
      version,
      status: z.enum(['in_progress', 'submitted', 'returned', 'accepted']),
      note: reason.optional(),
    }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      const task = await one(
        db,
        'SELECT * FROM tasks WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE',
        [actor.tenant_id, params.id],
      );
      await projectScope(db, actor, task.project_id);
      invariant(task.version === body.version, 'VERSION_CONFLICT');
      const review = ['returned', 'accepted'].includes(body.status);
      invariant(
        review
          ? actor.id === task.reviewer_id || actor.role === 'tenant_admin'
          : actor.id === task.assignee_id,
        'FORBIDDEN',
        403,
      );
      const transitions: Record<string, string[]> = {
        todo: ['in_progress'],
        in_progress: ['submitted'],
        returned: ['in_progress', 'submitted'],
        submitted: ['returned', 'accepted'],
        accepted: [],
      };
      invariant(transitions[task.status]?.includes(body.status), 'INVALID_TRANSITION');
      if (body.status === 'returned') invariant(body.note, 'RETURN_REASON_REQUIRED', 400);
      const row = await one(
        db,
        'UPDATE tasks SET status=$2,version=version+1 WHERE id=$1 RETURNING *',
        [params.id, body.status],
      );
      await audit(db, actor, `task.${body.status}`, params.id, { note: body.note ?? null });
      const titles: Record<string, string> = {
        submitted: '📨 Vazifa tekshiruvga yuborildi',
        returned: '↩️ Vazifa qaytarildi',
        accepted: '✅ Vazifa qabul qilindi',
        in_progress: '▶️ Vazifa boshlandi',
      };
      await notify(db, {
        tenant_id: actor.tenant_id,
        user_id: review ? task.assignee_id : task.reviewer_id,
        project_id: task.project_id,
        kind: `task.${body.status}`,
        title: titles[body.status]!,
        body: `Vazifa: ${task.title}${body.note ? `\nIzoh: ${body.note}` : ''}`,
        payload: { task_id: task.id },
        dedup_key: `task.${body.status}:${task.id}:${row.version}`,
      });
      return row;
    },
  });
  add({
    method: 'POST',
    path: '/v1/reports',
    summary: 'Kunlik yoki haftalik hisobot; original plan saqlanadi',
    permission: 'reports.submit',
    body: z.strictObject({
      project_id: uuid,
      zone_id: uuid.optional(),
      kind: z.enum(['daily', 'weekly']),
      report_date: date,
      content: reason,
      progress_quantity: qty.optional(),
      estimate_line_id: uuid.optional(),
      forecast_end: date.optional(),
    }),
    idempotent: true,
    handler: async ({ db, actor, body }) => {
      await projectScope(db, actor, body.project_id);
      invariant(
        (body.progress_quantity === undefined) === (body.estimate_line_id === undefined),
        'PROGRESS_LINE_REQUIRED',
        400,
      );
      if (body.estimate_line_id) {
        const line = await one(
          db,
          'SELECT kind FROM estimate_lines WHERE tenant_id=$1 AND project_id=$2 AND id=$3 AND archived_at IS NULL',
          [actor.tenant_id, body.project_id, body.estimate_line_id],
        );
        invariant(line.kind !== 'material', 'MATERIAL_IS_NOT_WORK_PROGRESS');
      }
      const report = await one(
        db,
        'INSERT INTO reports(tenant_id,project_id,zone_id,author_id,kind,report_date,content,progress_quantity,estimate_line_id,forecast_end) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
        [
          actor.tenant_id,
          body.project_id,
          body.zone_id ?? null,
          actor.id,
          body.kind,
          body.report_date,
          body.content,
          body.progress_quantity ?? null,
          body.estimate_line_id ?? null,
          body.forecast_end ?? null,
        ],
      );
      const project = await one(db, 'SELECT name FROM projects WHERE id=$1', [body.project_id]);
      for (const user of await projectRecipients(
        db,
        actor.tenant_id,
        body.project_id,
        ['foreman'],
        actor.id,
      ))
        await notify(db, {
          tenant_id: actor.tenant_id,
          user_id: user,
          project_id: body.project_id,
          kind: 'report.submitted',
          title: body.kind === 'daily' ? '📝 Yangi kunlik hisobot' : '📝 Yangi haftalik hisobot',
          body: `Obyekt: ${project.name}\nMuallif: ${actor.display_name}\nSana: ${body.report_date}`,
          payload: { report_id: report.id },
          dedup_key: `report.submitted:${report.id}:${user}`,
        });
      return report;
    },
  });
  add({
    method: 'GET',
    path: '/v1/reports',
    summary:
      'Obyekt hisobotlari; xodim faqat o‘z hisobotini ko‘radi; muallif, zona, smeta qatori va foto soni bilan',
    permission: 'reports.read',
    query: pageQuery.extend({
      project_id: uuid,
      status: z.enum(['submitted', 'returned', 'accepted']).optional(),
      kind: z.enum(['daily', 'weekly']).optional(),
    }),
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      return {
        items: (
          await db.query(
            `SELECT r.*,r.progress_quantity::text,u.display_name author_name,rb.display_name reviewed_by_name,z.name zone_name,l.description estimate_line_name,l.unit_id estimate_unit,
                    (SELECT count(*)::int FROM files f WHERE f.tenant_id=r.tenant_id AND f.report_id=r.id AND f.archived_at IS NULL) file_count
             FROM reports r JOIN users u ON u.id=r.author_id LEFT JOIN users rb ON rb.id=r.reviewed_by LEFT JOIN zones z ON z.id=r.zone_id LEFT JOIN estimate_lines l ON l.id=r.estimate_line_id
             WHERE r.tenant_id=$1 AND r.project_id=$2 AND r.archived_at IS NULL AND ($3 OR r.author_id=$4)
               AND ($7::text IS NULL OR r.status=$7) AND ($8::text IS NULL OR r.kind=$8)
             ORDER BY r.report_date DESC,r.created_at DESC,r.id LIMIT $5 OFFSET $6`,
            [
              actor.tenant_id,
              query.project_id,
              await allowed(db, actor, 'reports.review'),
              actor.id,
              query.limit,
              query.offset,
              query.status ?? null,
              query.kind ?? null,
            ],
          )
        ).rows,
      };
    },
  });
  add({
    method: 'POST',
    path: '/v1/reports/:id/review',
    summary: 'Hisobotni qabul yoki qaytarish; stock sarfi qayta post qilinmaydi',
    permission: 'reports.review',
    params: idParams,
    body: z.strictObject({ version, action: z.enum(['accepted', 'returned']), reason }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      const report = await one(
        db,
        'SELECT * FROM reports WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE',
        [actor.tenant_id, params.id],
      );
      await projectScope(db, actor, report.project_id);
      invariant(actor.id !== report.author_id, 'SELF_REVIEW_FORBIDDEN', 403);
      invariant(report.version === body.version, 'VERSION_CONFLICT');
      invariant(report.status === 'submitted', 'INVALID_TRANSITION');
      if (body.action === 'accepted') {
        if (report.estimate_line_id)
          await db.query(
            'INSERT INTO progress_entries(tenant_id,report_id,estimate_line_id,quantity) VALUES($1,$2,$3,$4)',
            [actor.tenant_id, report.id, report.estimate_line_id, report.progress_quantity],
          );
        if (report.forecast_end)
          await db.query('UPDATE projects SET forecast_end=$2,version=version+1 WHERE id=$1', [
            report.project_id,
            report.forecast_end,
          ]);
      }
      const row = await one(
        db,
        'UPDATE reports SET status=$2,reviewed_by=$3,version=version+1 WHERE id=$1 RETURNING *',
        [report.id, body.action, actor.id],
      );
      await audit(db, actor, `report.${body.action}`, report.id, { reason: body.reason });
      await notify(db, {
        tenant_id: actor.tenant_id,
        user_id: report.author_id,
        project_id: report.project_id,
        kind: `report.${body.action}`,
        title: body.action === 'accepted' ? '✅ Hisobot qabul qilindi' : '↩️ Hisobot qaytarildi',
        body: `Sana: ${report.report_date}\nIzoh: ${body.reason}`,
        payload: { report_id: report.id },
        dedup_key: `report.${body.action}:${report.id}:${row.version}`,
      });
      return row;
    },
  });
  add({
    method: 'POST',
    path: '/v1/reports/:id/resubmit',
    summary: 'Qaytarilgan hisobot matnini tuzatib yuborish',
    permission: 'reports.submit',
    action: 'update',
    params: idParams,
    body: z.strictObject({ version, content: reason }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      const report = await one(
        db,
        'SELECT * FROM reports WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE',
        [actor.tenant_id, params.id],
      );
      await projectScope(db, actor, report.project_id);
      invariant(report.author_id === actor.id, 'FORBIDDEN', 403);
      invariant(
        report.status === 'returned' && report.version === body.version,
        'INVALID_TRANSITION',
      );
      await audit(db, actor, 'report.resubmit', report.id, { previous_content: report.content });
      return one(
        db,
        "UPDATE reports SET content=$2,status='submitted',version=version+1 WHERE id=$1 RETURNING *",
        [report.id, body.content],
      );
    },
  });
  add({
    method: 'POST',
    path: '/v1/files',
    summary: 'Private JPEG/PNG foto yuklash, hajm va signature tekshiruvi',
    permission: 'files.write',
    body: z.strictObject({
      project_id: uuid,
      report_id: uuid.optional(),
      task_id: uuid.optional(),
      name: text,
      mime_type: z.enum(['image/jpeg', 'image/png']),
      base64: z.string().max(7000000),
    }),
    idempotent: true,
    handler: async ({ db, actor, body }) => {
      await projectScope(db, actor, body.project_id);
      if (body.task_id) {
        const task = await one(
          db,
          'SELECT * FROM tasks WHERE tenant_id=$1 AND id=$2 AND project_id=$3',
          [actor.tenant_id, body.task_id, body.project_id],
        );
        invariant(
          task.assignee_id === actor.id ||
            task.reviewer_id === actor.id ||
            (await allowed(db, actor, 'tasks.manage')),
          'FORBIDDEN',
          403,
        );
      }
      if (body.report_id) {
        const report = await one(
          db,
          'SELECT * FROM reports WHERE tenant_id=$1 AND id=$2 AND project_id=$3',
          [actor.tenant_id, body.report_id, body.project_id],
        );
        invariant(
          report.author_id === actor.id && report.status !== 'accepted',
          'REPORT_FILE_LOCKED',
        );
      }
      const bytes = Buffer.from(body.base64, 'base64');
      invariant(bytes.length > 0 && bytes.length <= 5242880, 'FILE_SIZE_INVALID', 400);
      invariant(
        body.mime_type === 'image/png'
          ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
        'FILE_SIGNATURE_INVALID',
        400,
      );
      const storage = resolve(process.env.STORAGE_DIR ?? './storage');
      await mkdir(storage, { recursive: true });
      const key = randomUUID();
      await writeFile(resolve(storage, key), bytes, { flag: 'wx' });
      return one(
        db,
        'INSERT INTO files(tenant_id,project_id,report_id,name,mime_type,size,sha256,storage_key,uploaded_by,task_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,name,mime_type,size,sha256',
        [
          actor.tenant_id,
          body.project_id,
          body.report_id ?? null,
          body.name,
          body.mime_type,
          bytes.length,
          createHash('sha256').update(bytes).digest('hex'),
          key,
          actor.id,
          body.task_id ?? null,
        ],
      );
    },
  });
  add({
    method: 'GET',
    path: '/v1/files/:id',
    summary: 'Har safar scope tekshiriladigan private download',
    permission: 'files.read',
    params: idParams,
    handler: async ({ db, actor, params }) => {
      const file = await one(
        db,
        'SELECT * FROM files WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL',
        [actor.tenant_id, params.id],
      );
      await projectScope(db, actor, file.project_id);
      if (file.report_id) {
        const report = await one(db, 'SELECT author_id FROM reports WHERE tenant_id=$1 AND id=$2', [
          actor.tenant_id,
          file.report_id,
        ]);
        invariant(
          report.author_id === actor.id || (await allowed(db, actor, 'reports.review')),
          'NOT_FOUND',
          404,
        );
      }
      const bytes = await readFile(
        resolve(process.env.STORAGE_DIR ?? './storage', file.storage_key),
      );
      return {
        id: file.id,
        name: file.name,
        mime_type: file.mime_type,
        base64: bytes.toString('base64'),
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/integrations',
    summary: 'Integratsiya holati; xato paytida 0 emas, not_configured/stale/error',
    permission: 'integrations.read',
    handler: async ({ db, actor }) => {
      const rows = (
        await db.query(
          'SELECT provider,status,last_success_at,last_error_code FROM integration_connections WHERE tenant_id=$1',
          [actor.tenant_id],
        )
      ).rows;
      return {
        release_ready: false,
        items: ['telegram', 'uysot', 'bank', 'didox', 'ihamkor', 'camera', 'saas_payment'].map(
          (provider) =>
            rows.find((r) => r.provider === provider) ?? {
              provider,
              status: 'not_configured',
              last_success_at: null,
              last_error_code: 'PROVIDER_ACCESS_REQUIRED',
            },
        ),
      };
    },
  });
  add({
    method: 'POST',
    path: '/v1/billing/checkout',
    page: 'billing',
    action: 'create',
    summary: 'Haqiqiy provider tanlanmaguncha checkout yopiq',
    recovery: true,
    body: z.strictObject({ invoice_id: uuid }),
    handler: async ({ db, actor, body }) => {
      await one(db, 'SELECT id FROM billing_invoices WHERE tenant_id=$1 AND id=$2', [
        actor.tenant_id,
        body.invoice_id,
      ]);
      invariant(false, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 503);
    },
  });
  add({
    method: 'GET',
    path: '/v1/audit',
    summary: 'Kompaniya admini uchun audit; ijrochi nomi va filtrlar bilan, maxfiy kalitlarsiz',
    permission: 'audit.read',
    adminOnly: true,
    query: auditQuery,
    handler: ({ db, actor, query }) => listAudit(db, actor, query),
  });
}
