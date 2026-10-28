import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatMoney, formatQuantity } from '@/lib/format';
import { Alert, Badge, EmptyState, PageHeader, type Tone } from '@/components/ui';
import { displayCurrency } from '@/lib/currency-store';
import { monthLabel } from '@/features/finance/model';
import { MonthlyChart } from './charts';
import { pct, useDashboard, useMyEarnings, type Dashboard } from './model';
import {
  Filters,
  KindsCard,
  Kpi,
  LowItems,
  Money,
  MonthlyCostCard,
  OverBudgetCard,
  PaymentRequestsCard,
  ProjectRows,
  ProjectsTable,
  Section,
  TaskRows,
  periodNote,
} from './widgets';

type DashRole = 'foreman' | 'manager' | 'brigadier' | 'warehouse_manager' | 'accountant' | 'financier';

/**
 * Umumiy ramka: rolga xos sarlavha (Figma), obyekt/davr filtri, yuklanish va xato holati, pastda manba izohi.
 * Har rol o'z bloklarini `children(d, note)` orqali chizadi; ma'lumot faqat /v1/dashboard dan.
 */
function Frame({
  role,
  filters,
  children,
}: {
  role: DashRole;
  filters?: boolean;
  children: (d: Dashboard, note: string) => ReactNode;
}) {
  const { t, lang } = useT();
  const [projectId, setProjectId] = useState('');
  const [months, setMonths] = useState('6');
  const query = useDashboard(projectId, months);
  const d = query.data;
  const note = periodNote(t, lang, d);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader title={t(`dash.title.${role}`)} description={t(`dash.sub.${role}`)} />
      {filters && (
        <Filters
          projectId={projectId}
          months={months}
          onProject={setProjectId}
          onMonths={setMonths}
          note={note}
        />
      )}
      {query.isError && (
        <Alert tone="danger">
          {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
        </Alert>
      )}
      {!d && !query.isError && <div className="skeleton" style={{ height: 120 }} />}
      {d && children(d, note)}
      {d && <p className="muted text-xs">{t('dash.source')}</p>}
    </div>
  );
}

