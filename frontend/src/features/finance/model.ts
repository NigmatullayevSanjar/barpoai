import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, qs, type ListResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatMonth } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';
import type { Tone } from '@/components/ui';

export type DocKind =
  | 'allocation'
  | 'purchase_order'
  | 'supplier_invoice'
  | 'opening_debt'
  | 'labor'
  | 'equipment'
  | 'service'
  | 'payment'
  | 'receipt'
  | 'advance'
  | 'advance_offset'
  | 'cash_transfer'
  | 'reversal';
export const payableKinds: DocKind[] = ['supplier_invoice', 'opening_debt', 'labor', 'equipment', 'service'];
export const cashKinds: DocKind[] = ['payment', 'receipt', 'advance', 'cash_transfer'];
export const allocationKinds: DocKind[] = ['allocation', 'purchase_order'];
export type FinanceDocument = {
  id: string;
  project_id: string;
  kind: DocKind;
  amount: string;
  counterparty_id: string | null;
  counterparty_name: string | null;
  cash_account_id: string | null;
  cash_account_name: string | null;
  cash_account_kind: 'bank' | 'cash' | null;
  target_cash_account_name: string | null;
  matched_receipt_id: string | null;
  matched_material_name: string | null;
  allocated_invoice_id: string | null;
  allocated_invoice_description: string | null;
  reverses_id: string | null;
  reference: string | null;
  external_ref: string | null;
  description: string;
  document_date: string;
  due_date: string | null;
  created_by_name: string;
  created_at: string;
  outstanding: string | null;
  /** Qarz hujjatlari uchun to'langan qismi (serverda); boshqa turlarda null */
  paid: string | null;
  /** Qarz hujjatini shu obyektdagi kontragent avansidan yopish mumkin bo'lgan summa (serverda); boshqa turlarda null */
  advance_offsettable: string | null;
  reversed: boolean;
  zone_name: string | null;
};
/** GET /v1/finance/documents `summary` — Figma F5 KPI kartalari (ro'yxat filtri bilan, sahifalashsiz) */
export type DocsSummary = {
  count: number;
  total: string;
  outstanding: string;
  paid_count: number;
  open_count: number;
  overdue_count: number;
};
export type Counterparty = {
  id: string;
  name: string;
  kind: 'supplier' | 'contractor' | 'customer' | 'employee';
  inn: string | null;
  phone: string | null;
  contact: string | null;
  bank_details: string | null;
  note: string | null;
  employee_id: string | null;
  archived_at: string | null;
  version: number;
  debt: string;
  advance: string;
  /** Muddati o'tgan qarz hujjatlari qoldig'i (serverda) */
  overdue: string;
  last_activity: string | null;
};
export type CounterpartiesSummary = { debt: string; advance: string; overdue: string };
export type CashAccount = {
  id: string;
  name: string;
  kind: 'bank' | 'cash';
  account_number: string | null;
  bank_name: string | null;
  archived_at: string | null;
  version: number;
  balance: string;
};
export type Summary = {
  actual_cost: string;
  inventory_value: string;
  net_cash_flow: string;
  supplier_debt: string;
  advances: string;
  income: string;
  allocations: string;
  purchase_orders: string;
  monthly: { month: string; expense: string; cash_out: string; cash_in: string; budget: string }[];
  by_kind: { kind: DocKind; count: number; amount: string }[];
  top_debt: { id: string; name: string; kind: string; debt: string; advance: string }[];
  by_project: {
    id: string;
    name: string;
    code: string | null;
    actual_cost: string;
    debt: string;
    budget: string;
  }[];
};
export type Payable = {
  id: string;
  kind: DocKind;
  amount: string;
  document_date: string;
  due_date: string | null;
  description: string;
  reference: string | null;
  project_id: string;
  project_name: string;
  counterparty_id: string | null;
  counterparty_name: string | null;
  outstanding: string;
  overdue: boolean;
};
export type PaymentRequest = {
  id: string;
  project_id: string;
  project_name: string;
  counterparty_id: string;
  counterparty_name: string;
  document_id: string | null;
  document_kind: DocKind | null;
  document_description: string | null;
  amount: string;
  due_date: string | null;
  purpose: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid' | 'cancelled';
  requested_by: string;
  requested_by_name: string;
  approved_by_name: string | null;
  decision_note: string | null;
  payment_document_id: string | null;
  version: number;
  created_at: string;
};
export type PayrollPeriod = {
  id: string;
  project_id: string;
  month: string;
  status: 'open' | 'posted' | 'closed';
  posted_at: string | null;
  posted_by_name: string | null;
  entries: number;
  total: string;
  paid: string;
  /** Oklad + bonus (ish haqi fondi) va to'lanmagan qoldiq — serverda */
  gross: string;
  due: string;
  /** V-C: akkord jami va ochiq davrda kutilayotgan akkord (brigadir bo'yicha) — serverda */
  piece_total: string;
  piece_pending?: { employee_id: string; employee_name: string; amount: string }[];
  version: number;
};
export type PayrollEntry = {
  id: string;
  period_id: string;
  employee_id: string;
  employee_name: string;
  employee_role: string;
  position: string | null;
  base_salary: string;
  bonus: string;
  deduction: string;
  piece_rate: string;
  net: string;
  /** posted yozuvda: avansdan hisoblanadigan va kassadan to'lanadigan qism — serverda */
  advance_available?: string | null;
  cash_due?: string | null;
  note: string | null;
  status: 'pending' | 'posted' | 'paid';
  labor_document_id: string | null;
  payment_document_id: string | null;
  version: number;
};
export type Budget = {
  project_id: string;
  month: string;
  amount: string;
  version: number;
  actual: string;
  remaining: string;
  percent: string | null;
};
export type BudgetYear = {
  year: number;
  months: number;
  amount: string;
  actual: string;
  remaining: string;
  percent: string | null;
};
export type BudgetTotals = { amount: string; actual: string; remaining: string; percent: string | null };
/** GET /v1/finance/calendar — muddatli hujjatlar, ochiq so'rovlar, bajarilgan to'lovlar va KPI (Figma F5) */
export type CalendarData = {
  documents: {
    id: string;
    kind: DocKind;
    due_date: string;
    description: string;
    reference: string | null;
    project_name: string;
    counterparty_name: string | null;
    outstanding: string;
  }[];
  requests: {
    id: string;
    amount: string;
    due_date: string;
    purpose: string;
    status: PaymentRequest['status'];
    project_name: string;
    counterparty_name: string;
  }[];
  payments: {
    id: string;
    document_date: string;
    amount: string;
    description: string;
    reference: string | null;
    project_name: string;
    counterparty_name: string | null;
  }[];
  overdue: { amount: string; count: number };
  summary: {
    today_count: number;
    today_amount: string;
    week_count: number;
    week_amount: string;
    month_count: number;
    month_amount: string;
  };
};
export type PlanActual = {
  totals: { plan_value: string; fact_value: string; variance: string; percent: string | null };
  by_kind: { kind: string; plan_value: string; plan_qty: string; fact_value: string }[];
  by_category: {
    category: string;
    kind: string;
    lines: number;
    plan_value: string;
    fact_value: string | null;
  }[];
  lines: {
    id: string;
    kind: string;
    category: string | null;
    description: string;
    unit_id: string;
    plan_qty: string;
    plan_value: string;
    zone_name: string | null;
    estimate_name: string;
    fact_qty: string;
    fact_value: string | null;
  }[];
  by_zone: {
    zone_name: string;
    kind: string;
    lines: number;
    plan_qty: string;
    plan_value: string;
    fact_qty: string;
    percent: string | null;
  }[];
  monthly: { month: string; plan_value: string; fact_value: string; budget: string }[];
};
export type Forecast = {
  plan_total: string;
  budget_total: string;
  actual_cost: string;
  remaining_plan: string;
  monthly_burn: string;
  months_used: number;
  months_left: number | null;
  projected_remaining_spend: string | null;
  projected_total: string | null;
  projected_variance: string | null;
  months_of_runway: number | null;
  end_date: string | null;
  recent: { month: string; expense: string }[];
};
export type FinanceReports = {
  cash_flow: { month: string; account: string; kind: string; inflow: string; outflow: string }[];
  expenses: { project: string; month: string; material: string; other: string; total: string }[];
  aging: { counterparty: string; current: string; d30: string; d90: string; older: string; total: string }[];
  income: string;
};

