import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Printer } from 'lucide-react';
import { api, ApiError, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatMoney } from '@/lib/format';
import { displayCurrency } from '@/lib/currency-store';
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
  useListState,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { num, useCounterparties, useFinanceMutation, type Counterparty, type DocKind } from './model';

/**
 * Figma F5 (2026-10-17): "Kontragentlar bilan hisob-kitob" — KPI (debitorlik, kreditorlik, muddati o'tgan),
 * tur filtri, jadval (STIR, debitorlik, kreditorlik, oxirgi operatsiya, holat) va "Solishtirish" dalolatnomasi.
 * Debitorlik — berilgan avans (ular bizga qarz), kreditorlik — bizning qarz; hammasi serverdan.
 */
const kinds = ['supplier', 'contractor', 'customer', 'employee'] as const;
type CpState = 'archived' | 'overdue' | 'active';
const stateOf = (r: Counterparty): CpState =>
  r.archived_at ? 'archived' : num(r.overdue) > 0 ? 'overdue' : 'active';

export function CounterpartiesPage() {
  const { t, lang } = useT();
  const { can } = useAuth();
  const list = useListState();
  const [kind, setKind] = useState('');
  const query = useCounterparties({
    q: list.q,
    kind: kind || undefined,
    offset: list.offset,
    limit: list.limit,
  });
  const summary = query.data?.summary;
  const [edit, setEdit] = useState<Counterparty | 'new' | null>(null);
  const columns: Column<Counterparty>[] = [
    {
      key: 'name',
      header: t('fin.counterparty'),
      sortValue: (r) => r.name,
      render: (r) => (
        <>
          <div className="cell-main">{r.name}</div>
          <div className="cell-sub">
            {[t(`fin.counterparties.kind.${r.kind}`), r.phone, r.contact].filter(Boolean).join(' · ')}
          </div>
        </>
      ),
    },
    {
      key: 'inn',
      header: t('fin.counterparties.inn'),
      sortValue: (r) => r.inn ?? '',
      render: (r) => (r.inn ? <span className="mono">{r.inn}</span> : <span className="muted">—</span>),
    },
    {
      key: 'advance',
      header: t('fin.counterparties.receivable'),
      align: 'right',
      sortValue: (r) => num(r.advance),
      render: (r) =>
        num(r.advance) ? (
          <b className="mono" style={{ color: 'var(--warning)' }}>
            {formatMoney(r.advance, lang, false)}
          </b>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'debt',
      header: t('fin.counterparties.payable'),
      align: 'right',
      sortValue: (r) => num(r.debt),
      render: (r) =>
        num(r.debt) ? (
          <b className="mono" style={{ color: 'var(--danger)' }}>
            {formatMoney(r.debt, lang, false)}
          </b>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'last',
      header: t('fin.counterparties.last_activity'),
      sortValue: (r) => r.last_activity ?? '',
      render: (r) =>
        r.last_activity ? (
          <span className="mono">{formatDate(r.last_activity, lang)}</span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'status',
      header: t('common.status'),
      sortValue: (r) => stateOf(r),
      render: (r) => {
        const s = stateOf(r);
        return (
          <span className={`status-text-${s === 'active' ? 'active' : s === 'overdue' ? 'danger' : 'muted'}`}>
            {s === 'active'
              ? t('common.active')
              : s === 'overdue'
                ? t('fin.overdue')
                : t('fin.counterparties.archived')}
          </span>
        );
      },
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
    <div className="stack" style={{ gap: 16 }}>
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
      <div className="grid-3">
        <Stat
          label={t('fin.counterparties.kpi.receivable')}
          value={summary ? formatMoney(summary.advance, lang, false) : '—'}
          sub={displayCurrency()}
          tone={summary && num(summary.advance) > 0 ? 'warning' : undefined}
        />
        <Stat
          label={t('fin.counterparties.kpi.payable')}
          value={summary ? formatMoney(summary.debt, lang, false) : '—'}
          sub={displayCurrency()}
          tone={summary && num(summary.debt) > 0 ? 'danger' : undefined}
        />
        <Stat
          label={t('fin.counterparties.kpi.overdue')}
          value={summary ? formatMoney(summary.overdue, lang, false) : '—'}
          sub={displayCurrency()}
          tone={summary && num(summary.overdue) > 0 ? 'danger' : undefined}
        />
      </div>
      <div className="toolbar blocks-toolbar">
        <Select
          aria-label={t('fin.kind')}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            list.setOffset(0);
          }}
        >
          <option value="">
            {t('fin.kind')}: {t('common.all')}
          </option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {t(`fin.counterparties.kind.${k}`)}
            </option>
          ))}
        </Select>
        <SearchInput value={list.search} onChange={list.setSearch} />
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
        pagination={list.pagination}
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
          {kinds.map((k) => (
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

/* ---------------- Solishtirish (statement) ---------------- */
type StatementRow = {
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
};
/** Figma "Solishtirish": kontragent va davr, bizning ma'lumot kartasi, hujjatlar jadvali, dalolatnomani chop etish. */
export function ReconciliationPage() {
  const { t, lang } = useT();
  const [params] = useSearchParams();
  const [cp, setCp] = useState(params.get('counterparty') ?? '');
  const [cpName, setCpName] = useState<string | undefined>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const query = useQuery({
    queryKey: ['statement', cp, from, to],
    queryFn: () =>
      api<{
        counterparty: Counterparty;
        items: StatementRow[];
        totals: { debt: string; advance: string };
      }>(`/v1/counterparties/${cp}/statement${qs({ from: from || undefined, to: to || undefined })}`),
    enabled: Boolean(cp),
  });
  const d = query.data;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader
        title={t('fin.rec.title')}
        description={t('fin.rec.sub')}
        actions={
          d ? (
            <Button icon={<Printer />} onClick={() => window.print()}>
              {t('fin.rec.generate')}
            </Button>
          ) : undefined
        }
      />
      <div className="toolbar blocks-toolbar">
        <SearchSelect<Counterparty>
          path="/v1/counterparties"
          aria-label={t('fin.rec.select')}
          placeholder={t('fin.rec.select')}
          value={cp}
          valueLabel={cpName ?? query.data?.counterparty.name}
          onChange={(id, item) => {
            setCp(id);
            setCpName(item?.name);
          }}
          getId={(c) => c.id}
          getLabel={(c) => c.name}
          getSub={(c) => t(`fin.counterparties.kind.${c.kind}`)}
        />
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
      {query.isError && (
        <Alert tone="danger">
          {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
        </Alert>
      )}
      {d && (
        <>
          <section className="card">
            <div className="card-header">
              <h3>
                {t('fin.rec.our_data')}
                <span className="card-sub">{d.counterparty.name}</span>
              </h3>
            </div>
            <div className="grid-3" style={{ padding: 16 }}>
              <div>
                <div className="stat-label">{t('fin.rec.total_debt')}</div>
                <div className="stat-value is-danger" style={{ fontSize: 'var(--fs-xl)' }}>
                  {formatMoney(d.totals.debt, lang, false)} {displayCurrency()}
                </div>
              </div>
              <div>
                <div className="stat-label">{t('fin.counterparties.advance')}</div>
                <div className="stat-value is-success" style={{ fontSize: 'var(--fs-xl)' }}>
                  {formatMoney(d.totals.advance, lang, false)} {displayCurrency()}
                </div>
              </div>
              <div>
                <div className="stat-label">{t('fin.rec.count')}</div>
                <div className="stat-value" style={{ fontSize: 'var(--fs-xl)' }}>
                  {d.items.length}
                </div>
              </div>
            </div>
            <p className="card-pad muted text-sm" style={{ paddingTop: 0 }}>
              {t('fin.rec.one_sided')}
            </p>
          </section>
          <div className="table-wrap">
            <table className="table table-dense">
              <thead>
                <tr>
                  <th>{t('fin.rec.document')}</th>
                  <th>{t('common.date')}</th>
                  <th>{t('dash.projects')}</th>
                  <th>{t('fin.description')}</th>
                  <th className="num">
                    {t('fin.amount_col')} ({displayCurrency()})
                  </th>
                  <th className="num">{t('fin.rec.running')}</th>
                </tr>
              </thead>
              <tbody>
                {d.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Badge tone={r.kind === 'payment' ? 'success' : 'warning'}>
                        {t(`fin.kind.${r.kind}`)}
                      </Badge>
                      {r.reference ? <span className="mono muted"> {r.reference}</span> : null}
                    </td>
                    <td className="mono">{formatDate(r.document_date, lang)}</td>
                    <td>{r.project_name}</td>
                    <td>{r.description}</td>
                    <td className="num mono">{formatMoney(r.amount, lang, false)}</td>
                    <td className="num">
                      <b className="mono">{formatMoney(r.running_debt, lang, false)}</b>
                    </td>
                  </tr>
                ))}
                {d.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ padding: 16, textAlign: 'center' }}>
                      {t('fin.documents_empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
