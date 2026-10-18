import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, apiAll } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { formatDateTime, formatMoney } from '@/lib/format';
import { displayCurrency } from '@/lib/currency-store';
import { EmptyState, PageHeader, Stat } from '@/components/ui';
import { MonthlyChart } from '@/features/dashboard/charts';
import { monthLabel } from '@/features/finance/model';
import { AccessBadge, type Tenant } from './pages';

/**
 * Figma F6 (2026-10-17) "Platforma boshqaruv paneli": KPI (kompaniyalar, hodimlar, faol obunalar, oylik daromad,
 * qarzdorlik, qaytarilgan), oylik daromad dinamikasi, kompaniyalar holati, xodimlar taqsimoti, so'nggi operatsiyalar.
 * Hamma sonlar GET /v1/platform/billing/summary dan; "sof foyda" xarajat modeli yo'qligi sababli ko'rsatilmaydi (D17).
 */
export type BillingSummary = {
  invoiced: string;
  cash_received: string;
  refunded: string;
  debt: string;
  credit_balance: string;
  profit: null;
  counts: {
    tenants: number;
    employees: number;
    paid: number;
    trial: number;
    pending: number;
    overdue: number;
    blocked: number;
  };
  monthly: { month: string; invoiced: string; received: string }[];
  debt_split: {
    overdue: string;
    current: string;
    overdue_share: string | null;
    current_share: string | null;
  };
  recent: {
    id: string;
    kind: 'payment' | 'credit' | 'refund';
    amount: string;
    created_at: string;
    legal_name: string;
  }[];
  roles: { role: string; count: number }[];
};
export const useBillingSummary = () =>
  useQuery({
    queryKey: ['platform-summary'],
    queryFn: () => api<BillingSummary>('/v1/platform/billing/summary'),
  });

export function PlatformDashboard() {
  const { t, lang } = useT();
  const tenants = useQuery({
    queryKey: ['platform-tenants'],
    queryFn: () => apiAll<Tenant>('/v1/platform/tenants'),
  });
  const summary = useBillingSummary();
  const s = summary.data;
  const c = s?.counts;
  const money = (v: string) => formatMoney(v, lang, false);
  const lastMonth = s?.monthly[s.monthly.length - 1];
  const maxRole = Math.max(1, ...(s?.roles ?? []).map((r) => r.count));
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader title={t('platform.dashboard_title')} description={t('platform.dashboard_sub')} />
      <div className="grid-3">
        <Stat to="/admin/tenants" label={t('platform.tenants_total')} value={c ? c.tenants : '—'} />
        <Stat label={t('platform.employees_total')} value={c ? c.employees : '—'} />
        <Stat
          label={t('platform.subscriptions_active')}
          value={c ? c.paid : '—'}
          sub={
            c
              ? `${t('platform.tenants_trial')}: ${c.trial} · ${t('platform.tenants_pending')}: ${c.pending}`
              : undefined
          }
        />
      </div>
      <div className="grid-3">
        <Stat
          label={t('platform.monthly_income')}
          value={lastMonth ? money(lastMonth.received) : '—'}
          sub={lastMonth ? `${monthLabel(lastMonth.month, lang)} · ${displayCurrency()}` : displayCurrency()}
        />
        <Stat
          label={t('platform.debt')}
          value={s ? money(s.debt) : '—'}
          sub={
            c
              ? `${t('platform.tenants_overdue')}: ${c.overdue} · ${t('platform.tenants_blocked')}: ${c.blocked}`
              : undefined
          }
          tone={s && Number(s.debt) > 0 ? 'danger' : undefined}
        />
        <Stat
          label={t('platform.cash_received')}
          value={s ? money(s.cash_received) : '—'}
          sub={
            s
              ? `${t('platform.invoiced')}: ${money(s.invoiced)} · ${t('platform.refunded')}: ${money(s.refunded)}`
              : undefined
          }
          tone="success"
        />
      </div>
      <div className="grid-main">
        <section className="card">
          <div className="card-header">
            <h3>
              {t('platform.chart_title')}
              <span className="card-sub">{t('platform.chart_sub')}</span>
            </h3>
          </div>
          <div className="card-pad">
            {s && s.monthly.length > 0 ? (
              <MonthlyChart
                title={t('platform.chart_title')}
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
            <h3>
              {t('platform.tenants_state')}
              <span className="card-sub">{t('platform.tenants_state_sub')}</span>
            </h3>
            <Link to="/admin/tenants">{t('common.all')}</Link>
          </div>
          {tenants.data && tenants.data.items.length === 0 ? (
            <EmptyState title={t('common.empty')} />
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {(tenants.data?.items ?? []).slice(0, 8).map((x) => (
                <li key={x.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <Link
                    to={`/admin/tenants/${x.id}`}
                    className="row-between"
                    style={{ padding: '12px 20px', color: 'inherit' }}
                  >
                    <span className="grow">
                      <span style={{ fontWeight: 600 }}>{x.legal_name}</span>
                      <small className="muted" style={{ display: 'block' }}>
                        {x.plan_code ?? t('platform.no_plan')} · {x.active_users}
                      </small>
                    </span>
                    <AccessBadge row={x} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <div className="grid-main">
        <section className="card">
          <div className="card-header">
            <h3>
              {t('platform.roles_title')}
              <span className="card-sub">{t('platform.roles_sub')}</span>
            </h3>
          </div>
          {s && s.roles.length === 0 ? (
            <p className="card-pad muted">{t('common.empty')}</p>
          ) : (
            <div className="role-bars">
              {(s?.roles ?? []).map((r) => (
                <div key={r.role} className="role-row">
                  <span>{t(`role.${r.role}`)}</span>
                  <span className="progress ok">
                    <span style={{ width: `${Math.round((r.count / maxRole) * 100)}%` }} />
                  </span>
                  <span className="role-count">{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="card">
          <div className="card-header">
            <h3>
              {t('platform.recent_title')}
              <span className="card-sub">{t('platform.recent_sub')}</span>
            </h3>
            <Link to="/admin/billing">{t('common.all')}</Link>
          </div>
          {s && s.recent.length === 0 ? (
            <p className="card-pad muted">{t('platform.no_ops')}</p>
          ) : (
            <ul className="ops-list">
              {(s?.recent ?? []).map((e) => (
                <li key={e.id}>
                  <div className="row-between">
                    <b>
                      {e.legal_name} — {t(`tenants.entry.${e.kind}`)}
                    </b>
                    <span className={e.kind === 'refund' ? 'money-out' : 'money-in'}>{money(e.amount)}</span>
                  </div>
                  <small>{formatDateTime(e.created_at, lang)}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
