import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { pageRoutes, type Page } from '@/lib/permissions';

type Target = { id: string; kind: string; project_id: string | null; read_at: string | null };

/** Backend `notify` turlari (task.*, report.*, progress.*, stock.*, payment.*, billing.*, support.*) → sahifa. */
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
    default:
      return null;
  }
};
/** Obyekt tanlovini URL'dan (?project=) o'qiydigan sahifalar (useProjectSelection). */
const projectScoped: Page[] = ['tasks', 'reports', 'stock'];

/** Bildirishnoma ochiladigan marshrut; noma'lum tur uchun null. Sahifalarda alohida yozuvni ochish yo'q, shuning uchun ro'yxat sahifasi. */
export function notificationTarget(n: Pick<Target, 'kind' | 'project_id'>): string | null {
  // Kompaniya murojaati platforma xodimlariga keladi; javob esa kompaniya billing sahifasiga qaytadi.
  if (n.kind === 'support.request') return '/admin/support';
  const page = pageFor(n.kind);
  if (!page) return null;
  const params = new URLSearchParams();
  if (n.project_id && projectScoped.includes(page)) params.set('project', n.project_id);
  // Jo'natish, sarf va qaytarish tasdiq kutadi — ombor sahifasining «Harakatlar» tabida.
  if (['stock.transfer', 'stock.consumption', 'stock.return'].includes(n.kind))
    params.set('tab', 'movements');
  // Jo'natma faqat brigadirga keladi: uning "Material qabul" bo'limi (menyu bandi bilan bir xil manzil).
  if (n.kind === 'stock.transfer') params.set('kind', 'transfer');
  const query = params.toString();
  return query ? `${pageRoutes[page]}?${query}` : pageRoutes[page];
}

/** Bildirishnomani bosish: tegishli sahifaga o'tadi va o'qilmagan bo'lsa o'qilgan deb belgilaydi. */
export function useOpenNotification() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (n: Target) => {
    const to = notificationTarget(n);
    if (to) navigate(to);
    if (!n.read_at)
      api('/v1/me/notifications/read', { method: 'POST', body: { ids: [n.id] } })
        .then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
        // Belgilash o'tmasa bildirishnoma o'qilmagan bo'lib qoladi; o'tish allaqachon bajarilgan.
        .catch(() => undefined);
  };
}