export const kindTone: Record<DocKind, Tone> = {
  allocation: 'info',
  purchase_order: 'info',
  supplier_invoice: 'warning',
  opening_debt: 'neutral',
  labor: 'brand',
  equipment: 'brand',
  service: 'brand',
  payment: 'success',
  receipt: 'success',
  advance: 'warning',
  advance_offset: 'info',
  cash_transfer: 'neutral',
  reversal: 'danger',
};
export const financeKeys = [
  'finance-docs',
  'finance-summary',
  'finance-payables',
  'finance-calendar',
  'payment-requests',
  'payroll',
  'budgets',
  'counterparties',
  'cash-balances',
  'statement',
  'plan-actual',
  'forecast',
  'finance-reports',
  'notifications',
  'stock-overview',
  'search-select',
];

export function useFinanceMutation<T>(
  fn: (v: T) => Promise<unknown>,
  onDone?: (result: unknown) => void,
  successKey = 'fin.saved',
) {
  const { t } = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result) => {
      await Promise.all(financeKeys.map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
      toast.success(t(successKey));
      onDone?.(result);
    },
    onError: (e: ApiError) =>
      toast.error(
        e.code === 'VERSION_CONFLICT' ? t('common.version_conflict') : errorMessage(t, e.code, e.status),
      ),
  });
}
export const usePricesVisible = () => {
  const { me, permissions } = useAuth();
  return me?.role === 'tenant_admin' || Boolean(permissions?.permissions.includes('prices.read'));
};
export const useSummary = (projectId: string) =>
  useQuery({
    queryKey: ['finance-summary', projectId],
    queryFn: () => api<Summary>(`/v1/finance/summary${qs({ project_id: projectId || undefined })}`),
  });
