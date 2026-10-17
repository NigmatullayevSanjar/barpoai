import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, apiAll } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { formatDate, formatMoney, formatQuantity } from '@/lib/format';
import { Badge, EmptyState, Select, Stat, type Tone } from '@/components/ui';
import { displayCurrency } from '@/lib/currency-store';
import { monthLabel, type PaymentRequest } from '@/features/finance/model';
import { ProjectStatusBadge } from '@/features/projects/ProjectsPage';
import type { Project } from '@/features/projects/types';
import { priorityTone, statusTone } from '@/features/work/model';
import { DonutChart, MonthlyChart } from './charts';
import { pct, type Costs, type Dashboard, type ProjectItem, type TaskItem } from './model';

/** Figma KPI kartasi: yorliq, mono raqam, izoh. */
export function Kpi({
  label,
  value,
  sub,
  tone,
  to,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'danger' | 'success' | 'warning';
  to?: string;
}) {
  return <Stat label={label} value={value} sub={sub} tone={tone} to={to} />;
}

/** Karta: sarlavha, izoh, o'ngda "Barchasi" havolasi yoki son. */
export function Section({
  title,
  sub,
  to,
  aside,
  children,
  pad,
}: {
  title: ReactNode;
  sub?: ReactNode;
  to?: string;
  aside?: ReactNode;
  children: ReactNode;
  pad?: boolean;
}) {
  const { t } = useT();
  return (
    <section className="card">
      <div className="card-header">
        <h3>
          {title}
          {sub && <span className="card-sub">{sub}</span>}
        </h3>
        {aside ?? (to && <Link to={to}>{t('dash.all')}</Link>)}
      </div>
      {pad ? <div className="card-pad">{children}</div> : children}
    </section>
  );
}

export function Money({ value }: { value: string | null | undefined }) {
  const { lang } = useT();
  return <>{value == null ? '—' : formatMoney(value, lang, false)}</>;
}

/** Obyekt va davr filtri (Figma: "Obyektni tanlang", "Dan/Gacha" o'rniga davr). */
export function Filters({
  projectId,
  months,
  onProject,
  onMonths,
  note,
}: {
  projectId: string;
  months: string;
  onProject: (id: string) => void;
  onMonths: (m: string) => void;
  note?: ReactNode;
}) {
  const { t } = useT();
  const { can } = useAuth();
  const projectList = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiAll<Project>('/v1/projects'),
    enabled: can('projects', 'read'),
  });
  return (
    <div className="toolbar" style={{ marginBottom: 0 }}>
      {(projectList.data?.items.length ?? 0) > 0 && (
        <Select
          aria-label={t('dash.filter_project')}
          value={projectId}
          onChange={(e) => onProject(e.target.value)}
          style={{ minWidth: 260 }}
        >
          <option value="">{t('dash.filter_project_all')}</option>
          {projectList.data!.items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code ? `${p.code} · ` : ''}
              {p.name}
            </option>
          ))}
        </Select>
      )}
      <Select aria-label={t('dash.period')} value={months} onChange={(e) => onMonths(e.target.value)}>
        {['3', '6', '12'].map((n) => (
          <option key={n} value={n}>
            {t('dash.period_months', { n })}
          </option>
        ))}
      </Select>
      {note && <span className="muted text-sm">{note}</span>}
    </div>
  );
}

export function periodNote(t: ReturnType<typeof useT>['t'], lang: 'uz' | 'ru', d?: Dashboard) {
  return d
    ? t('dash.note_period', { from: formatDate(d.period.from, lang), to: formatDate(d.period.to, lang) })
    : '';
}

const rowStyle = { padding: '12px 20px', borderBottom: '1px solid var(--border)' } as const;

