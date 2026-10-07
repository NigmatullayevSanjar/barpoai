import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { formatDate, formatMoney } from '@/lib/format';
import { Badge, Button, Modal, Textarea } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { kindTone, payableKinds, useFinanceMutation, type DocKind, type FinanceDocument } from './model';
import { DocumentModal } from './DocumentModal';

export function DocumentsTable({
  docs,
  loading,
  error,
  onRetry,
  projectId,
  showProject,
  allowPay,
}: {
  docs?: FinanceDocument[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  projectId: string;
  showProject?: boolean;
  allowPay?: boolean;
}) {
  const { t, lang } = useT();
  const { permissions, me } = useAuth();
  const canReverse = me?.role === 'tenant_admin' || permissions?.permissions.includes('finance.reverse');
  const [reverse, setReverse] = useState<FinanceDocument | null>(null);
  const [pay, setPay] = useState<FinanceDocument | null>(null);
  const columns: Column<FinanceDocument>[] = [
    {
      key: 'date',
      header: t('fin.document_date'),
      sortValue: (r) => r.document_date,
      render: (r) => (
        <>
          <div>{formatDate(r.document_date, lang)}</div>
          {r.due_date && (
            <div className="cell-sub">
              {t('fin.due_date')}: {formatDate(r.due_date, lang)}
            </div>
          )}
        </>
      ),
    },
    {
      key: 'kind',
      header: t('fin.kind'),
      sortValue: (r) => r.kind,
      render: (r) => <Badge tone={kindTone[r.kind]}>{t(`fin.kind.${r.kind}`)}</Badge>,
    },
    {
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
          {r.kind === 'payment' && r.cash_account_name && (
            <div className="cell-sub">{r.cash_account_name}</div>
          )}
        </>
      ),
    },
    {
      key: 'desc',
      header: t('fin.description'),
      render: (r) => (
        <>
          <div>{r.description}</div>
          <div className="cell-sub">
            {[r.reference, r.matched_material_name, r.allocated_invoice_description, r.zone_name]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </>
      ),
    },
    {
      key: 'amount',
      header: t('fin.amount'),
      align: 'right',
      sortValue: (r) => Number(r.amount),
      render: (r) => (
        <b style={{ textDecoration: r.reversed ? 'line-through' : undefined }}>
          {formatMoney(r.amount, lang, false)}
        </b>
      ),
    },
    {
      key: 'outstanding',
      header: t('fin.outstanding'),
      align: 'right',
      render: (r) =>
        r.outstanding === null ? (
          <span className="muted">—</span>
        ) : Number(r.outstanding) > 0 ? (
          <Badge
            tone={r.due_date && r.due_date < new Date().toISOString().slice(0, 10) ? 'danger' : 'warning'}
          >
            {formatMoney(r.outstanding, lang, false)}
          </Badge>
        ) : (
          <Badge tone="success">{t('fin.paid')}</Badge>
        ),
    },
    {
      key: 'who',
      header: t('fin.created_by'),
      render: (r) => <span className="text-xs muted">{r.created_by_name}</span>,
    },
    {
      key: 'act',
      header: '',
      className: 'actions',
      render: (r) => (
        <span className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
          {r.reversed && <Badge tone="danger">{t('fin.reversed')}</Badge>}
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
  ];
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
      <span hidden>{showProject ? 1 : 0}</span>
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
      description={`${t(`fin.kind.${doc.kind}`)} · ${formatMoney(doc.amount, lang)} · ${doc.description}`}
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
