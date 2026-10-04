import { z } from 'zod';
import { type Endpoint } from './http.js';
import { one, audit } from './db.js';
import { uuid, idParams, pageQuery } from './schemas.js';
import { projectScope, permissions, allowed } from './permissions.js';
import { invariant } from './errors.js';
/** Obyekt kartasi, xodim kartasi, biriktirishni olib tashlash va omborlar ro'yxati. */
export function companyExtraRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'GET',
    path: '/v1/projects/:id',
    summary: 'Obyekt kartasi: zonalar, biriktirilgan xodimlar, omborlar va hisoblagichlar',
    permission: 'projects.read',
    params: idParams,
    handler: async ({ db, actor, params }) => {
      const project = await projectScope(db, actor, params.id);
      const zones = (
        await db.query(
          'SELECT * FROM zones WHERE tenant_id=$1 AND project_id=$2 ORDER BY name,id',
          [actor.tenant_id, params.id],
        )
      ).rows;
      const members = (
        await db.query(
          `SELECT u.id,u.display_name,u.role,u.phone,u.active,
                  coalesce((SELECT json_agg(json_build_object('id',w.id,'name',w.name)) FROM warehouse_assignments wa JOIN warehouses w ON w.id=wa.warehouse_id WHERE wa.tenant_id=u.tenant_id AND wa.user_id=u.id AND w.project_id=$2),'[]') warehouses
           FROM project_assignments a JOIN users u ON u.tenant_id=a.tenant_id AND u.id=a.user_id
           WHERE a.tenant_id=$1 AND a.project_id=$2 ORDER BY u.role,u.display_name`,
          [actor.tenant_id, params.id],
        )
      ).rows;
      const warehouses = (
        await db.query(
          'SELECT w.*,a.id account_id FROM warehouses w LEFT JOIN stock_accounts a ON a.tenant_id=w.tenant_id AND a.warehouse_id=w.id WHERE w.tenant_id=$1 AND w.project_id=$2 ORDER BY w.name',
          [actor.tenant_id, params.id],
        )
      ).rows;
      const counters = await one(
        db,
        `SELECT
           (SELECT count(*)::int FROM tasks t WHERE t.tenant_id=$1 AND t.project_id=$2 AND t.archived_at IS NULL AND t.status<>'accepted') open_tasks,
           (SELECT count(*)::int FROM tasks t WHERE t.tenant_id=$1 AND t.project_id=$2 AND t.archived_at IS NULL AND t.status<>'accepted' AND t.deadline<now()) overdue_tasks,
           (SELECT count(*)::int FROM estimates e WHERE e.tenant_id=$1 AND e.project_id=$2 AND e.archived_at IS NULL) estimates,
           (SELECT count(*)::int FROM reports r WHERE r.tenant_id=$1 AND r.project_id=$2 AND r.archived_at IS NULL AND r.status='submitted') pending_reports`,
        [actor.tenant_id, params.id],
      );
      return { ...project, zones, members, warehouses, counters };
    },
  });
  add({
    method: 'GET',
    path: '/v1/warehouses',
    summary: 'Obyekt omborlari va ularning stock hisoblari',
    permission: 'stock.read',
    query: pageQuery.extend({ project_id: uuid }),
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      return {
        items: (
          await db.query(
            `SELECT w.*,a.id account_id FROM warehouses w LEFT JOIN stock_accounts a ON a.tenant_id=w.tenant_id AND a.warehouse_id=w.id
             WHERE w.tenant_id=$1 AND w.project_id=$2 AND ($3<>'warehouse_manager' OR EXISTS(SELECT 1 FROM warehouse_assignments x WHERE x.tenant_id=w.tenant_id AND x.warehouse_id=w.id AND x.user_id=$4))
             ORDER BY w.name LIMIT $5 OFFSET $6`,
            [actor.tenant_id, query.project_id, actor.role, actor.id, query.limit, query.offset],
          )
        ).rows,
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/employees/:id',
    summary: 'Xodim kartasi: biriktirishlar, individual ruxsatlar va Telegram holati',
    permission: 'employees.manage',
    action: 'read',
    params: idParams,
    handler: async ({ db, actor, params }) => {
      const user = await one(
        db,
        'SELECT id,login,display_name,phone,role,active,must_change_password,position,hired_at,version,created_at FROM users WHERE tenant_id=$1 AND id=$2',
        [actor.tenant_id, params.id],
      );
      const projects = (
        await db.query(
          `SELECT p.id,p.name,p.code,p.status,
                  coalesce((SELECT json_agg(json_build_object('id',w.id,'name',w.name)) FROM warehouse_assignments wa JOIN warehouses w ON w.id=wa.warehouse_id WHERE wa.tenant_id=a.tenant_id AND wa.user_id=a.user_id AND w.project_id=p.id),'[]') warehouses
           FROM project_assignments a JOIN projects p ON p.tenant_id=a.tenant_id AND p.id=a.project_id
           WHERE a.tenant_id=$1 AND a.user_id=$2 AND p.archived_at IS NULL ORDER BY p.name`,
          [actor.tenant_id, params.id],
        )
      ).rows;
      const overrides = (
        await db.query(
          'SELECT permission,effect FROM permission_overrides WHERE tenant_id=$1 AND user_id=$2',
          [actor.tenant_id, params.id],
        )
      ).rows;
      const telegram = (
        await db.query(
          'SELECT telegram_username,linked_at FROM telegram_accounts WHERE user_id=$1',
          [params.id],
        )
      ).rows[0];
      const effective: string[] = [];
      for (const p of permissions)
        if (await allowed(db, { ...user, tenant_id: actor.tenant_id }, p)) effective.push(p);
      return {
        ...user,
        projects,
        overrides,
        effective_permissions: effective,
        telegram: telegram
          ? { username: telegram.telegram_username, linked_at: telegram.linked_at }
          : null,
      };
    },
  });
  add({
    method: 'DELETE',
    path: '/v1/employees/:id/assignments',
    summary: 'Obyekt yoki ombor biriktirishini olib tashlash',
    permission: 'employees.manage',
    action: 'update',
    params: idParams,
    body: z.strictObject({ project_id: uuid, warehouse_id: uuid.optional() }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      await projectScope(db, actor, body.project_id);
      if (body.warehouse_id) {
        await db.query(
          'DELETE FROM warehouse_assignments WHERE tenant_id=$1 AND warehouse_id=$2 AND user_id=$3',
          [actor.tenant_id, body.warehouse_id, params.id],
        );
      } else {
        const open = await db.query(
          "SELECT 1 FROM tasks WHERE tenant_id=$1 AND project_id=$2 AND (assignee_id=$3 OR reviewer_id=$3) AND status<>'accepted' AND archived_at IS NULL LIMIT 1",
          [actor.tenant_id, body.project_id, params.id],
        );
        const custody = await db.query(
          'SELECT 1 FROM stock_accounts a JOIN stock_balances b ON b.tenant_id=a.tenant_id AND b.account_id=a.id WHERE a.tenant_id=$1 AND a.project_id=$2 AND a.custodian_id=$3 AND (b.quantity>0 OR b.reserved>0) LIMIT 1',
          [actor.tenant_id, body.project_id, params.id],
        );
        invariant(!open.rowCount && !custody.rowCount, 'HANDOVER_REQUIRED');
        await db.query(
          'DELETE FROM warehouse_assignments wa USING warehouses w WHERE wa.tenant_id=$1 AND wa.user_id=$3 AND w.id=wa.warehouse_id AND w.project_id=$2',
          [actor.tenant_id, body.project_id, params.id],
        );
        await db.query(
          'DELETE FROM project_assignments WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3',
          [actor.tenant_id, body.project_id, params.id],
        );
      }
      await audit(db, actor, 'employee.unassign', params.id, body);
      return { ok: true };
    },
  });
}
