import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { pageRoutes, type Page } from '@/lib/permissions';

type Target = {
  id: string;
  kind: string;
  project_id: string | null;
  read_at: string | null;
  payload?: Record<string, unknown> | null;
};

/**
 * Backend `notify` turlari → sahifa:
 * task.* → vazifalar; report.*, progress.corrected → hisobotlar; stock.* → ombor (tegishli bo'lim);
 * payment.* → to'lov so'rovlari; billing.*, support.response → obuna; platform.correction → audit.
 */
const pageFor = (kind: string): Page | null => {
  switch (kind.split('.')[0]) {
    case 'task':
      return 'tasks';
    case 'report':
    case 'progress':
      return 'reports';
    case 'stock':
      return 'stock';
    case 'payment':
      return 'payment_requests';
    case 'billing':
    case 'support':
      return 'billing';
    case 'platform':
      return 'audit';
    default:
      return null;
  }
};
/** Obyekt tanlovini URL'dan (?project=) o'qiydigan sahifalar (useProjectSelection). */
const projectScoped: Page[] = ['tasks', 'reports', 'stock'];
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

/** Ombor bildirishnomasi qaysi bo'limni ochadi (menyu bandlari bilan bir xil so'rov parametrlari). */
function stockSection(kind: string, params: URLSearchParams) {
  if (kind === 'stock.low') params.set('tab', 'balances');
  else if (kind === 'stock.transfer') {
    // Chiqim faqat qabul qiluvchiga (prorab) keladi: harakatlardagi chiqimlar.
    params.set('tab', 'movements');
    params.set('kind', 'transfer');
  } else if (kind === 'stock.consumption' || kind === 'stock.return') params.set('tab', 'movements');
}

/** Bildirishnoma ochiladigan sahifa va marshrut; noma'lum tur uchun null. */
export function notificationTarget(n: Pick<Target, 'kind' | 'project_id' | 'payload'>): {
  page: Page | null;
  to: string;
} | null {
  // Kompaniya murojaati platforma xodimlariga keladi.
  if (n.kind === 'support.request') return { page: null, to: '/admin/support' };
  const page = pageFor(n.kind);
  if (!page) return null;
  const params = new URLSearchParams();
  if (n.project_id && projectScoped.includes(page)) params.set('project', n.project_id);
  const payload = n.payload ?? {};
  if (page === 'tasks' && str(payload.task_id)) params.set('task', str(payload.task_id)!);
  if (page === 'reports' && str(payload.report_id)) params.set('report', str(payload.report_id)!);
  if (page === 'stock') stockSection(n.kind, params);
  const query = params.toString();
  return { page, to: query ? `${pageRoutes[page]}?${query}` : pageRoutes[page] };
}

/**
 * Bildirishnomani bosish: kelgan sahifasiga o'tadi va o'qilmagan bo'lsa o'qilgan deb belgilaydi.
 * Rolda o'sha sahifa ruxsati bo'lmasa (masalan, ruxsat matritsasi o'zgargan) — obyekt sahifasiga, u ham bo'lmasa joyida qoladi.
 */
export function useOpenNotification() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  return (n: Target) => {
    const target = notificationTarget(n);
    if (target && (!target.page || can(target.page, 'read'))) navigate(target.to);
    else if (target && n.project_id && can('projects', 'read')) navigate(`/app/projects/${n.project_id}`);
    if (!n.read_at)
      api('/v1/me/notifications/read', { method: 'POST', body: { ids: [n.id] } })
        .then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
        // Belgilash o'tmasa bildirishnoma o'qilmagan bo'lib qoladi; o'tish allaqachon bajarilgan.
        .catch(() => undefined);
  };
}

/** Sahifadagi ochiq yozuv (drawer) URL so'rov parametrida: bildirishnoma havolasi shu yozuvni ochadi. */
export function useRecordParam(key: string) {
  const [params, setParams] = useSearchParams();
  const value = params.get(key);
  const set = useCallback(
    (id: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set(key, id);
          else next.delete(key);
          return next;
        },
        { replace: true },
      ),
    [key, setParams],
  );
  return [value, set] as const;
}
