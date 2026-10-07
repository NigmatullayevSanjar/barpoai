import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatMoney, formatQuantity, formatRelative } from '@/lib/format';
import { Alert, Badge, EmptyState, PageHeader, Stat, type Tone } from '@/components/ui';
import { ProjectStatusBadge } from '@/features/projects/ProjectsPage';
import type { ProjectStatus } from '@/features/projects/types';
import { priorityTone, statusTone, type Priority, type TaskStatus } from '@/features/work/model';

type Dashboard = {
  generated_at: string;
  projects: {
    total: number;
    active: number;
    completed: number;
    behind_schedule: number;
    items: {
      id: string;
      name: string;
      code: string | null;
      status: ProjectStatus;
      planned_end: string | null;
      forecast_end: string | null;
      open_tasks: number;
      overdue_tasks: number;
      pending_reports: number;
      progress_percent: string | null;
      behind_schedule: boolean;
    }[];
  } | null;
  tasks: {
    open: number;
    overdue: number;
    due_today: number;
    awaiting_my_review: number;
    my_open: number;
    accepted_30d: number;
    items: {
      id: string;
      title: string;
      status: TaskStatus;
      priority: Priority;
      deadline: string | null;
      project_id: string;
      project_name: string;
      mine: boolean;
      overdue: boolean;
    }[];
  } | null;
  reports: { pending_review: number | null; my_returned: number; last_7d: number } | null;
  stock: {
    low: number;
    materials: number;
    inventory_value: string | null;
    pending_requests: number;
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
  } | null;
  finance: {
    budget_total: string;
    budget_month: string;
    plan_total: string;
    actual_cost: string;
    month_expense: string;
    remaining_budget: string;
    net_cash_flow: string;
    supplier_debt: string;
    advances: string;
    income: string;
    payment_requests: { pending: number; approved: number };
    overdue_payables: { count: number; amount: string };
  } | null;
  employees: { active: number; by_role: Record<string, number> } | null;
};
type Notification = { id: string; title: string; body: string; created_at: string; read_at: string | null };

const pct = (fact: string, plan: string) => {
  const p = Number(plan),
    f = Number(fact);
  return p > 0 ? Math.min(999, Math.round((f / p) * 100)) : null;
};
function Progress({ value, bad }: { value: number | null; bad?: boolean }) {
  if (value === null) return <span className="muted text-xs">—</span>;
  return (
    <span className={`progress ${(bad ?? value > 100) ? 'bad' : 'ok'}`} title={`${value}%`}>
      <span style={{ width: `${Math.min(100, value)}%` }} />
    </span>
  );
}

