import { z } from 'zod';
import { type Endpoint } from './http.js';
import { one, audit } from './db.js';
import { idParams, version, reason, uuid, text, timestamp } from './schemas.js';
import { projectScope, assignedUser } from './permissions.js';
import { invariant } from './errors.js';
export function lifecycleRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'DELETE',
    path: '/v1/projects/:id',
    summary: 'Obyektni arxivlash; ledger saqlanadi',
    permission: 'projects.write',
    params: idParams,
    body: z.strictObject({ version, reason }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      await projectScope(db, actor, params.id);
      const project = await one(db, 'SELECT * FROM projects WHERE id=$1 FOR UPDATE', [params.id]);
      invariant(project.version === body.version, 'VERSION_CONFLICT');
      invariant(
        !(
          await db.query(
            "SELECT 1 FROM tasks WHERE tenant_id=$1 AND project_id=$2 AND status<>'accepted' AND archived_at IS NULL",
            [actor.tenant_id, params.id],
          )
        ).rowCount,
        'OPEN_TASKS_EXIST',
      );
      invariant(
        !(
          await db.query(
            'SELECT 1 FROM stock_balances b JOIN stock_accounts a ON a.tenant_id=b.tenant_id AND a.id=b.account_id WHERE a.tenant_id=$1 AND a.project_id=$2 AND (b.quantity>0 OR b.reserved>0)',
            [actor.tenant_id, params.id],
          )
        ).rowCount,
        'STOCK_HANDOVER_REQUIRED',
      );
      await db.query('UPDATE projects SET archived_at=now(),version=version+1 WHERE id=$1', [
        params.id,
      ]);
      await audit(db, actor, 'project.archive', params.id, { reason: body.reason });
      return { ok: true };
    },
  });
  add({
    method: 'PATCH',
    path: '/v1/tasks/:id',
    summary: 'Vazifa tahriri yoki topshirish',
    permission: 'tasks.manage',
    params: idParams,
    body: z.strictObject({
      version,
      title: text,
      assignee_id: uuid,
      reviewer_id: uuid,
      deadline: timestamp.nullable(),
      description: z.string().trim().max(4000).nullable().optional(),
      zone_id: uuid.nullable().optional(),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
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
      invariant(!['accepted', 'submitted'].includes(task.status), 'TASK_LOCKED');
      await assignedUser(db, actor.tenant_id, task.project_id, body.assignee_id);
      await assignedUser(db, actor.tenant_id, task.project_id, body.reviewer_id);
      invariant(body.assignee_id !== body.reviewer_id, 'SELF_REVIEW_FORBIDDEN');
      const row = await one(
        db,
        'UPDATE tasks SET title=$2,assignee_id=$3,reviewer_id=$4,deadline=$5,description=CASE WHEN $6::boolean THEN $7 ELSE description END,zone_id=CASE WHEN $8::boolean THEN $9 ELSE zone_id END,priority=coalesce($10,priority),version=version+1 WHERE id=$1 RETURNING *',
        [
          params.id,
          body.title,
          body.assignee_id,
          body.reviewer_id,
          body.deadline,
          body.description !== undefined,
          body.description || null,
          body.zone_id !== undefined,
          body.zone_id ?? null,
          body.priority ?? null,
        ],
      );
      await audit(db, actor, 'task.update', params.id);
      return row;
    },
  });
  add({
    method: 'DELETE',
    path: '/v1/tasks/:id',
    summary: 'Ochiq vazifani arxivlash',
    permission: 'tasks.manage',
    params: idParams,
    body: z.strictObject({ version, reason }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      const task = await one(db, 'SELECT * FROM tasks WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
        actor.tenant_id,
        params.id,
      ]);
      await projectScope(db, actor, task.project_id);
      invariant(task.version === body.version, 'VERSION_CONFLICT');
      invariant(!['accepted', 'submitted'].includes(task.status), 'TASK_LOCKED');
      await db.query('UPDATE tasks SET archived_at=now(),version=version+1 WHERE id=$1', [
        params.id,
      ]);
      await audit(db, actor, 'task.archive', params.id, { reason: body.reason });
      return { ok: true };
    },
  });
  add({
    method: 'DELETE',
    path: '/v1/reports/:id',
    summary: 'Qaytarilgan hisobotni arxivlash; qabul qilingan fakt o‘chmaydi',
    permission: 'reports.submit',
    params: idParams,
    body: z.strictObject({ version, reason }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      const report = await one(
        db,
        'SELECT * FROM reports WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [actor.tenant_id, params.id],
      );
      await projectScope(db, actor, report.project_id);
      invariant(report.author_id === actor.id || actor.role === 'tenant_admin', 'FORBIDDEN', 403);
      invariant(report.status === 'returned', 'REPORT_LOCKED');
      invariant(report.version === body.version, 'VERSION_CONFLICT');
      await db.query('UPDATE reports SET archived_at=now(),version=version+1 WHERE id=$1', [
        params.id,
      ]);
      await audit(db, actor, 'report.archive', params.id, { reason: body.reason });
      return { ok: true };
    },
  });
  add({
    method: 'DELETE',
    path: '/v1/files/:id',
    summary: 'Private faylni arxivlash',
    permission: 'files.write',
    params: idParams,
    body: z.strictObject({ reason }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      const file = await one(db, 'SELECT * FROM files WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
        actor.tenant_id,
        params.id,
      ]);
      await projectScope(db, actor, file.project_id);
      invariant(file.uploaded_by === actor.id || actor.role === 'tenant_admin', 'FORBIDDEN', 403);
      if (file.report_id) {
        const report = await one(db, 'SELECT status FROM reports WHERE id=$1', [file.report_id]);
        invariant(report.status !== 'accepted', 'REPORT_FILE_LOCKED');
      }
      await db.query('UPDATE files SET archived_at=now() WHERE id=$1', [params.id]);
      await audit(db, actor, 'file.archive', params.id, { reason: body.reason });
      return { ok: true };
    },
  });
}
