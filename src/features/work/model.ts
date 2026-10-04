import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, qs, type ListResponse } from '@/lib/api';
import { errorMessage, useT } from '@/lib/i18n';
import { useToast } from '@/components/ui/Toast';
import type { Tone } from '@/components/ui';

export type TaskStatus = 'todo' | 'in_progress' | 'submitted' | 'returned' | 'accepted';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type Task = {
  id: string;
  project_id: string;
  zone_id: string | null;
  zone_name: string | null;
  title: string;
  description: string | null;
  assignee_id: string;
  assignee_name: string;
  reviewer_id: string;
  reviewer_name: string;
  priority: Priority;
  deadline: string | null;
  status: TaskStatus;
  overdue: boolean;
  file_count: number;
  version: number;
  created_by: string;
  created_at: string;
};
export type HistoryItem = {
  action: string;
  details: Record<string, unknown>;
  created_at: string;
  actor_name: string | null;
};
export type FileMeta = {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  created_at: string;
  uploaded_by_name?: string;
};
export type TaskDetail = Task & {
  project_name: string;
  created_by_name: string;
  files: FileMeta[];
  history: HistoryItem[];
};
export type Report = {
  id: string;
  project_id: string;
  zone_id: string | null;
  zone_name: string | null;
  author_id: string;
  author_name: string;
  kind: 'daily' | 'weekly';
  report_date: string;
  content: string;
  progress_quantity: string | null;
  estimate_line_id: string | null;
  estimate_line_name: string | null;
  estimate_unit: string | null;
  forecast_end: string | null;
  status: 'submitted' | 'returned' | 'accepted';
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  file_count: number;
  version: number;
  created_at: string;
};
export type ReportDetail = Report & {
  project_name: string;
  estimate_plan_quantity: string | null;
  files: FileMeta[];
  progress: {
    id: string;
    quantity: string;
    corrected_delta: string;
    corrections: {
      id: string;
      quantity_delta: string;
      reason: string;
      created_at: string;
      created_by_name: string;
    }[];
  } | null;
  history: HistoryItem[];
};
export const taskStatuses: TaskStatus[] = ['todo', 'in_progress', 'submitted', 'returned', 'accepted'];
export const priorities: Priority[] = ['low', 'normal', 'high', 'urgent'];
export const statusTone: Record<TaskStatus, Tone> = {
  todo: 'neutral',
  in_progress: 'info',
  submitted: 'warning',
  returned: 'danger',
  accepted: 'success',
};
export const priorityTone: Record<Priority, Tone> = {
  low: 'neutral',
  normal: 'info',
  high: 'warning',
  urgent: 'danger',
};
export const reportTone = { submitted: 'warning', returned: 'danger', accepted: 'success' } as const;
export const workKeys = [
  'tasks',
  'task',
  'reports',
  'report',
  'files',
  'notifications',
  'project',
  'estimate',
  'plan-actual',
];

export function useWorkMutation<T>(
  fn: (v: T) => Promise<unknown>,
  onDone?: (r: unknown) => void,
  successKey = 'tasks.saved',
) {
  const { t } = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r) => {
      await Promise.all(workKeys.map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
      toast.success(t(successKey));
      onDone?.(r);
    },
    onError: (e: ApiError) =>
      toast.error(
        e.code === 'VERSION_CONFLICT' ? t('common.version_conflict') : errorMessage(t, e.code, e.status),
      ),
  });
}
export const useTasks = (projectId: string, filters: { status?: string; mine?: boolean } = {}) =>
  useQuery({
    queryKey: ['tasks', projectId, filters],
    queryFn: () =>
      api<ListResponse<Task>>(`/v1/tasks${qs({ project_id: projectId, limit: 100, ...filters })}`),
    enabled: Boolean(projectId),
  });
export const useTask = (id: string | null) =>
  useQuery({
    queryKey: ['task', id],
    queryFn: () => api<TaskDetail>(`/v1/tasks/${id}`),
    enabled: Boolean(id),
  });
export const useReports = (projectId: string, filters: { status?: string; kind?: string } = {}) =>
  useQuery({
    queryKey: ['reports', projectId, filters],
    queryFn: () =>
      api<ListResponse<Report>>(`/v1/reports${qs({ project_id: projectId, limit: 100, ...filters })}`),
    enabled: Boolean(projectId),
  });
export const useReport = (id: string | null) =>
  useQuery({
    queryKey: ['report', id],
    queryFn: () => api<ReportDetail>(`/v1/reports/${id}`),
    enabled: Boolean(id),
  });
export const useFileContent = (id: string | null) =>
  useQuery({
    queryKey: ['files', id],
    queryFn: () => api<{ id: string; name: string; mime_type: string; base64: string }>(`/v1/files/${id}`),
    enabled: Boolean(id),
    staleTime: Infinity,
  });
/** Fayl tanlash → base64 (data URL prefiksisiz) */
export const readAsBase64 = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(f);
  });
export const daysUntil = (iso: string | null) =>
  iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) : null;
