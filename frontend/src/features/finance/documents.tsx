import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatMoney } from '@/lib/format';
import { displayCurrency } from '@/lib/currency-store';
import {
  Alert,
  Button,
  Input,
  Modal,
  PageHeader,
  Segmented,
  Select,
  Stat,
  useListState,
} from '@/components/ui';
import { ProjectSelect, useProjectSelection } from '@/features/common/ProjectSelect';
import { DocumentModal } from './DocumentModal';
import { DocumentsTable, kindsFor, type DocsVariant } from './DocumentsTable';
import {
  num,
  useCashBalances,
  useDocuments,
  useFinanceMutation,
  usePricesVisible,
  type CashAccount,
  type DocKind,
} from './model';

/**
 * Figma F5 (2026-10-17): Birlamchi hujjatlar, Hisoblar va dalolatnomalar, Bank va kassa, Talabnomalarga pul ajratish —
 * bitta hujjatlar sahifasining to'rt ko'rinishi. KPI (summary) va filtrlar serverdan; summalar hisoblanmaydi.
 */
type Page = 'accounting_documents' | 'invoices' | 'bank_cash' | 'allocations';
const variantOf: Record<Page, DocsVariant> = {
  accounting_documents: 'documents',
  invoices: 'invoices',
  bank_cash: 'cash',
  allocations: 'allocations',
};
/** Figma "Hisoblar va dalolatnomalar" segmenti: schyot-fakturalar (invoys, boshlang'ich qarz) va dalolatnomalar (mehnat, texnika, xizmat). */
const invoiceSegments: Record<string, DocKind[]> = {
  invoice: ['supplier_invoice', 'opening_debt'],
  act: ['labor', 'equipment', 'service'],
};
const titles = {
  accounting_documents: ['fin.docs.title', 'fin.docs.sub', 'fin.new_document'],
  invoices: ['fin.invoices.title', 'fin.invoices.sub', 'fin.invoices.new'],
  bank_cash: ['fin.bank.title', 'fin.bank.sub', 'fin.bank.new_operation'],
  allocations: ['fin.alloc.title', 'fin.alloc.sub', 'fin.alloc.new'],
} as const;

