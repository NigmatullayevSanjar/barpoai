import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, ApiError, qs, type ListResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatMoney, formatQuantity, monthStart, todayIso } from '@/lib/format';
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  Input,
  Modal,
  PageHeader,
  Select,
  Stat,
  Textarea,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ProjectSelect, useProjectSelection } from '@/features/common/ProjectSelect';
import { ExportButton } from '@/features/common/ExportButton';
import { normalizeNumber } from '@/features/estimates/model';
import type { Employee } from '@/features/projects/types';
import { ProjectFilter, useProjectFilter } from './pages';
import {
  monthLabel,
  num,
  useCashBalances,
  useCounterparties,
  useFinanceMutation,
  usePayables,
  usePaymentRequests,
  type PaymentRequest,
  type PayrollEntry,
  type PayrollPeriod,
} from './model';

/* ---------------- Payment requests ---------------- */
export function PaymentRequestsPage() {
  const { t, lang } = useT();
  const { can, me, permissions } = useAuth();
  const f = useProjectFilter();
  const [status, setStatus] = useState('');
  const [create, setCreate] = useState(false);
  const [act, setAct] = useState<{
    r: PaymentRequest;
    action: 'approve' | 'reject' | 'cancel' | 'pay';
  } | null>(null);
  const query = usePaymentRequests(f.projectId, status || undefined);
  const canApprove = me?.role === 'tenant_admin' || permissions?.permissions.includes('finance.allocate');
  const canPay = can('bank_cash', 'create');
  const tone = {
    pending: 'warning',
    approved: 'info',
    rejected: 'danger',
    paid: 'success',
    cancelled: 'neutral',
  } as const;
  const columns: Column<PaymentRequest>[] = [
    {
      key: 'date',
      header: t('common.date'),
      sortValue: (r) => r.created_at,
      render: (r) => (
        <>
          <div>{formatDate(r.created_at, lang)}</div>
          {r.due_date && (
            <div className="cell-sub">
              {t('fin.due_date')}: {formatDate(r.due_date, lang)}
            </div>
          )}
        </>
      ),
    },
    { key: 'project', header: t('dash.projects'), render: (r) => r.project_name },
    {
      key: 'cp',
      header: t('fin.counterparty'),
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
      header: t('fin.amount'),
      align: 'right',
      sortValue: (r) => num(r.amount),
      render: (r) => <b>{formatMoney(r.amount, lang, false)}</b>,
    },
    {
      key: 'by',
      header: t('fin.pr.requested_by'),
      render: (r) => (
        <>
          <div>{r.requested_by_name}</div>
          {r.approved_by_name && <div className="cell-sub">{r.approved_by_name}</div>}
        </>
      ),
    },
    {
      key: 'status',
      header: t('common.status'),
      sortValue: (r) => r.status,
      render: (r) => <Badge tone={tone[r.status]}>{t(`fin.pr.status.${r.status}`)}</Badge>,
    },
    {
      key: 'act',
      header: '',
      className: 'actions',
      render: (r) => (
        <span className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
          {r.status === 'pending' &&
            (me?.role === 'tenant_admin' || (canApprove && r.requested_by !== me?.id)) && (
              <Button size="sm" onClick={() => setAct({ r, action: 'approve' })}>
                {t('fin.pr.approve')}
              </Button>
            )}
          {r.status === 'approved' && canPay && r.document_id && (
            <Button size="sm" onClick={() => setAct({ r, action: 'pay' })}>
              {t('fin.pr.pay')}
            </Button>
          )}
          {(r.status === 'pending' || r.status === 'approved') &&
            (me?.role === 'tenant_admin' || (canApprove && r.requested_by !== me?.id)) && (
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
        </span>
      ),
    },
  ];
  return (
    <div className="stack" style={{ gap: 14 }}>
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
      <div className="toolbar">
        <ProjectFilter f={f} />
        <Select aria-label={t('common.status')} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('common.all')}</option>
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
  const counterparties = useCounterparties();
  const [project, setProject] = useState(defaultProject);
  const [cp, setCp] = useState('');
  const [doc, setDoc] = useState('');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState('');
  const [purpose, setPurpose] = useState('');
  const payables = usePayables(project, cp ? { counterparty_id: cp } : {});
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
        <Select
          label={t('fin.counterparty')}
          value={cp}
          onChange={(e) => {
            setCp(e.target.value);
            setDoc('');
          }}
        >
          <option value="">—</option>
          {(counterparties.data?.items ?? [])
            .filter((c) => !c.archived_at)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </Select>
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
                {t(`fin.kind.${p.kind}`)} · {p.description.slice(0, 40)} · {formatMoney(p.outstanding, lang)}
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
      description={`${r.counterparty_name} · ${formatMoney(r.amount, lang)} · ${r.purpose}`}
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
                  {c.name} · {formatMoney(c.balance, lang)}
                </option>
              ))}
          </Select>
        )}
        <Textarea label={t('fin.pr.note')} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}

