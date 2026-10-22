import { useState, type ComponentProps } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { formatDate, formatMoney } from '@/lib/format';
import { displayCurrency } from '@/lib/currency-store';
import { Badge, Button, Modal, Textarea } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { kindTone, payableKinds, useFinanceMutation, type DocKind, type FinanceDocument } from './model';
import { DocumentModal } from './DocumentModal';

/** Figma F5 jadval ko'rinishlari: birlamchi hujjatlar, hisoblar, bank/kassa operatsiyalari, ajratmalar. */
export type DocsVariant = 'documents' | 'invoices' | 'cash' | 'allocations';
export type DocState = 'reversed' | 'paid' | 'overdue' | 'open' | 'posted';

/** Hujjat holati: qarz hujjatlarida to'lov bo'yicha, boshqalarda "o'tkazilgan"; teskari qilingan — alohida. */
export function docState(r: FinanceDocument): DocState {
  if (r.reversed) return 'reversed';
  if (r.outstanding === null) return 'posted';
  if (Number(r.outstanding) <= 0) return 'paid';
  return r.due_date && r.due_date < new Date().toISOString().slice(0, 10) ? 'overdue' : 'open';
}
const stateTone: Record<DocState, 'danger' | 'success' | 'warning' | 'neutral'> = {
  reversed: 'danger',
  paid: 'success',
  overdue: 'danger',
  open: 'warning',
  posted: 'neutral',
};
const outKinds: DocKind[] = ['payment', 'advance', 'cash_transfer'];