export function DocumentsPage({ page }: { page: Page }) {
  const { t, lang } = useT();
  const { can } = useAuth();
  const sel = useProjectSelection();
  const prices = usePricesVisible();
  const kinds = kindsFor(page);
  const [segment, setSegment] = useState('');
  const [kind, setKind] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [modal, setModal] = useState(false);
  const [unpaidOnly, setUnpaidOnly] = useState(page === 'invoices');
  const list = useListState();
  const segmentKinds = page === 'invoices' && segment ? invoiceSegments[segment]! : kinds;
  const query = useDocuments(
    sel.projectId,
    {
      kind: kind || segmentKinds.join(','),
      from: from || undefined,
      to: to || undefined,
      unpaid: page === 'invoices' && unpaidOnly ? true : undefined,
      cash_kind: page === 'bank_cash' && segment ? segment : undefined,
    },
    list,
  );
  const summary = query.data?.summary;
  const cash = useCashBalances();
  const accounts = cash.data?.items ?? [];
  const countOf = (k: CashAccount['kind']) => accounts.filter((a) => a.kind === k && !a.archived_at).length;
  const reset = () => list.setOffset(0);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader
        title={t(titles[page][0])}
        description={t(titles[page][1])}
        actions={
          can(page, 'create') && sel.projectId ? (
            <Button icon={<Plus />} onClick={() => setModal(true)}>
              {t(titles[page][2])}
            </Button>
          ) : undefined
        }
      />
      {!prices && <Alert tone="warning">{t('fin.no_prices')}</Alert>}
      {page === 'bank_cash' && (
        <>
          <div className="grid-2">
            <Stat
              label={t('fin.bank.kpi.bank')}
              value={cash.data?.summary ? formatMoney(cash.data.summary.bank, lang, false) : '—'}
              sub={`${displayCurrency()} · ${t('fin.bank.accounts_n', { n: countOf('bank') })}`}
              tone={cash.data?.summary && num(cash.data.summary.bank) < 0 ? 'danger' : undefined}
            />
            <Stat
              label={t('fin.bank.kpi.cash')}
              value={cash.data?.summary ? formatMoney(cash.data.summary.cash, lang, false) : '—'}
              sub={`${displayCurrency()} · ${t('fin.bank.accounts_n', { n: countOf('cash') })}`}
              tone={cash.data?.summary && num(cash.data.summary.cash) < 0 ? 'danger' : undefined}
            />
          </div>
          <CashAccountsPanel accounts={accounts} />
        </>
      )}
      {page === 'invoices' && summary && (
        <div className="grid-4">
          <Stat label={t('fin.invoices.kpi.total')} value={summary.count} />
          <Stat label={t('fin.state.paid')} value={summary.paid_count} tone="success" />
          <Stat
            label={t('fin.state.open')}
            value={summary.open_count}
            tone={summary.open_count > 0 ? 'warning' : undefined}
          />
          <Stat
            label={t('fin.state.overdue')}
            value={summary.overdue_count}
            tone={summary.overdue_count > 0 ? 'danger' : undefined}
          />
        </div>
      )}
      {page === 'allocations' && summary && (
        <div className="grid-3">
          <Stat label={t('fin.alloc.kpi.count')} value={summary.count} />
          <Stat
            label={t('fin.allocations')}
            value={formatMoney(summary.total, lang, false)}
            sub={displayCurrency()}
            tone="success"
          />
          <Stat label={t('dash.projects')} value={sel.project?.name ?? '—'} />
        </div>
      )}
      <div className="toolbar blocks-toolbar">
        {page === 'invoices' && (
          <Segmented
            value={segment}
            onChange={(v) => {
              setSegment(v);
              setKind('');
              reset();
            }}
            items={[
              { key: '', label: t('common.all') },
              { key: 'invoice', label: t('fin.invoices.segment.invoice') },
              { key: 'act', label: t('fin.invoices.segment.act') },
            ]}
          />
        )}
        {page === 'bank_cash' && (
          <Segmented
            value={segment}
            onChange={(v) => {
              setSegment(v);
              reset();
            }}
            items={[
              { key: '', label: t('common.all') },
              { key: 'bank', label: t('fin.bank.segment.bank') },
              { key: 'cash', label: t('fin.bank.segment.cash') },
            ]}
          />
        )}
        <ProjectSelect
          value={sel.projectId}
          onChange={(id) => {
            sel.setProjectId(id);
            reset();
          }}
          projects={sel.projects}
        />
        <Select
          aria-label={t('fin.kind')}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            reset();
          }}
        >
          <option value="">
            {t('fin.kind')}: {t('common.all')}
          </option>
          {segmentKinds.map((k) => (
            <option key={k} value={k}>
              {t(`fin.kind.${k}`)}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          aria-label={t('fin.filter_from')}
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            reset();
          }}
          style={{ width: 150 }}
        />
        <Input
          type="date"
          aria-label={t('fin.filter_to')}
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            reset();
          }}
          style={{ width: 150 }}
        />
        {page === 'invoices' && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={unpaidOnly}
              onChange={(e) => {
                setUnpaidOnly(e.target.checked);
                reset();
              }}
            />{' '}
            {t('fin.invoices.unpaid')}
          </label>
        )}
      </div>
      <DocumentsTable
        variant={variantOf[page]}
        docs={query.data?.items}
        loading={query.isLoading}
        error={
          query.error
            ? errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)
            : null
        }
        onRetry={query.refetch}
        projectId={sel.projectId}
        allowPay={page === 'invoices' && can('bank_cash', 'create')}
        pagination={list.pagination}
      />
      {/* Avans hisobi faqat hisoblar jadvalidagi "Avansdan yopish" tugmasidan (summa serverdan oldindan to'ldiriladi). */}
      {modal && (
        <DocumentModal
          projectId={sel.projectId}
          kinds={kinds.filter((k) => k !== 'advance_offset')}
          onClose={() => setModal(false)}
        />
      )}
    </div>
  );
}

/** Bank va kassa hisoblari kartasi: har hisob qoldig'i serverdan; tahrirlash update ruxsati bilan. */
function CashAccountsPanel({ accounts }: { accounts: CashAccount[] }) {
  const { t, lang } = useT();
  const { can } = useAuth();
  const [edit, setEdit] = useState<CashAccount | 'new' | null>(null);
  return (
    <section className="card">
      <div className="card-header">
        <h3>{t('fin.bank.accounts')}</h3>
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
              type="button"
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
                {[a.bank_name, a.account_number].filter(Boolean).join(' · ') || displayCurrency()}
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
