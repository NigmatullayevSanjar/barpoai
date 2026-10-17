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
  area_m2: string | null;
  image_file_id: string | null;
  archived_at: string | null;
  version: number;
  created_at: string;
  /** Ro'yxat kartasi uchun (GET /v1/projects): progress, mas'ul; pul maydonlari narx huquqisiz kelmaydi. */
  progress_percent?: string | null;
  responsible_name?: string | null;
  plan_total?: string;
  fact_total?: string;
};
export type ZoneKind = 'block' | 'entrance' | 'floor' | 'other';
export const zoneKinds: ZoneKind[] = ['block', 'entrance', 'floor', 'other'];
/** Blok holati serverda sanalardan hisoblanadi (qo'lda o'zgartirilmaydi). */
export type ZoneStatus = 'waiting' | 'active' | 'delayed' | 'completed';
export const zoneStatuses: ZoneStatus[] = ['waiting', 'active', 'delayed', 'completed'];
export type Zone = {
  id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  kind: ZoneKind;
  floors_count: number | null;
  version: number;
  area_m2: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  image_file_id: string | null;
  status: ZoneStatus;
  responsibles: { id: string; display_name: string }[];
  /** Faqat blok uchun va narxlarni ko'rish huquqi bo'lsa; aks holda null. */
  estimate_total: string | null;
};
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

export type PremiseKind = 'apartment' | 'commercial' | 'parking' | 'storage';
export const premiseKinds: PremiseKind[] = ['apartment', 'commercial', 'parking', 'storage'];
export type Premise = {
  id: string;
  project_id: string;
  zone_id: string | null;
  block_zone_id: string | null;
  number: string;
  kind: PremiseKind;
  rooms: number | null;
  floor: number | null;
  area_m2: string;
  archived_at: string | null;
  version: number;
  zone_name: string | null;
  zone_kind: ZoneKind | null;
  block_name: string | null;
  plan_file_id: string | null;
  /** Oxirgi narx varaqasidagi qiymat; huquq yo'q yoki varaqada yo'q bo'lsa null. */
  cost: string | null;
  created_at: string;
  updated_at: string;
};
export type PremiseList = {
  items: Premise[];
  total_count: number;
  total_area_m2: string;
  /** Xonalar soni filtriga e'tibor bermaydi: blok sahifasidagi guruhlar shundan quriladi. */
  by_rooms: { rooms: number | null; count: number }[];
};
export type PremiseImportAction = 'create' | 'update' | 'unchanged' | 'error';
export type PremiseImportSummary = Record<PremiseImportAction, number>;
export type PremiseImportRow = {
  row: number;
  block: string | null;
  entrance: string | null;
  floor: number | string | null;
  number: string | null;
  kind: string | null;
  rooms: number | string | null;
  area_m2: string | null;
  zone_id: string | null;
  action: PremiseImportAction;
  premise_id: string | null;
  version: number | null;
  errors: { field: string; code: string }[];
};
export type PremiseImportPreview = {
  id: string | null;
  digest: string | null;
  expires_at: string | null;
  summary: PremiseImportSummary;
  rows: PremiseImportRow[];
};
