import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatMoney } from '@/lib/format';
import { displayCurrency } from '@/lib/currency-store';
import { Alert, PageHeader, Select, Stat } from '@/components/ui';
import { useProjectSelection } from '@/features/common/ProjectSelect';
import { pageRoutes } from '@/lib/permissions';
import { monthLabel, num, useSummary } from './model';

/**
 * Moliya markazi (admin) va umumiy filtrlar. Figma F5 (2026-10-17) sahifalari alohida modullarda:
 * documents, counterparties, budgets, requests, calendar, payroll, analysis.
 */

/** Tanlangan obyekt yoki "barcha obyektlar" filtri */
function useProjectFilter(allowAll = true) {
  const sel = useProjectSelection();
  const [all, setAll] = useState(allowAll);
  return { ...sel, all: allowAll && all, setAll, projectId: allowAll && all ? '' : sel.projectId };
}
function ProjectFilter({
  f,
  allowAll = true,
  onChange,
}: {
  f: ReturnType<typeof useProjectFilter>;
  allowAll?: boolean;
  onChange?: () => void;
}) {
  const { t } = useT();
  return (
    <Select
      aria-label={t('erp.select_project')}
      value={f.all ? '' : f.projectId || ''}
      onChange={(e) => {
        onChange?.();
        if (!e.target.value) f.setAll(true);
        else {
          f.setAll(false);
          f.setProjectId(e.target.value);
        }
      }}
      style={{ minWidth: 240 }}
    >
      {allowAll && <option value="">{t('fin.all_projects')}</option>}
      {f.projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.code ? `${p.code} · ` : ''}
          {p.name}
        </option>
      ))}
    </Select>
  );
}

/* ---------------- Hub ---------------- */
export function FinanceHubPage() {
  const { t, lang } = useT();
  const { can } = useAuth();
  const f = useProjectFilter();
  const summary = useSummary(f.projectId);
  const d = summary.data;
  const links = (
    [
      'accounting_documents',
      'invoices',
      'bank_cash',
      'counterparties',
      'allocations',
      'budgets',
      'payment_requests',
      'payment_calendar',
      'payroll',
      'plan_actual',
      'forecast',
      'financial_reports',
      'reconciliation',
    ] as const
  ).filter((p) => can(p));
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader title={t('fin.title')} description={t('fin.sub')} />
      <div className="toolbar blocks-toolbar">
        <ProjectFilter f={f} />
      </div>
      {summary.isError && (
        <Alert tone="danger">
          {errorMessage(t, (summary.error as ApiError).code, (summary.error as ApiError).status)}
        </Alert>
      )}
      <div className="grid-4">
        <Stat
          accent
          label={t('fin.actual_cost')}
          value={d ? formatMoney(d.actual_cost, lang, false) : '—'}
          sub={displayCurrency()}
        />
        <Stat
          label={t('fin.net_cash')}
          value={d ? formatMoney(d.net_cash_flow, lang, false) : '—'}
          sub={`${t('fin.income')}: ${d ? formatMoney(d.income, lang, false) : '—'}`}
        />
        <Stat
          label={t('fin.supplier_debt')}
          value={d ? formatMoney(d.supplier_debt, lang, false) : '—'}
          sub={`${t('fin.advances')}: ${d ? formatMoney(d.advances, lang, false) : '—'}`}
        />
        <Stat
          label={t('fin.inventory_value')}
          value={d ? formatMoney(d.inventory_value, lang, false) : '—'}
          sub={`${t('fin.allocations')}: ${d ? formatMoney(d.allocations, lang, false) : '—'}`}
        />
      </div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card">
          <div className="card-header">
            <h3>{t('fin.monthly')}</h3>
          </div>
          <table className="summary-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>{t('fin.month')}</th>
                <th className="num">{t('fin.expense')}</th>
                <th className="num">{t('fin.budget')}</th>
                <th className="num">{t('fin.cash_out')}</th>
                <th className="num">{t('fin.cash_in')}</th>
              </tr>
            </thead>
            <tbody>
              {(d?.monthly ?? []).map((m) => (
                <tr key={m.month} style={{ borderTop: '1px solid var(--border)' }}>
                  <td>{monthLabel(m.month, lang)}</td>
                  <td
                    className="num"
                    style={{
                      color:
                        num(m.budget) > 0 && num(m.expense) > num(m.budget) ? 'var(--danger)' : undefined,
                    }}
                  >
                    {formatMoney(m.expense, lang, false)}
                  </td>
                  <td className="num">
                    {num(m.budget) ? formatMoney(m.budget, lang, false) : <span className="muted">—</span>}
                  </td>
                  <td className="num">{formatMoney(-num(m.cash_out), lang, false)}</td>
                  <td className="num">{formatMoney(m.cash_in, lang, false)}</td>
                </tr>
              ))}
              {d && d.monthly.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted" style={{ padding: 16, textAlign: 'center' }}>
                    {t('common.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        <div className="stack">
          <section className="card">
            <div className="card-header">
              <h3>{t('fin.by_project')}</h3>
            </div>
            <table className="summary-table" style={{ width: '100%' }}>
              <tbody>
                {(d?.by_project ?? []).map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td>
                      <Link to={`/app/projects/${p.id}`}>{p.name}</Link>
                    </td>
                    <td className="num">{formatMoney(p.actual_cost, lang, false)}</td>
                    <td className="num muted">
                      {num(p.budget) ? `${Math.round((num(p.actual_cost) / num(p.budget)) * 100)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="card">
            <div className="card-header">
              <h3>{t('fin.top_debt')}</h3>
            </div>
            <table className="summary-table" style={{ width: '100%' }}>
              <tbody>
                {(d?.top_debt ?? []).map((c) => (
                  <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td>{c.name}</td>
                    <td className="num">{formatMoney(c.debt, lang, false)}</td>
                    <td className="num muted">
                      {num(c.advance) ? `${t('fin.advances')}: ${formatMoney(c.advance, lang, false)}` : ''}
                    </td>
                  </tr>
                ))}
                {d && d.top_debt.length === 0 && (
                  <tr>
                    <td className="muted" style={{ padding: 16, textAlign: 'center' }}>
                      {t('common.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>
      </div>
      <div className="pill-list">
        {links.map((p) => (
          <Link key={p} to={pageRoutes[p]} className="btn btn-secondary btn-sm">
            {t(`page.${p}`)}
          </Link>
        ))}
      </div>
    </div>
  );
}

export { ProjectFilter, useProjectFilter };
