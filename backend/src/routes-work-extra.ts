import { z } from 'zod';
import { type Endpoint } from './http.js';
import { one, audit } from './db.js';
import { uuid, idParams, reason } from './schemas.js';
import { projectScope, allowed } from './permissions.js';
import { invariant } from './errors.js';
import { notify } from './notify.js';
import { quantity } from './money.js';

/** Vazifa va hisobot kartalari, fayl ro'yxati va qabul qilingan progressni tuzatish. */
export function workExtraRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'GET',
    path: '/v1/tasks/:id',
    summary: 'Vazifa kartasi: ishtirokchilar, fayllar va holat tarixi (audit)',
    permission: 'tasks.read',
    params: idParams,
    handler: async ({ db, actor, params }) => {
      const task = await one(
        db,
        `SELECT t.*,a.display_name assignee_name,r.display_name reviewer_name,c.display_name created_by_name,z.name zone_name,p.name project_name
         FROM tasks t JOIN users a ON a.id=t.assignee_id JOIN users r ON r.id=t.reviewer_id JOIN users c ON c.id=t.created_by LEFT JOIN zones z ON z.id=t.zone_id JOIN projects p ON p.id=t.project_id
         WHERE t.tenant_id=$1 AND t.id=$2 AND t.archived_at IS NULL`,
        [actor.tenant_id, params.id],
      );
      await projectScope(db, actor, task.project_id);
      invariant(
        (await allowed(db, actor, 'tasks.manage')) ||
          task.assignee_id === actor.id ||
          task.reviewer_id === actor.id,
        'NOT_FOUND',
        404,
      );
      const files = (
        await db.query(
          'SELECT f.id,f.name,f.mime_type,f.size,f.created_at,u.display_name uploaded_by_name FROM files f JOIN users u ON u.id=f.uploaded_by WHERE f.tenant_id=$1 AND f.task_id=$2 AND f.archived_at IS NULL ORDER BY f.created_at',
          [actor.tenant_id, params.id],
        )
      ).rows;
      const history = (
        await db.query(
          'SELECT e.action,e.details,e.created_at,u.display_name actor_name FROM audit_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.tenant_id=$1 AND e.resource_id=$2 ORDER BY e.created_at',
          [actor.tenant_id, params.id],
        )
      ).rows;
      return { ...task, files, history };
    },
  });
  add({
    method: 'GET',
    path: '/v1/reports/:id',
    summary: 'Hisobot kartasi: fotosuratlar, progress yozuvi va tuzatishlar',
    permission: 'reports.read',
    params: idParams,
    handler: async ({ db, actor, params }) => {
      const report = await one(
        db,
        `SELECT r.*,u.display_name author_name,rb.display_name reviewed_by_name,z.name zone_name,p.name project_name,
                l.description estimate_line_name,l.unit_id estimate_unit,l.effective_quantity::text estimate_plan_quantity
         FROM reports r JOIN users u ON u.id=r.author_id LEFT JOIN users rb ON rb.id=r.reviewed_by LEFT JOIN zones z ON z.id=r.zone_id JOIN projects p ON p.id=r.project_id
         LEFT JOIN estimate_lines l ON l.id=r.estimate_line_id WHERE r.tenant_id=$1 AND r.id=$2 AND r.archived_at IS NULL`,
        [actor.tenant_id, params.id],
      );
      await projectScope(db, actor, report.project_id);
      invariant(
        report.author_id === actor.id || (await allowed(db, actor, 'reports.review')),
        'NOT_FOUND',
        404,
      );
      const files = (
        await db.query(
          'SELECT f.id,f.name,f.mime_type,f.size,f.created_at FROM files f WHERE f.tenant_id=$1 AND f.report_id=$2 AND f.archived_at IS NULL ORDER BY f.created_at',
          [actor.tenant_id, params.id],
        )
      ).rows;
      const progress = (
        await db.query(
          `SELECT pe.id,pe.quantity::text,coalesce((SELECT sum(c.quantity_delta) FROM progress_corrections c WHERE c.tenant_id=pe.tenant_id AND c.progress_entry_id=pe.id),0)::text corrected_delta,
                  coalesce((SELECT json_agg(json_build_object('id',c.id,'quantity_delta',c.quantity_delta::text,'reason',c.reason,'created_at',c.created_at,'created_by_name',cu.display_name) ORDER BY c.created_at)
                            FROM progress_corrections c JOIN users cu ON cu.id=c.created_by WHERE c.tenant_id=pe.tenant_id AND c.progress_entry_id=pe.id),'[]') corrections
           FROM progress_entries pe WHERE pe.tenant_id=$1 AND pe.report_id=$2`,
          [actor.tenant_id, params.id],
        )
      ).rows[0];
      const history = (
        await db.query(
          'SELECT e.action,e.details,e.created_at,u.display_name actor_name FROM audit_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.tenant_id=$1 AND e.resource_id=$2 ORDER BY e.created_at',
          [actor.tenant_id, params.id],
        )
      ).rows;
      return { ...report, files, progress: progress ?? null, history };
    },
  });
  add({
    method: 'POST',
    path: '/v1/progress-entries/:id/corrections',
    summary:
      'Qabul qilingan progressni sabab bilan tuzatish; asl yozuv o‘zgarmaydi, farq alohida saqlanadi',
    permission: 'reports.review',
    action: 'update',
    params: idParams,
    body: z.strictObject({
      quantity_delta: z.string().regex(/^-?(0|[1-9]\d{0,17})(\.\d{1,6})?$/),
      reason,
    }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      const entry = await one(
        db,
        'SELECT pe.*,r.project_id,r.author_id FROM progress_entries pe JOIN reports r ON r.id=pe.report_id WHERE pe.tenant_id=$1 AND pe.id=$2',
        [actor.tenant_id, params.id],
      );
      await projectScope(db, actor, entry.project_id);
      invariant(Number(body.quantity_delta) !== 0, 'NO_ADJUSTMENT_REQUIRED', 400);
      const current = await one(
        db,
        'SELECT pe.quantity+coalesce((SELECT sum(c.quantity_delta) FROM progress_corrections c WHERE c.tenant_id=pe.tenant_id AND c.progress_entry_id=pe.id),0) total FROM progress_entries pe WHERE pe.tenant_id=$1 AND pe.id=$2',
        [actor.tenant_id, params.id],
      );
      invariant(Number(current.total) + Number(body.quantity_delta) >= 0, 'NEGATIVE_PROGRESS', 400);
      const row = await one(
        db,
        'INSERT INTO progress_corrections(tenant_id,progress_entry_id,quantity_delta,reason,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *,quantity_delta::text',
        [actor.tenant_id, params.id, body.quantity_delta, body.reason, actor.id],
      );
      await audit(db, actor, 'progress.correct', entry.report_id, {
        delta: body.quantity_delta,
        reason: body.reason,
      });
      await notify(db, {
        tenant_id: actor.tenant_id,
        user_id: entry.author_id,
        project_id: entry.project_id,
        kind: 'progress.corrected',
        title: '✏️ Progress tuzatildi',
        body: `Farq: ${quantity(body.quantity_delta)}\nSabab: ${body.reason}`,
        payload: { report_id: entry.report_id },
        dedup_key: `progress.correct:${row.id}`,
      });
      return row;
    },
  });
  add({
    method: 'GET',
    path: '/v1/files',
    summary: 'Hisobot yoki vazifa fayllari ro‘yxati (mazmunsiz)',
    permission: 'files.read',
    query: z.object({ report_id: uuid.optional(), task_id: uuid.optional() }),
    handler: async ({ db, actor, query }) => {
      invariant(query.report_id || query.task_id, 'REPORT_OR_TASK_REQUIRED', 400);
      const parent = query.report_id
        ? await one(db, 'SELECT project_id,author_id FROM reports WHERE tenant_id=$1 AND id=$2', [
            actor.tenant_id,
            query.report_id,
          ])
        : await one(db, 'SELECT project_id FROM tasks WHERE tenant_id=$1 AND id=$2', [
            actor.tenant_id,
            query.task_id,
          ]);
      await projectScope(db, actor, parent.project_id);
      return {
        items: (
          await db.query(
            'SELECT f.id,f.name,f.mime_type,f.size,f.created_at,u.display_name uploaded_by_name FROM files f JOIN users u ON u.id=f.uploaded_by WHERE f.tenant_id=$1 AND f.archived_at IS NULL AND ($2::uuid IS NULL OR f.report_id=$2) AND ($3::uuid IS NULL OR f.task_id=$3) ORDER BY f.created_at',
            [actor.tenant_id, query.report_id ?? null, query.task_id ?? null],
          )
        ).rows,
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/projects/:id/work-lines',
    summary: 'Hisobot uchun ish qatorlari (material emas), narxsiz; hisobot yuboruvchi ko‘ra oladi',
    permission: 'reports.read',
    params: idParams,
    handler: async ({ db, actor, params }) => {
      await projectScope(db, actor, params.id);
      return {
        items: (
          await db.query(
            `SELECT l.id,l.description,l.unit_id,l.effective_quantity::text,l.category,z.name zone_name,e.name estimate_name,
                    (SELECT (coalesce(sum(p.quantity),0)+coalesce((SELECT sum(c.quantity_delta) FROM progress_corrections c JOIN progress_entries pe ON pe.tenant_id=c.tenant_id AND pe.id=c.progress_entry_id WHERE pe.tenant_id=l.tenant_id AND pe.estimate_line_id=l.id),0))::text FROM progress_entries p WHERE p.tenant_id=l.tenant_id AND p.estimate_line_id=l.id) fact_quantity
             FROM estimate_lines l JOIN estimates e ON e.id=l.estimate_id LEFT JOIN zones z ON z.id=l.zone_id
             WHERE l.tenant_id=$1 AND l.project_id=$2 AND l.kind<>'material' AND l.archived_at IS NULL AND e.archived_at IS NULL ORDER BY e.name,l.position,l.id`,
            [actor.tenant_id, params.id],
          )
        ).rows,
      };
    },
  });
}
