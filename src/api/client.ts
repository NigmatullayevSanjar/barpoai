export const apiBase =
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_API_URL ?? "";
export const liveBackend = Boolean(apiBase);
let accessToken = "";
export function setAccessToken(value: string) {
  accessToken = value;
}
export async function api<T = any>(
  path: string,
  options: { method?: string; body?: unknown; key?: string } = {},
): Promise<T> {
  const res = await fetch(apiBase + path, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.method && options.method !== "GET"
        ? { "Idempotency-Key": options.key ?? crypto.randomUUID() }
        : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.error?.code ?? "API_ERROR");
    if (res.status === 401)
      window.dispatchEvent(new Event("barpo-session-expired"));
    throw error;
  }
  return data;
}
export type CrudAction = "create" | "read" | "update" | "delete";
export type PageRules = Record<string, Record<CrudAction, boolean>>;
export type PermissionSnapshot = {
  role: string;
  pages: PageRules;
  permissions: string[];
  version: number;
};
let snapshot: PermissionSnapshot | null = null;
export function getPermissions() {
  return snapshot;
}
export function setPermissions(value: PermissionSnapshot | null) {
  snapshot = value;
  window.dispatchEvent(new Event("barpo-permissions-changed"));
}
export async function refreshPermissions() {
  const data = await api<PermissionSnapshot>("/v1/me/permissions");
  setPermissions(data);
  return data;
}
export const backendRole = (role: string) =>
  role === "admin" ? "tenant_admin" : role === "technician" ? "support" : role;
export const frontendRole = (role: string) =>
  role === "tenant_admin" ? "admin" : role === "support" ? "technician" : role;
export const pageLabels: Record<string, string> = {
  dashboard: "Bosh sahifa",
  projects: "Obyektlar",
  employees: "Xodimlar",
  estimates: "Smetalar",
  stock: "Ombor va xomashyolar",
  finance: "Moliya",
  tasks: "Vazifalar",
  reports: "Hisobotlar",
  files: "Fayllar",
  integrations: "Integratsiyalar",
  camera: "Kamera kuzatuvi",
  billing: "Obuna",
  settings: "Sozlamalar",
  permissions: "Ruxsatlar",
  audit: "Audit",
  accounting_documents: "Birlamchi hujjatlar",
  invoices: "Hisoblar va dalolatnomalar",
  bank_cash: "Bank va kassa",
  counterparties: "Kontragentlar",
  payroll: "Ish haqi",
  reconciliation: "Solishtirish",
  financial_reports: "Moliyaviy hisobotlar",
  allocations: "Mablag‘ ajratish",
  budgets: "Budjetlar",
  plan_actual: "Reja–fakt",
  forecast: "Prognoz",
  payment_requests: "To‘lov so‘rovlari",
  payment_calendar: "To‘lov kalendari",
};
export function screenPage(screen: number): string | null {
  const financial: Record<number, string> = {
    77: "accounting_documents",
    78: "invoices",
    79: "bank_cash",
    80: "counterparties",
    81: "payroll",
    82: "reconciliation",
    83: "financial_reports",
    84: "allocations",
    88: "budgets",
    89: "plan_actual",
    90: "forecast",
    91: "payment_requests",
    92: "payment_calendar",
    93: "financial_reports",
  };
  if (financial[screen]) return financial[screen];
  if ([1, 2, 27, 28, 52, 53, 60, 74, 75, 85, 86, 96].includes(screen))
    return null;
  if (screen === 0) return "settings";
  if ((screen >= 3 && screen <= 6) || screen === 37) return "employees";
  if ((screen >= 7 && screen <= 7) || (screen >= 15 && screen <= 19))
    return "stock";
  if (screen >= 8 && screen <= 11) return "tasks";
  if (screen === 12 || (screen >= 34 && screen <= 36)) return "estimates";
  if (screen === 13 || screen === 14 || screen === 76 || screen === 87)
    return "dashboard";
  if (screen >= 20 && screen <= 26) return "projects";
  if (
    (screen >= 29 && screen <= 33) ||
    screen === 83 ||
    (screen >= 93 && screen <= 95)
  )
    return "reports";
  if (screen === 38) return "permissions";
  if (screen === 39) return "billing";
  if (screen === 40) return "camera";
  if ((screen >= 77 && screen <= 84) || (screen >= 88 && screen <= 92))
    return "finance";
  return null;
}
