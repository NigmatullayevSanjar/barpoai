import { type Db, type Row, one } from './db.js';
import { invariant } from './errors.js';
export const roles = [
  'super_admin',
  'platform_owner',
  'support',
  'tenant_admin',
  'foreman',
  'brigadier',
  'warehouse_manager',
  'financier',
  'accountant',
  'manager',
] as const;
export const tenantRoles = [
  'tenant_admin',
  'foreman',
  'brigadier',
  'warehouse_manager',
  'financier',
  'accountant',
  'manager',
] as const;
export const permissions = [
  'projects.read',
  'projects.write',
  'employees.manage',
  'estimates.read',
  'estimates.import',
  'estimates.edit',
  'prices.read',
  'stock.read',
  'stock.receive',
  'stock.send',
  'stock.accept',
  'stock.consume',
  'stock.review',
  'stock.reverse',
  'finance.read',
  'finance.allocate',
  'finance.post',
  'finance.reverse',
  'tasks.read',
  'tasks.manage',
  'reports.read',
  'reports.submit',
  'reports.review',
  'files.read',
  'files.write',
  'integrations.read',
  'audit.read',
] as const;
export type Permission = (typeof permissions)[number];
export const pages = [
  'dashboard',
  'projects',
  'employees',
  'estimates',
  'stock',
  'finance',
  'tasks',
  'reports',
  'files',
  'integrations',
  'camera',
  'billing',
  'settings',
  'permissions',
  'audit',
  'accounting_documents',
  'invoices',
  'bank_cash',
  'counterparties',
  'payroll',
  'reconciliation',
  'financial_reports',
  'allocations',
  'budgets',
  'plan_actual',
  'forecast',
  'payment_requests',
  'payment_calendar',
] as const;
export const actions = ['create', 'read', 'update', 'delete'] as const;
export type Page = (typeof pages)[number];
export type Action = (typeof actions)[number];
export const financialPages: Partial<Record<string, Page>> = {
  allocation: 'allocations',
  purchase_order: 'payment_requests',
  supplier_invoice: 'invoices',
  opening_debt: 'accounting_documents',
  labor: 'payroll',
  equipment: 'accounting_documents',
  service: 'accounting_documents',
  payment: 'bank_cash',
  receipt: 'bank_cash',
  advance: 'bank_cash',
  cash_transfer: 'bank_cash',
  reversal: 'accounting_documents',
};
export const financeSubpages = new Set([
  'accounting_documents',
  'invoices',
  'bank_cash',
  'counterparties',
  'payroll',
  'reconciliation',
  'financial_reports',
  'allocations',
  'budgets',
  'plan_actual',
  'forecast',
  'payment_requests',
  'payment_calendar',
]);
export const permissionPage: Record<Permission, [Page, Action]> = {
  'projects.read': ['projects', 'read'],
  'projects.write': ['projects', 'create'],
  'employees.manage': ['employees', 'update'],
  'estimates.read': ['estimates', 'read'],
  'estimates.import': ['estimates', 'create'],
  'estimates.edit': ['estimates', 'update'],
  'prices.read': ['finance', 'read'],
  'stock.read': ['stock', 'read'],
  'stock.receive': ['stock', 'create'],
  'stock.send': ['stock', 'create'],
  'stock.accept': ['stock', 'update'],
  'stock.consume': ['stock', 'create'],
  'stock.review': ['stock', 'update'],
  'stock.reverse': ['stock', 'delete'],
  'finance.read': ['finance', 'read'],
  'finance.allocate': ['finance', 'create'],
  'finance.post': ['finance', 'create'],
  'finance.reverse': ['finance', 'delete'],
  'tasks.read': ['tasks', 'read'],
  'tasks.manage': ['tasks', 'update'],
  'reports.read': ['reports', 'read'],
  'reports.submit': ['reports', 'create'],
  'reports.review': ['reports', 'update'],
  'files.read': ['files', 'read'],
  'files.write': ['files', 'create'],
  'integrations.read': ['integrations', 'read'],
  'audit.read': ['audit', 'read'],
};
const common: Permission[] = [
  'projects.read',
  'tasks.read',
  'reports.read',
  'files.read',
  'files.write',
];
export const basePermissions: Record<string, readonly Permission[]> = {
  tenant_admin: permissions,
  foreman: [
    ...common,
    'stock.read',
    'stock.review',
    'tasks.manage',
    'reports.submit',
    'reports.review',
    'estimates.read',
  ],
  brigadier: [...common, 'stock.read', 'stock.accept', 'stock.consume', 'reports.submit'],
  warehouse_manager: [...common, 'stock.read', 'stock.receive', 'stock.send'],
  financier: [
    ...common,
    'estimates.read',
    'estimates.import',
    'prices.read',
    'finance.read',
    'finance.allocate',
  ],
  accountant: [
    ...common,
    'estimates.read',
    'prices.read',
    'finance.read',
    'finance.post',
    'finance.reverse',
  ],
  manager: [...common, 'tasks.manage'],
  super_admin: [],
  platform_owner: [],
  support: [],
};
async function permissionContext(db: Db, actor: Row) {
  db.permissionCache ??= new Map();
  const key = `${actor.tenant_id}:${actor.id}:${actor.role}`;
  const cached = db.permissionCache.get(key);
  if (cached) return cached;
  const overrides = (
    await db.query(
      'SELECT permission,effect FROM permission_overrides WHERE tenant_id=$1 AND user_id=$2',
      [actor.tenant_id, actor.id],
    )
  ).rows;
  const policies = (
    await db.query(
      'SELECT page,action,allowed FROM role_page_permissions WHERE tenant_id=$1 AND role=$2',
      [actor.tenant_id, actor.role],
    )
  ).rows;
  const result = { overrides, policies };
  db.permissionCache.set(key, result);
  return result;
}
export async function allowed(
  db: Db,
  actor: Row,
  permission: Permission,
  requestedAction?: Action,
  requestedPage?: Page,
) {
  if (!actor.tenant_id) return false;
  const context = await permissionContext(db, actor);
  const override = context.overrides.find((o) => o.permission === permission);
  if (override?.effect === 'deny') return false;
  const [defaultPage, defaultAction] = permissionPage[permission];
  const page = requestedPage ?? defaultPage;
  const action = requestedAction ?? defaultAction;
  const policy = context.policies.filter(
    (p) => p.page === page && ['read', action].includes(p.action),
  );
  if (policy.some((p) => p.action === 'read' && !p.allowed)) return false;
  if (override?.effect === 'grant') return true;
  const match = policy.find((p) => p.action === action);
  if (match) return match.allowed;
  return basePermissions[actor.role]?.includes(permission) ?? false;
}
export async function pageAllowed(db: Db, actor: Row, page: Page, action: Action) {
  if (!actor.tenant_id) return false;
  if (actor.role === 'tenant_admin') return true;
  if (page === 'permissions') return false;
  const domainPage = financeSubpages.has(page) ? 'finance' : page;
  let bindings = permissions.filter(
    (p) =>
      permissionPage[p][0] === domainPage &&
      (permissionPage[p][1] === action ||
        ((p === 'projects.write' || p === 'tasks.manage' || p === 'employees.manage') &&
          action !== 'read') ||
        (p === 'employees.manage' && action === 'read') ||
        (p === 'reports.submit' && action === 'update')),
  );
  if (financeSubpages.has(page) && action === 'create')
    bindings = bindings.filter(
      (p) =>
        p ===
        (['allocations', 'budgets', 'payment_requests'].includes(page)
          ? 'finance.allocate'
          : 'finance.post'),
    );
  if (domainPage === 'finance' && action === 'read')
    bindings = bindings.filter((p) => p === 'finance.read');
  const context = await permissionContext(db, actor);
  const denied = context.overrides.filter((o) => o.effect === 'deny').map((r) => r.permission);
  if (bindings.length > 0 && bindings.every((p) => denied.includes(p))) return false;
  const rows = context.policies.filter((p) => p.page === page);
  if (rows.some((r) => r.action === 'read' && !r.allowed)) return false;
  const explicit = rows.find((r) => r.action === action);
  if (explicit) return explicit.allowed;
  if (page === 'dashboard') return action === 'read';
  if (page === 'tasks' && action === 'update') return allowed(db, actor, 'tasks.read');
  if (
    page === 'stock' &&
    action === 'update' &&
    ((await allowed(db, actor, 'stock.send')) || (await allowed(db, actor, 'stock.receive')))
  )
    return true;
  if (page === 'camera') return false;
  for (const p of bindings) if (await allowed(db, actor, p, action, page)) return true;
  return false;
}
export async function effectivePages(db: Db, actor: Row) {
  const result: Record<string, Record<string, boolean>> = {};
  for (const page of pages) {
    const entry: Record<string, boolean> = {};
    for (const action of actions) entry[action] = await pageAllowed(db, actor, page, action);
    result[page] = entry;
  }
  return result;
}
export async function delegatableRole(db: Db, actor: Row, role: string) {
  if (actor.role === 'tenant_admin') return;
  const target = { ...actor, id: '00000000-0000-0000-0000-000000000000', role };
  for (const permission of permissions)
    if (await allowed(db, target, permission))
      invariant(await allowed(db, actor, permission), 'DELEGATION_EXCEEDS_OWN_PERMISSIONS', 403);
}
export async function permit(
  db: Db,
  actor: Row,
  permission: Permission,
  action?: Action,
  page?: Page,
) {
  invariant(await allowed(db, actor, permission, action, page), 'FORBIDDEN', 403);
}
export async function projectScope(db: Db, actor: Row, id: string) {
  const project = await one(
    db,
    'SELECT * FROM projects WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL',
    [actor.tenant_id, id],
  );
  if (actor.role !== 'tenant_admin')
    invariant(
      (
        await db.query(
          'SELECT 1 FROM project_assignments WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3',
          [actor.tenant_id, id, actor.id],
        )
      ).rowCount,
      'NOT_FOUND',
      404,
    );
  return project;
}
export async function accountScope(db: Db, actor: Row, id: string, custodySelf = true) {
  const account = await one(db, 'SELECT * FROM stock_accounts WHERE tenant_id=$1 AND id=$2', [
    actor.tenant_id,
    id,
  ]);
  await projectScope(db, actor, account.project_id);
  if (actor.role !== 'tenant_admin' && account.warehouse_id && actor.role === 'warehouse_manager') {
    invariant(
      (
        await db.query(
          'SELECT 1 FROM warehouse_assignments WHERE tenant_id=$1 AND warehouse_id=$2 AND user_id=$3',
          [actor.tenant_id, account.warehouse_id, actor.id],
        )
      ).rowCount,
      'NOT_FOUND',
      404,
    );
  }
  if (custodySelf && actor.role === 'brigadier')
    invariant(account.custodian_id === actor.id, 'NOT_FOUND', 404);
  return account;
}
export async function assignedUser(db: Db, tenant: string, project: string, id: string) {
  const user = await one(db, 'SELECT id,role FROM users WHERE tenant_id=$1 AND id=$2 AND active', [
    tenant,
    id,
  ]);
  if (user.role !== 'tenant_admin')
    invariant(
      (
        await db.query(
          'SELECT 1 FROM project_assignments WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3',
          [tenant, project, id],
        )
      ).rowCount,
      'USER_OUTSIDE_PROJECT',
    );
  return user;
}
export function redactPrices(value: any): any {
  if (Array.isArray(value)) return value.map(redactPrices);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          ![
            'unit_price',
            'unit_cost',
            'total',
            'value',
            'value_delta',
            'amount',
            'price',
            'monthly_price',
          ].includes(key),
      )
      .map(([k, v]) => [k, redactPrices(v)]),
  );
}
