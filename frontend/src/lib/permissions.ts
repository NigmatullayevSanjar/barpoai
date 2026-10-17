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
/** Biznes amallari faqat platforma egasida; texnik xodimlarni super admin boshqaradi (server ham tekshiradi). */
export const isPlatformOwner = (role?: Role) => role === 'platform_owner';
export const canManageStaff = (role?: Role) => role === 'super_admin';
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
  'pricing',
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
  pricing: '/app/finance/pricing',
};

/** Menyu bandi; `label` berilmasa yorliq `page.<page>` kalitidan olinadi. */
export type NavItem = { page: Page; icon: string; label?: string };
export type NavGroup = { group: string | null; items: NavItem[] };
const item = (page: Page, icon: string, label?: string): NavItem => ({ page, icon, label });
const flat = (...items: NavItem[]): NavGroup[] => [{ group: null, items }];
const nav = {
  dashboard: item('dashboard', 'LayoutDashboard'),
  projects: item('projects', 'Building2'),
  estimates: item('estimates', 'Calculator'),
  tasks: item('tasks', 'ListChecks'),
  reports: item('reports', 'ClipboardList'),
  /** Dala rollari uchun ombor sahifasi "Xomashyolar" deb ataladi (Figma). */
  materials: item('stock', 'Boxes', 'nav.materials'),
  stock: item('stock', 'Boxes'),
  employees: item('employees', 'UserCog'),
  finance: item('finance', 'Wallet'),
  budgets: item('budgets', 'PiggyBank'),
  allocations: item('allocations', 'HandCoins'),
  payment_requests: item('payment_requests', 'FileInput'),
  payment_calendar: item('payment_calendar', 'CalendarDays'),
  plan_actual: item('plan_actual', 'GitCompare'),
  pricing: item('pricing', 'Tags'),
  forecast: item('forecast', 'TrendingUp'),
  accounting_documents: item('accounting_documents', 'FileText'),
  invoices: item('invoices', 'Receipt'),
  bank_cash: item('bank_cash', 'Landmark'),
  counterparties: item('counterparties', 'Users'),
  payroll: item('payroll', 'BadgeDollarSign'),
  reconciliation: item('reconciliation', 'Scale'),
  financial_reports: item('financial_reports', 'BarChart3'),
};
/**
 * Kompaniya menyusi rol bo'yicha, Figma tartibida (D17, 2026-10-16): xodim rollarida tekis ro'yxat, adminda guruhlar.
 * Har band read ruxsati bo'lsa ko'rinadi (ruxsat matritsasi bandni yashirishi mumkin). Figma'da bo'lmagan, lekin
 * kodda bor sahifalar (Moliya markazi, Mablag' ajratish, Narx varaqasi, Fayllar, Audit, Integratsiyalar) faqat
 * adminda; Narx varaqasi D8 bo'yicha finansistda ham. Ombor mudiri menyusida vazifa va hisobot yo'q (Figma).
 */
export const roleNav: Partial<Record<Role, NavGroup[]>> = {
  foreman: flat(nav.dashboard, nav.projects, nav.estimates, nav.tasks, nav.materials, nav.reports),
  manager: flat(
    nav.dashboard,
    nav.projects,
    nav.estimates,
    nav.tasks,
    nav.materials,
    nav.reports,
    nav.employees,
  ),
  brigadier: flat(nav.dashboard, nav.tasks, nav.materials, nav.reports),
  warehouse_manager: flat(nav.dashboard, item('stock', 'Boxes', 'nav.warehouse')),
  financier: flat(
    nav.dashboard,
    nav.budgets,
    nav.plan_actual,
    nav.forecast,
    nav.payment_requests,
    nav.payment_calendar,
    nav.financial_reports,
    nav.pricing,
  ),
  accountant: flat(
    nav.dashboard,
    nav.accounting_documents,
    nav.invoices,
    nav.bank_cash,
    nav.counterparties,
    nav.payroll,
    nav.reconciliation,
    nav.financial_reports,
    nav.allocations,
  ),
  tenant_admin: [
    {
      group: 'nav.group.main',
      items: [nav.dashboard, nav.projects, nav.estimates, nav.tasks, nav.reports, nav.stock, nav.employees],
    },
    {
      group: 'nav.group.finance',
      items: [
        nav.finance,
        nav.budgets,
        nav.plan_actual,
        nav.forecast,
        nav.payment_requests,
        nav.payment_calendar,
        nav.pricing,
        nav.allocations,
        nav.accounting_documents,
        nav.invoices,
        nav.bank_cash,
        nav.counterparties,
        nav.payroll,
        nav.reconciliation,
        nav.financial_reports,
      ],
    },
    {
      group: 'nav.group.admin',
      items: [
        item('permissions', 'ShieldCheck'),
        item('billing', 'CreditCard'),
        item('camera', 'Cctv'),
        item('integrations', 'Plug'),
        item('audit', 'ScrollText'),
        item('files', 'FileText'),
        item('settings', 'Settings'),
      ],
    },
  ],
};
export const navFor = (role: Role): NavGroup[] => roleNav[role] ?? [];

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
    roles: ['platform_owner', 'super_admin', 'support'],
  },
  {
    key: 'tenants',
    to: '/admin/tenants',
    icon: 'Building2',
    roles: ['platform_owner', 'super_admin', 'support'],
  },
  {
    key: 'plans',
    to: '/admin/plans',
    icon: 'Package',
    roles: ['platform_owner', 'super_admin', 'support'],
  },
  {
    key: 'billing',
    to: '/admin/billing',
    icon: 'CreditCard',
    roles: ['platform_owner', 'super_admin', 'support'],
  },
  {
    key: 'debtors',
    to: '/admin/debtors',
    icon: 'AlertTriangle',
    roles: ['platform_owner', 'super_admin', 'support'],
  },
  {
    key: 'support',
    to: '/admin/support',
    icon: 'LifeBuoy',
    roles: ['platform_owner', 'support', 'super_admin'],
  },
  { key: 'staff', to: '/admin/staff', icon: 'UserCog', roles: ['super_admin'] },
  { key: 'audit', to: '/admin/audit', icon: 'ScrollText', roles: ['super_admin', 'platform_owner'] },
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
      ? role === 'platform_owner' || role === 'super_admin'
        ? '/admin'
        : '/admin/tenants'
      : '/app';