/* ---------------- Payment calendar ---------------- */
export function PaymentCalendarPage() {
  const { t, lang } = useT();
  const f = useProjectFilter();
  const [range, setRange] = useState<'week' | 'month'>('month');
  const today = new Date();
  const from = todayIso();
  const toDate = new Date(today);
  toDate.setDate(toDate.getDate() + (range === 'week' ? 7 : 31));
  const to = toDate.toISOString().slice(0, 10);
  const query = useQuery({
    queryKey: ['finance-calendar', f.projectId, range],
    queryFn: () =>
      api<{
        documents: {
          id: string;
          kind: string;
          due_date: string;
          description: string;
          reference: string | null;
          project_name: string;
          counterparty_name: string | null;
          outstanding: string;
        }[];
        requests: {
          id: string;
          amount: string;
          due_date: string;
          purpose: string;
          status: string;
          project_name: string;
          counterparty_name: string;
        }[];
        overdue: { amount: string; count: number };
      }>(`/v1/finance/calendar${qs({ project_id: f.projectId || undefined, from, to })}`),
  });
  const d = query.data;
  const days = new Map<
    string,
    { label: string; amount: number; kind: string; who: string; project: string; status?: string }[]
  >();
  for (const doc of d?.documents ?? [])
    days.set(doc.due_date, [
      ...(days.get(doc.due_date) ?? []),
      {
        label: doc.description,
        amount: num(doc.outstanding),
        kind: t(`fin.kind.${doc.kind}`),
        who: doc.counterparty_name ?? '—',
        project: doc.project_name,
      },
    ]);
  for (const r of d?.requests ?? [])
    days.set(r.due_date, [
      ...(days.get(r.due_date) ?? []),
      {
        label: r.purpose,
        amount: num(r.amount),
        kind: t('fin.pr.title'),
        who: r.counterparty_name,
        project: r.project_name,
        status: t(`fin.pr.status.${r.status}`),
      },
    ]);
  const sorted = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
  const total = sorted.reduce((s, [, items]) => s + items.reduce((x, i) => x + i.amount, 0), 0);
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader title={t('fin.cal.title')} description={t('fin.cal.sub')} />
      <div className="toolbar">
        <ProjectFilter f={f} />
        <div className="segmented">
          <button type="button" aria-pressed={range === 'week'} onClick={() => setRange('week')}>
            {t('fin.cal.week')}
          </button>
          <button type="button" aria-pressed={range === 'month'} onClick={() => setRange('month')}>
            {t('fin.cal.month')}
          </button>
        </div>
      </div>
      <div className="grid-3">
        <Stat
          label={t('fin.cal.overdue_total')}
          value={d ? formatMoney(d.overdue.amount, lang, false) : '—'}
          sub={d ? `${d.overdue.count} ${t('fin.documents').toLowerCase()}` : undefined}
          accent={Boolean(d && num(d.overdue.amount) > 0)}
        />
        <Stat
          label={`${formatDate(from, lang)} — ${formatDate(to, lang)}`}
          value={formatMoney(total, lang, false)}
          sub="UZS"
        />
        <Stat label={t('fin.documents')} value={sorted.reduce((s, [, i]) => s + i.length, 0)} />
      </div>
      {sorted.length === 0 ? (
        <div className="card">
          <p className="card-pad muted">
            {t('fin.cal.empty')} {t('fin.cal.no_due')}
          </p>
        </div>
      ) : (
        sorted.map(([day, items]) => (
          <section key={day} className="card">
            <div className="card-header">
              <h3 style={{ color: day < from ? 'var(--danger)' : undefined }}>{formatDate(day, lang)}</h3>
              <b>
                {formatMoney(
                  items.reduce((s, i) => s + i.amount, 0),
                  lang,
                )}
              </b>
            </div>
            <table className="summary-table" style={{ width: '100%' }}>
              <tbody>
                {items.map((i, idx) => (
                  <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                    <td>
                      <Badge>{i.kind}</Badge>
                    </td>
                    <td>{i.who}</td>
                    <td>
                      {i.label}
                      {i.status ? <span className="muted"> · {i.status}</span> : null}
                    </td>
                    <td className="muted">{i.project}</td>
                    <td className="num">
                      <b>{formatMoney(i.amount, lang, false)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </div>
  );
}

/* ---------------- Payroll ---------------- */
export function PayrollPage() {
  const { t, lang } = useT();
  const { can } = useAuth();
  const sel = useProjectSelection();
  const query = useQuery({
    queryKey: ['payroll', sel.projectId],
    queryFn: () =>
      api<{ periods: PayrollPeriod[]; entries: PayrollEntry[] }>(
        `/v1/finance/payroll?project_id=${sel.projectId}`,
      ),
    enabled: Boolean(sel.projectId),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [newPeriod, setNewPeriod] = useState(false);
  const [month, setMonth] = useState(monthStart().slice(0, 7));
  const [entryModal, setEntryModal] = useState<PayrollEntry | 'new' | null>(null);
  const [postConfirm, setPostConfirm] = useState<PayrollPeriod | null>(null);
  const [payEntry, setPayEntry] = useState<PayrollEntry | null>(null);
  const period = query.data?.periods.find((p) => p.id === (selected ?? query.data?.periods[0]?.id));
  const entries = query.data?.entries.filter((e) => e.period_id === period?.id) ?? [];
  const createPeriod = useFinanceMutation(
    () =>
      api('/v1/finance/payroll/periods', {
        method: 'POST',
        body: { project_id: sel.projectId, month: `${month}-01` },
      }),
    () => setNewPeriod(false),
  );
  const post = useFinanceMutation(
    () =>
      api(`/v1/finance/payroll/periods/${postConfirm!.id}/post`, {
        method: 'POST',
        body: { version: postConfirm!.version },
      }),
    () => setPostConfirm(null),
  );
  const remove = useFinanceMutation((id: string) =>
    api(`/v1/finance/payroll/entries/${id}`, { method: 'DELETE' }),
  );
  const canEdit = can('payroll', 'create') && period?.status === 'open';
  const columns: Column<PayrollEntry>[] = [
    {
      key: 'name',
      header: t('fin.payroll.employee'),
      sortValue: (r) => r.employee_name,
      render: (r) => (
        <>
          <div className="cell-main">{r.employee_name}</div>
          <div className="cell-sub">{r.position ?? t(`role.${r.employee_role}`)}</div>
        </>
      ),
    },
    {
      key: 'base',
      header: t('fin.payroll.base'),
      align: 'right',
      render: (r) => formatMoney(r.base_salary, lang, false),
    },
    {
      key: 'bonus',
      header: t('fin.payroll.bonus'),
      align: 'right',
      render: (r) => formatMoney(r.bonus, lang, false),
    },
    {
      key: 'ded',
      header: t('fin.payroll.deduction'),
      align: 'right',
      render: (r) => formatMoney(r.deduction, lang, false),
    },
    {
      key: 'net',
      header: t('fin.payroll.net'),
      align: 'right',
      sortValue: (r) => num(r.net),
      render: (r) => <b>{formatMoney(r.net, lang, false)}</b>,
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (r) => (
        <Badge tone={r.status === 'paid' ? 'success' : r.status === 'posted' ? 'info' : 'neutral'}>
          {t(`fin.payroll.entry_status.${r.status}`)}
        </Badge>
      ),
    },
    {
      key: 'act',
      header: '',
      className: 'actions',
      render: (r) => (
        <span className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
          {canEdit && (
            <Button size="sm" variant="secondary" onClick={() => setEntryModal(r)}>
              {t('common.edit')}
            </Button>
          )}
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)}>
              {t('common.delete')}
            </Button>
          )}
          {r.status === 'posted' && can('bank_cash', 'create') && (
            <Button size="sm" onClick={() => setPayEntry(r)}>
              {t('fin.payroll.pay')}
            </Button>
          )}
        </span>
      ),
    },
  ];
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader
        title={t('fin.payroll.title')}
        description={t('fin.payroll.sub')}
        actions={
          can('payroll', 'create') && sel.projectId ? (
            <Button icon={<Plus />} onClick={() => setNewPeriod(true)}>
              {t('fin.payroll.new_period')}
            </Button>
          ) : undefined
        }
      />
      <div className="toolbar">
        <ProjectSelect value={sel.projectId} onChange={sel.setProjectId} projects={sel.projects} />
        {query.data && query.data.periods.length > 0 && (
          <Select
            aria-label={t('fin.payroll.period')}
            value={period?.id ?? ''}
            onChange={(e) => setSelected(e.target.value)}
          >
            {query.data.periods.map((p) => (
              <option key={p.id} value={p.id}>
                {monthLabel(p.month, lang)} · {t(`fin.payroll.status.${p.status}`)}
              </option>
            ))}
          </Select>
        )}
      </div>
      {query.data && query.data.periods.length === 0 && (
        <div className="card">
          <p className="card-pad muted">{t('fin.payroll.empty')}</p>
        </div>
      )}
      {period && (
        <>
          <div className="grid-4">
            <Stat
              label={t('fin.payroll.period')}
              value={monthLabel(period.month, lang)}
              sub={t(`fin.payroll.status.${period.status}`)}
            />
            <Stat label={t('fin.payroll.employee')} value={period.entries} />
            <Stat label={t('fin.payroll.total')} value={formatMoney(period.total, lang, false)} sub="UZS" />
            <Stat label={t('fin.payroll.paid')} value={formatMoney(period.paid, lang, false)} />
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            {canEdit && (
              <Button variant="secondary" icon={<Plus />} onClick={() => setEntryModal('new')}>
                {t('fin.payroll.add_entry')}
              </Button>
            )}
            {canEdit && entries.length > 0 && (
              <Button onClick={() => setPostConfirm(period)}>{t('fin.payroll.post')}</Button>
            )}
          </div>
          <DataTable
            columns={columns}
            rows={entries}
            rowKey={(r) => r.id}
            empty={{ title: t('fin.payroll.no_entries') }}
          />
        </>
      )}
      <Modal
        open={newPeriod}
        onClose={() => setNewPeriod(false)}
        title={t('fin.payroll.new_period')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setNewPeriod(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => createPeriod.mutate(undefined)} loading={createPeriod.isPending}>
              {t('common.create')}
            </Button>
          </>
        }
      >
        <Input
          type="month"
          label={t('fin.budgets.month')}
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </Modal>
      {entryModal && period && (
        <PayrollEntryModal
          periodId={period.id}
          entry={entryModal === 'new' ? null : entryModal}
          onClose={() => setEntryModal(null)}
        />
      )}
      <ConfirmDialog
        open={postConfirm !== null}
        onClose={() => setPostConfirm(null)}
        onConfirm={() => post.mutate(undefined)}
        title={t('fin.payroll.post')}
        message={t('fin.payroll.post_confirm')}
        loading={post.isPending}
      />
      {payEntry && <PayEntryModal entry={payEntry} onClose={() => setPayEntry(null)} />}
    </div>
  );
}
function PayrollEntryModal({
  periodId,
  entry,
  onClose,
}: {
  periodId: string;
  entry: PayrollEntry | null;
  onClose: () => void;
}) {
  const { t } = useT();
  const employees = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<ListResponse<Employee>>('/v1/employees?limit=100'),
  });
  const [employee, setEmployee] = useState(entry?.employee_id ?? '');
  const [position, setPosition] = useState(entry?.position ?? '');
  const [base, setBase] = useState(entry?.base_salary ?? '');
  const [bonus, setBonus] = useState(entry?.bonus ?? '0');
  const [deduction, setDeduction] = useState(entry?.deduction ?? '0');
  const [note, setNote] = useState(entry?.note ?? '');
  const save = useFinanceMutation(
    () =>
      api(`/v1/finance/payroll/periods/${periodId}/entries`, {
        method: 'POST',
        body: {
          employee_id: employee,
          position: position || null,
          base_salary: normalizeNumber(base),
          bonus: normalizeNumber(bonus || '0'),
          deduction: normalizeNumber(deduction || '0'),
          note: note || null,
        },
      }),
    onClose,
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={t('fin.payroll.add_entry')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => save.mutate(undefined)}
            loading={save.isPending}
            disabled={!employee || !base}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Select
          wrapClassName="span-2"
          label={t('fin.payroll.employee')}
          value={employee}
          disabled={Boolean(entry)}
          onChange={(e) => {
            setEmployee(e.target.value);
            const u = employees.data?.items.find((x) => x.id === e.target.value);
            if (u?.position && !position) setPosition(u.position);
          }}
        >
          <option value="">—</option>
          {(employees.data?.items ?? [])
            .filter((e) => e.active)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.display_name} · {t(`role.${e.role}`)}
              </option>
            ))}
        </Select>
        <Input
          label={t('employees.position')}
          value={position}
          onChange={(e) => setPosition(e.target.value)}
        />
        <Input
          label={t('fin.payroll.base')}
          inputMode="decimal"
          value={base}
          onChange={(e) => setBase(e.target.value)}
        />
        <Input
          label={t('fin.payroll.bonus')}
          inputMode="decimal"
          value={bonus}
          onChange={(e) => setBonus(e.target.value)}
        />
        <Input
          label={t('fin.payroll.deduction')}
          inputMode="decimal"
          value={deduction}
          onChange={(e) => setDeduction(e.target.value)}
        />
        <Textarea
          wrapClassName="span-2"
          label={t('fin.pr.note')}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Modal>
  );
}
function PayEntryModal({ entry, onClose }: { entry: PayrollEntry; onClose: () => void }) {
  const { t, lang } = useT();
  const cash = useCashBalances();
  const [cashAccount, setCashAccount] = useState('');
  const save = useFinanceMutation(
    () =>
      api(`/v1/finance/payroll/entries/${entry.id}/pay`, {
        method: 'POST',
        body: { version: entry.version, cash_account_id: cashAccount },
      }),
    onClose,
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={t('fin.payroll.pay')}
      description={`${entry.employee_name} · ${formatMoney(entry.net, lang)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!cashAccount}>
            {t('common.confirm')}
          </Button>
        </>
      }
    >
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
              {c.name} · {formatMoney(c.balance, lang)}
            </option>
          ))}
      </Select>
    </Modal>
  );
}

/* ---------------- Plan–actual ---------------- */
export function PlanActualPage() {
  const { t, lang } = useT();
  const sel = useProjectSelection();
  const query = useQuery({
    queryKey: ['plan-actual', sel.projectId],
    queryFn: () =>
      api<{
        by_kind: { kind: string; plan_value: string; plan_qty: string; fact_value: string }[];
        lines: {
          id: string;
          kind: string;
          category: string | null;
          description: string;
          unit_id: string;
          plan_qty: string;
          plan_value: string;
          zone_name: string | null;
          estimate_name: string;
          fact_qty: string;
          fact_value: string | null;
        }[];
        by_zone: {
          zone_name: string;
          kind: string;
          lines: number;
          plan_qty: string;
          plan_value: string;
          fact_qty: string;
          percent: string | null;
        }[];
        monthly: { month: string; plan_value: string; fact_value: string; budget: string }[];
      }>(`/v1/finance/plan-actual?project_id=${sel.projectId}`),
    enabled: Boolean(sel.projectId),
  });
  const d = query.data;
  const pct = (fact: number, plan: number) => (plan > 0 ? Math.round((fact / plan) * 100) : null);
  const Variance = ({ plan, fact }: { plan: number; fact: number }) => (
    <span style={{ color: fact > plan ? 'var(--danger)' : 'var(--success)' }}>
      {formatMoney(plan - fact, lang, false)}
    </span>
  );
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader
        title={t('fin.pa.title')}
        description={t('fin.pa.sub')}
        actions={
          sel.projectId && (
            <ExportButton path={`/v1/finance/plan-actual/export?project_id=${sel.projectId}`} />
          )
        }
      />
      <div className="toolbar">
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
            {d.by_kind.map((k) => (
              <div key={k.kind} className="card stat">
                <div className="stat-label">{t(`est.kind.${k.kind}`)}</div>
                <div className="stat-value" style={{ fontSize: 'var(--fs-xl)' }}>
                  {formatMoney(k.fact_value, lang, false)}
                </div>
                <div className="stat-sub">
                  {t('fin.pa.plan')}: {formatMoney(k.plan_value, lang, false)} ·{' '}
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
                  <th className="num">{t('fin.pa.plan')} (UZS)</th>
                </tr>
              </thead>
              <tbody>
                {d.by_zone.map((z, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td>{z.zone_name === '—' ? t('fin.pa.no_zone') : z.zone_name}</td>
                    <td>{t(`est.kind.${z.kind}`)}</td>
                    <td className="num">{z.lines}</td>
                    <td className="num">{z.percent === null ? '—' : `${Math.round(Number(z.percent))}%`}</td>
                    <td className="num">{formatMoney(z.plan_value, lang, false)}</td>
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
                    <td className="num">{formatMoney(m.plan_value, lang, false)}</td>
                    <td className="num">{num(m.budget) ? formatMoney(m.budget, lang, false) : '—'}</td>
                    <td className="num">{formatMoney(m.fact_value, lang, false)}</td>
                    <td className="num">
                      <Variance plan={num(m.plan_value) || num(m.budget)} fact={num(m.fact_value)} />
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
                    <th className="num">{t('fin.pa.plan')} (UZS)</th>
                    <th className="num">{t('fin.pa.fact')} (UZS)</th>
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
                        <td className="num">{formatMoney(l.plan_value, lang, false)}</td>
                        <td className="num">
                          {l.fact_value ? (
                            formatMoney(l.fact_value, lang, false)
                          ) : (
                            <span className="muted">—</span>
                          )}
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

/* ---------------- Forecast ---------------- */
export function ForecastPage() {
  const { t, lang } = useT();
  const sel = useProjectSelection();
  const query = useQuery({
    queryKey: ['forecast', sel.projectId],
    queryFn: () =>
      api<{
        plan_total: string;
        budget_total: string;
        actual_cost: string;
        remaining_plan: string;
        monthly_burn: string;
        months_used: number;
        months_left: number | null;
        projected_remaining_spend: string | null;
        projected_total: string | null;
        projected_variance: string | null;
        months_of_runway: number | null;
        end_date: string | null;
        recent: { month: string; expense: string }[];
      }>(`/v1/finance/forecast?project_id=${sel.projectId}`),
    enabled: Boolean(sel.projectId),
  });
  const d = query.data;
  const over =
    d?.projected_variance !== null && d?.projected_variance !== undefined && num(d.projected_variance) < 0;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader title={t('fin.fc.title')} description={t('fin.fc.sub')} />
      <div className="toolbar">
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
              value={formatMoney(d.plan_total, lang, false)}
              sub={`${t('fin.fc.budget_total')}: ${formatMoney(d.budget_total, lang, false)}`}
            />
            <Stat
              label={t('fin.fc.actual')}
              value={formatMoney(d.actual_cost, lang, false)}
              sub={`${t('fin.fc.remaining')}: ${formatMoney(d.remaining_plan, lang, false)}`}
            />
            <Stat
              label={t('fin.fc.burn')}
              value={formatMoney(d.monthly_burn, lang, false)}
              sub={d.months_of_runway !== null ? `${t('fin.fc.runway')}: ${d.months_of_runway}` : undefined}
            />
            <Stat
              accent={over}
              label={t('fin.fc.projected_total')}
              value={d.projected_total ? formatMoney(d.projected_total, lang, false) : '—'}
              sub={
                d.months_left !== null
                  ? `${t('fin.fc.months_left')}: ${d.months_left} · ${formatDate(d.end_date, lang)}`
                  : t('projects.planned_end') + ': —'
              }
            />
          </div>
          <section className="card">
            <div className="card-header">
              <h3>{t('fin.monthly')}</h3>
            </div>
            <table className="summary-table" style={{ width: '100%' }}>
              <tbody>
                {d.recent.map((m) => (
                  <tr key={m.month} style={{ borderTop: '1px solid var(--border)' }}>
                    <td>{monthLabel(m.month, lang)}</td>
                    <td className="num">{formatMoney(m.expense, lang, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

/* ---------------- Reports ---------------- */
export function FinancialReportsPage() {
  const { t, lang } = useT();
  const f = useProjectFilter();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 5);
    return monthStart(d);
  });
  const [to, setTo] = useState(todayIso());
  const query = useQuery({
    queryKey: ['finance-reports', f.projectId, from, to],
    queryFn: () =>
      api<{
        cash_flow: { month: string; account: string; kind: string; inflow: string; outflow: string }[];
        expenses: { project: string; month: string; material: string; other: string; total: string }[];
        aging: {
          counterparty: string;
          current: string;
          d30: string;
          d90: string;
          older: string;
          total: string;
        }[];
        income: string;
      }>(`/v1/finance/reports${qs({ project_id: f.projectId || undefined, from, to })}`),
  });
  const d = query.data;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader title={t('fin.rep.title')} description={t('fin.rep.sub')} />
      <div className="toolbar">
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
        {d && (
          <Badge tone="success">
            {t('fin.rep.income')}: {formatMoney(d.income, lang)}
          </Badge>
        )}
      </div>
      {d && (
        <div className="stack" style={{ gap: 14 }}>
          <section className="card">
            <div className="card-header">
              <h3>{t('fin.rep.cash_flow')}</h3>
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
                    <td className="num">{formatMoney(r.inflow, lang, false)}</td>
                    <td className="num">{formatMoney(r.outflow, lang, false)}</td>
                    <td className="num">
                      <b>{formatMoney(num(r.inflow) - num(r.outflow), lang, false)}</b>
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
          <section className="card">
            <div className="card-header">
              <h3>{t('fin.rep.expenses')}</h3>
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
                    <td className="num">{formatMoney(r.material, lang, false)}</td>
                    <td className="num">{formatMoney(r.other, lang, false)}</td>
                    <td className="num">
                      <b>{formatMoney(r.total, lang, false)}</b>
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
                    <td className="num">{formatMoney(r.current, lang, false)}</td>
                    <td className="num">{formatMoney(r.d30, lang, false)}</td>
                    <td className="num" style={{ color: num(r.d90) ? 'var(--warning)' : undefined }}>
                      {formatMoney(r.d90, lang, false)}
                    </td>
                    <td className="num" style={{ color: num(r.older) ? 'var(--danger)' : undefined }}>
                      {formatMoney(r.older, lang, false)}
                    </td>
                    <td className="num">
                      <b>{formatMoney(r.total, lang, false)}</b>
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
        </div>
      )}
    </div>
  );
}
