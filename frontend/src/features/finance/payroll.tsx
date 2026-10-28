import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, apiAll } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { formatMoney, monthStart } from '@/lib/format';
import { displayCurrency } from '@/lib/currency-store';
import {
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
import { normalizeNumber } from '@/features/estimates/model';
import type { Employee } from '@/features/projects/types';
import {
  monthLabel,
  num,
  useCashBalances,
  useFinanceMutation,
  type PayrollEntry,
  type PayrollPeriod,
} from './model';

/**
 * Figma F5 (2026-10-17) "Ish haqi va xodimlar": KPI (fond, hisoblangan, to'langan, qoldiq — serverdan),
 * davr tanlovi, jadval (xodim, lavozim, oklad, bonus, ushlanma, jami, holat). Davr ochish/yopish va to'lash
 * mantiqi avvalgidek.
 */
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
  const money = (v: string) => formatMoney(v, lang, false);
  const columns: Column<PayrollEntry>[] = [
    {
      key: 'name',
      header: t('fin.payroll.employee'),
      sortValue: (r) => r.employee_name,
      render: (r) => (
        <>
          <div className="cell-main">{r.employee_name}</div>
          <div className="cell-sub">{t(`role.${r.employee_role}`)}</div>
        </>
      ),
    },
    {
      key: 'position',
      header: t('employees.position'),
      sortValue: (r) => r.position ?? '',
      render: (r) => r.position ?? <span className="muted">—</span>,
    },
    {
      key: 'base',
      header: `${t('fin.payroll.base')} (${displayCurrency()})`,
      align: 'right',
      sortValue: (r) => num(r.base_salary),
      render: (r) => <span className="mono">{money(r.base_salary)}</span>,
    },
    {
      key: 'bonus',
      header: t('fin.payroll.bonus'),
      align: 'right',
      render: (r) =>
        num(r.bonus) ? <span className="money-in">{money(r.bonus)}</span> : <span className="mono">0</span>,
    },
    {
      key: 'piece',
      header: t('fin.payroll.piece'),
      align: 'right',
      sortValue: (r) => num(r.piece_rate),
      render: (r) =>
        num(r.piece_rate) ? (
          <span className="money-in">{money(r.piece_rate)}</span>
        ) : (
          <span className="mono">0</span>
        ),
    },
    {
      key: 'ded',
      header: t('fin.payroll.deduction'),
      align: 'right',
      render: (r) =>
        num(r.deduction) ? (
          <span className="money-out">{money(r.deduction)}</span>
        ) : (
          <span className="mono">0</span>
        ),
    },
    {
      key: 'net',
      header: t('fin.payroll.net'),
      align: 'right',
      sortValue: (r) => num(r.net),
      render: (r) => (
        <b className="mono">
          {money(r.net)} {displayCurrency()}
        </b>
      ),
    },
    {
      key: 'status',
      header: t('common.status'),
      sortValue: (r) => r.status,
      render: (r) => (
        <Badge tone={r.status === 'paid' ? 'success' : r.status === 'posted' ? 'info' : 'warning'}>
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
    <div className="stack" style={{ gap: 16 }}>
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
      <div className="grid-4">
        <Stat
          label={t('fin.payroll.gross')}
          value={period ? money(period.gross) : '—'}
          sub={period ? `${monthLabel(period.month, lang)} · ${displayCurrency()}` : displayCurrency()}
        />
        <Stat
          label={t('fin.payroll.accrued')}
          value={period ? money(period.total) : '—'}
          sub={period ? t(`fin.payroll.status.${period.status}`) : undefined}
        />
        <Stat
          label={t('fin.payroll.paid_kpi')}
          value={period ? money(period.paid) : '—'}
          tone={period && num(period.paid) > 0 ? 'success' : undefined}
        />
        <Stat
          label={t('fin.payroll.due')}
          value={period ? money(period.due) : '—'}
          tone={period && num(period.due) > 0 ? 'warning' : undefined}
        />
      </div>
      <div className="toolbar blocks-toolbar">
        <ProjectSelect value={sel.projectId} onChange={sel.setProjectId} projects={sel.projects} />
        {query.data && query.data.periods.length > 0 && (
          <Select
            aria-label={t('fin.payroll.period')}
            value={period?.id ?? ''}
            onChange={(e) => setSelected(e.target.value)}
          >
            {query.data.periods.map((p) => (
              <option key={p.id} value={p.id}>
                {t('fin.payroll.period')}: {monthLabel(p.month, lang)} · {t(`fin.payroll.status.${p.status}`)}
              </option>
            ))}
          </Select>
        )}
        <span className="spacer" />
        {canEdit && (
          <Button variant="secondary" icon={<Plus />} onClick={() => setEntryModal('new')}>
            {t('fin.payroll.add_entry')}
          </Button>
        )}
        {canEdit && entries.length > 0 && (
          <Button onClick={() => setPostConfirm(period!)}>{t('fin.payroll.post')}</Button>
        )}
      </div>
      {query.data && query.data.periods.length === 0 && (
        <div className="card">
          <p className="card-pad muted">{t('fin.payroll.empty')}</p>
        </div>
      )}
      {period?.status === 'open' && period.piece_pending && period.piece_pending.length > 0 && (
        <section className="card">
          <div className="card-header">
            <h3>
              {t('fin.payroll.piece_pending')}
              <span className="card-sub">{t('fin.payroll.piece_pending_hint')}</span>
            </h3>
          </div>
          <div className="card-pad stack" style={{ gap: 4 }}>
            {period.piece_pending.map((p) => (
              <div key={p.employee_id} className="row" style={{ justifyContent: 'space-between' }}>
                <span>{p.employee_name}</span>
                <b className="mono">
                  {money(p.amount)} {displayCurrency()}
                </b>
              </div>
            ))}
          </div>
        </section>
      )}
      {period && (
        <DataTable
          columns={columns}
          rows={entries}
          rowKey={(r) => r.id}
          empty={{ title: t('fin.payroll.no_entries') }}
        />
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
    queryFn: () => apiAll<Employee>('/v1/employees'),
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
          label={`${t('fin.payroll.base')} (UZS)`}
          inputMode="decimal"
          value={base}
          onChange={(e) => setBase(e.target.value)}
        />
        <Input
          label={`${t('fin.payroll.bonus')} (UZS)`}
          inputMode="decimal"
          value={bonus}
          onChange={(e) => setBonus(e.target.value)}
        />
        <Input
          label={`${t('fin.payroll.deduction')} (UZS)`}
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
      description={`${entry.employee_name} · ${formatMoney(entry.net, lang, true, 'UZS')}`}
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
      {entry.advance_available && Number(entry.advance_available) > 0 && (
        <p className="muted" style={{ margin: 0 }}>
          {t('fin.payroll.advance_applied')}: <b>{formatMoney(entry.advance_available, lang, true, 'UZS')}</b>{' '}
          · {t('fin.payroll.paid_cash')}: <b>{formatMoney(entry.cash_due ?? '0', lang, true, 'UZS')}</b>
        </p>
      )}
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
    </Modal>
  );
}
