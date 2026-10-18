import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, apiAll, ApiError, qs, type ListResponse } from '@/lib/api';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatDateTime, formatMoney, monthStart } from '@/lib/format';
import { displayCurrency } from '@/lib/currency-store';
import { Badge, Input, PageHeader, SearchInput, Stat, useListState } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { DonutChart, MonthlyChart } from '@/features/dashboard/charts';
import { monthLabel } from '@/features/finance/model';
import { useBillingSummary } from './dashboard';
import { TenantsTable } from './tenants';
import type { Tenant } from './pages';

/**
 * Figma F6 (2026-10-17) "Daromad va qarzdorlik": 6 oylik daromad dinamikasi, qarzdorlik taqsimoti (muddati o'tgan /
 * joriy), 1 oylik buxgalter hisoboti (to'lov, kredit, qaytarish yozuvlari yurib boruvchi qoldiq bilan; daromad–zarar)
 * va invoyslar ro'yxati. Yig'indilar va ulushlar serverdan (billing/summary, billing/report).
 */
type InvoiceRow = {
  id: string;
  tenant_id: string;
  legal_name: string;
  plan_code: string;
  period_start: string;
  period_end: string;
  due_at: string;
  amount: string;
  covered: string;
  outstanding: string;
};
type Report = {
  month: string;
  entries: {
    id: string;
    created_at: string;
    kind: 'payment' | 'credit' | 'refund';
    amount: string;
    external_ref: string;
    reason: string;
    legal_name: string;
    running: string;
  }[];
  totals: { income: string; expense: string; net: string; margin: string | null };
};