export function DocumentsTable({
  docs,
  loading,
  error,
  onRetry,
  projectId,
  variant = 'documents',
  allowPay,
  pagination,
}: {
  docs?: FinanceDocument[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  projectId: string;
  variant?: DocsVariant;
  allowPay?: boolean;
  pagination?: ComponentProps<typeof DataTable>['pagination'];
}) {
  const { t, lang } = useT();
  const { permissions, me } = useAuth();
  const canReverse = me?.role === 'tenant_admin' || permissions?.permissions.includes('finance.reverse');
  const [reverse, setReverse] = useState<FinanceDocument | null>(null);
  const [pay, setPay] = useState<FinanceDocument | null>(null);
  const money = (v: string) => formatMoney(v, lang, false);
  const subOf = (r: FinanceDocument) =>
    [
      r.matched_material_name,
      r.allocated_invoice_description,
      r.zone_name,
      r.kind === 'reversal' ? t('fin.kind.reversal') : null,
    ]
      .filter(Boolean)
      .join(' · ');
  const c = {
    date: {
      key: 'date',
      header: t('common.date'),
      sortValue: (r) => r.document_date,
      render: (r) => <span className="mono">{formatDate(r.document_date, lang)}</span>,
    },
    dateDue: {
      key: 'date',
      header: t('common.date'),
      sortValue: (r) => r.document_date,
      render: (r) => (
        <>
          <div className="mono">{formatDate(r.document_date, lang)}</div>
          {r.due_date && (
            <div className="cell-sub">
              {t('fin.due_date')}: {formatDate(r.due_date, lang)}
            </div>
          )}
        </>
      ),
    },
    number: {
      key: 'ref',
      header: t('fin.reference'),
      sortValue: (r) => r.reference ?? '',
      render: (r) => (r.reference ? <b className="mono">{r.reference}</b> : <span className="muted">—</span>),
    },
    numberDesc: {
      key: 'ref',
      header: t('fin.invoices.number'),
      sortValue: (r) => r.reference ?? '',
      render: (r) => (
        <>
          <div className="cell-main mono">{r.reference ?? '—'}</div>
          <div className="cell-sub">{r.description}</div>
        </>
      ),
    },
    kind: {
      key: 'kind',
      header: t('fin.kind'),
      sortValue: (r) => r.kind,
      render: (r) => <Badge tone={kindTone[r.kind]}>{t(`fin.kind.${r.kind}`)}</Badge>,
    },
    party: {
      key: 'party',
      header: t('fin.counterparty'),
      sortValue: (r) => r.counterparty_name ?? '',
      render: (r) => (
        <>
          <div className="cell-main">{r.counterparty_name ?? r.cash_account_name ?? '—'}</div>
          {r.kind === 'cash_transfer' && (
            <div className="cell-sub">
              {r.cash_account_name} → {r.target_cash_account_name}
            </div>
          )}
          {r.kind === 'payment' && r.cash_account_name && variant !== 'cash' && (
            <div className="cell-sub">{r.cash_account_name}</div>
          )}
        </>
      ),
    },
    desc: {
      key: 'desc',
      header: t('fin.description'),
      render: (r) => (
        <>
          <div>{r.description}</div>
          <div className="cell-sub">{subOf(r)}</div>
        </>
      ),
    },
    descMain: {
      key: 'desc',
      header: variant === 'cash' ? t('fin.bank.doc_col') : t('fin.description'),
      render: (r) => (
        <>
          <div className="cell-main">{r.description}</div>
          <div className="cell-sub">{[r.reference, subOf(r)].filter(Boolean).join(' · ')}</div>
        </>
      ),
    },
    amount: {
      key: 'amount',
      header: `${t('fin.amount_col')} (${displayCurrency()})`,
      align: 'right',
      sortValue: (r) => Number(r.amount),
      render: (r) => (
        <b className="mono" style={{ textDecoration: r.reversed ? 'line-through' : undefined }}>
          {money(r.amount)}
        </b>
      ),
    },
    due: {
      key: 'due',
      header: t('fin.due_date'),
      sortValue: (r) => r.due_date ?? '',
      render: (r) =>
        r.due_date ? (
          <span className="mono">{formatDate(r.due_date, lang)}</span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    paid: {
      key: 'paid',
      header: t('fin.paid'),
      align: 'right',
      render: (r) =>
        r.paid === null ? (
          <span className="muted">—</span>
        ) : (
          <span className="money-in">{money(r.paid)}</span>
        ),
    },
    outstanding: {
      key: 'outstanding',
      header: t('fin.outstanding'),
      align: 'right',
      sortValue: (r) => Number(r.outstanding ?? 0),
      render: (r) =>
        r.outstanding === null ? (
          <span className="muted">—</span>
        ) : Number(r.outstanding) > 0 ? (
          <span className="money-out">{money(r.outstanding)}</span>
        ) : (
          <span className="mono">{money(r.outstanding)}</span>
        ),
    },
    state: {
      key: 'state',
      header: t('common.status'),
      sortValue: (r) => docState(r),
      render: (r) => {
        const s = docState(r);
        return <Badge tone={stateTone[s]}>{t(`fin.state.${s}`)}</Badge>;
      },
    },
    cashIn: {
      key: 'in',
      header: t('fin.cash_in'),
      align: 'right',
      render: (r) =>
        r.kind === 'receipt' ? (
          <span className="money-in">{money(r.amount)}</span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    cashOut: {
      key: 'out',
      header: t('fin.cash_out'),
      align: 'right',
      render: (r) =>
        outKinds.includes(r.kind) ? (
          <span className="money-out" style={{ textDecoration: r.reversed ? 'line-through' : undefined }}>
            {money(r.amount)}
          </span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    account: {
      key: 'acc',
      header: t('fin.cash_account'),
      render: (r) => (
        <>
          <div>{r.cash_account_name ?? '—'}</div>
          {r.target_cash_account_name && <div className="cell-sub">→ {r.target_cash_account_name}</div>}
        </>
      ),
    },
    who: {
      key: 'who',
      header: variant === 'allocations' ? t('fin.alloc.responsible') : t('fin.created_by'),
      render: (r) => <span className="text-xs muted">{r.created_by_name}</span>,
    },
    act: {
      key: 'act',
      header: '',
      className: 'actions',
      render: (r) => (
        <span className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
          {variant === 'cash' && r.reversed && <Badge tone="danger">{t('fin.reversed')}</Badge>}
          {allowPay && payableKinds.includes(r.kind) && !r.reversed && Number(r.outstanding) > 0 && (
            <Button size="sm" onClick={() => setPay(r)}>
              {t('fin.pay')}
            </Button>
          )}
          {canReverse && !r.reversed && r.kind !== 'reversal' && (
            <Button size="sm" variant="ghost" onClick={() => setReverse(r)}>
              {t('fin.reverse')}
            </Button>
          )}
        </span>
      ),
    },
  } satisfies Record<string, Column<FinanceDocument>>;
  const columns: Column<FinanceDocument>[] =
    variant === 'invoices'
      ? [c.numberDesc, c.party, c.date, c.due, c.amount, c.paid, c.outstanding, c.state, c.act]
      : variant === 'cash'
        ? [c.date, c.descMain, c.party, c.cashIn, c.cashOut, c.account, c.act]
        : variant === 'allocations'
          ? [c.date, c.descMain, c.party, c.kind, c.amount, c.who, c.act]
          : [c.number, c.kind, c.party, c.desc, c.dateDue, c.amount, c.state, c.act];
  return (
    <>
      <DataTable
        columns={columns}
        rows={docs}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        onRetry={onRetry}
        empty={{ title: t('fin.documents_empty') }}
        pagination={pagination}
        dense
      />
      {reverse && <ReverseModal doc={reverse} onClose={() => setReverse(null)} />}
      {pay && (
        <DocumentModal
          projectId={projectId}
          kinds={['payment']}
          preset={{
            counterparty_id: pay.counterparty_id ?? undefined,
            allocated_invoice_id: pay.id,
            amount: pay.outstanding ?? undefined,
          }}
          onClose={() => setPay(null)}
        />
      )}
    </>
  );
}
function ReverseModal({ doc, onClose }: { doc: FinanceDocument; onClose: () => void }) {
  const { t, lang } = useT();
  const [reason, setReason] = useState('');
  const m = useFinanceMutation(
    () => api(`/v1/finance/documents/${doc.id}/reverse`, { method: 'POST', body: { reason: reason.trim() } }),
    onClose,
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={t('fin.reverse')}
      description={`${t(`fin.kind.${doc.kind}`)} · ${formatMoney(doc.amount, lang, true, 'UZS')} · ${doc.description}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={() => m.mutate(undefined)}
            loading={m.isPending}
            disabled={reason.trim().length < 5}
          >
            {t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <p className="muted text-sm">{t('fin.reverse_confirm')}</p>
        <Textarea
          label={t('common.reason')}
          hint={t('common.reason_hint')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </Modal>
  );
}
export const kindsFor = (page: string): DocKind[] =>
  page === 'bank_cash'
    ? ['payment', 'receipt', 'advance', 'cash_transfer']
    : page === 'allocations'
      ? ['allocation', 'purchase_order']
      : page === 'invoices'
        ? ['supplier_invoice', 'labor', 'equipment', 'service', 'opening_debt']
        : [
            'allocation',
            'purchase_order',
            'supplier_invoice',
            'opening_debt',
            'labor',
            'equipment',
            'service',
            'payment',
            'receipt',
            'advance',
            'cash_transfer',
          ];
