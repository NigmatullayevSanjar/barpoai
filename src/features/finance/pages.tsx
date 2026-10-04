import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, ApiError, qs, type ListResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatMoney, monthStart } from '@/lib/format';
import {
  Alert,
  Badge,
  Button,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Stat,
  Textarea,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ProjectSelect, useProjectSelection } from '@/features/common/ProjectSelect';
import { normalizeNumber } from '@/features/estimates/model';
import { pageRoutes } from '@/lib/permissions';
import { DocumentModal } from './DocumentModal';
import { DocumentsTable, kindsFor } from './DocumentsTable';
import {
  monthLabel,
  num,
  useBudgets,
  useCashBalances,
  useCounterparties,
  useDocuments,
  useFinanceMutation,
  usePayables,
  usePricesVisible,
  useSummary,
  type Budget,
  type CashAccount,
  type Counterparty,
  type DocKind,
  type Payable,
} from './model';

/** Tanlangan obyekt yoki "barcha obyektlar" filtri */
function useProjectFilter(allowAll = true) {
  const sel = useProjectSelection();
  const [all, setAll] = useState(allowAll);
  return { ...sel, all: allowAll && all, setAll, projectId: allowAll && all ? '' : sel.projectId };
}
function ProjectFilter({
  f,
  allowAll = true,
}: {
  f: ReturnType<typeof useProjectFilter>;
  allowAll?: boolean;
}) {
  const { t } = useT();
  return (
    <Select
      aria-label={t('erp.select_project')}
      value={f.all ? '' : f.projectId || ''}
      onChange={(e) => {
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
      <div className="toolbar">
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
          sub="UZS"
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

/* ---------------- Generic documents page (docs / invoices / bank / allocations) ---------------- */
export function DocumentsPage({
  page,
}: {
  page: 'accounting_documents' | 'invoices' | 'bank_cash' | 'allocations';
}) {
  const { t, lang } = useT();
  const { can } = useAuth();
  const sel = useProjectSelection();
  const prices = usePricesVisible();
  const kinds = kindsFor(page);
  const [kind, setKind] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [modal, setModal] = useState(false);
  const [unpaidOnly, setUnpaidOnly] = useState(page === 'invoices');
  const query = useDocuments(sel.projectId, {
    kind: kind || kinds.join(','),
    from: from || undefined,
    to: to || undefined,
  });
  const docs = query.data?.items.filter(
    (d) =>
      !unpaidOnly || page !== 'invoices' || (d.outstanding !== null && num(d.outstanding) > 0 && !d.reversed),
  );
  const titles = {
    accounting_documents: ['fin.docs.title', 'fin.docs.sub'],
    invoices: ['fin.invoices.title', 'fin.invoices.sub'],
    bank_cash: ['fin.bank.title', 'fin.bank.sub'],
    allocations: ['fin.alloc.title', 'fin.alloc.sub'],
  } as const;
  const cash = useCashBalances();
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader
        title={t(titles[page][0])}
        description={t(titles[page][1])}
        actions={
          can(page, 'create') && sel.projectId ? (
            <Button icon={<Plus />} onClick={() => setModal(true)}>
              {t(
                page === 'invoices'
                  ? 'fin.invoices.new'
                  : page === 'allocations'
                    ? 'fin.alloc.new'
                    : 'fin.new_document',
              )}
            </Button>
          ) : undefined
        }
      />
      {!prices && <Alert tone="warning">{t('fin.no_prices')}</Alert>}
      {page === 'bank_cash' && <CashAccountsPanel accounts={cash.data?.items ?? []} />}
      <div className="toolbar">
        <ProjectSelect value={sel.projectId} onChange={sel.setProjectId} projects={sel.projects} />
        <Select aria-label={t('fin.kind')} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">{t('common.all')}</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {t(`fin.kind.${k}`)}
            </option>
          ))}
        </Select>
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
        {page === 'invoices' && (
          <label className="checkbox">
            <input type="checkbox" checked={unpaidOnly} onChange={(e) => setUnpaidOnly(e.target.checked)} />{' '}
            {t('fin.invoices.unpaid')}
          </label>
        )}
      </div>
      <DocumentsTable
        docs={docs}
        loading={query.isLoading}
        error={
          query.error
            ? errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)
            : null
        }
        onRetry={query.refetch}
        projectId={sel.projectId}
        allowPay={page === 'invoices' && can('bank_cash', 'create')}
      />
      {modal && <DocumentModal projectId={sel.projectId} kinds={kinds} onClose={() => setModal(false)} />}
      <span hidden>{lang}</span>
    </div>
  );
}