/** Figma "E'tibor talab qiladiganlar": muddati o'tgan vazifalar, tekshiruvdagi hisobotlar, kam qolgan material, kutilayotgan jo'natma va talabnoma. */
function AttentionCard({ d }: { d: Dashboard }) {
  const { t } = useT();
  const items: { key: string; text: string; to: string; tone: Tone }[] = [];
  if (d.tasks && d.tasks.overdue > 0)
    items.push({
      key: 'overdue',
      text: t('dash.overdue_tasks_n', { n: d.tasks.overdue }),
      to: '/app/tasks',
      tone: 'danger',
    });
  if (d.reports && d.reports.pending_review)
    items.push({
      key: 'reports',
      text: t('dash.reports_pending_n', { n: d.reports.pending_review }),
      to: '/app/reports',
      tone: 'warning',
    });
  if (d.stock && d.stock.low > 0)
    items.push({ key: 'low', text: t('dash.low_n', { n: d.stock.low }), to: '/app/stock', tone: 'warning' });
  if (d.stock && d.stock.pending_transfers > 0)
    items.push({
      key: 'transfers',
      text: t('dash.transfers_pending_n', { n: d.stock.pending_transfers }),
      to: '/app/stock',
      tone: 'info',
    });
  if (d.stock && d.stock.pending_requests > 0)
    items.push({
      key: 'requests',
      text: t('dash.requests_pending_n', { n: d.stock.pending_requests }),
      to: '/app/stock',
      tone: 'info',
    });
  return (
    <Section
      title={t('dash.sec.attention')}
      aside={<Badge tone={items.length ? 'danger' : 'neutral'}>{items.length}</Badge>}
    >
      {items.length === 0 ? (
        <EmptyState title={t('dash.no_attention')} />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((it) => (
            <li key={it.key} style={{ borderBottom: '1px solid var(--border)' }}>
              <Link to={it.to} className="row-between" style={{ padding: '12px 20px', color: 'inherit' }}>
                <span style={{ fontWeight: 500 }}>{it.text}</span>
                <Badge tone={it.tone}>{t('dash.all')}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Prorab operativ paneli (Figma). */
export function ForemanDashboard() {
  const { t } = useT();
  return (
    <Frame role="foreman" filters>
      {(d) => (
        <>
          <div className="grid-4">
            {d.projects && (
              <Kpi
                label={t('dash.kpi.projects')}
                value={d.projects.total}
                sub={t('dash.kpi.projects_sub', {
                  active: d.projects.active,
                  behind: d.projects.behind_schedule,
                })}
                to="/app/projects"
              />
            )}
            {d.tasks && (
              <Kpi
                label={t('dash.kpi.tasks_open')}
                value={d.tasks.open}
                sub={t('dash.kpi.tasks_sub', { overdue: d.tasks.overdue, today: d.tasks.due_today })}
                tone={d.tasks.overdue > 0 ? 'danger' : undefined}
                to="/app/tasks"
              />
            )}
            {d.reports && (
              <Kpi
                label={
                  d.reports.pending_review !== null
                    ? t('dash.kpi.reports_pending')
                    : t('dash.kpi.my_returned')
                }
                value={d.reports.pending_review ?? d.reports.my_returned}
                sub={t('dash.kpi.reports_sub', { n: d.reports.in_period })}
                to="/app/reports"
              />
            )}
            {d.stock && (
              <Kpi
                label={t('dash.kpi.requests')}
                value={d.stock.pending_requests}
                sub={t('dash.transfers_pending_n', { n: d.stock.pending_transfers })}
                to="/app/stock"
              />
            )}
          </div>
          <div className="grid-main">
            <div className="stack" style={{ gap: 16 }}>
              {d.tasks && (
                <Section
                  title={t('dash.sec.today_tasks')}
                  sub={t('dash.sec.today_tasks_sub')}
                  to="/app/tasks"
                >
                  <TaskRows items={d.tasks.items} empty={t('dash.no_tasks')} />
                </Section>
              )}
              {d.stock && (
                <Section title={t('dash.sec.materials')} sub={t('dash.sec.materials_sub')} to="/app/stock">
                  <LowItems items={d.stock.low_items} empty={t('dash.no_low')} />
                </Section>
              )}
            </div>
            <div className="stack" style={{ gap: 16 }}>
              {d.tasks && (
                <Section
                  title={t('dash.sec.overdue')}
                  aside={<Badge tone={d.tasks.overdue > 0 ? 'danger' : 'neutral'}>{d.tasks.overdue}</Badge>}
                >
                  <TaskRows items={d.tasks.overdue_items} empty={t('dash.overdue_none')} showAssignee />
                </Section>
              )}
              {d.projects && (
                <Section title={t('dash.sec.active_blocks')} to="/app/projects">
                  <ProjectRows items={d.projects.items.slice(0, 6)} empty={t('dash.no_projects')} />
                </Section>
              )}
              <AttentionCard d={d} />
            </div>
          </div>
        </>
      )}
    </Frame>
  );
}

/** Boshqaruv paneli (Figma): bosh muhandis va mijoz admini. Xarajat bloklari faqat narx huquqi bilan. */
export function ManagerDashboard() {
  const { t } = useT();
  return (
    <Frame role="manager" filters>
      {(d, note) => {
        const done = d.tasks ? pct(d.tasks.accepted, d.tasks.total) : null;
        return (
          <>
            <div className="grid-4">
              {d.projects && (
                <Kpi
                  label={t('dash.kpi.projects_active')}
                  value={d.projects.active}
                  sub={t('dash.kpi.projects_sub', {
                    active: d.projects.total,
                    behind: d.projects.behind_schedule,
                  })}
                  to="/app/projects"
                />
              )}
              {d.costs ? (
                <Kpi
                  label={t('dash.kpi.plan_total')}
                  value={<Money value={d.costs.plan_total} />}
                  sub={`${displayCurrency()} · ${t('dash.note_current')}`}
                  to="/app/estimates"
                />
              ) : (
                d.reports && (
                  <Kpi
                    label={t('dash.kpi.reports_pending')}
                    value={d.reports.pending_review ?? d.reports.my_returned}
                    sub={t('dash.kpi.reports_sub', { n: d.reports.in_period })}
                    to="/app/reports"
                  />
                )
              )}
              {d.tasks && (
                <Kpi
                  label={t('dash.kpi.tasks_done')}
                  value={done === null ? '—' : `${done}%`}
                  sub={t('dash.kpi.tasks_done_sub', { accepted: d.tasks.accepted, total: d.tasks.total })}
                  to="/app/tasks"
                />
              )}
              {d.costs ? (
                <Kpi
                  label={t('dash.kpi.period_expense')}
                  value={<Money value={d.costs.period_expense} />}
                  sub={note}
                />
              ) : (
                d.stock && (
                  <Kpi
                    label={t('dash.kpi.requests')}
                    value={d.stock.pending_requests}
                    sub={t('dash.transfers_pending_n', { n: d.stock.pending_transfers })}
                    to="/app/stock"
                  />
                )
              )}
            </div>
            <div className="grid-main">
              {d.costs ? (
                <MonthlyCostCard costs={d.costs} note={note} />
              ) : (
                d.tasks && (
                  <Section title={t('dash.sec.overdue')} to="/app/tasks">
                    <TaskRows items={d.tasks.overdue_items} empty={t('dash.overdue_none')} showAssignee />
                  </Section>
                )
              )}
              {d.tasks && (
                <Section title={t('dash.sec.recent_tasks')} to="/app/tasks">
                  <TaskRows items={d.tasks.items} empty={t('dash.no_tasks')} />
                </Section>
              )}
            </div>
            {d.costs && (
              <div className="grid-main">
                <KindsCard costs={d.costs} note={note} />
                <OverBudgetCard costs={d.costs} />
              </div>
            )}
            {d.projects && (
              <Section
                title={t('dash.sec.projects_table')}
                sub={t('dash.sec.projects_table_sub')}
                to="/app/projects"
              >
                <ProjectsTable items={d.projects.items} empty={t('dash.no_projects_admin')} />
              </Section>
            )}
          </>
        );
      }}
    </Frame>
  );
}

/** V-C (D23): brigadirning akkord hisobi — faqat o'ziniki; summalar serverdan. */
function EarningsCard() {
  const { t, lang } = useT();
  const query = useMyEarnings();
  const e = query.data;
  if (!e) return null;
  const money = (v: string) => `${formatMoney(v, lang, false)} ${displayCurrency()}`;
  return (
    <Section title={t('dash.earn.title')} sub={t('dash.earn.sub')} pad>
      <div className="grid-4" style={{ marginBottom: 12 }}>
        <Kpi label={t('dash.earn.month')} value={money(e.totals.earned_month)} />
        <Kpi
          label={t('dash.earn.total')}
          value={money(e.totals.earned)}
          sub={`${t('dash.earn.in_payroll')}: ${money(e.totals.in_payroll)}`}
        />
        <Kpi
          label={t('dash.earn.paid')}
          value={money(e.totals.paid)}
          sub={`${t('dash.earn.advances')}: ${money(e.totals.advances)}`}
        />
        <Kpi
          label={t('dash.earn.balance')}
          value={money(e.totals.balance)}
          tone={Number(e.totals.balance) > 0 ? 'success' : undefined}
        />
      </div>
      {e.entries.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {t('dash.earn.empty')}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="table table-dense">
            <thead>
              <tr>
                <th>{t('common.date')}</th>
                <th>{t('dash.earn.project')}</th>
                <th>{t('reports.col.work')}</th>
                <th className="num">{t('reports.col.qty')}</th>
                <th className="num">{t('reports.labor_amount')}</th>
              </tr>
            </thead>
            <tbody>
              {e.entries.slice(0, 10).map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.report_date, lang)}</td>
                  <td>{r.project_name}</td>
                  <td>{r.description}</td>
                  <td className="num">{formatQuantity(r.quantity, r.unit_id)}</td>
                  <td className="num">
                    {r.amount === null ? (
                      <span className="muted">{t('dash.earn.rate_missing')}</span>
                    ) : (
                      money(r.amount)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
/** Brigadir paneli (Figma): o'z vazifalari, qabul kutayotgan jo'natmalar, talabnomalar. */
export function BrigadierDashboard() {
  const { t } = useT();
  return (
    <Frame role="brigadier">
      {(d) => {
        const onTime = d.tasks ? pct(d.tasks.open - d.tasks.overdue, d.tasks.open) : null;
        return (
          <>
            <div className="grid-4">
              {d.tasks && (
                <Kpi
                  label={t('dash.kpi.my_tasks')}
                  value={d.tasks.my_open}
                  sub={t('dash.kpi.my_tasks_sub', { overdue: d.tasks.overdue })}
                  tone={d.tasks.overdue > 0 ? 'danger' : undefined}
                  to="/app/tasks"
                />
              )}
              {d.tasks && (
                <Kpi
                  label={t('dash.kpi.on_time')}
                  value={onTime === null ? '—' : `${onTime}%`}
                  sub={t('dash.kpi.on_time_sub')}
                />
              )}
              {d.stock && (
                <Kpi
                  label={t('dash.kpi.transfers')}
                  value={d.stock.pending_transfers}
                  sub={t('dash.kpi.transfers_sub')}
                  tone={d.stock.pending_transfers > 0 ? 'warning' : undefined}
                  to="/app/stock"
                />
              )}
              {d.stock && (
                <Kpi
                  label={t('dash.kpi.requests')}
                  value={d.stock.pending_requests}
                  sub={t('dash.kpi.requests_sub')}
                  to="/app/stock"
                />
              )}
            </div>
            <EarningsCard />
            <div className="grid-main">
              {d.tasks && (
                <Section title={t('dash.sec.recent_tasks')} to="/app/tasks">
                  <TaskRows items={d.tasks.items} empty={t('dash.no_tasks')} />
                </Section>
              )}
              {d.stock && (
                <Section title={t('dash.sec.materials')} sub={t('dash.sec.materials_sub')} to="/app/stock">
                  <LowItems items={d.stock.low_items} empty={t('dash.no_low')} />
                </Section>
              )}
            </div>
          </>
        );
      }}
    </Frame>
  );
}

const moveTone: Record<string, Tone> = {
  posted: 'success',
  pending: 'warning',
  partial: 'info',
  disputed: 'danger',
  cancelled: 'neutral',
};
/** Omborxona boshqaruvi (Figma): kirim/chiqim soni, kutilayotgan jo'natmalar, kam qolganlar, oxirgi operatsiyalar. */
export function WarehouseDashboard() {
  const { t, lang } = useT();
  return (
    <Frame role="warehouse_manager" filters>
      {(d, note) => (
        <>
          {d.stock && (
            <div className="grid-4">
              <Kpi
                label={t('dash.kpi.materials')}
                value={d.stock.materials}
                sub={t('dash.kpi.materials_sub')}
                to="/app/stock"
              />
              <Kpi
                label={t('dash.kpi.today_in')}
                value={d.stock.today_receipts}
                sub={t('dash.note_current')}
              />
              <Kpi
                label={t('dash.kpi.today_out')}
                value={d.stock.today_consumptions}
                sub={t('dash.note_current')}
              />
              <Kpi
                label={t('dash.kpi.low')}
                value={d.stock.low}
                sub={t('dash.kpi.low_sub')}
                tone={d.stock.low > 0 ? 'danger' : undefined}
                to="/app/stock"
              />
            </div>
          )}
          {d.stock && (
            <div className="grid-main">
              <Section
                title={t('dash.sec.stock_moves')}
                sub={t('dash.sec.stock_moves_sub')}
                aside={<small className="muted">{note}</small>}
                pad
              >
                {d.stock.monthly.every((r) => r.receipts === 0 && r.issues === 0) ? (
                  <EmptyState title={t('dash.no_data')} />
                ) : (
                  <MonthlyChart
                    unit="count"
                    title={t('dash.sec.stock_moves')}
                    rows={d.stock.monthly.map((r) => ({
                      month: r.month,
                      receipts: String(r.receipts),
                      issues: String(r.issues),
                    }))}
                    monthLabel={(m) => monthLabel(m, lang)}
                    series={[
                      {
                        key: 'issues',
                        label: t('dash.series_issues'),
                        color: 'var(--chart-plan)',
                        kind: 'bar',
                      },
                      {
                        key: 'receipts',
                        label: t('dash.series_receipts'),
                        color: 'var(--chart-fact)',
                        kind: 'bar',
                      },
                    ]}
                  />
                )}
              </Section>
              <div className="stack" style={{ gap: 16 }}>
                <Section title={t('dash.sec.pending_moves')}>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {[
                      {
                        key: 'transfers',
                        text: t('dash.transfers_pending_n', { n: d.stock.pending_transfers }),
                        n: d.stock.pending_transfers,
                      },
                      {
                        key: 'requests',
                        text: t('dash.requests_pending_n', { n: d.stock.pending_requests }),
                        n: d.stock.pending_requests,
                      },
                    ].map((it) => (
                      <li key={it.key} style={{ borderBottom: '1px solid var(--border)' }}>
                        <Link
                          to="/app/stock"
                          className="row-between"
                          style={{ padding: '12px 20px', color: 'inherit' }}
                        >
                          <span style={{ fontWeight: 500 }}>{it.text}</span>
                          <Badge tone={it.n > 0 ? 'warning' : 'neutral'}>{it.n}</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Section>
                <Section title={t('dash.sec.low_items')} to="/app/stock">
                  <LowItems items={d.stock.low_items} empty={t('dash.no_low')} />
                </Section>
              </div>
            </div>
          )}
          {d.stock && (
            <Section title={t('dash.sec.recent_ops')} sub={t('dash.sec.recent_ops_sub')} to="/app/stock">
              {d.stock.recent.length === 0 ? (
                <EmptyState title={t('dash.no_data')} />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table
                    className="table"
                    style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}
                  >
                    <thead>
                      <tr>
                        <th>{t('dash.col.kind')}</th>
                        <th>{t('dash.col.material')}</th>
                        <th>{t('dash.col.quantity')}</th>
                        <th>{t('dash.col.from_to')}</th>
                        <th>{t('dash.col.date')}</th>
                        <th>{t('dash.col.actor')}</th>
                        <th>{t('dash.col.state')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.stock.recent.map((c) => (
                        <tr key={c.id}>
                          <td className="cell-main">{t(`stock.kind.${c.kind}`)}</td>
                          <td>
                            {c.material_name}
                            <div className="cell-sub">{c.project_name}</div>
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>
                            {formatQuantity(c.quantity, c.unit_id)}
                          </td>
                          <td className="muted">
                            {c.from_name ?? '—'} → {c.to_name ?? '—'}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{formatDate(c.created_at, lang)}</td>
                          <td>{c.created_by_name ?? '—'}</td>
                          <td>
                            <Badge tone={moveTone[c.status] ?? 'neutral'}>
                              {t(`stock.status.${c.status}`)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}
        </>
      )}
    </Frame>
  );
}

/** Buxgalteriya boshqaruv paneli (Figma). */
export function AccountantDashboard() {
  const { t } = useT();
  return (
    <Frame role="accountant" filters>
      {(d, note) => (
        <>
          {d.finance && (
            <div className="grid-5">
              <Kpi
                label={t('dash.kpi.cash')}
                value={<Money value={d.finance.net_cash_flow} />}
                sub={displayCurrency()}
              />
              <Kpi
                label={t('dash.kpi.income')}
                value={<Money value={d.finance.income} />}
                sub={displayCurrency()}
              />
              <Kpi
                label={t('dash.kpi.period_expense')}
                value={<Money value={d.finance.period_expense} />}
                sub={note}
              />
              <Kpi
                label={t('dash.kpi.advances')}
                value={<Money value={d.finance.advances} />}
                sub={displayCurrency()}
              />
              <Kpi
                label={t('dash.kpi.debt')}
                value={<Money value={d.finance.supplier_debt} />}
                sub={t('dash.kpi.overdue_payables_sub', { n: d.finance.overdue_payables.count })}
                tone={Number(d.finance.supplier_debt) > 0 ? 'danger' : undefined}
                to="/app/finance/invoices"
              />
            </div>
          )}
          {d.costs && (
            <div className="grid-main">
              <MonthlyCostCard costs={d.costs} note={note} />
              <KindsCard costs={d.costs} note={note} />
            </div>
          )}
          {d.finance && (
            <div className="grid-main">
              <PaymentRequestsCard status="pending" title={t('dash.sec.payments')} />
              {d.costs && <OverBudgetCard costs={d.costs} />}
            </div>
          )}
        </>
      )}
    </Frame>
  );
}

/** Moliyaviy bosh sahifa (Figma): finansist. */
export function FinancierDashboard() {
  const { t } = useT();
  return (
    <Frame role="financier" filters>
      {(d, note) => {
        const used = d.finance ? pct(d.finance.actual_cost, d.finance.budget_total) : null;
        return (
          <>
            {d.finance && (
              <div className="grid-5">
                <Kpi
                  label={t('dash.kpi.cash')}
                  value={<Money value={d.finance.net_cash_flow} />}
                  sub={displayCurrency()}
                />
                <Kpi
                  label={t('dash.kpi.income')}
                  value={<Money value={d.finance.income} />}
                  sub={displayCurrency()}
                />
                <Kpi
                  label={t('dash.kpi.period_expense')}
                  value={<Money value={d.finance.period_expense} />}
                  sub={note}
                />
                <Kpi
                  label={t('dash.kpi.period_budget')}
                  value={<Money value={d.finance.period_budget} />}
                  sub={note}
                  to="/app/finance/budgets"
                />
                <Kpi
                  label={t('dash.kpi.budget_used')}
                  value={used === null ? '—' : `${used}%`}
                  sub={used === null ? t('dash.no_budget') : t('dash.kpi.budget_used_sub')}
                  tone={used !== null && used > 100 ? 'danger' : undefined}
                  to="/app/finance/plan-actual"
                />
              </div>
            )}
            {d.costs && (
              <div className="grid-main">
                <MonthlyCostCard costs={d.costs} note={note} />
                <KindsCard costs={d.costs} note={note} />
              </div>
            )}
            {d.finance && (
              <div className="grid-main">
                <PaymentRequestsCard status="approved" title={t('dash.sec.payments')} />
                {d.costs && <OverBudgetCard costs={d.costs} />}
              </div>
            )}
          </>
        );
      }}
    </Frame>
  );
}