export const useDocuments = (
  projectId: string,
  filters: {
    kind?: string;
    counterparty_id?: string;
    from?: string;
    to?: string;
    unpaid?: boolean;
    cash_kind?: string;
  } = {},
  page: { offset: number; limit: number },
) =>
  useQuery({
    queryKey: ['finance-docs', projectId, filters, page.offset, page.limit],
    queryFn: () =>
      api<ListResponse<FinanceDocument> & { summary?: DocsSummary }>(
        `/v1/finance/documents${qs({ project_id: projectId, ...filters, limit: page.limit, offset: page.offset })}`,
      ),
    enabled: Boolean(projectId),
  });
export const useCounterparties = (opts: { q?: string; kind?: string; offset: number; limit: number }) =>
  useQuery({
    queryKey: ['counterparties', opts.q, opts.kind, opts.offset, opts.limit],
    queryFn: () =>
      api<ListResponse<Counterparty> & { summary?: CounterpartiesSummary }>(
        `/v1/counterparties${qs({ q: opts.q || undefined, kind: opts.kind || undefined, limit: opts.limit, offset: opts.offset })}`,
      ),
  });
export const useCashBalances = () =>
  useQuery({
    queryKey: ['cash-balances'],
    queryFn: () =>
      api<ListResponse<CashAccount> & { summary?: { bank: string; cash: string } }>(
        '/v1/finance/cash-balances',
      ),
  });
export const usePayables = (
  projectId: string,
  filters: { counterparty_id?: string; overdue?: boolean } = {},
  page: { offset: number; limit: number },
) =>
  useQuery({
    queryKey: ['finance-payables', projectId, filters, page.offset, page.limit],
    queryFn: () =>
      api<ListResponse<Payable>>(
        `/v1/finance/payables${qs({ project_id: projectId || undefined, ...filters, limit: page.limit, offset: page.offset })}`,
      ),
  });
export const usePaymentRequests = (
  projectId: string,
  status: string | undefined,
  page: { offset: number; limit: number },
) =>
  useQuery({
    queryKey: ['payment-requests', projectId, status, page.offset, page.limit],
    queryFn: () =>
      api<ListResponse<PaymentRequest>>(
        `/v1/finance/payment-requests${qs({ project_id: projectId || undefined, status, limit: page.limit, offset: page.offset })}`,
      ),
  });
export const useBudgets = (projectId: string) =>
  useQuery({
    queryKey: ['budgets', projectId],
    queryFn: () =>
      api<ListResponse<Budget> & { yearly: BudgetYear[]; summary: BudgetTotals }>(
        `/v1/budgets?project_id=${projectId}&limit=100`,
      ),
    enabled: Boolean(projectId),
  });
/** "YYYY-MM-01" → "Oktyabr 2026"; lug'atdagi oy nomi (Intl emas — brauzerga qarab "M10" chiqardi). */
export const monthLabel = (iso: string, lang: 'uz' | 'ru') => formatMonth(iso, lang);
export const num = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === '' ? 0 : Number(v);
