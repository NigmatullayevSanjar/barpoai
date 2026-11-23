import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ProjectStatus } from '@/features/projects/types';
import type { Priority, TaskStatus } from '@/features/work/model';

/** `/v1/dashboard` javobi: ruxsat bo'lmagan bloklar null. Ta'riflar docs/backend/BARPO_DASHBOARD_METRICS.md. */
export type TaskItem = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  deadline: string | null;
  project_id: string;
  project_name: string;
  mine: boolean;
};
export type ProjectItem = {
  id: string;
  name: string;
  code: string | null;
  status: ProjectStatus;
  planned_start: string | null;
  actual_start: string | null;
  planned_end: string | null;
  forecast_end: string | null;
  responsible_name: string | null;
  open_tasks: number;
  overdue_tasks: number;
  pending_reports: number;
  progress_percent: string | null;
  behind_schedule: boolean;
};
export type Costs = {
  budget_total: string;
  period_budget: string;
  plan_total: string;
  actual_cost: string;
  period_expense: string;
  remaining_budget: string;
  monthly: { month: string; plan: string; budget: string; fact: string }[];
  by_kind: { kind: string; amount: string; share_percent: string | null }[];
  over_budget: {
    id: string;
    name: string;
    code: string | null;
    budget: string;
    actual: string;
    over: string;
  }[];
};
export type StockMove = {
  id: string;
  kind: string;
  status: string;
  quantity: string;
  material_name: string;
  unit_id: string;
  created_at: string;
  project_name: string;
  from_name: string | null;
  to_name: string | null;
  created_by_name: string | null;
};
export type Dashboard = {
  generated_at: string;
  project_id: string | null;
  period: { months: number; from: string; to: string };
  projects: {
    total: number;
    active: number;
    completed: number;
    behind_schedule: number;
    items: ProjectItem[];
  } | null;
  tasks: {
    total: number;
    accepted: number;
    open: number;
    overdue: number;
    due_today: number;
    awaiting_my_review: number;
    my_open: number;
    accepted_period: number;
    items: (TaskItem & { overdue: boolean })[];
    overdue_items: (TaskItem & { assignee_name: string })[];
  } | null;
  reports: { pending_review: number | null; my_returned: number; in_period: number } | null;
  stock: {
    low: number;
    materials: number;
    inventory_value: string | null;
    pending_transfers: number;
    today_receipts: number;
    today_consumptions: number;
    low_items: {
      material_name: string;
      unit_id: string;
      account_name: string;
      project_name: string;
      available: string;
      minimum_quantity: string;
    }[];
    monthly: { month: string; receipts: number; issues: number }[];
    recent: StockMove[];
  } | null;
  costs: Costs | null;
  finance:
    | (Costs & {
        net_cash_flow: string;
        supplier_debt: string;
        advances: string;
        income: string;
        payment_requests: { pending: number; approved: number };
        overdue_payables: { count: number; amount: string };
      })
    | null;
  employees: { active: number; by_role: Record<string, number> } | null;
};

export function useDashboard(projectId: string, months: string) {
  return useQuery({
    queryKey: ['dashboard', projectId, months],
    queryFn: () =>
      api<Dashboard>(`/v1/dashboard?months=${months}${projectId ? `&project_id=${projectId}` : ''}`),
  });
}

/** Foiz (pul emas): faqat ko'rsatish uchun, 0..999 oralig'ida butun son; asos 0 bo'lsa null. */
export const pct = (part: string | number, base: string | number) => {
  const b = Number(base),
    p = Number(part);
  return b > 0 ? Math.min(999, Math.round((p / b) * 100)) : null;
};
