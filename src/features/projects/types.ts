export type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed';
export type Project = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  customer_name: string | null;
  description: string | null;
  status: ProjectStatus;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  forecast_end: string | null;
  archived_at: string | null;
  version: number;
  created_at: string;
};
export type Zone = { id: string; project_id: string; parent_id: string | null; name: string };
export type Member = {
  id: string;
  display_name: string;
  role: string;
  phone: string | null;
  active: boolean;
  warehouses: { id: string; name: string }[];
};
export type Warehouse = { id: string; project_id: string; name: string; account_id: string | null };
export type ProjectDetail = Project & {
  zones: Zone[];
  members: Member[];
  warehouses: Warehouse[];
  counters: { open_tasks: number; overdue_tasks: number; estimates: number; pending_reports: number };
};
export type Employee = {
  id: string;
  login: string;
  display_name: string;
  phone: string | null;
  role: string;
  active: boolean;
  must_change_password: boolean;
  position: string | null;
  hired_at: string | null;
  version: number;
  created_at: string;
  projects: { project_id: string; project_name: string }[];
  telegram_linked: boolean;
};
export type EmployeeDetail = Omit<Employee, 'projects' | 'telegram_linked'> & {
  projects: {
    id: string;
    name: string;
    code: string | null;
    status: ProjectStatus;
    warehouses: { id: string; name: string }[];
  }[];
  overrides: { permission: string; effect: 'grant' | 'deny' }[];
  effective_permissions: string[];
  telegram: { username: string | null; linked_at: string } | null;
};
export const statusTone = {
  planning: 'info',
  active: 'success',
  paused: 'warning',
  completed: 'neutral',
} as const;