/** Vazifalar ro'yxati (Figma "Bugungi ishlar"/"Yaqindagi vazifalar"): nom, obyekt · muddat, holat belgisi. */
export function TaskRows({
  items,
  empty,
  showAssignee,
}: {
  items: (TaskItem & { overdue?: boolean; assignee_name?: string })[];
  empty: ReactNode;
  showAssignee?: boolean;
}) {
  const { t, lang } = useT();
  if (items.length === 0) return <EmptyState title={empty} />;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((task) => (
        <li key={task.id} style={{ borderBottom: '1px solid var(--border)' }}>
          <Link
            to={`/app/tasks?project=${task.project_id}`}
            className="row-between"
            style={{ padding: '12px 20px', color: 'inherit', gap: 10 }}
          >
            <span className="grow">
              <span style={{ fontWeight: 600 }}>{task.title}</span>
              <small className="muted" style={{ display: 'block' }}>
                {showAssignee && task.assignee_name ? `${task.assignee_name} · ` : ''}
                {task.project_name}
                {task.deadline && ` · ${formatDate(task.deadline, lang)}`}
              </small>
            </span>
            <span className="row">
              {task.overdue && <Badge tone="danger">{t('dash.overdue')}</Badge>}
              <Badge tone={priorityTone[task.priority] as Tone}>{t(`tasks.priority.${task.priority}`)}</Badge>
              <Badge tone={statusTone[task.status] as Tone}>{t(`tasks.status.${task.status}`)}</Badge>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Progress({ value }: { value: number | null }) {
  if (value === null) return <span className="muted text-xs">—</span>;
  return (
    <span className="progress" title={`${value}%`}>
      <span style={{ width: `${Math.min(100, value)}%` }} />
    </span>
  );
}

/** Obyektlar ro'yxati progress bilan (Figma "Faol bino bloklari"). */
export function ProjectRows({ items, empty }: { items: ProjectItem[]; empty: ReactNode }) {
  const { t, lang } = useT();
  if (items.length === 0) return <EmptyState title={empty} />;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((p) => {
        const progress = p.progress_percent === null ? null : Math.round(Number(p.progress_percent));
        return (
          <li key={p.id} style={rowStyle}>
            <div className="row-between">
              <Link to={`/app/projects/${p.id}`} style={{ fontWeight: 600, color: 'inherit' }}>
                {p.code ? `${p.code} · ` : ''}
                {p.name}
              </Link>
              <span className="row">
                {p.behind_schedule && <Badge tone="warning">{t('dash.behind')}</Badge>}
                <b className="text-sm">{progress === null ? '—' : `${progress}%`}</b>
              </span>
            </div>
            <div style={{ marginTop: 8 }}>
              <Progress value={progress} />
            </div>
            <small className="muted" style={{ display: 'block', marginTop: 6 }}>
              {progress === null ? t('dash.no_progress') : t('dash.open_tasks_short', { n: p.open_tasks })}
              {p.overdue_tasks > 0 && (
                <span style={{ color: 'var(--danger)' }}>
                  {' '}
                  · {t('dash.overdue_short', { n: p.overdue_tasks })}
                </span>
              )}
              {p.pending_reports > 0 && ` · ${t('dash.pending_reports_short', { n: p.pending_reports })}`}
              {' · '}
              {formatDate(p.forecast_end ?? p.planned_end, lang)}
            </small>
          </li>
        );
      })}
    </ul>
  );
}

/** Figma "Tizimdagi faol obyektlar" jadvali. */
export function ProjectsTable({ items, empty }: { items: ProjectItem[]; empty: ReactNode }) {
  const { t, lang } = useT();
  if (items.length === 0) return <EmptyState title={empty} />;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
        <thead>
          <tr>
            <th>{t('dash.col.project')}</th>
            <th>{t('dash.col.responsible')}</th>
            <th>{t('dash.col.start')}</th>
            <th>{t('dash.col.status')}</th>
            <th style={{ width: 220 }}>{t('dash.col.progress')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => {
            const progress = p.progress_percent === null ? null : Math.round(Number(p.progress_percent));
            return (
              <tr key={p.id}>
                <td>
                  <Link to={`/app/projects/${p.id}`} className="cell-main" style={{ color: 'inherit' }}>
                    {p.name}
                  </Link>
                  {p.code && <div className="cell-sub">{p.code}</div>}
                </td>
                <td>{p.responsible_name ?? '—'}</td>
                <td className="num" style={{ textAlign: 'left', fontFamily: 'var(--font-mono)' }}>
                  {formatDate(p.actual_start ?? p.planned_start, lang)}
                </td>
                <td>
                  <span className="row">
                    <ProjectStatusBadge status={p.status} />
                    {p.behind_schedule && <Badge tone="warning">{t('dash.behind')}</Badge>}
                  </span>
                </td>
                <td>
                  <div className="text-xs" style={{ fontWeight: 600, marginBottom: 4 }}>
                    {progress === null ? '—' : `${progress}%`}
                  </div>
                  <Progress value={progress} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Kam qolgan materiallar (Figma "Zaxira kam"). */
export function LowItems({
  items,
  empty,
}: {
  items: NonNullable<Dashboard['stock']>['low_items'];
  empty: ReactNode;
}) {
  if (items.length === 0) return <EmptyState title={empty} />;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((x, i) => (
        <li key={i} className="row-between" style={rowStyle}>
          <span>
            <span style={{ fontWeight: 600 }}>{x.material_name}</span>
            <small className="muted" style={{ display: 'block' }}>
              {x.account_name} · {x.project_name}
            </small>
          </span>
          <span className="num" style={{ color: 'var(--danger)', fontFamily: 'var(--font-mono)' }}>
            {formatQuantity(x.available, x.unit_id)}
            <small className="muted"> / {formatQuantity(x.minimum_quantity)}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Reja/fakt ustunlari (Figma "Xarajatlar tahlili"). */
export function MonthlyCostCard({ costs, note }: { costs: Costs; note: ReactNode }) {
  const { t, lang } = useT();
  const empty = costs.monthly.every(
    (r) => Number(r.plan) === 0 && Number(r.budget) === 0 && Number(r.fact) === 0,
  );
  return (
    <Section
      title={t('dash.sec.chart_monthly')}
      sub={t('dash.sec.chart_monthly_sub')}
      aside={<small className="muted">{t('dash.amounts_in', { cur: displayCurrency() })}</small>}
      pad
    >
      {empty ? (
        <EmptyState title={t('dash.chart_empty')} />
      ) : (
        <MonthlyChart
          title={t('dash.sec.chart_monthly')}
          rows={costs.monthly}
          monthLabel={(m) => monthLabel(m, lang)}
          series={[
            { key: 'plan', label: t('dash.series_plan'), color: 'var(--chart-plan)', kind: 'bar' },
            { key: 'fact', label: t('dash.series_fact'), color: 'var(--chart-fact)', kind: 'bar' },
            { key: 'budget', label: t('dash.series_budget'), color: 'var(--chart-line)', kind: 'line' },
          ]}
        />
      )}
      <small className="muted" style={{ display: 'block', marginTop: 8 }}>
        {note}
      </small>
    </Section>
  );
}

const kindColor: Record<string, string> = {
  material: 'var(--chart-1)',
  labor: 'var(--chart-2)',
  equipment: 'var(--chart-3)',
  service: 'var(--chart-4)',
};
/** Xarajat turlari donuti (Figma "Xarajatlar taqsimoti"). */
export function KindsCard({ costs, note }: { costs: Costs; note: ReactNode }) {
  const { t } = useT();
  return (
    <Section title={t('dash.sec.chart_kinds')} aside={<small className="muted">{note}</small>} pad>
      {costs.by_kind.every((k) => Number(k.amount) === 0) ? (
        <EmptyState title={t('dash.kinds_empty')} />
      ) : (
        <DonutChart
          title={t('dash.sec.chart_kinds')}
          total={costs.period_expense}
          items={costs.by_kind.map((k) => ({
            key: k.kind,
            label: t(`est.kind.${k.kind}`),
            color: kindColor[k.kind] ?? 'var(--muted)',
            amount: k.amount,
            share: k.share_percent,
          }))}
        />
      )}
    </Section>
  );
}

export function OverBudgetCard({ costs }: { costs: Costs }) {
  const { t, lang } = useT();
  const m = (v: string) => formatMoney(v, lang, false);
  return (
    <Section
      title={t('dash.sec.over_budget')}
      aside={<small className="muted">{t('dash.note_current')}</small>}
    >
      {costs.over_budget.length === 0 ? (
        <EmptyState title={t('dash.over_budget_none')} />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {costs.over_budget.map((p) => (
            <li key={p.id} style={rowStyle}>
              <div className="row-between">
                <Link
                  to={`/app/finance/budgets?project=${p.id}`}
                  style={{ fontWeight: 600, color: 'inherit' }}
                >
                  {p.code ? `${p.code} · ` : ''}
                  {p.name}
                </Link>
                <Badge tone="danger">{t('dash.over_by', { amount: m(p.over) })}</Badge>
              </div>
              <small className="muted">
                {t('dash.budget_vs_actual', { budget: m(p.budget), actual: m(p.actual) })}
              </small>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** To'lov so'rovlari ro'yxati (Figma "Bugungi to'lovlar"): holat bo'yicha filtrlangan oxirgi 6 ta. */
export function PaymentRequestsCard({ status, title }: { status: 'pending' | 'approved'; title: ReactNode }) {
  const { t, lang } = useT();
  const query = useQuery({
    queryKey: ['payment-requests', 'dashboard', status],
    queryFn: () => api<{ items: PaymentRequest[] }>(`/v1/finance/payment-requests?status=${status}&limit=6`),
  });
  const tone: Record<string, Tone> = {
    pending: 'warning',
    approved: 'info',
    paid: 'success',
    rejected: 'danger',
  };
  return (
    <Section title={title} to="/app/finance/payment-requests">
      {query.data && query.data.items.length === 0 ? (
        <EmptyState title={t('dash.no_data')} />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {(query.data?.items ?? []).map((r) => (
            <li key={r.id} className="row-between" style={rowStyle}>
              <span className="grow">
                <span style={{ fontWeight: 600 }}>{r.counterparty_name}</span>
                <small className="muted" style={{ display: 'block' }}>
                  {r.purpose ?? r.project_name}
                  {r.due_date && ` · ${formatDate(r.due_date, lang)}`}
                </small>
              </span>
              <span className="row">
                <b style={{ fontFamily: 'var(--font-mono)' }}>{formatMoney(r.amount, lang)}</b>
                <Badge tone={tone[r.status] ?? 'neutral'}>{t(`fin.pr.status.${r.status}`)}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export { pct };