export function BillingPage() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const list = useListState();
  const [unpaid, setUnpaid] = useState(false);
  const [month, setMonth] = useState(monthStart().slice(0, 7));
  const summary = useBillingSummary();
  const report = useQuery({
    queryKey: ['platform-report', month],
    queryFn: () => api<Report>(`/v1/platform/billing/report${qs({ month: `${month}-01` })}`),
  });
  const invoices = useQuery({
    queryKey: ['platform-invoices', list.q, list.offset, list.limit, unpaid],
    queryFn: () =>
      api<ListResponse<InvoiceRow>>(
        `/v1/platform/billing/invoices${qs({ q: list.q, limit: list.limit, offset: list.offset, unpaid })}`,
      ),
  });
  const s = summary.data;
  const r = report.data;
  const money = (v: string) => formatMoney(v, lang, false);
  const columns: Column<InvoiceRow>[] = [
    {
      key: 'tenant',
      header: t('tenants.legal_name'),
      sortValue: (r) => r.legal_name,
      render: (r) => <span className="cell-main">{r.legal_name}</span>,
    },
    { key: 'plan', header: t('tenants.plan'), render: (r) => r.plan_code },
    {
      key: 'period',
      header: t('tenants.period_start'),
      sortValue: (r) => r.period_start,
      render: (r) => `${formatDate(r.period_start, lang)} — ${formatDate(r.period_end, lang)}`,
    },
    {
      key: 'due',
      header: t('tenants.due_at'),
      sortValue: (r) => r.due_at,
      render: (r) => <span className="mono">{formatDate(r.due_at, lang)}</span>,
    },
    {
      key: 'amount',
      header: t('tenants.amount'),
      align: 'right',
      render: (r) => <span className="mono">{formatMoney(r.amount, lang)}</span>,
    },
    {
      key: 'covered',
      header: t('tenants.covered'),
      align: 'right',
      render: (r) => <span className="money-in">{money(r.covered)}</span>,
    },
    {
      key: 'out',
      header: t('platform.debt'),
      align: 'right',
      render: (r) => (
        <Badge
          tone={
            Number(r.outstanding) > 0 ? (new Date(r.due_at) < new Date() ? 'danger' : 'warning') : 'success'
          }
        >
          {money(r.outstanding)}
        </Badge>
      ),
    },
  ];
  const monthName = monthLabel(`${month}-01`, lang);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader title={t('billing.title')} description={t('billing.sub')} />
      <div className="grid-main">
        <section className="card">
          <div className="card-header">
            <h3>{t('billing.chart_title')}</h3>
          </div>
          <div className="card-pad">
            {s && s.monthly.length > 0 ? (
              <MonthlyChart
                title={t('billing.chart_title')}
                rows={s.monthly.map((m) => ({ month: m.month, plan: m.invoiced, fact: m.received }))}
                monthLabel={(m) => monthLabel(m, lang)}
                series={[
                  { key: 'plan', label: t('platform.series_plan'), color: 'var(--chart-plan)', kind: 'bar' },
                  { key: 'fact', label: t('platform.series_fact'), color: 'var(--chart-fact)', kind: 'bar' },
                ]}
              />
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                {t('common.empty')}
              </p>
            )}
          </div>
        </section>
        <section className="card">
          <div className="card-header">
            <h3>{t('billing.debt_split')}</h3>
          </div>
          <div className="card-pad">
            {s && (
              <DonutChart
                title={t('billing.debt_split')}
                total={s.debt}
                items={[
                  {
                    key: 'overdue',
                    label: t('billing.debt_overdue'),
                    color: '#dc2626',
                    amount: s.debt_split.overdue,
                    share: s.debt_split.overdue_share,
                  },
                  {
                    key: 'current',
                    label: t('billing.debt_current'),
                    color: '#f59e0b',
                    amount: s.debt_split.current,
                    share: s.debt_split.current_share,
                  },
                ]}
              />
            )}
          </div>
        </section>
      </div>
      <section className="card">
        <div className="card-header">
          <h3>
            {t('billing.report_title')}
            <span className="card-sub">{t('billing.report_sub', { month: monthName })}</span>
          </h3>
          <Input
            type="month"
            aria-label={t('fin.month')}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ width: 170 }}
          />
        </div>
        <div className="card-pad" style={{ paddingTop: 0 }}>
          <h4 style={{ margin: '12px 0 8px' }}>
            {t('billing.entries_title')} ({monthName})
          </h4>
          <div className="table-wrap">
            <table className="table table-dense">
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('fin.description')}</th>
                  <th>{t('tenants.legal_name')}</th>
                  <th>{t('tenants.entry_kind')}</th>
                  <th className="num">{t('fin.cash_in')}</th>
                  <th className="num">{t('fin.cash_out')}</th>
                  <th className="num">{t('billing.running')}</th>
                </tr>
              </thead>
              <tbody>
                {(r?.entries ?? []).map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{formatDateTime(e.created_at, lang)}</td>
                    <td>
                      <div className="cell-main">{e.reason}</div>
                      <div className="cell-sub mono">{e.external_ref}</div>
                    </td>
                    <td>{e.legal_name}</td>
                    <td>
                      <Badge
                        tone={e.kind === 'payment' ? 'success' : e.kind === 'refund' ? 'danger' : 'info'}
                      >
                        {t(`tenants.entry.${e.kind}`)}
                      </Badge>
                    </td>
                    <td className="num">
                      {e.kind === 'payment' ? (
                        <span className="money-in">{money(e.amount)}</span>
                      ) : e.kind === 'credit' ? (
                        <span className="muted mono">{money(e.amount)}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="num">
                      {e.kind === 'refund' ? <span className="money-out">{money(e.amount)}</span> : '—'}
                    </td>
                    <td className="num">
                      <b className="mono">{money(e.running)}</b>
                    </td>
                  </tr>
                ))}
                {r && r.entries.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted" style={{ padding: 16, textAlign: 'center' }}>
                      {t('billing.no_entries')}
                    </td>
                  </tr>
                )}
                {r && r.entries.length > 0 && (
                  <tr style={{ background: 'var(--surface-2)', fontWeight: 600 }}>
                    <td>{t('common.total')}</td>
                    <td colSpan={3}>{t('billing.pl_title')}</td>
                    <td className="num money-in">{money(r.totals.income)}</td>
                    <td className="num money-out">{money(r.totals.expense)}</td>
                    <td className="num">
                      <b className="mono">{money(r.totals.net)}</b>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <h4 style={{ margin: '16px 0 8px' }}>
            {t('billing.pl_title')} ({monthName})
          </h4>
          <div className="grid-4">
            <Stat
              label={t('billing.income')}
              value={r ? money(r.totals.income) : '—'}
              sub={displayCurrency()}
              tone="success"
            />
            <Stat
              label={t('billing.expense')}
              value={r ? money(r.totals.expense) : '—'}
              sub={displayCurrency()}
              tone={r && Number(r.totals.expense) > 0 ? 'danger' : undefined}
            />
            <Stat
              label={t('billing.net')}
              value={r ? money(r.totals.net) : '—'}
              sub={displayCurrency()}
              tone={r && Number(r.totals.net) < 0 ? 'danger' : 'success'}
            />
            <Stat label={t('billing.margin')} value={r?.totals.margin ? `${r.totals.margin}%` : '—'} />
          </div>
        </div>
      </section>
      <section className="card">
        <div className="card-header">
          <h3>{t('tenants.invoices')}</h3>
        </div>
        <div className="toolbar" style={{ padding: '0 16px 12px' }}>
          <SearchInput value={list.search} onChange={list.setSearch} />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={unpaid}
              onChange={(e) => {
                setUnpaid(e.target.checked);
                list.setOffset(0);
              }}
            />{' '}
            {t('platform.debt')}
          </label>
        </div>
        <DataTable
          columns={columns}
          rows={invoices.data?.items}
          rowKey={(r) => r.id}
          loading={invoices.isLoading}
          error={invoices.error ? errorMessage(t, (invoices.error as ApiError).code) : null}
          onRetry={invoices.refetch}
          onRowClick={(r) => navigate(`/admin/tenants/${r.tenant_id}`)}
          pagination={list.pagination}
        />
      </section>
    </div>
  );
}

export function DebtorsPage() {
  const { t } = useT();
  const query = useQuery({
    queryKey: ['platform-tenants'],
    queryFn: () => apiAll<Tenant>('/v1/platform/tenants'),
  });
  const rows = query.data?.items.filter((r) => r.access_state === 'overdue' || r.access_state === 'blocked');
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader title={t('nav.debtors')} description={t('platform.tenants_overdue')} />
      <TenantsTable rows={rows} loading={query.isLoading} error={query.error} refetch={query.refetch} />
    </div>
  );
}
