import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Boxes, Printer, Scale, Wallet } from 'lucide-react';
import { api, ApiError, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatMoney, formatQuantity, monthStart, todayIso } from '@/lib/format';
import { displayCurrency } from '@/lib/currency-store';
import { Alert, Badge, Button, Input, PageHeader, Stat } from '@/components/ui';
import { ProjectSelect, useProjectSelection } from '@/features/common/ProjectSelect';
import { ExportButton } from '@/features/common/ExportButton';
import { MonthlyChart } from '@/features/dashboard/charts';
import { ProjectFilter, useProjectFilter } from './pages';
import { monthLabel, num, type FinanceReports, type Forecast, type PlanActual } from './model';

/**
 * Figma F5 (2026-10-17): finansist tahlil sahifalari — "Reja va fakt tahlili" (KPI, 6 oylik ustunlar, kategoriyalar),
 * "Prognoz" (KPI, oylik xarajat tendensiyasi, ko'rsatkichlar) va buxgalter "Hisob hisobotlari" (hisobot kartalari).
 * Figma'dagi likvidlik/qarzdorlik nisbati, daromad prognozi, balans va soliq hisobotlari uchun ma'lumot yo'q (D17).
 */

/* ---------------- Reja–fakt ---------------- */
export function PlanActualPage() {
  const { t, lang } = useT();
  const sel = useProjectSelection();
  const query = useQuery({
    queryKey: ['plan-actual', sel.projectId],
    queryFn: () => api<PlanActual>(`/v1/finance/plan-actual?project_id=${sel.projectId}`),
    enabled: Boolean(sel.projectId),
  });
  const d = query.data;
  const money = (v: string) => formatMoney(v, lang, false);
  const pct = (fact: number, plan: number) => (plan > 0 ? Math.round((fact / plan) * 100) : null);
  const Variance = ({ plan, fact }: { plan: string; fact: string }) => (
    <span className="mono" style={{ color: num(fact) > num(plan) ? 'var(--danger)' : 'var(--success)' }}>
      {formatMoney(num(plan) - num(fact), lang, false)}
    </span>
  );
  const chartRows = (d?.monthly ?? []).slice(-6).map((m) => ({
    month: m.month.slice(0, 10),
    plan: m.plan_value,
    fact: m.fact_value,
  }));
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader
        title={t('fin.pa.title')}
        description={t('fin.pa.sub')}
        actions={
          sel.projectId && (
            <ExportButton path={`/v1/finance/plan-actual/export?project_id=${sel.projectId}`} />
          )
        }
      />
      <div className="toolbar blocks-toolbar">
        <ProjectSelect value={sel.projectId} onChange={sel.setProjectId} projects={sel.projects} />
      </div>
      {query.isError && (
        <Alert tone="danger">
          {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
        </Alert>
      )}
      {d && (
        <>
          <div className="grid-4">
            <Stat label={t('fin.pa.kpi.plan')} value={money(d.totals.plan_value)} sub={displayCurrency()} />
            <Stat label={t('fin.pa.kpi.fact')} value={money(d.totals.fact_value)} sub={displayCurrency()} />
            <Stat
              label={t('fin.pa.kpi.variance')}
              value={money(d.totals.variance)}
              sub={displayCurrency()}
              tone={num(d.totals.variance) < 0 ? 'danger' : 'success'}
            />
            <Stat
              label={t('fin.pa.kpi.percent')}
              value={d.totals.percent === null ? '—' : `${d.totals.percent}%`}
              tone={d.totals.percent !== null && Number(d.totals.percent) > 100 ? 'danger' : undefined}
            />
          </div>
          <section className="card">
            <div className="card-header">
              <h3>{t('fin.pa.chart')}</h3>
            </div>
            <div className="card-pad">
              {chartRows.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  {t('fin.pa.empty')}
                </p>
              ) : (
                <MonthlyChart
                  title={t('fin.pa.chart')}
                  rows={chartRows}
                  monthLabel={(m) => monthLabel(m, lang)}
                  series={[
                    { key: 'plan', label: t('fin.pa.plan'), color: 'var(--chart-plan)', kind: 'bar' },
                    { key: 'fact', label: t('fin.pa.fact'), color: 'var(--chart-fact)', kind: 'bar' },
                  ]}
                />
              )}
            </div>
          </section>
          <section className="card">
            <div className="card-header">
              <h3>
                {t('fin.pa.by_category')}
                <span className="card-sub">{t('fin.pa.fact_na')}</span>
              </h3>
            </div>
            <table className="summary-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>{t('fin.pa.category')}</th>
                  <th style={{ textAlign: 'left' }}>{t('est.col.kind')}</th>
                  <th className="num">{t('fin.pa.lines_count')}</th>
                  <th className="num">
                    {t('fin.pa.plan')} ({displayCurrency()})
                  </th>
                  <th className="num">{t('fin.pa.fact')}</th>
                  <th className="num">{t('fin.pa.variance')}</th>
                  <th className="num">{t('fin.pa.percent')}</th>
                </tr>
              </thead>
              <tbody>
                {d.by_category.map((c, i) => {
                  const p = c.fact_value === null ? null : pct(num(c.fact_value), num(c.plan_value));
                  return (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td>
                        <b>{c.category || t('fin.pa.no_category')}</b>
                      </td>
                      <td>{t(`est.kind.${c.kind}`)}</td>
                      <td className="num">{c.lines}</td>
                      <td className="num mono">{money(c.plan_value)}</td>
                      <td className="num mono">{c.fact_value === null ? '—' : money(c.fact_value)}</td>
                      <td className="num">
                        {c.fact_value === null ? '—' : <Variance plan={c.plan_value} fact={c.fact_value} />}
                      </td>
                      <td className="num">
                        {p === null ? (
                          '—'
                        ) : (
                          <b style={{ color: p > 100 ? 'var(--danger)' : undefined }}>{p}%</b>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {d.by_category.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted" style={{ padding: 16, textAlign: 'center' }}>
                      {t('fin.pa.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
          <div className="grid-4">
            {d.by_kind.map((k) => (
              <div key={k.kind} className="card stat">
                <div className="stat-label">{t(`est.kind.${k.kind}`)}</div>
                <div className="stat-value" style={{ fontSize: 'var(--fs-xl)' }}>
                  {money(k.fact_value)}
                </div>
                <div className="stat-sub">
                  {t('fin.pa.plan')}: {money(k.plan_value)} ·{' '}
                  {pct(num(k.fact_value), num(k.plan_value)) ?? '—'}%
                </div>
                <span
                  className={`progress ${num(k.fact_value) > num(k.plan_value) ? 'bad' : 'ok'}`}
                  style={{ marginTop: 8 }}
                >
                  <span
                    style={{ width: `${Math.min(100, pct(num(k.fact_value), num(k.plan_value)) ?? 0)}%` }}
                  />
                </span>
              </div>
            ))}
          </div>
          <section className="card">
            <div className="card-header">
              <h3>{t('fin.pa.by_zone')}</h3>
            </div>
            <table className="summary-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>{t('est.col.zone')}</th>
                  <th style={{ textAlign: 'left' }}>{t('est.col.kind')}</th>
                  <th className="num">{t('fin.pa.lines_count')}</th>
                  <th className="num">{t('fin.pa.percent')}</th>
                  <th className="num">
                    {t('fin.pa.plan')} ({displayCurrency()})
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.by_zone.map((z, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td>{z.zone_name === '—' ? t('fin.pa.no_zone') : z.zone_name}</td>
                    <td>{t(`est.kind.${z.kind}`)}</td>
                    <td className="num">{z.lines}</td>
                    <td className="num">{z.percent === null ? '—' : `${Math.round(Number(z.percent))}%`}</td>
                    <td className="num mono">{money(z.plan_value)}</td>
                  </tr>
                ))}
                {d.by_zone.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted" style={{ padding: 16, textAlign: 'center' }}>
                      {t('fin.pa.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
          <section className="card">
            <div className="card-header">
              <h3>{t('fin.pa.by_month')}</h3>
            </div>
            <table className="summary-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>{t('fin.month')}</th>
                  <th className="num">{t('fin.pa.plan')}</th>
                  <th className="num">{t('fin.budget')}</th>
                  <th className="num">{t('fin.pa.fact')}</th>
                  <th className="num">{t('fin.pa.variance')}</th>
                </tr>
              </thead>
              <tbody>
                {d.monthly.map((m) => (
                  <tr key={m.month} style={{ borderTop: '1px solid var(--border)' }}>
                    <td>{monthLabel(m.month, lang)}</td>
                    <td className="num mono">{money(m.plan_value)}</td>
                    <td className="num mono">{num(m.budget) ? money(m.budget) : '—'}</td>
                    <td className="num mono">{money(m.fact_value)}</td>
                    <td className="num">
                      <Variance plan={num(m.plan_value) ? m.plan_value : m.budget} fact={m.fact_value} />
                    </td>
                  </tr>
                ))}
                {d.monthly.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted" style={{ padding: 16, textAlign: 'center' }}>
                      {t('fin.pa.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
          <section className="card">
            <div className="card-header">
              <h3>{t('fin.pa.by_line')}</h3>
            </div>
            <div className="table-wrap" style={{ border: 0 }}>
              <table className="table table-dense">
                <thead>
                  <tr>
                    <th>{t('est.col.kind')}</th>
                    <th>{t('est.col.description')}</th>
                    <th>{t('est.col.zone')}</th>
                    <th className="num">
                      {t('fin.pa.plan')} ({t('est.col.quantity')})
                    </th>
                    <th className="num">
                      {t('fin.pa.fact')} ({t('est.col.quantity')})
                    </th>
                    <th className="num">{t('fin.pa.percent')}</th>
                    <th className="num">
                      {t('fin.pa.plan')} ({displayCurrency()})
                    </th>
                    <th className="num">
                      {t('fin.pa.fact')} ({displayCurrency()})
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.lines.map((l) => {
                    const p = pct(num(l.fact_qty), num(l.plan_qty));
                    return (
                      <tr key={l.id}>
                        <td>
                          <Badge tone={l.kind === 'material' ? 'info' : 'brand'}>
                            {t(`est.kind.${l.kind}`)}
                          </Badge>
                        </td>
                        <td>
                          <div className="cell-main">{l.description}</div>
                          <div className="cell-sub">
                            {[l.estimate_name, l.category].filter(Boolean).join(' · ')}
                          </div>
                        </td>
                        <td>{l.zone_name ?? '—'}</td>
                        <td className="num">{formatQuantity(l.plan_qty, l.unit_id)}</td>
                        <td className="num">
                          {num(l.fact_qty) ? (
                            formatQuantity(l.fact_qty, l.unit_id)
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="num">
                          {p === null ? (
                            '—'
                          ) : (
                            <span style={{ color: p > 100 ? 'var(--danger)' : undefined }}>{p}%</span>
                          )}
                        </td>
                        <td className="num mono">{money(l.plan_value)}</td>
                        <td className="num mono">
                          {l.fact_value ? money(l.fact_value) : <span className="muted">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ---------------- Prognoz ---------------- */
export function ForecastPage() {
  const { t, lang } = useT();
  const sel = useProjectSelection();
  const query = useQuery({
    queryKey: ['forecast', sel.projectId],
    queryFn: () => api<Forecast>(`/v1/finance/forecast?project_id=${sel.projectId}`),
    enabled: Boolean(sel.projectId),
  });
  const d = query.data;
  const money = (v: string) => formatMoney(v, lang, false);
  const over =
    d?.projected_variance !== null && d?.projected_variance !== undefined && num(d.projected_variance) < 0;
  const rows = [...(d?.recent ?? [])]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({ month: m.month.slice(0, 10), expense: m.expense }));
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader title={t('fin.fc.title')} description={t('fin.fc.sub')} />
      <div className="toolbar blocks-toolbar">
        <ProjectSelect value={sel.projectId} onChange={sel.setProjectId} projects={sel.projects} />
      </div>
      {d && (
        <>
          {d.months_used === 0 ? (
            <Alert tone="info">{t('fin.fc.no_data')}</Alert>
          ) : (
            <Alert tone={over ? 'danger' : 'success'}>
              {over ? t('fin.fc.over') : t('fin.fc.ok')}
              {d.projected_variance
                ? ` · ${t('fin.fc.variance')}: ${formatMoney(d.projected_variance, lang)}`
                : ''}
            </Alert>
          )}
          <div className="grid-4">
            <Stat
              label={t('fin.fc.plan_total')}
              value={money(d.plan_total)}
              sub={`${t('fin.fc.budget_total')}: ${money(d.budget_total)}`}
            />
            <Stat
              label={t('fin.fc.actual')}
              value={money(d.actual_cost)}
              sub={`${t('fin.fc.remaining')}: ${money(d.remaining_plan)}`}
            />
            <Stat
              label={t('fin.fc.burn')}
              value={money(d.monthly_burn)}
              sub={
                d.months_of_runway !== null
                  ? `${t('fin.fc.runway')}: ${d.months_of_runway}`
                  : displayCurrency()
              }
            />
            <Stat
              label={t('fin.fc.projected_total')}
              value={d.projected_total ? money(d.projected_total) : '—'}
              sub={displayCurrency()}
              tone={over ? 'danger' : d.projected_total ? 'success' : undefined}
            />
          </div>
          <div className="grid-main">
            <section className="card">
              <div className="card-header">
                <h3>{t('fin.fc.chart')}</h3>
              </div>
              <div className="card-pad">
                {rows.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    {t('fin.fc.no_data')}
                  </p>
                ) : (
                  <MonthlyChart
                    title={t('fin.fc.chart')}
                    rows={rows}
                    monthLabel={(m) => monthLabel(m, lang)}
                    series={[
                      { key: 'expense', label: t('fin.expense'), color: 'var(--chart-fact)', kind: 'bar' },
                    ]}
                  />
                )}
              </div>
            </section>
            <section className="card">
              <div className="card-header">
                <h3>{t('fin.fc.indicators')}</h3>
              </div>
              <dl className="block-facts card-pad" style={{ margin: 0 }}>
                <div>
                  <dt>{t('fin.fc.months_left')}</dt>
                  <dd>{d.months_left !== null ? d.months_left : '—'}</dd>
                </div>
                <div>
                  <dt>{t('fin.fc.end_date')}</dt>
                  <dd>{d.end_date ? formatDate(d.end_date, lang) : t('fin.fc.no_end')}</dd>
                </div>
                <div>
                  <dt>{t('fin.fc.runway')}</dt>
                  <dd>{d.months_of_runway !== null ? d.months_of_runway : '—'}</dd>
                </div>
                <div>
                  <dt>{t('fin.fc.variance')}</dt>
                  <dd className={over ? 'status-text-danger' : 'status-text-active'}>
                    {d.projected_variance ? money(d.projected_variance) : '—'}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Hisob hisobotlari ---------------- */
type Report = 'cash_flow' | 'expenses' | 'aging';
export function FinancialReportsPage() {
  const { t, lang } = useT();
  const { can } = useAuth();
  const f = useProjectFilter();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 5);
    return monthStart(d);
  });
  const [to, setTo] = useState(todayIso());
  const [open, setOpen] = useState<Report>('cash_flow');
  const query = useQuery({
    queryKey: ['finance-reports', f.projectId, from, to],
    queryFn: () =>
      api<FinanceReports>(`/v1/finance/reports${qs({ project_id: f.projectId || undefined, from, to })}`),
  });
  const d = query.data;
  const money = (v: string) => formatMoney(v, lang, false);
  const period = t('dash.note_period', { from: formatDate(from, lang), to: formatDate(to, lang) });
  const cards: { key: Report; icon: typeof Wallet; title: string; desc: string }[] = [
    { key: 'cash_flow', icon: Wallet, title: t('fin.rep.cash_flow'), desc: t('fin.rep.cash_flow_desc') },
    { key: 'expenses', icon: BarChart3, title: t('fin.rep.expenses'), desc: t('fin.rep.expenses_desc') },
    { key: 'aging', icon: Scale, title: t('fin.rep.aging'), desc: t('fin.rep.aging_desc') },
  ];
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader title={t('fin.rep.title')} description={t('fin.rep.sub')} />
      <div className="toolbar blocks-toolbar">
        <ProjectFilter f={f} />
        <Input
          type="date"
          aria-label={t('fin.filter_from')}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          style={{ width: 150 }}
        />
        <Input
          type="date"
          aria-label={t('fin.filter_to')}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          style={{ width: 150 }}
        />
        <span className="spacer" />
        {d && (
          <Badge tone="success">
            {t('fin.rep.income')}: {formatMoney(d.income, lang)}
          </Badge>
        )}
      </div>
      <div className="report-grid">
        {cards.map((c) => (
          <section key={c.key} className="card report-card">
            <div className="report-head">
              <span className="report-icon">
                <c.icon />
              </span>
              <div>
                <h3>{c.title}</h3>
                <div className="report-meta">{period}</div>
              </div>
            </div>
            <p>{c.desc}</p>
            <div className="report-actions">
              <Button variant={open === c.key ? 'primary' : 'secondary'} onClick={() => setOpen(c.key)}>
                {t('fin.rep.view')}
              </Button>
              <Button
                variant="secondary"
                icon={<Printer />}
                onClick={() => {
                  setOpen(c.key);
                  setTimeout(() => window.print(), 50);
                }}
              >
                {t('fin.rep.print')}
              </Button>
            </div>
          </section>
        ))}
        {can('stock') && (
          <section className="card report-card">
            <div className="report-head">
              <span className="report-icon">
                <Boxes />
              </span>
              <div>
                <h3>{t('fin.rep.stock')}</h3>
                <div className="report-meta">{f.project?.name ?? t('fin.all_projects')}</div>
              </div>
            </div>
            <p>{t('fin.rep.stock_desc')}</p>
            <div className="report-actions">
              <Link className="btn btn-secondary" to="/app/stock?tab=balances">
                {t('fin.rep.view')}
              </Link>
              {f.projectId ? (
                <ExportButton path={`/v1/stock/overview/export?project_id=${f.projectId}`} />
              ) : (
                <Button variant="secondary" disabled>
                  {t('dash.filter_project')}
                </Button>
              )}
            </div>
          </section>
        )}
      </div>
      {d && open === 'cash_flow' && (
        <section className="card">
          <div className="card-header">
            <h3>
              {t('fin.rep.cash_flow')}
              <span className="card-sub">{period}</span>
            </h3>
          </div>
          <table className="summary-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>{t('fin.month')}</th>
                <th style={{ textAlign: 'left' }}>{t('fin.cash_account')}</th>
                <th className="num">{t('fin.cash_in')}</th>
                <th className="num">{t('fin.cash_out')}</th>
                <th className="num">{t('fin.net_cash')}</th>
              </tr>
            </thead>
            <tbody>
              {d.cash_flow.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td>{monthLabel(r.month, lang)}</td>
                  <td>
                    {r.account} <span className="muted">· {t(`fin.bank.kind.${r.kind}`)}</span>
                  </td>
                  <td className="num money-in">{money(r.inflow)}</td>
                  <td className="num money-out">{money(r.outflow)}</td>
                  <td className="num">
                    <b className="mono">{formatMoney(num(r.inflow) - num(r.outflow), lang, false)}</b>
                  </td>
                </tr>
              ))}
              {d.cash_flow.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted" style={{ padding: 16, textAlign: 'center' }}>
                    {t('common.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
      {d && open === 'expenses' && (
        <section className="card">
          <div className="card-header">
            <h3>
              {t('fin.rep.expenses')}
              <span className="card-sub">{period}</span>
            </h3>
          </div>
          <table className="summary-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>{t('dash.projects')}</th>
                <th style={{ textAlign: 'left' }}>{t('fin.month')}</th>
                <th className="num">{t('fin.rep.material')}</th>
                <th className="num">{t('fin.rep.other')}</th>
                <th className="num">{t('fin.expense')}</th>
              </tr>
            </thead>
            <tbody>
              {d.expenses.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td>{r.project}</td>
                  <td>{monthLabel(r.month, lang)}</td>
                  <td className="num mono">{money(r.material)}</td>
                  <td className="num mono">{money(r.other)}</td>
                  <td className="num">
                    <b className="mono">{money(r.total)}</b>
                  </td>
                </tr>
              ))}
              {d.expenses.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted" style={{ padding: 16, textAlign: 'center' }}>
                    {t('common.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
      {d && open === 'aging' && (
        <section className="card">
          <div className="card-header">
            <h3>{t('fin.rep.aging')}</h3>
          </div>
          <table className="summary-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>{t('fin.counterparty')}</th>
                <th className="num">{t('fin.rep.current')}</th>
                <th className="num">{t('fin.rep.d30')}</th>
                <th className="num">{t('fin.rep.d90')}</th>
                <th className="num">{t('fin.rep.older')}</th>
                <th className="num">{t('fin.outstanding')}</th>
              </tr>
            </thead>
            <tbody>
              {d.aging.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td>{r.counterparty}</td>
                  <td className="num mono">{money(r.current)}</td>
                  <td className="num mono">{money(r.d30)}</td>
                  <td className="num mono" style={{ color: num(r.d90) ? 'var(--warning)' : undefined }}>
                    {money(r.d90)}
                  </td>
                  <td className="num mono" style={{ color: num(r.older) ? 'var(--danger)' : undefined }}>
                    {money(r.older)}
                  </td>
                  <td className="num">
                    <b className="mono">{money(r.total)}</b>
                  </td>
                </tr>
              ))}
              {d.aging.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted" style={{ padding: 16, textAlign: 'center' }}>
                    {t('common.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
