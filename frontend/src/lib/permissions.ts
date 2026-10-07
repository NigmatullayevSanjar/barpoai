/**
 * Sahifa kalitlari backenddagi `pages` ro'yxati bilan bir xil.
 * UI faqat ko'rsatish uchun filtrlaydi; haqiqiy ruxsat har API so'rovida serverda tekshiriladi.
 */
export type CrudAction = 'create' | 'read' | 'update' | 'delete';
export type PageRules = Record<string, Record<CrudAction, boolean>>;
export type PermissionSnapshot = {
  role: string;
  pages: PageRules;
  permissions: string[];
  version: number;
};

export type Role =
  | 'super_admin'
  | 'platform_owner'
  | 'support'
  | 'tenant_admin'
  | 'foreman'
  | 'brigadier'
  | 'warehouse_manager'
  | 'financier'
  | 'accountant'
  | 'manager';

export const platformRoles: Role[] = ['super_admin', 'platform_owner', 'support'];
export const tenantRoles: Role[] = [
  'tenant_admin',
  'foreman',
  'brigadier',
  'warehouse_manager',
  'financier',
  'accountant',
  'manager',
];
export const employeeRoles: Role[] = [
  'foreman',
  'brigadier',
  'warehouse_manager',
  'financier',
  'accountant',
  'manager',
];

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
export type Page = (typeof pages)[number];

/** Sahifa → marshrut. Moliya ichidagi sahifalar /app/finance/... ostida. */
export const pageRoutes: Record<Page, string> = {
  dashboard: '/app',
  projects: '/app/projects',
  employees: '/app/employees',
  estimates: '/app/estimates',
  stock: '/app/stock',
  finance: '/app/finance',
  tasks: '/app/tasks',
  reports: '/app/reports',
  files: '/app/files',
  integrations: '/app/integrations',
  camera: '/app/camera',
  billing: '/app/billing',
  settings: '/app/settings',
  permissions: '/app/permissions',
  audit: '/app/audit',
  accounting_documents: '/app/finance/documents',
  invoices: '/app/finance/invoices',
  bank_cash: '/app/finance/bank-cash',
  counterparties: '/app/finance/counterparties',
  payroll: '/app/finance/payroll',
  reconciliation: '/app/finance/reconciliation',
  financial_reports: '/app/finance/reports',
  allocations: '/app/finance/allocations',
  budgets: '/app/finance/budgets',
  plan_actual: '/app/finance/plan-actual',
  forecast: '/app/finance/forecast',
  payment_requests: '/app/finance/payment-requests',
  payment_calendar: '/app/finance/payment-calendar',
};

/** Kompaniya menyusi guruhlari; har band read ruxsati bo'lsa ko'rinadi. */
export const tenantNav: {
  group: string;
  items: { page: Page; icon: string }[];
}[] = [
  {
    group: 'nav.group.main',
    items: [
      { page: 'dashboard', icon: 'LayoutDashboard' },
      { page: 'projects', icon: 'Building2' },
      { page: 'estimates', icon: 'Calculator' },
      { page: 'tasks', icon: 'ListChecks' },
      { page: 'reports', icon: 'ClipboardList' },
      { page: 'stock', icon: 'Boxes' },
    ],
  },
  {
    group: 'nav.group.finance',
    items: [
      { page: 'finance', icon: 'Wallet' },
      { page: 'budgets', icon: 'PiggyBank' },
      { page: 'allocations', icon: 'HandCoins' },
      { page: 'payment_requests', icon: 'FileInput' },
      { page: 'payment_calendar', icon: 'CalendarDays' },
      { page: 'plan_actual', icon: 'GitCompare' },
      { page: 'forecast', icon: 'TrendingUp' },
      { page: 'accounting_documents', icon: 'FileText' },
      { page: 'invoices', icon: 'Receipt' },
      { page: 'bank_cash', icon: 'Landmark' },
      { page: 'counterparties', icon: 'Users' },
      { page: 'payroll', icon: 'BadgeDollarSign' },
      { page: 'reconciliation', icon: 'Scale' },
      { page: 'financial_reports', icon: 'BarChart3' },
    ],
  },
  {
    group: 'nav.group.admin',
    items: [
      { page: 'employees', icon: 'UserCog' },
      { page: 'permissions', icon: 'ShieldCheck' },
      { page: 'billing', icon: 'CreditCard' },
      { page: 'camera', icon: 'Cctv' },
      { page: 'integrations', icon: 'Plug' },
      { page: 'audit', icon: 'ScrollText' },
      { page: 'settings', icon: 'Settings' },
    ],
  },
];

export type PlatformNavItem = {
  key: string;
  to: string;
  icon: string;
  roles: Role[];
};
export const platformNav: PlatformNavItem[] = [
  {
    key: 'dashboard',
    to: '/admin',
    icon: 'LayoutDashboard',
    roles: ['platform_owner'],
  },
  {
    key: 'tenants',
    to: '/admin/tenants',
    icon: 'Building2',
    roles: ['platform_owner'],
  },
  {
    key: 'plans',
    to: '/admin/plans',
    icon: 'Package',
    roles: ['platform_owner'],
  },
  {
    key: 'billing',
    to: '/admin/billing',
    icon: 'CreditCard',
    roles: ['platform_owner'],
  },
  {
    key: 'debtors',
    to: '/admin/debtors',
    icon: 'AlertTriangle',
    roles: ['platform_owner'],
  },
  {
    key: 'support',
    to: '/admin/support',
    icon: 'LifeBuoy',
    roles: ['platform_owner', 'support', 'super_admin'],
  },
  { key: 'staff', to: '/admin/staff', icon: 'UserCog', roles: ['super_admin'] },
  {
    key: 'diagnostics',
    to: '/admin/diagnostics',
    icon: 'Activity',
    roles: ['super_admin', 'support'],
  },
];

export const homeFor = (role: Role, mustChange: boolean) =>
  mustChange
    ? '/change-password'
    : platformRoles.includes(role)
      ? role === 'platform_owner'
        ? '/admin'
        : '/admin/support'
      : '/app';
