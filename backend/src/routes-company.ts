import { z } from 'zod';
import { type Endpoint } from './http.js';
import { one, audit } from './db.js';
import {
  uuid,
  text,
  date,
  idParams,
  pageQuery,
  version,
  password,
  loginName,
  reason,
} from './schemas.js';
import {
  projectScope,
  assignedUser,
  permissions,
  tenantRoles,
  allowed,
  delegatableRole,
} from './permissions.js';
import { hashPassword, token, digest } from './security.js';
import { invariant } from './errors.js';
export function companyRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'GET',
    path: '/v1/projects',
    summary: 'Faqat biriktirilgan obyektlar',
    permission: 'projects.read',
    query: pageQuery,
    handler: async ({ db, actor, query }) => ({
      items: (
        await db.query(
          `SELECT p.* FROM projects p WHERE p.tenant_id=$1 AND p.archived_at IS NULL AND ($2='tenant_admin' OR EXISTS(SELECT 1 FROM project_assignments a WHERE a.tenant_id=p.tenant_id AND a.project_id=p.id AND a.user_id=$3)) ORDER BY p.created_at,p.id LIMIT $4 OFFSET $5`,
          [actor.tenant_id, actor.role, actor.id, query.limit, query.offset],
        )
      ).rows,
    }),
  });
  const projectBody = z.strictObject({
    name: text,
    planned_start: date.optional(),
    planned_end: date.optional(),
  });
  add({
    method: 'POST',
    path: '/v1/projects',
    summary: 'Obyekt yaratish',
    permission: 'projects.write',
    body: projectBody,
    idempotent: true,
    handler: async ({ db, actor, body }) => {
      const row = await one(
        db,
        'INSERT INTO projects(tenant_id,name,planned_start,planned_end) VALUES($1,$2,$3,$4) RETURNING *',
        [actor.tenant_id, body.name, body.planned_start ?? null, body.planned_end ?? null],
      );
      await db.query('INSERT INTO project_assignments VALUES($1,$2,$3)', [
        actor.tenant_id,
        row.id,
        actor.id,
      ]);
      await audit(db, actor, 'project.create', row.id);
      return row;
    },
  });
  add({
    method: 'PATCH',
    path: '/v1/projects/:id',
    summary: 'Obyekt va alohida forecastni yangilash',
    permission: 'projects.write',
    params: idParams,
    body: z.strictObject({
      version,
      name: text,
      forecast_end: date.nullable().optional(),
      actual_start: date.nullable().optional(),
      actual_end: date.nullable().optional(),
    }),
    idempotent: true,
    handler: async ({ db, actor, body, params }) => {
      await projectScope(db, actor, params.id);
      const row = await one(
        db,
        'UPDATE projects SET name=$3,forecast_end=$4,actual_start=$5,actual_end=$6,version=version+1 WHERE id=$1 AND version=$2 RETURNING *',
        [
          params.id,
          body.version,
          body.name,
          body.forecast_end ?? null,
          body.actual_start ?? null,
          body.actual_end ?? null,
        ],
      );
      await audit(db, actor, 'project.update', row.id);
      return row;
    },
  });
  add({
    method: 'POST',
    path: '/v1/projects/:id/zones',
    summary: 'O‘zgarmas parent bilan zona yaratish',
    permission: 'projects.write',
    params: idParams,
    body: z.strictObject({ name: text, parent_id: uuid.optional() }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      await projectScope(db, actor, params.id);
      return one(
        db,
        'INSERT INTO zones(tenant_id,project_id,name,parent_id) VALUES($1,$2,$3,$4) RETURNING *',
        [actor.tenant_id, params.id, body.name, body.parent_id ?? null],
      );
    },
  });
  add({
    method: 'GET',
    path: '/v1/projects/:id/zones',
    summary: 'Obyekt zonalari',
    permission: 'projects.read',
    params: idParams,
    handler: async ({ db, actor, params }) => {
      await projectScope(db, actor, params.id);
      return {
        items: (
          await db.query(
            'SELECT * FROM zones WHERE tenant_id=$1 AND project_id=$2 ORDER BY name,id',
            [actor.tenant_id, params.id],
          )
        ).rows,
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/employees',
    summary: 'Kompaniya xodimlari; hash hech qachon chiqmaydi',
    permission: 'employees.manage',
    query: pageQuery,
    handler: async ({ db, actor, query }) => ({
      items: (
        await db.query(
          'SELECT id,login,display_name,role,active,must_change_password,version FROM users WHERE tenant_id=$1 ORDER BY display_name,id LIMIT $2 OFFSET $3',
          [actor.tenant_id, query.limit, query.offset],
        )
      ).rows,
    }),
  });
  const employeeRole = z.enum([
    'foreman',
    'brigadier',
    'warehouse_manager',
    'financier',
    'accountant',
    'manager',
  ]);
  add({
    method: 'POST',
    path: '/v1/employees',
    summary: 'Xodim va almashtirilishi majburiy boshlang‘ich parol',
    permission: 'employees.manage',
    action: 'create',
    body: z.strictObject({ login: loginName, password, display_name: text, role: employeeRole }),
    idempotent: true,
    handler: async ({ db, actor, body }) => {
      await delegatableRole(db, actor, body.role);
      const row = await one(
        db,
        'INSERT INTO users(tenant_id,login,password_hash,display_name,role,must_change_password) VALUES($1,$2,$3,$4,$5,true) RETURNING id,login,role,display_name,must_change_password,version',
        [
          actor.tenant_id,
          body.login.toLowerCase(),
          await hashPassword(body.password),
          body.display_name,
          body.role,
        ],
      );
      await audit(db, actor, 'employee.create', row.id);
      return row;
    },
  });
  add({
    method: 'PATCH',
    path: '/v1/employees/:id',
    summary: 'Rol yoki holat o‘zgarishi sessiyalarni bekor qiladi',
    permission: 'employees.manage',
    params: idParams,
    body: z.strictObject({ version, display_name: text, role: employeeRole, active: z.boolean() }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      const user = await one(db, 'SELECT * FROM users WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
        actor.tenant_id,
        params.id,
      ]);
      invariant(user.role !== 'tenant_admin', 'OWNERSHIP_TRANSFER_REQUIRED');
      invariant(user.version === body.version, 'VERSION_CONFLICT');
      await delegatableRole(db, actor, body.role);
      invariant(
        actor.role === 'tenant_admin' || actor.id !== user.id,
        'SELF_ROLE_CHANGE_FORBIDDEN',
        403,
      );
      if (!body.active || user.role !== body.role) {
        const held = await db.query(
          'SELECT 1 FROM stock_accounts a JOIN stock_balances b ON b.tenant_id=a.tenant_id AND b.account_id=a.id WHERE a.tenant_id=$1 AND a.custodian_id=$2 AND (b.quantity>0 OR b.reserved>0) LIMIT 1',
          [actor.tenant_id, user.id],
        );
        const tasks = await db.query(
          "SELECT 1 FROM tasks WHERE tenant_id=$1 AND (assignee_id=$2 OR reviewer_id=$2) AND status<>'accepted' LIMIT 1",
          [actor.tenant_id, user.id],
        );
        invariant(!held.rowCount && !tasks.rowCount, 'HANDOVER_REQUIRED');
      }
      const row = await one(
        db,
        'UPDATE users SET display_name=$3,role=$4,active=$5,version=version+1 WHERE tenant_id=$1 AND id=$2 RETURNING id,display_name,role,active,version',
        [actor.tenant_id, user.id, body.display_name, body.role, body.active],
      );
      await db.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1', [user.id]);
      await audit(db, actor, 'employee.update', user.id);
      return row;
    },
  });
  add({
    method: 'POST',
    path: '/v1/employees/:id/assignments',
    summary: 'Xodimga obyekt va ombor doirasi',
    permission: 'employees.manage',
    params: idParams,
    body: z.strictObject({ project_id: uuid, warehouse_id: uuid.optional() }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      await projectScope(db, actor, body.project_id);
      await one(db, 'SELECT id FROM users WHERE tenant_id=$1 AND id=$2 AND active', [
        actor.tenant_id,
        params.id,
      ]);
      await db.query('INSERT INTO project_assignments VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [
        actor.tenant_id,
        body.project_id,
        params.id,
      ]);
      if (body.warehouse_id) {
        await one(db, 'SELECT 1 FROM warehouses WHERE tenant_id=$1 AND id=$2 AND project_id=$3', [
          actor.tenant_id,
          body.warehouse_id,
          body.project_id,
        ]);
        await db.query(
          'INSERT INTO warehouse_assignments VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [actor.tenant_id, body.warehouse_id, params.id],
        );
      }
      await audit(db, actor, 'employee.assign', params.id, {
        project_id: body.project_id,
        warehouse_id: body.warehouse_id,
      });
      return { ok: true };
    },
  });
  add({
    method: 'POST',
    path: '/v1/employees/:id/permissions',
    summary: 'Individual grant/deny; platforma vakolati berilmaydi',
    permission: 'employees.manage',
    params: idParams,
    body: z.strictObject({
      permission: z.enum(permissions),
      effect: z.enum(['grant', 'deny', 'inherit']),
    }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      invariant(actor.role === 'tenant_admin' && actor.id !== params.id, 'FORBIDDEN', 403);
      const user = await one(db, 'SELECT role FROM users WHERE tenant_id=$1 AND id=$2', [
        actor.tenant_id,
        params.id,
      ]);
      invariant(user.role !== 'tenant_admin', 'FORBIDDEN', 403);
      invariant(body.permission !== 'employees.manage', 'NON_DELEGABLE_PERMISSION', 403);
      if (body.effect === 'grant')
        invariant(
          await allowed(db, actor, body.permission),
          'DELEGATION_EXCEEDS_OWN_PERMISSIONS',
          403,
        );
      if (body.effect === 'inherit')
        await db.query(
          'DELETE FROM permission_overrides WHERE tenant_id=$1 AND user_id=$2 AND permission=$3',
          [actor.tenant_id, params.id, body.permission],
        );
      else
        await db.query(
          'INSERT INTO permission_overrides VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,user_id,permission) DO UPDATE SET effect=excluded.effect',
          [actor.tenant_id, params.id, body.permission, body.effect],
        );
      await audit(db, actor, 'employee.permission', params.id, body);
      return { ok: true };
    },
  });
  add({
    method: 'POST',
    path: '/v1/employees/:id/reset',
    summary: 'Xodimga bir martalik reset token; parol qaytarilmaydi',
    permission: 'employees.manage',
    params: idParams,
    handler: async ({ db, actor, params }) => {
      const user = await one(
        db,
        'SELECT id,role FROM users WHERE tenant_id=$1 AND id=$2 AND active',
        [actor.tenant_id, params.id],
      );
      invariant(user.role !== 'tenant_admin', 'FORBIDDEN', 403);
      await db.query(
        'UPDATE password_resets SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',
        [params.id],
      );
      const raw = token();
      await db.query("INSERT INTO password_resets VALUES($1,$2,now()+interval '30 minutes',NULL)", [
        digest(raw),
        params.id,
      ]);
      await db.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1', [params.id]);
      await audit(db, actor, 'employee.reset', params.id);
      return { token: raw, expires_in: 1800 };
    },
  });
  add({
    method: 'POST',
    path: '/v1/company/ownership',
    summary: 'Yagona kompaniya adminini almashtirish',
    permission: 'employees.manage',
    body: z.strictObject({ new_admin_id: uuid, previous_admin_role: employeeRole, reason }),
    idempotent: true,
    handler: async ({ db, actor, body }) => {
      invariant(actor.role === 'tenant_admin' && actor.id !== body.new_admin_id, 'FORBIDDEN', 403);
      await db.query(
        'SELECT id FROM users WHERE tenant_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE',
        [actor.tenant_id, [actor.id, body.new_admin_id]],
      );
      await one(db, 'SELECT id FROM users WHERE tenant_id=$1 AND id=$2 AND active', [
        actor.tenant_id,
        body.new_admin_id,
      ]);
      await db.query('UPDATE users SET role=$2,version=version+1 WHERE id=$1', [
        actor.id,
        body.previous_admin_role,
      ]);
      await db.query("UPDATE users SET role='tenant_admin',version=version+1 WHERE id=$1", [
        body.new_admin_id,
      ]);
      await db.query('DELETE FROM permission_overrides WHERE tenant_id=$1 AND user_id=$2', [
        actor.tenant_id,
        body.new_admin_id,
      ]);
      await db.query('UPDATE sessions SET revoked_at=now() WHERE user_id=ANY($1::uuid[])', [
        [actor.id, body.new_admin_id],
      ]);
      await audit(db, actor, 'company.ownership', body.new_admin_id, { reason: body.reason });
      return { ok: true, login_required: true };
    },
  });
  add({
    method: 'GET',
    path: '/v1/billing',
    page: 'billing',
    action: 'read',
    summary: 'Bloklangan admin uchun ham obuna, invoys va to‘lov tarixi',
    recovery: true,
    handler: async ({ db, actor }) => ({
      tenant: await one(
        db,
        'SELECT legal_name,status,trial_started_at,trial_ends_at,paid_until FROM tenants WHERE id=$1',
        [actor.tenant_id],
      ),
      subscription:
        (
          await db.query(
            'SELECT s.*,p.code,p.version,p.monthly_price,p.limits FROM subscriptions s JOIN plan_versions p ON p.id=s.plan_version_id WHERE s.tenant_id=$1',
            [actor.tenant_id],
          )
        ).rows[0] ?? null,
      invoices: (
        await db.query(
          'SELECT * FROM billing_invoices WHERE tenant_id=$1 ORDER BY period_start DESC',
          [actor.tenant_id],
        )
      ).rows,
      entries: (
        await db.query(
          'SELECT id,invoice_id,kind,amount,created_at FROM billing_entries WHERE tenant_id=$1 ORDER BY created_at DESC',
          [actor.tenant_id],
        )
      ).rows,
    }),
  });
  add({
    method: 'POST',
    path: '/v1/support-requests',
    page: 'billing',
    action: 'create',
    summary: 'Bloklangan admin uchun support yoki tarif almashtirish so‘rovi',
    recovery: true,
    body: z.strictObject({ kind: z.enum(['support', 'plan_change']), message: reason }),
    handler: async ({ db, actor, body }) =>
      one(
        db,
        'INSERT INTO support_requests(tenant_id,user_id,kind,message) VALUES($1,$2,$3,$4) RETURNING id,status,created_at',
        [actor.tenant_id, actor.id, body.kind, body.message],
      ),
  });
}
