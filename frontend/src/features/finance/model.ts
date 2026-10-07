import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, qs, type ListResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
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
  reversed: boolean;
  zone_name: string | null;
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
};
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
  net: string;
  note: string | null;
  status: 'pending' | 'posted' | 'paid';
  labor_document_id: string | null;
  payment_document_id: string | null;
  version: number;
};
export type Budget = { project_id: string; month: string; amount: string; version: number };

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
  filters: { kind?: string; counterparty_id?: string; from?: string; to?: string } = {},
) =>
  useQuery({
    queryKey: ['finance-docs', projectId, filters],
    queryFn: () =>
      api<ListResponse<FinanceDocument>>(
        `/v1/finance/documents${qs({ project_id: projectId, limit: 100, ...filters })}`,
      ),
    enabled: Boolean(projectId),
  });
export const useCounterparties = () =>
  useQuery({
    queryKey: ['counterparties'],
    queryFn: () => api<ListResponse<Counterparty>>('/v1/counterparties?limit=100'),
  });
export const useCashBalances = () =>
  useQuery({
    queryKey: ['cash-balances'],
    queryFn: () => api<ListResponse<CashAccount>>('/v1/finance/cash-balances'),
  });
export const usePayables = (
  projectId: string,
  filters: { counterparty_id?: string; overdue?: boolean } = {},
) =>
  useQuery({
    queryKey: ['finance-payables', projectId, filters],
    queryFn: () =>
      api<ListResponse<Payable>>(
        `/v1/finance/payables${qs({ project_id: projectId || undefined, limit: 100, ...filters })}`,
      ),
  });
export const usePaymentRequests = (projectId: string, status?: string) =>
  useQuery({
    queryKey: ['payment-requests', projectId, status],
    queryFn: () =>
      api<ListResponse<PaymentRequest>>(
        `/v1/finance/payment-requests${qs({ project_id: projectId || undefined, status, limit: 100 })}`,
      ),
  });
export const useBudgets = (projectId: string) =>
  useQuery({
    queryKey: ['budgets', projectId],
    queryFn: () => api<ListResponse<Budget>>(`/v1/budgets?project_id=${projectId}&limit=100`),
    enabled: Boolean(projectId),
  });
export const monthLabel = (iso: string, lang: 'uz' | 'ru') =>
  new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
export const num = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === '' ? 0 : Number(v);
