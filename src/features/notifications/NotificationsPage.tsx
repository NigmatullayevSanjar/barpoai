import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck } from 'lucide-react';
import { api, ApiError, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDateTime } from '@/lib/format';
import { Alert, Button, EmptyState, PageHeader, Pagination, Segmented } from '@/components/ui';

type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  project_id: string | null;
  read_at: string | null;
  created_at: string;
};
const LIMIT = 30;
/** Bildirishnomalar sahifasi: barchasi/o'qilmaganlar, sahifalash, o'qildi deb belgilash, obyektga o'tish. */
export function NotificationsPage() {
  const { t, lang } = useT();
  const { isPlatform } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: ['notifications', 'page', filter, offset],
    queryFn: () =>
      api<{ items: Notification[]; unread: number; total: number }>(
        `/v1/me/notifications${qs({ limit: LIMIT, offset, unread: filter === 'unread' ? true : undefined })}`,
      ),
  });
  const mark = useMutation({
    mutationFn: (ids: string[]) => api('/v1/me/notifications/read', { method: 'POST', body: { ids } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const d = query.data;
  const count = filter === 'unread' ? (d?.unread ?? 0) : (d?.total ?? 0);
  return (
    <div className="content-narrow stack" style={{ gap: 14 }}>
      <PageHeader
        title={t('notif.title')}
        description={t('notifpage.sub')}
        actions={
          (d?.unread ?? 0) > 0 ? (
            <Button
              variant="secondary"
              icon={<CheckCheck />}
              loading={mark.isPending}
              onClick={() => mark.mutate([])}
            >
              {t('notif.mark_all')}
            </Button>
          ) : undefined
        }
      />
      <div className="toolbar">
        <Segmented<'all' | 'unread'>
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setOffset(0);
          }}
          items={[
            { key: 'all', label: `${t('notif.all')}${d ? ` (${d.total})` : ''}` },
            { key: 'unread', label: `${t('notif.unread')}${d ? ` (${d.unread})` : ''}` },
          ]}
        />
      </div>
      {query.isError && (
        <Alert tone="danger">
          {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
        </Alert>
      )}
      <section className="card">
        {d && d.items.length === 0 ? (
          <EmptyState title={filter === 'unread' ? t('notif.empty') : t('notifpage.empty_all')} />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {d?.items.map((n) => (
              <li
                key={n.id}
                className="row-between"
                style={{
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '12px 20px',
                  borderBottom: '1px solid var(--border)',
                  background: n.read_at ? undefined : 'var(--brand-50)',
                }}
              >
                <div className="grow">
                  <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>{n.title}</div>
                  <div className="text-sm" style={{ whiteSpace: 'pre-line' }}>
                    {n.body}
                  </div>
                  <small className="muted">
                    {formatDateTime(n.created_at, lang)}
                    {n.project_id && !isPlatform && (
                      <>
                        {' · '}
                        <Link to={`/app/projects/${n.project_id}`}>{t('notifpage.open_project')}</Link>
                      </>
                    )}
                  </small>
                </div>
                {!n.read_at && (
                  <Button size="sm" variant="ghost" onClick={() => mark.mutate([n.id])}>
                    {t('notifpage.mark_read')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {count > LIMIT && <Pagination offset={offset} limit={LIMIT} count={count} onChange={setOffset} />}
      </section>
    </div>
  );
}