function CashAccountsPanel({ accounts }: { accounts: CashAccount[] }) {
  const { t, lang } = useT();
  const { can } = useAuth();
  const [edit, setEdit] = useState<CashAccount | 'new' | null>(null);
  const total = accounts.filter((a) => !a.archived_at).reduce((s, a) => s + num(a.balance), 0);
  return (
    <section className="card">
      <div className="card-header">
        <h3>
          {t('fin.bank.total')}: {formatMoney(total, lang)}
        </h3>
        {can('bank_cash', 'create') && (
          <Button size="sm" variant="secondary" icon={<Plus />} onClick={() => setEdit('new')}>
            {t('fin.bank.new_account')}
          </Button>
        )}
      </div>
      {accounts.length === 0 ? (
        <p className="card-pad muted">{t('fin.bank.empty')}</p>
      ) : (
        <div className="grid-4" style={{ padding: 16 }}>
          {accounts.map((a) => (
            <button
              key={a.id}
              className="card stat"
              style={{ textAlign: 'left', cursor: 'pointer', opacity: a.archived_at ? 0.5 : 1 }}
              onClick={() => can('bank_cash', 'update') && setEdit(a)}
            >
              <div className="stat-label">
                {t(`fin.bank.kind.${a.kind}`)} · {a.name}
              </div>
              <div
                className="stat-value"
                style={{ fontSize: 'var(--fs-xl)', color: num(a.balance) < 0 ? 'var(--danger)' : undefined }}
              >
                {formatMoney(a.balance, lang, false)}
              </div>
              <div className="stat-sub">
                {[a.bank_name, a.account_number].filter(Boolean).join(' · ') || 'UZS'}
              </div>
            </button>
          ))}
        </div>
      )}
      {edit && <CashAccountModal account={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </section>
  );
}
function CashAccountModal({ account, onClose }: { account: CashAccount | null; onClose: () => void }) {
  const { t } = useT();
  const [name, setName] = useState(account?.name ?? '');
  const [kind, setKind] = useState<'bank' | 'cash'>(account?.kind ?? 'bank');
  const [number, setNumber] = useState(account?.account_number ?? '');
  const [bank, setBank] = useState(account?.bank_name ?? '');
  const [archived, setArchived] = useState(Boolean(account?.archived_at));
  const save = useFinanceMutation(
    () =>
      account
        ? api(`/v1/cash-accounts/${account.id}`, {
            method: 'PATCH',
            body: {
              version: account.version,
              name,
              kind,
              account_number: number || null,
              bank_name: bank || null,
              archived,
            },
          })
        : api('/v1/cash-accounts', { method: 'POST', body: { name, kind } }),
    onClose,
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={t('fin.bank.new_account')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => save.mutate(undefined)}
            loading={save.isPending}
            disabled={name.trim().length < 1}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <Input label={t('fin.bank.account_name')} value={name} onChange={(e) => setName(e.target.value)} />
        <Select
          label={t('fin.kind')}
          value={kind}
          onChange={(e) => setKind(e.target.value as 'bank' | 'cash')}
        >
          <option value="bank">{t('fin.bank.kind.bank')}</option>
          <option value="cash">{t('fin.bank.kind.cash')}</option>
        </Select>
        {account && (
          <>
            <Input label={t('fin.bank.bank_name')} value={bank} onChange={(e) => setBank(e.target.value)} />
            <Input
              label={t('fin.bank.account_number')}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
            <label className="checkbox">
              <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />{' '}
              {t('fin.counterparties.archive')}
            </label>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ---------------- Counterparties ---------------- */
export function CounterpartiesPage() {
  const { t, lang } = useT();
  const { can } = useAuth();
  const query = useCounterparties();
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<Counterparty | 'new' | null>(null);
  const columns: Column<Counterparty>[] = [
    {
      key: 'name',
      header: t('common.name'),
      sortValue: (r) => r.name,
      render: (r) => (
        <>
          <div className="cell-main">{r.name}</div>
          <div className="cell-sub">
            {[r.inn && `${t('fin.counterparties.inn')}: ${r.inn}`, r.phone, r.contact]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </>
      ),
    },
    {
      key: 'kind',
      header: t('fin.kind'),
      sortValue: (r) => r.kind,
      render: (r) => (
        <Badge tone={r.kind === 'customer' ? 'success' : r.kind === 'employee' ? 'brand' : 'info'}>
          {t(`fin.counterparties.kind.${r.kind}`)}
        </Badge>
      ),
    },
    {
      key: 'debt',
      header: t('fin.counterparties.debt'),
      align: 'right',
      sortValue: (r) => num(r.debt),
      render: (r) =>
        num(r.debt) ? (
          <b style={{ color: 'var(--warning)' }}>{formatMoney(r.debt, lang, false)}</b>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'advance',
      header: t('fin.counterparties.advance'),
      align: 'right',
      render: (r) =>
        num(r.advance) ? formatMoney(r.advance, lang, false) : <span className="muted">—</span>,
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (r) =>
        r.archived_at ? (
          <Badge>{t('fin.counterparties.archived')}</Badge>
        ) : (
          <Badge tone="success">{t('common.active')}</Badge>
        ),
    },
    {
      key: 'act',
      header: '',
      className: 'actions',
      render: (r) => (
        <span className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
          {can('reconciliation') && (
            <Link className="btn btn-ghost btn-sm" to={`/app/finance/reconciliation?counterparty=${r.id}`}>
              {t('fin.counterparties.statement')}
            </Link>
          )}
          {can('counterparties', 'update') && (
            <Button size="sm" variant="secondary" onClick={() => setEdit(r)}>
              {t('common.edit')}
            </Button>
          )}
        </span>
      ),
    },
  ];
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader
        title={t('fin.counterparties.title')}
        description={t('fin.counterparties.sub')}
        actions={
          can('counterparties', 'create') ? (
            <Button icon={<Plus />} onClick={() => setEdit('new')}>
              {t('fin.counterparties.new')}
            </Button>
          ) : undefined
        }
      />
      <div className="toolbar">
        <SearchInput value={search} onChange={setSearch} />
      </div>
      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(r) => r.id}
        loading={query.isLoading}
        error={
          query.error
            ? errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)
            : null
        }
        onRetry={query.refetch}
        search={{ query: search, fields: (r) => [r.name, r.inn, r.phone, r.contact] }}
        empty={{ title: t('fin.counterparties.empty') }}
      />
      {edit && <CounterpartyModal c={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
function CounterpartyModal({ c, onClose }: { c: Counterparty | null; onClose: () => void }) {
  const { t } = useT();
  const [form, setForm] = useState({
    name: c?.name ?? '',
    kind: c?.kind ?? 'supplier',
    inn: c?.inn ?? '',
    phone: c?.phone ?? '',
    contact: c?.contact ?? '',
    bank_details: c?.bank_details ?? '',
    note: c?.note ?? '',
    archived: Boolean(c?.archived_at),
  });
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const save = useFinanceMutation(
    () =>
      c
        ? api(`/v1/counterparties/${c.id}`, {
            method: 'PATCH',
            body: {
              version: c.version,
              name: form.name,
              kind: form.kind,
              inn: form.inn || null,
              phone: form.phone || null,
              contact: form.contact || null,
              bank_details: form.bank_details || null,
              note: form.note || null,
              archived: form.archived,
            },
          })
        : api('/v1/counterparties', {
            method: 'POST',
            body: {
              name: form.name,
              kind: form.kind,
              ...(form.inn ? { inn: form.inn } : {}),
              ...(form.phone ? { phone: form.phone } : {}),
              ...(form.contact ? { contact: form.contact } : {}),
              ...(form.bank_details ? { bank_details: form.bank_details } : {}),
              ...(form.note ? { note: form.note } : {}),
            },
          }),
    onClose,
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={c ? c.name : t('fin.counterparties.new')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => save.mutate(undefined)}
            loading={save.isPending}
            disabled={form.name.trim().length < 1}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Input
          label={t('common.name')}
          required
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
        />
        <Select label={t('fin.kind')} value={form.kind} onChange={(e) => set('kind', e.target.value)}>
          {(['supplier', 'contractor', 'customer', 'employee'] as const).map((k) => (
            <option key={k} value={k}>
              {t(`fin.counterparties.kind.${k}`)}
            </option>
          ))}
        </Select>
        <Input
          label={t('fin.counterparties.inn')}
          value={form.inn}
          onChange={(e) => set('inn', e.target.value)}
        />
        <Input label={t('common.phone')} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        <Input
          wrapClassName="span-2"
          label={t('fin.counterparties.contact')}
          value={form.contact}
          onChange={(e) => set('contact', e.target.value)}
        />
        <Textarea
          wrapClassName="span-2"
          label={t('fin.counterparties.bank')}
          rows={2}
          value={form.bank_details}
          onChange={(e) => set('bank_details', e.target.value)}
        />
        <Textarea
          wrapClassName="span-2"
          label={t('common.reason')}
          rows={2}
          value={form.note}
          onChange={(e) => set('note', e.target.value)}
        />
        {c && (
          <label className="checkbox span-2">
            <input
              type="checkbox"
              checked={form.archived}
              onChange={(e) => set('archived', e.target.checked)}
            />{' '}
            {t('fin.counterparties.archive')}
          </label>
        )}
      </div>
    </Modal>
  );
}

/* ---------------- Budgets ---------------- */
export function BudgetsPage() {
  const { t, lang } = useT();
  const { can } = useAuth();
  const sel = useProjectSelection();
  const budgets = useBudgets(sel.projectId);
  const summary = useSummary(sel.projectId);
  const [edit, setEdit] = useState<Budget | 'new' | null>(null);
  const rows = useMemo(() => {
    const byMonth = new Map((summary.data?.monthly ?? []).map((m) => [m.month.slice(0, 10), m]));
    return (budgets.data?.items ?? []).map((b) => ({
      ...b,
      actual: byMonth.get(b.month.slice(0, 10))?.expense ?? '0',
    }));
  }, [budgets.data, summary.data]);
  const total = rows.reduce((s, r) => s + num(r.amount), 0);
  const totalActual = rows.reduce((s, r) => s + num(r.actual), 0);
  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: 'month',
      header: t('fin.budgets.month'),
      sortValue: (r) => r.month,
      render: (r) => monthLabel(r.month, lang),
    },
    {
      key: 'amount',
      header: t('fin.budgets.amount'),
      align: 'right',
      render: (r) => formatMoney(r.amount, lang, false),
    },
    {
      key: 'actual',
      header: t('fin.budgets.actual'),
      align: 'right',
      render: (r) => formatMoney(r.actual, lang, false),
    },
    {
      key: 'remaining',
      header: t('fin.budgets.remaining'),
      align: 'right',
      render: (r) => (
        <b style={{ color: num(r.amount) - num(r.actual) < 0 ? 'var(--danger)' : 'var(--success)' }}>
          {formatMoney(num(r.amount) - num(r.actual), lang, false)}
        </b>
      ),
    },
    {
      key: 'usage',
      header: t('fin.budgets.usage'),
      render: (r) => {
        const pct = num(r.amount) ? Math.round((num(r.actual) / num(r.amount)) * 100) : 0;
        return (
          <span className="row">
            <span
              className={`progress ${pct > 100 ? 'bad' : pct > 85 ? 'warn' : 'ok'}`}
              style={{ width: 120 }}
            >
              <span style={{ width: `${Math.min(100, pct)}%` }} />
            </span>
            <small>{pct}%</small>
          </span>
        );
      },
    },
    ...(can('budgets', 'update')
      ? ([
          {
            key: 'act',
            header: '',
            className: 'actions',
            render: (r) => (
              <Button size="sm" variant="secondary" onClick={() => setEdit(r)}>
                {t('common.edit')}
              </Button>
            ),
          },
        ] as Column<(typeof rows)[number]>[])
      : []),
  ];
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader
        title={t('fin.budgets.title')}
        description={t('fin.budgets.sub')}
        actions={
          can('budgets', 'create') && sel.projectId ? (
            <Button icon={<Plus />} onClick={() => setEdit('new')}>
              {t('fin.budgets.new')}
            </Button>
          ) : undefined
        }
      />
      <div className="toolbar">
        <ProjectSelect value={sel.projectId} onChange={sel.setProjectId} projects={sel.projects} />
      </div>
      <div className="grid-3">
        <Stat label={t('fin.budgets.total')} value={formatMoney(total, lang, false)} sub="UZS" />
        <Stat label={t('fin.budgets.actual')} value={formatMoney(totalActual, lang, false)} />
        <Stat label={t('fin.budgets.remaining')} value={formatMoney(total - totalActual, lang, false)} />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.month}
        loading={budgets.isLoading}
        empty={{ title: t('fin.budgets.empty') }}
      />
      {edit && (
        <BudgetModal
          projectId={sel.projectId}
          budget={edit === 'new' ? null : edit}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}
function BudgetModal({
  projectId,
  budget,
  onClose,
}: {
  projectId: string;
  budget: Budget | null;
  onClose: () => void;
}) {
  const { t } = useT();
  const [month, setMonth] = useState(budget?.month.slice(0, 7) ?? monthStart().slice(0, 7));
  const [amount, setAmount] = useState(budget?.amount ?? '');
  const save = useFinanceMutation(
    () =>
      api('/v1/budgets', {
        method: budget ? 'PATCH' : 'POST',
        body: {
          project_id: projectId,
          month: `${month}-01`,
          amount: normalizeNumber(amount),
          ...(budget ? { version: budget.version } : {}),
        },
      }),
    onClose,
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={t('fin.budgets.new')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!amount}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Input
          type="month"
          label={t('fin.budgets.month')}
          value={month}
          disabled={Boolean(budget)}
          onChange={(e) => setMonth(e.target.value)}
        />
        <Input
          label={t('fin.budgets.amount')}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
    </Modal>
  );
}

/* ---------------- Reconciliation (statement) ---------------- */
export function ReconciliationPage() {
  const { t, lang } = useT();
  const counterparties = useCounterparties();
  const params = new URLSearchParams(location.search);
  const [cp, setCp] = useState(params.get('counterparty') ?? '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const query = useQuery({
    queryKey: ['statement', cp, from, to],
    queryFn: () =>
      api<{
        counterparty: Counterparty;
        items: {
          id: string;
          kind: DocKind;
          amount: string;
          document_date: string;
          description: string;
          reference: string | null;
          project_name: string;
          payable_delta: string;
          advance_delta: string;
          running_debt: string;
        }[];
        totals: { debt: string; advance: string };
      }>(`/v1/counterparties/${cp}/statement${qs({ from: from || undefined, to: to || undefined })}`),
    enabled: Boolean(cp),
  });
  const d = query.data;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader title={t('fin.rec.title')} description={t('fin.rec.sub')} />
      <div className="toolbar">
        <Select
          aria-label={t('fin.rec.select')}
          value={cp}
          onChange={(e) => setCp(e.target.value)}
          style={{ minWidth: 280 }}
        >
          <option value="">{t('fin.rec.select')}</option>
          {(counterparties.data?.items ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {t(`fin.counterparties.kind.${c.kind}`)}
            </option>
          ))}
        </Select>
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
      </div>
      {d && (
        <>
          <div className="grid-3">
            <Stat label={t('fin.rec.total_debt')} value={formatMoney(d.totals.debt, lang, false)} sub="UZS" />
            <Stat
              label={t('fin.counterparties.advance')}
              value={formatMoney(d.totals.advance, lang, false)}
            />
            <Stat label={t('fin.documents')} value={d.items.length} />
          </div>
          <div className="table-wrap">
            <table className="table table-dense">
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('fin.kind')}</th>
                  <th>{t('dash.projects')}</th>
                  <th>{t('fin.description')}</th>
                  <th className="num">{t('fin.amount')}</th>
                  <th className="num">{t('fin.rec.running')}</th>
                </tr>
              </thead>
              <tbody>
                {d.items.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.document_date, lang)}</td>
                    <td>
                      <Badge tone={r.kind === 'payment' ? 'success' : 'warning'}>
                        {t(`fin.kind.${r.kind}`)}
                      </Badge>
                    </td>
                    <td>{r.project_name}</td>
                    <td>
                      {r.description}
                      {r.reference ? <span className="muted"> · {r.reference}</span> : null}
                    </td>
                    <td className="num">{formatMoney(r.amount, lang, false)}</td>
                    <td className="num">
                      <b>{formatMoney(r.running_debt, lang, false)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Payables helper export for calendar ---------------- */
export function PayablesList({ projectId }: { projectId: string }) {
  const { t, lang } = useT();
  const q = usePayables(projectId);
  const columns: Column<Payable>[] = [
    {
      key: 'due',
      header: t('fin.due_date'),
      sortValue: (r) => r.due_date ?? '9',
      render: (r) =>
        r.due_date ? (
          <span style={{ color: r.overdue ? 'var(--danger)' : undefined }}>
            {formatDate(r.due_date, lang)}
          </span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    { key: 'kind', header: t('fin.kind'), render: (r) => <Badge>{t(`fin.kind.${r.kind}`)}</Badge> },
    { key: 'cp', header: t('fin.counterparty'), render: (r) => r.counterparty_name ?? '—' },
    { key: 'desc', header: t('fin.description'), render: (r) => r.description },
    {
      key: 'out',
      header: t('fin.outstanding'),
      align: 'right',
      render: (r) => <b>{formatMoney(r.outstanding, lang, false)}</b>,
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={q.data?.items}
      rowKey={(r) => r.id}
      loading={q.isLoading}
      empty={{ title: t('fin.invoices.empty') }}
      dense
    />
  );
}
export { ProjectFilter, useProjectFilter };
