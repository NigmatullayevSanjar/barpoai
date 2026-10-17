import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatMoney } from '@/lib/format';
import { displayCurrency } from '@/lib/currency-store';
import { Badge, Button, Input, Modal, PageHeader, Select, Textarea, useListState } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { normalizeNumber } from '@/features/estimates/model';
import { ProjectFilter, useProjectFilter } from './pages';
import {
  num,
  useCashBalances,
  useFinanceMutation,
  usePayables,
  usePaymentRequests,
  type Counterparty,
  type PaymentRequest,
} from './model';

/**
 * Figma F5 (2026-10-17) "To'lov so'rovlari": filtr kartasi (obyekt, holat), jadval — so'rov sanasi, so'rovchi,
 * kontragent, tavsif, summa, holat, harakatlar (tasdiqlash / rad etish / to'lash). Mantiq avvalgidek: faqat
 * finance.allocate egasi yoki admin tasdiqlaydi, o'z so'rovini tasdiqlab bo'lmaydi.
 */
const tone = {
  pending: 'warning',
  approved: 'info',
  rejected: 'danger',
  paid: 'success',
  cancelled: 'neutral',
} as const;

export function PaymentRequestsPage() {
  const { t, lang } = useT();
  const { can, me, permissions } = useAuth();
  const f = useProjectFilter();
  const [status, setStatus] = useState('');
  const list = useListState();
  const [create, setCreate] = useState(false);
  const [act, setAct] = useState<{
    r: PaymentRequest;
    action: 'approve' | 'reject' | 'cancel' | 'pay';
  } | null>(null);
  const query = usePaymentRequests(f.projectId, status || undefined, list);
  const canApprove = me?.role === 'tenant_admin' || permissions?.permissions.includes('finance.allocate');
  const canPay = can('bank_cash', 'create');
  const mayDecide = (r: PaymentRequest) =>
    me?.role === 'tenant_admin' || (canApprove && r.requested_by !== me?.id);
  const columns: Column<PaymentRequest>[] = [
    {
      key: 'date',
      header: t('fin.pr.request_col'),
      sortValue: (r) => r.created_at,
      render: (r) => (
        <>
          <div className="cell-main mono">{formatDate(r.created_at, lang)}</div>
          {r.due_date && (
            <div className="cell-sub">
              {t('fin.due_date')}: {formatDate(r.due_date, lang)}
            </div>
          )}
        </>
      ),
    },
    {
      key: 'by',
      header: t('fin.pr.requested_by'),
      sortValue: (r) => r.requested_by_name,
      render: (r) => (
        <>
          <div>{r.requested_by_name}</div>
          <div className="cell-sub">{r.project_name}</div>
        </>
      ),
    },
    {
      key: 'cp',
      header: t('fin.counterparty'),
      sortValue: (r) => r.counterparty_name,
      render: (r) => (
        <>
          <div className="cell-main">{r.counterparty_name}</div>
          {r.document_description && (
            <div className="cell-sub">
              {t(`fin.kind.${r.document_kind}`)}: {r.document_description}
            </div>
          )}
        </>
      ),
    },
    {
      key: 'purpose',
      header: t('fin.pr.purpose'),
      render: (r) => (
        <>
          <div>{r.purpose}</div>
          {r.decision_note && <div className="cell-sub">→ {r.decision_note}</div>}
        </>
      ),
    },
    {
      key: 'amount',
      header: `${t('fin.amount_col')} (${displayCurrency()})`,
      align: 'right',
      sortValue: (r) => num(r.amount),
      render: (r) => <b className="mono">{formatMoney(r.amount, lang, false)}</b>,
    },
    {
      key: 'status',
      header: t('common.status'),
      sortValue: (r) => r.status,
      render: (r) => <Badge tone={tone[r.status]}>{t(`fin.pr.status.${r.status}`)}</Badge>,
    },
    {
      key: 'act',
      header: t('fin.pr.actions'),
      className: 'actions',
      render: (r) => (
        <span className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
          {r.status === 'pending' && mayDecide(r) && (
            <Button size="sm" onClick={() => setAct({ r, action: 'approve' })}>
              {t('fin.pr.approve')}
            </Button>
          )}
          {r.status === 'approved' && canPay && r.document_id && (
            <Button size="sm" onClick={() => setAct({ r, action: 'pay' })}>
              {t('fin.pr.pay')}
            </Button>
          )}
          {(r.status === 'pending' || r.status === 'approved') && mayDecide(r) && (
            <Button size="sm" variant="ghost" onClick={() => setAct({ r, action: 'reject' })}>
              {t('fin.pr.reject')}
            </Button>
          )}
          {(r.status === 'pending' || r.status === 'approved') &&
            (r.requested_by === me?.id || me?.role === 'tenant_admin') && (
              <Button size="sm" variant="ghost" onClick={() => setAct({ r, action: 'cancel' })}>
                {t('common.cancel')}
              </Button>
            )}
          {(r.status === 'rejected' || r.status === 'paid') && r.approved_by_name && (
            <span className="muted text-xs">{r.approved_by_name}</span>
          )}
        </span>
      ),
    },
  ];
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader
        title={t('fin.pr.title')}
        description={t('fin.pr.sub')}
        actions={
          can('payment_requests', 'create') ? (
            <Button icon={<Plus />} onClick={() => setCreate(true)}>
              {t('fin.pr.new')}
            </Button>
          ) : undefined
        }
      />
      <div className="toolbar blocks-toolbar">
        <span className="filters-label">{t('fin.filters')}</span>
        <ProjectFilter f={f} onChange={() => list.setOffset(0)} />
        <Select
          aria-label={t('common.status')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            list.setOffset(0);
          }}
        >
          <option value="">
            {t('common.status')}: {t('common.all')}
          </option>
          {(['pending', 'approved', 'paid', 'rejected', 'cancelled'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`fin.pr.status.${s}`)}
            </option>
          ))}
        </Select>
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
        empty={{ title: t('fin.pr.empty') }}
      />
      {create && (
        <PaymentRequestModal
          projects={f.projects}
          defaultProject={f.all ? (f.projects[0]?.id ?? '') : f.projectId}
          onClose={() => setCreate(false)}
        />
      )}
      {act && <PaymentRequestActionModal r={act.r} action={act.action} onClose={() => setAct(null)} />}
    </div>
  );
}
function PaymentRequestModal({
  projects,
  defaultProject,
  onClose,
}: {
  projects: { id: string; name: string }[];
  defaultProject: string;
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const [project, setProject] = useState(defaultProject);
  const [cp, setCp] = useState('');
  const [cpName, setCpName] = useState<string | undefined>();
  const [doc, setDoc] = useState('');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState('');
  const [purpose, setPurpose] = useState('');
  const payables = usePayables(project, cp ? { counterparty_id: cp } : {}, { offset: 0, limit: 100 });
  const save = useFinanceMutation(
    () =>
      api('/v1/finance/payment-requests', {
        method: 'POST',
        body: {
          project_id: project,
          counterparty_id: cp,
          ...(doc ? { document_id: doc } : {}),
          amount: normalizeNumber(amount),
          ...(due ? { due_date: due } : {}),
          purpose: purpose.trim(),
        },
      }),
    onClose,
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={t('fin.pr.new')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => save.mutate(undefined)}
            loading={save.isPending}
            disabled={!project || !cp || !amount || purpose.trim().length < 5}
          >
            {t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Select
          label={t('erp.select_project')}
          value={project}
          onChange={(e) => {
            setProject(e.target.value);
            setDoc('');
          }}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <SearchSelect<Counterparty>
          path="/v1/counterparties"
          params={{ archived: false }}
          label={t('fin.counterparty')}
          value={cp}
          valueLabel={cpName}
          onChange={(id, item) => {
            setCp(id);
            setCpName(item?.name);
            setDoc('');
          }}
          getId={(c) => c.id}
          getLabel={(c) => c.name}
          getSub={(c) => t(`fin.counterparties.kind.${c.kind}`)}
        />
        <Select
          wrapClassName="span-2"
          label={t('fin.pr.document')}
          hint={t('fin.pr.document_hint')}
          value={doc}
          onChange={(e) => {
            setDoc(e.target.value);
            const p = payables.data?.items.find((x) => x.id === e.target.value);
            if (p) {
              setAmount(p.outstanding);
              if (p.due_date) setDue(p.due_date.slice(0, 10));
            }
          }}
        >
          <option value="">—</option>
          {(payables.data?.items ?? [])
            .filter((p) => p.project_id === project)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {t(`fin.kind.${p.kind}`)} · {p.description.slice(0, 40)} ·{' '}
                {formatMoney(p.outstanding, lang, true, 'UZS')}
              </option>
            ))}
        </Select>
        <Input
          label={t('fin.amount')}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Input type="date" label={t('fin.due_date')} value={due} onChange={(e) => setDue(e.target.value)} />
        <Textarea
          wrapClassName="span-2"
          label={t('fin.pr.purpose')}
          hint={t('common.reason_hint')}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        />
      </div>
    </Modal>
  );
}
function PaymentRequestActionModal({
  r,
  action,
  onClose,
}: {
  r: PaymentRequest;
  action: 'approve' | 'reject' | 'cancel' | 'pay';
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const cash = useCashBalances();
  const [cashAccount, setCashAccount] = useState('');
  const [note, setNote] = useState('');
  const save = useFinanceMutation(
    () =>
      api(`/v1/finance/payment-requests/${r.id}/actions`, {
        method: 'POST',
        body: {
          version: r.version,
          action,
          ...(action === 'pay' ? { cash_account_id: cashAccount } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      }),
    onClose,
  );
  const titles = {
    approve: 'fin.pr.approve',
    reject: 'fin.pr.reject',
    cancel: 'common.cancel',
    pay: 'fin.pr.pay',
  } as const;
  return (
    <Modal
      open
      onClose={onClose}
      title={t(titles[action])}
      description={`${r.counterparty_name} · ${formatMoney(r.amount, lang, true, 'UZS')} · ${r.purpose}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={action === 'reject' || action === 'cancel' ? 'danger' : 'primary'}
            onClick={() => save.mutate(undefined)}
            loading={save.isPending}
            disabled={action === 'pay' && !cashAccount}
          >
            {t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="stack">
        {action === 'pay' && (
          <Select
            label={t('fin.cash_account')}
            value={cashAccount}
            onChange={(e) => setCashAccount(e.target.value)}
          >
            <option value="">—</option>
            {(cash.data?.items ?? [])
              .filter((c) => !c.archived_at)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {formatMoney(c.balance, lang, true, 'UZS')}
                </option>
              ))}
          </Select>
        )}
        <Textarea label={t('fin.pr.note')} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}