/** Kompaniya bosh sahifasi: bitta /v1/dashboard javobidan; ruxsat bo'lmagan bloklar null bo'lib, ko'rsatilmaydi. */
export function TenantDashboard() {
  const { t, lang } = useT();
  const { me, can } = useAuth();
  const query = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/v1/dashboard') });
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ items: Notification[]; unread: number }>('/v1/me/notifications?limit=20'),
  });
  const d = query.data;
  const m = (v: string | null | undefined) => (v == null ? '—' : formatMoney(v, lang, false));
  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        title={t('dash.welcome', { name: me?.display_name })}
        description={me?.tenant_name ?? t('dash.sub')}
      />
      {query.isError && (
        <Alert tone="danger">
          {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
        </Alert>
      )}
      <div className="grid-4">
        {d?.projects && (
          <Stat
            accent
            label={t('dash.projects_total')}
            value={d.projects.total}
            sub={`${t('dash.projects_active')}: ${d.projects.active} · ${t('dash.behind')}: ${d.projects.behind_schedule}`}
          />
        )}
        {d?.tasks && (
          <Stat
            label={t('dash.tasks_open')}
            value={d.tasks.open}
            sub={`${t('dash.tasks_overdue')}: ${d.tasks.overdue} · ${t('dash.due_today')}: ${d.tasks.due_today}`}
          />
        )}
        {d?.reports &&
          (d.reports.pending_review !== null ? (
            <Stat
              label={t('dash.reports_pending')}
              value={d.reports.pending_review}
              sub={`${t('dash.reports_7d')}: ${d.reports.last_7d}`}
            />
          ) : (
            <Stat
              label={t('dash.my_returned')}
              value={d.reports.my_returned}
              sub={`${t('dash.reports_7d')}: ${d.reports.last_7d}`}
            />
          ))}
        {d?.finance ? (
          <Stat
            label={t('dash.remaining')}
            value={m(d.finance.remaining_budget)}
            sub={`${t('dash.budget_total')}: ${m(d.finance.budget_total)}`}
          />
        ) : d?.stock ? (
          <Stat
            label={t('dash.stock_low')}
            value={d.stock.low}
            sub={`${t('dash.requests_pending')}: ${d.stock.pending_requests}`}
          />
        ) : d?.employees ? (
          <Stat label={t('dash.employees_active')} value={d.employees.active} />
        ) : null}
      </div>
      {!d && !query.isError && <div className="skeleton" style={{ height: 120 }} />}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {d?.projects && (
          <section className="card">
            <div className="card-header">
              <h3>{t('dash.my_projects')}</h3>
              <Link to="/app/projects" className="text-sm">
                {t('common.all')}
              </Link>
            </div>
            {d.projects.items.length === 0 ? (
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
                {d.projects.items.slice(0, 8).map((p) => (
                  <li key={p.id} style={{ borderBottom: '1px solid var(--border)', padding: '10px 20px' }}>
                    <div className="row-between">
                      <Link to={`/app/projects/${p.id}`} style={{ fontWeight: 500, color: 'inherit' }}>
                        {p.code ? `${p.code} · ` : ''}
                        {p.name}
                      </Link>
                      <span className="row">
                        {p.behind_schedule && <Badge tone="warning">{t('dash.behind')}</Badge>}
                        <ProjectStatusBadge status={p.status} />
                      </span>
                    </div>
                    <div className="row-between" style={{ marginTop: 6, gap: 12 }}>
                      <div className="grow" style={{ maxWidth: 260 }}>
                        <Progress
                          value={p.progress_percent === null ? null : Math.round(Number(p.progress_percent))}
                          bad={false}
                        />
                      </div>
                      <small className="muted">
                        {p.progress_percent === null
                          ? t('dash.no_progress')
                          : `${Math.round(Number(p.progress_percent))}%`}{' '}
                        · {t('dash.open_tasks_short', { n: p.open_tasks })}
                        {p.overdue_tasks > 0 && (
                          <span style={{ color: 'var(--danger)' }}>
                            {' '}
                            · {t('dash.overdue_short', { n: p.overdue_tasks })}
                          </span>
                        )}
                        {p.pending_reports > 0 &&
                          ` · ${t('dash.pending_reports_short', { n: p.pending_reports })}`}
                        {' · '}
                        {formatDate(p.forecast_end ?? p.planned_end, lang)}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {d?.tasks && (
          <section className="card">
            <div className="card-header">
              <h3>{t('dash.my_tasks')}</h3>
              <span className="row text-sm muted">
                {t('dash.my_open')}: {d.tasks.my_open}
                {d.tasks.awaiting_my_review > 0 &&
                  ` · ${t('dash.awaiting_review')}: ${d.tasks.awaiting_my_review}`}
              </span>
            </div>
            {d.tasks.items.length === 0 ? (
              <EmptyState title={t('dash.no_tasks')} />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {d.tasks.items.map((task) => (
                  <li key={task.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <Link
                      to={`/app/tasks?project=${task.project_id}`}
                      className="row-between"
                      style={{ padding: '10px 20px', color: 'inherit', gap: 10 }}
                    >
                      <span className="grow">
                        <span style={{ fontWeight: 500 }}>{task.title}</span>
                        <small className="muted" style={{ display: 'block' }}>
                          {task.project_name}
                          {task.deadline && ` · ${formatDate(task.deadline, lang)}`}
                        </small>
                      </span>
                      <span className="row">
                        {task.overdue && <Badge tone="danger">{t('tasks.overdue')}</Badge>}
                        <Badge tone={priorityTone[task.priority] as Tone}>
                          {t(`tasks.priority.${task.priority}`)}
                        </Badge>
                        <Badge tone={statusTone[task.status] as Tone}>
                          {t(`tasks.status.${task.status}`)}
                        </Badge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {d?.finance && (
          <section className="card">
            <div className="card-header">
              <h3>{t('dash.finance')}</h3>
              <Link to="/app/finance" className="text-sm">
                {t('common.all')}
              </Link>
            </div>
            <div className="card-pad stack" style={{ gap: 10 }}>
              {(() => {
                const base =
                  Number(d.finance.budget_total) > 0 ? d.finance.budget_total : d.finance.plan_total;
                const used = pct(d.finance.actual_cost, base);
                return (
                  <>
                    <div className="row-between text-sm">
                      <span>{t('dash.budget_used')}</span>
                      <b>{used === null ? '—' : `${used}%`}</b>
                    </div>
                    <Progress value={used} />
                    {Number(d.finance.budget_total) === 0 && (
                      <small className="muted">{t('dash.no_budget')}</small>
                    )}
                  </>
                );
              })()}
              <dl className="kv">
                <dt>{t('dash.actual_cost')}</dt>
                <dd>{m(d.finance.actual_cost)}</dd>
                <dt>{t('dash.month_expense')}</dt>
                <dd>
                  {m(d.finance.month_expense)}
                  {Number(d.finance.budget_month) > 0 && (
                    <small className="muted"> / {m(d.finance.budget_month)}</small>
                  )}
                </dd>
                <dt>{t('dash.debt')}</dt>
                <dd style={{ color: Number(d.finance.supplier_debt) > 0 ? 'var(--danger)' : undefined }}>
                  {m(d.finance.supplier_debt)}
                </dd>
                <dt>{t('dash.overdue_payables')}</dt>
                <dd>
                  {m(d.finance.overdue_payables.amount)}
                  <small className="muted"> ({d.finance.overdue_payables.count})</small>
                </dd>
                <dt>{t('dash.cash')}</dt>
                <dd>{m(d.finance.net_cash_flow)}</dd>
                <dt>{t('dash.income')}</dt>
                <dd>{m(d.finance.income)}</dd>
                <dt>{t('dash.payment_requests')}</dt>
                <dd>
                  <Link to="/app/finance/payment-requests">
                    {t('dash.pending_approved', {
                      pending: d.finance.payment_requests.pending,
                      approved: d.finance.payment_requests.approved,
                    })}
                  </Link>
                </dd>
              </dl>
            </div>
          </section>
        )}
        {d?.stock && (
          <section className="card">
            <div className="card-header">
              <h3>{t('dash.stock')}</h3>
              <Link to="/app/stock" className="text-sm">
                {t('common.all')}
              </Link>
            </div>
            <div className="card-pad stack" style={{ gap: 10 }}>
              <dl className="kv">
                <dt>{t('dash.stock_materials')}</dt>
                <dd>{d.stock.materials}</dd>
                {d.stock.inventory_value !== null && (
                  <>
                    <dt>{t('dash.stock_value')}</dt>
                    <dd>{m(d.stock.inventory_value)}</dd>
                  </>
                )}
                <dt>{t('dash.requests_pending')}</dt>
                <dd>{d.stock.pending_requests}</dd>
                <dt>{t('dash.transfers_pending')}</dt>
                <dd>{d.stock.pending_transfers}</dd>
                <dt>{t('dash.today_in')}</dt>
                <dd>{d.stock.today_receipts}</dd>
                <dt>{t('dash.today_out')}</dt>
                <dd>{d.stock.today_consumptions}</dd>
              </dl>
              <div>
                <div className="text-sm" style={{ fontWeight: 600, marginBottom: 6 }}>
                  {t('dash.low_items')} ({d.stock.low})
                </div>
                {d.stock.low_items.length === 0 ? (
                  <small className="muted">{t('dash.no_low')}</small>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {d.stock.low_items.map((x, i) => (
                      <li key={i} className="row-between text-sm" style={{ padding: '4px 0' }}>
                        <span>
                          {x.material_name}
                          <small className="muted"> · {x.account_name}</small>
                        </span>
                        <span style={{ color: 'var(--danger)' }}>
                          {formatQuantity(x.available, x.unit_id)}
                          <small className="muted"> / {formatQuantity(x.minimum_quantity)}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        )}
        {d?.employees && (
          <section className="card">
            <div className="card-header">
              <h3>{t('page.employees')}</h3>
              <Link to="/app/employees" className="text-sm">
                {t('common.all')}
              </Link>
            </div>
            <div className="card-pad">
              <dl className="kv">
                <dt>{t('dash.employees_active')}</dt>
                <dd>{d.employees.active}</dd>
                {Object.entries(d.employees.by_role)
                  .filter(([role]) => role !== 'tenant_admin')
                  .map(([role, n]) => (
                    <span key={role} style={{ display: 'contents' }}>
                      <dt>{t(`role.${role}`)}</dt>
                      <dd>{n}</dd>
                    </span>
                  ))}
              </dl>
            </div>
          </section>
        )}
        <section className="card">
          <div className="card-header">
            <h3>{t('dash.recent_notifications')}</h3>
            <Link to="/notifications" className="text-sm">
              {t('notifpage.see_all')}
            </Link>
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
      {d && <p className="muted text-xs">{t('dash.source')}</p>}
    </div>
  );
}
