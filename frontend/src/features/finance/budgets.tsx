import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { formatMoney, monthStart } from '@/lib/format';
import { displayCurrency } from '@/lib/currency-store';
import { Button, Input, Modal, PageHeader, Segmented, Stat } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ProjectSelect, useProjectSelection } from '@/features/common/ProjectSelect';
import { normalizeNumber } from '@/features/estimates/model';
import { monthLabel, num, useBudgets, useFinanceMutation, type Budget, type BudgetYear } from './model';

/**
 * Figma F5 (2026-10-17) "Budjetlar boshqaruvi": Yillik/Oylik segment, KPI (budjet, sarflangan, qolgan, bajarilish),
 * jadval bajarilish chizig'i bilan. Budjet obyekt va oy bo'yicha; yillik yig'ma va foizlar serverdan
 * (Figma'dagi xarajat kategoriyalari ma'lumoti yo'q — D17).
 */
function Usage({ percent }: { percent: string | null }) {
  const p = percent === null ? null : Number(percent);
  return (
    <span className="row" style={{ gap: 8 }}>
      <span
        className={`progress ${p === null ? 'ok' : p > 100 ? 'bad' : p > 85 ? 'warn' : 'ok'}`}
        style={{ width: 120 }}
      >
        <span style={{ width: `${Math.min(100, p ?? 0)}%` }} />
      </span>
      <small className="mono">{p === null ? '—' : `${percent}%`}</small>
    </span>
  );
}

export function BudgetsPage() {
  const { t, lang } = useT();
  const { can } = useAuth();
  const sel = useProjectSelection();
  const budgets = useBudgets(sel.projectId);
  const [view, setView] = useState<'year' | 'month'>('month');
  const [edit, setEdit] = useState<Budget | 'new' | null>(null);
  const d = budgets.data;
  const s = d?.summary;
  const money = (v: string) => formatMoney(v, lang, false);
  const remainingCell = (v: string) => (
    <b className="mono" style={{ color: num(v) < 0 ? 'var(--danger)' : 'var(--success)' }}>
      {money(v)}
    </b>
  );
  const monthColumns: Column<Budget>[] = [
    {
      key: 'month',
      header: t('fin.budgets.month'),
      sortValue: (r) => r.month,
      render: (r) => <b>{monthLabel(r.month, lang)}</b>,
    },
    {
      key: 'amount',
      header: `${t('fin.budgets.amount_col')} (${displayCurrency()})`,
      align: 'right',
      sortValue: (r) => num(r.amount),
      render: (r) => <span className="mono">{money(r.amount)}</span>,
    },
    {
      key: 'actual',
      header: t('fin.budgets.spent'),
      align: 'right',
      sortValue: (r) => num(r.actual),
      render: (r) => <span className="mono">{money(r.actual)}</span>,
    },
    {
      key: 'remaining',
      header: t('fin.budgets.remaining'),
      align: 'right',
      sortValue: (r) => num(r.remaining),
      render: (r) => remainingCell(r.remaining),
    },
    {
      key: 'usage',
      header: t('fin.budgets.percent'),
      sortValue: (r) => num(r.percent),
      render: (r) => <Usage percent={r.percent} />,
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
        ] as Column<Budget>[])
      : []),
  ];
  const yearColumns: Column<BudgetYear>[] = [
    {
      key: 'year',
      header: t('fin.budgets.year'),
      sortValue: (r) => r.year,
      render: (r) => (
        <>
          <div className="cell-main">{r.year}</div>
          <div className="cell-sub">{t('fin.budgets.months_n', { n: r.months })}</div>
        </>
      ),
    },
    {
      key: 'amount',
      header: `${t('fin.budgets.amount_col')} (${displayCurrency()})`,
      align: 'right',
      render: (r) => <span className="mono">{money(r.amount)}</span>,
    },
    {
      key: 'actual',
      header: t('fin.budgets.spent'),
      align: 'right',
      render: (r) => <span className="mono">{money(r.actual)}</span>,
    },
    {
      key: 'remaining',
      header: t('fin.budgets.remaining'),
      align: 'right',
      render: (r) => remainingCell(r.remaining),
    },
    { key: 'usage', header: t('fin.budgets.percent'), render: (r) => <Usage percent={r.percent} /> },
  ];
  return (
    <div className="stack" style={{ gap: 16 }}>
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
      <div className="toolbar blocks-toolbar">
        <Segmented<'year' | 'month'>
          value={view}
          onChange={setView}
          items={[
            { key: 'year', label: t('fin.budgets.yearly') },
            { key: 'month', label: t('fin.budgets.monthly') },
          ]}
        />
        <ProjectSelect value={sel.projectId} onChange={sel.setProjectId} projects={sel.projects} />
      </div>
      <div className="grid-4">
        <Stat label={t('fin.budgets.total')} value={s ? money(s.amount) : '—'} sub={displayCurrency()} />
        <Stat label={t('fin.budgets.spent')} value={s ? money(s.actual) : '—'} sub={displayCurrency()} />
        <Stat
          label={t('fin.budgets.remaining')}
          value={s ? money(s.remaining) : '—'}
          sub={displayCurrency()}
          tone={s ? (num(s.remaining) < 0 ? 'danger' : 'success') : undefined}
        />
        <Stat
          label={t('fin.budgets.percent')}
          value={s?.percent ? `${s.percent}%` : '—'}
          tone={s?.percent && Number(s.percent) > 100 ? 'danger' : undefined}
        />
      </div>
      {view === 'month' ? (
        <DataTable
          columns={monthColumns}
          rows={d?.items}
          rowKey={(r) => r.month}
          loading={budgets.isLoading}
          empty={{ title: t('fin.budgets.empty') }}
        />
      ) : (
        <DataTable
          columns={yearColumns}
          rows={d?.yearly}
          rowKey={(r) => String(r.year)}
          loading={budgets.isLoading}
          empty={{ title: t('fin.budgets.empty') }}
        />
      )}
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
