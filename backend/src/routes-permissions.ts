import { z } from 'zod';
import { type Endpoint } from './http.js';
import {
  pages,
  actions,
  effectivePages,
  permissions,
  allowed,
  tenantRoles,
} from './permissions.js';
import { one, audit } from './db.js';
import { version } from './schemas.js';
import { invariant } from './errors.js';
export function permissionRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'GET',
    path: '/v1/me/permissions',
    summary: 'Frontend uchun serverdagi samarali sahifa va CRUD ruxsatlari',
    handler: async ({ db, actor }) => {
      const domain: string[] = [];
      for (const p of permissions) if (await allowed(db, actor, p)) domain.push(p);
      return {
        role: actor.role,
        pages: await effectivePages(db, actor),
        permissions: domain,
        version:
          (
            await db.query('SELECT version FROM permission_versions WHERE tenant_id=$1', [
              actor.tenant_id,
            ])
          ).rows[0]?.version ?? 1,
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/company/role-permissions',
    summary: 'Admin uchun barcha kompaniya rollari va sahifa CRUD matritsasi',
    adminOnly: true,
    handler: async ({ db, actor }) => {
      const roles: Record<string, unknown> = {};
      for (const role of tenantRoles)
        roles[role] = await effectivePages(db, {
          ...actor,
          id: '00000000-0000-0000-0000-000000000000',
          role,
        });
      return {
        version:
          (
            await db.query('SELECT version FROM permission_versions WHERE tenant_id=$1', [
              actor.tenant_id,
            ])
          ).rows[0]?.version ?? 1,
        roles,
        pages,
        actions,
        locked_pages: ['permissions'],
      };
    },
  });
  add({
    method: 'POST',
    path: '/v1/company/role-permissions',
    summary: 'Har rol va har sahifa uchun mustaqil CRUD sozlash',
    adminOnly: true,
    idempotent: true,
    body: z.strictObject({
      version,
      role: z.enum([
        'foreman',
        'brigadier',
        'warehouse_manager',
        'financier',
        'accountant',
        'manager',
      ]),
      rules: z
        .array(
          z.strictObject({
            page: z.enum(pages),
            create: z.boolean(),
            read: z.boolean(),
            update: z.boolean(),
            delete: z.boolean(),
          }),
        )
        .min(1)
        .max(pages.length),
    }),
    handler: async ({ db, actor, body }) => {
      await db.query(
        'INSERT INTO permission_versions(tenant_id) VALUES($1) ON CONFLICT DO NOTHING',
        [actor.tenant_id],
      );
      const current = await one(
        db,
        'SELECT version FROM permission_versions WHERE tenant_id=$1 FOR UPDATE',
        [actor.tenant_id],
      );
      invariant(body.version === current.version, 'VERSION_CONFLICT');
      invariant(
        new Set(body.rules.map((r: any) => r.page)).size === body.rules.length,
        'DUPLICATE_PAGE_RULE',
        400,
      );
      for (const rule of body.rules) {
        invariant(
          rule.page !== 'permissions' || actions.every((a) => !rule[a]),
          'ADMIN_ONLY_PAGE',
          403,
        );
        invariant(
          rule.read || (!rule.create && !rule.update && !rule.delete),
          'READ_REQUIRED_FOR_WRITE',
          400,
        );
        for (const action of actions)
          await db.query(
            `INSERT INTO role_page_permissions(tenant_id,role,page,action,allowed,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,role,page,action) DO UPDATE SET allowed=excluded.allowed,updated_by=excluded.updated_by,updated_at=now()`,
            [actor.tenant_id, body.role, rule.page, action, rule[action], actor.id],
          );
      }
      const next = await one(
        db,
        'UPDATE permission_versions SET version=version+1 WHERE tenant_id=$1 RETURNING version',
        [actor.tenant_id],
      );
      await audit(db, actor, 'role.permissions', null, { role: body.role, rules: body.rules });
      return {
        ...next,
        role: body.role,
        pages: await effectivePages(db, {
          ...actor,
          id: '00000000-0000-0000-0000-000000000000',
          role: body.role,
        }),
      };
    },
  });
}
