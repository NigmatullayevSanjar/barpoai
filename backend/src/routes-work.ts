import { z } from 'zod';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { type Endpoint } from './http.js';
import { one, audit } from './db.js';
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
import { invariant } from './errors.js';
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
    }),
    idempotent: true,
    handler: async ({ db, actor, body }) => {
      await projectScope(db, actor, body.project_id);
      await assignedUser(db, actor.tenant_id, body.project_id, body.assignee_id);
      await assignedUser(db, actor.tenant_id, body.project_id, body.reviewer_id);
      invariant(body.assignee_id !== body.reviewer_id, 'SELF_REVIEW_FORBIDDEN');
      const row = await one(
        db,
        'INSERT INTO tasks(tenant_id,project_id,zone_id,title,assignee_id,reviewer_id,priority,deadline,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
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
        ],
      );
      await audit(db, actor, 'task.create', row.id);
      return row;
    },
  });
  add({
    method: 'GET',
    path: '/v1/tasks',
    summary: 'Faqat ruxsatli vazifalar',
    permission: 'tasks.read',
    query: pageQuery.extend({ project_id: uuid }),
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      return {
        items: (
          await db.query(
            'SELECT * FROM tasks WHERE tenant_id=$1 AND project_id=$2 AND archived_at IS NULL AND ($3 OR assignee_id=$4 OR reviewer_id=$4) ORDER BY deadline NULLS LAST,id LIMIT $5 OFFSET $6',
            [
              actor.tenant_id,
              query.project_id,
              await allowed(db, actor, 'tasks.manage'),
              actor.id,
              query.limit,
              query.offset,
            ],
          )
        ).rows,
      };
    },
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
      return one(
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
    },
  });
  add({
    method: 'GET',
    path: '/v1/reports',
    summary: 'Obyekt hisobotlari; xodim faqat o‘z hisobotini ko‘radi',
    permission: 'reports.read',
    query: pageQuery.extend({ project_id: uuid }),
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      return {
        items: (
          await db.query(
            'SELECT * FROM reports WHERE tenant_id=$1 AND project_id=$2 AND archived_at IS NULL AND ($3 OR author_id=$4) ORDER BY report_date DESC,id LIMIT $5 OFFSET $6',
            [
              actor.tenant_id,
              query.project_id,
              await allowed(db, actor, 'reports.review'),
              actor.id,
              query.limit,
              query.offset,
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
      name: text,
      mime_type: z.enum(['image/jpeg', 'image/png']),
      base64: z.string().max(7000000),
    }),
    idempotent: true,
    handler: async ({ db, actor, body }) => {
      await projectScope(db, actor, body.project_id);
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
        'INSERT INTO files(tenant_id,project_id,report_id,name,mime_type,size,sha256,storage_key,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,name,mime_type,size,sha256',
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
    summary: 'Kompaniya admini uchun audit; maxfiy kalitlarsiz',
    permission: 'audit.read',
    adminOnly: true,
    query: pageQuery,
    handler: async ({ db, actor, query }) => ({
      items: (
        await db.query(
          'SELECT id,actor_id,action,resource_id,details,created_at FROM audit_events WHERE tenant_id=$1 ORDER BY created_at DESC,id LIMIT $2 OFFSET $3',
          [actor.tenant_id, query.limit, query.offset],
        )
      ).rows,
    }),
  });
}
