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
/**
 * Platforma amallari ruxsatlari (D21, 2026-10-22) — backenddagi `platform-permissions.ts` bilan bir xil. Ro'yxat
 * `/v1/auth/me` dan keladi (egasida hammasi); UI faqat yashiradi, server har so'rovda tekshiradi.
 */
export const platformPermissionKeys = [
  'tenants.manage',
  'tenants.block',
  'plans.manage',
  'billing.manage',
  'users.reset',
  'tenants.correct',
  'audit.read',
  'support.reply',
  'diagnostics.read',
  'staff.manage',
  'permissions.manage',
] as const;
export type PlatformPermission = (typeof platformPermissionKeys)[number];
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

/** Menyu bandi; `label` berilmasa yorliq `page.<page>` kalitidan, `to` berilmasa manzil `pageRoutes[page]` dan olinadi. */
export type NavItem = { page: Page; icon: string; label?: string; to?: string };
export type NavGroup = { group: string | null; items: NavItem[] };
const item = (page: Page, icon: string, label?: string, to?: string): NavItem => ({ page, icon, label, to });
/** Bitta sahifaning ichki bo'limiga (so'rov parametri bilan) olib boradigan band. */
export const navHref = (it: NavItem) => it.to ?? pageRoutes[it.page];
/**
 * Band faolmi: yo'l mos kelsa va banddagi so'rov parametrlari joriy manzilda ham bo'lsa. So'rov parametrsiz band
 * (masalan, "Ombor") faqat shu sahifaning boshqa bandlari mos kelmaganda faol — bir vaqtda bitta band yonadi.
 */
export const isNavActive = (it: NavItem, pathname: string, search: string, siblings: NavItem[]) => {
  const [path, query = ''] = navHref(it).split('?');
  if (pathname !== path && !(path !== '/app' && path !== '/app/finance' && pathname.startsWith(path + '/')))
    return false;
  const current = new URLSearchParams(search);
  const matches = (q: string) => [...new URLSearchParams(q)].every(([k, v]) => current.get(k) === v);
  const size = (q: string) => [...new URLSearchParams(q)].length;
  const samePage = siblings.filter((s) => s !== it && navHref(s).split('?')[0] === path);
  const queryOf = (s: NavItem) => navHref(s).split('?')[1] ?? '';
  if (query) {
    // "Omborlar" (tab=balances) va "Inventarizatsiya" (tab=balances&inventory=1): aniqrog'i (ko'proq parametr) yonadi
    return matches(query) && !samePage.some((s) => size(queryOf(s)) > size(query) && matches(queryOf(s)));
  }
  return !samePage.some((s) => matches(queryOf(s)));
};
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
  // Figma brigadir: "Material qabul" (jo'natmalarni qabul qilish) va "Material talabnomasi" — ombor sahifasining bo'limlari.
  // Qoldiqlar va Materiallar ham alohida band: brigadirda ombor sahifasi tablarsiz, har band o'z bo'limini ochadi.
  brigadier: flat(
    nav.dashboard,
    nav.tasks,
    item('stock', 'Boxes', 'nav.material_accept', '/app/stock?tab=movements&kind=transfer'),
    item('stock', 'FileInput', 'nav.material_request', '/app/stock?tab=requests'),
    item('stock', 'BarChart3', 'stock.tab.balances', '/app/stock?tab=balances'),
    item('stock', 'Package', 'nav.materials_catalog', '/app/stock?tab=materials'),
    nav.reports,
  ),
  // Figma ombor mudiri: kirim/chiqim, omborlar (qoldiqlar), talabnomalar, transferlar, inventarizatsiya, materiallar.
  // "Buyurtma" (yetkazuvchi buyurtmasi) va "Hisobdan chiqarish" ma'lumoti yo'q (D17).
  warehouse_manager: flat(
    nav.dashboard,
    item('stock', 'ArrowLeftRight', 'nav.stock_movements', '/app/stock?tab=movements'),
    item('stock', 'Boxes', 'nav.warehouses', '/app/stock?tab=balances'),
    item('stock', 'FileInput', 'nav.requests', '/app/stock?tab=requests'),
    item('stock', 'GitCompare', 'nav.transfers', '/app/stock?tab=movements&kind=transfer'),
    item('stock', 'ClipboardList', 'nav.inventory', '/app/stock?tab=balances&inventory=1'),
    item('stock', 'Package', 'nav.materials_catalog', '/app/stock?tab=materials'),
    item('stock', 'ScrollText', 'stock.tab.customer', '/app/stock?tab=customer'),
  ),
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
    // Dalolatnoma (F-2/F-3) smeta kartasidan ochiladi; buxgalterda estimates.read va prices.read bor.
    nav.estimates,
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
  /** Berilmasa — barcha platforma xodimlariga (ko'rish sahifasi). */
  permission?: PlatformPermission;
};
export const platformNav: PlatformNavItem[] = [
  { key: 'dashboard', to: '/admin', icon: 'LayoutDashboard' },
  { key: 'tenants', to: '/admin/tenants', icon: 'Building2' },
  { key: 'plans', to: '/admin/plans', icon: 'Package' },
  { key: 'billing', to: '/admin/billing', icon: 'CreditCard' },
  { key: 'debtors', to: '/admin/debtors', icon: 'AlertTriangle' },
  { key: 'support', to: '/admin/support', icon: 'LifeBuoy' },
  { key: 'staff', to: '/admin/staff', icon: 'UserCog', permission: 'staff.manage' },
  {
    key: 'platform_permissions',
    to: '/admin/permissions',
    icon: 'ShieldCheck',
    permission: 'permissions.manage',
  },
  { key: 'audit', to: '/admin/audit', icon: 'ScrollText', permission: 'audit.read' },
  { key: 'diagnostics', to: '/admin/diagnostics', icon: 'Activity', permission: 'diagnostics.read' },
];

export const homeFor = (role: Role, mustChange: boolean) =>
  mustChange
    ? '/change-password'
    : platformRoles.includes(role)
      ? role === 'platform_owner' || role === 'super_admin'
        ? '/admin'
        : '/admin/tenants'
      : '/app';
