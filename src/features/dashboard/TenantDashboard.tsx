import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, type ListResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { formatDate, formatRelative } from '@/lib/format';
import { Button, EmptyState, PageHeader, Stat } from '@/components/ui';
import { ProjectStatusBadge } from '@/features/projects/ProjectsPage';
import type { Employee, Project } from '@/features/projects/types';

/** Kompaniya bosh sahifasi: faqat mavjud real endpointlardan hisoblanadi; bo'lmagan ko'rsatkich ko'rsatilmaydi. */
export function TenantDashboard() {
  const { t, lang } = useT();
  const { me, can } = useAuth();
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<ListResponse<Project>>('/v1/projects?limit=100'),
    enabled: can('projects'),
  });
  const employees = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<ListResponse<Employee>>('/v1/employees?limit=100'),
    enabled: can('employees'),
  });
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () =>
      api<{
        items: { id: string; title: string; body: string; created_at: string; read_at: string | null }[];
        unread: number;
      }>('/v1/me/notifications?limit=20'),
  });
  const list = projects.data?.items ?? [];
  const active = list.filter((p) => p.status === 'active').length;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title={t('dash.welcome', { name: me?.display_name })}
        description={me?.tenant_name ?? t('dash.sub')}
      />
      <div className="grid-4">
        {can('projects') && (
          <Stat
            accent
            label={t('dash.projects')}
            value={projects.data ? list.length : '—'}
            sub={`${t('dash.projects_active')}: ${projects.data ? active : '—'}`}
          />
        )}
        {can('employees') && (
          <Stat
            label={t('dash.employees')}
            value={employees.data ? employees.data.items.filter((e) => e.active).length : '—'}
          />
        )}
        <Stat label={t('dash.unread')} value={notifications.data?.unread ?? '—'} />
      </div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        {can('projects') && (
          <section className="card">
            <div className="card-header">
              <h3>{t('dash.my_projects')}</h3>
              <Link to="/app/projects" className="text-sm">
                {t('common.all')}
              </Link>
            </div>
            {list.length === 0 ? (
              <EmptyState
                title={can('projects', 'create') ? t('dash.no_projects_admin') : t('dash.no_projects')}
                action={
                  can('projects', 'create') ? (
                    <Link to="/app/projects" className="btn btn-primary">
                      <Plus size={16} /> {t('projects.new')}
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {list.slice(0, 8).map((p) => (
                  <li key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <Link
                      to={`/app/projects/${p.id}`}
                      className="row-between"
                      style={{ padding: '10px 20px', color: 'inherit' }}
                    >
                      <span>
                        <span style={{ fontWeight: 500 }}>{p.name}</span>
                        <small className="muted" style={{ display: 'block' }}>
                          {[p.code, p.customer_name].filter(Boolean).join(' · ')}
                        </small>
                      </span>
                      <span className="row">
                        <small className="muted">{formatDate(p.forecast_end ?? p.planned_end, lang)}</small>
                        <ProjectStatusBadge status={p.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        <section className="card">
          <div className="card-header">
            <h3>{t('dash.recent_notifications')}</h3>
          </div>
          {notifications.data?.items.length ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {notifications.data.items.slice(0, 8).map((n) => (
                <li
                  key={n.id}
                  style={{
                    padding: '10px 20px',
                    borderBottom: '1px solid var(--border)',
                    background: n.read_at ? undefined : 'var(--brand-50)',
                  }}
                >
                  <div style={{ fontWeight: 500, fontSize: 'var(--fs-sm)' }}>{n.title}</div>
                  <div className="text-xs muted" style={{ whiteSpace: 'pre-line' }}>
                    {n.body}
                  </div>
                  <small className="muted">{formatRelative(n.created_at, lang)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t('notif.empty')} />
          )}
        </section>
      </div>
      {!can('projects') && !can('employees') && (
        <div className="card">
          <EmptyState
            title={t('erp.no_project_access')}
            action={
              <Button variant="secondary" onClick={() => (location.href = '/profile')}>
                {t('page.profile')}
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}
