import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  Flame,
  History,
  Plus,
  RotateCcw,
  ClipboardCheck,
  X,
} from 'lucide-react';
import { api, ApiError, qs, type ListResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDateTime, formatMoney, formatQuantity, unitLabel } from '@/lib/format';
import {
  Alert,
  Badge,
  Button,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Segmented,
  Select,
  Stat,
  Tabs,
  Textarea,
  useListState,
} from '@/components/ui';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ProjectSelect, useProjectSelection } from '@/features/common/ProjectSelect';
import { ExportButton } from '@/features/common/ExportButton';
import { CustomerMaterialsTab } from './CustomerMaterialsTab';
import { NewMaterialModal } from '@/features/estimates/EstimateEditor';
import { normalizeNumber, useZones, type Material } from '@/features/estimates/model';
import {
  kindTone,
  statusTone,
  useCommands,
  useOverview,
  useRequests,
  type Balance,
  type CommandKind,
  type LedgerRow,
  type MaterialRequest,
  type MaterialRequestGroup,
  type StockAccount,
  type StockCommand,
} from './model';
import {
  CommandActionModal,
  CommandModal,
  MinimumModal,
  ReconcileModal,
  useStockMutation,
} from './StockModals';

type Tab = 'balances' | 'movements' | 'requests' | 'materials' | 'customer';
const TABS: readonly Tab[] = ['balances', 'movements', 'requests', 'materials', 'customer'];
const isTab = (v: string | null): v is Tab => TABS.includes(v as Tab);
/** Menyu bandi (?tab=…&kind=…&inventory=1) qaysi Figma bo'limini ochadi — sarlavha shu bo'yicha. */
type Section =
  | 'balances'
  | 'warehouses'
  | 'inventory'
  | 'movements'
  | 'transfers'
  | 'accept'
  | 'requests'
  | 'materials'
  | 'customer';
export function StockPage() {
  const { t } = useT();
  const { me, permissions } = useAuth();
  const sel = useProjectSelection();
  const overview = useOverview(sel.projectId);
  // Brigadir va ombor mudiri menyusi sahifaning ichki bo'limiga so'rov parametri bilan keladi (F4, D17).
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: Tab = isTab(tabParam) ? tabParam : 'balances';
  const kindParam = params.get('kind') ?? '';
  const inventory = params.get('inventory') === '1';
  const setTab = (next: Tab) => {
    const n = new URLSearchParams(params);
    n.set('tab', next);
    n.delete('kind');
    n.delete('inventory');
    setParams(n, { replace: true });
  };
  // Brigadir va ombor mudirida tablar yo'q: har bo'lim yon menyuning alohida bandi (permissions.ts roleNav).
  const tabless = me?.role === 'brigadier' || me?.role === 'warehouse_manager';
  const section: Section | null = !tabParam
    ? null
    : tab === 'balances'
      ? inventory
        ? 'inventory'
        : tabless
          ? 'balances'
          : 'warehouses'
      : tab === 'movements'
        ? kindParam === 'transfer'
          ? me?.role === 'brigadier'
            ? 'accept'
            : 'transfers'
          : 'movements'
        : tab;
  const has = (p: string) => Boolean(permissions?.permissions.includes(p));
  const [modal, setModal] = useState<null | {
    kind: Exclude<CommandKind, 'adjustment' | 'reversal'>;
    preset?: { from_account_id?: string; to_account_id?: string; material_id?: string };
  }>(null);
  const d = overview.data;
  const pending = d?.pending;
  const low = d?.balances.filter((b) => b.low).length ?? 0;
  // Figma "Ombor va xomashyo nazorati": KPI kartalar, bitta toolbar kartasida obyekt tanlovi va amallar.
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader
        title={section ? t(`stock.tab_title.${section}`) : t('stock.title')}
        description={section ? t(`stock.tab_sub.${section}`) : t('stock.sub')}
      />
      {d && (
        <div className="grid-4">
          <Stat label={t('stock.kpi.kinds')} value={d.balances.length} sub={t('stock.kpi.kinds_sub')} />
          <Stat
            label={t('stock.kpi.low')}
            value={low}
            sub={t('stock.kpi.low_sub')}
            tone={low > 0 ? 'danger' : undefined}
          />
          <Stat
            label={t('stock.kpi.requests')}
            value={pending?.requests ?? 0}
            sub={t('stock.pending_requests', { n: pending?.requests ?? 0 })}
          />
          <Stat
            label={t('stock.kpi.transfers')}
            value={pending?.transfers ?? 0}
            sub={`${t('stock.pending_transfers', { n: pending?.transfers ?? 0 })} · ${t('stock.pending_consumptions', { n: pending?.consumptions ?? 0 })}`}
          />
        </div>
      )}
      <div className="toolbar blocks-toolbar">
        <ProjectSelect value={sel.projectId} onChange={sel.setProjectId} projects={sel.projects} />
        <span className="spacer" />
        {sel.projectId && (
            <>
              <ExportButton path={`/v1/stock/overview/export?project_id=${sel.projectId}`} />
              {has('stock.receive') && (
                <Button
                  variant="secondary"
                  icon={<ArrowDownToLine />}
                  onClick={() => setModal({ kind: 'receipt' })}
                >
                  {t('stock.receipt')}
                </Button>
              )}
              {has('stock.send') && (
                <Button
                  variant="secondary"
                  icon={<ArrowLeftRight />}
                  onClick={() => setModal({ kind: 'transfer' })}
                >
                  {t('stock.transfer')}
                </Button>
              )}
              {has('stock.consume') && (
                <>
                  <Button
                    variant="secondary"
                    icon={<Flame />}
                    onClick={() => setModal({ kind: 'consumption' })}
                  >
                    {t('stock.consumption')}
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<RotateCcw />}
                    onClick={() => setModal({ kind: 'return' })}
                  >
                    {t('stock.return')}
                  </Button>
                </>
              )}
            </>
        )}
      </div>
      {overview.isError && (
        <Alert tone="danger">
          {errorMessage(t, (overview.error as ApiError).code, (overview.error as ApiError).status)}
        </Alert>
      )}
      {!tabless && (
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { key: 'balances', label: t('stock.tab.balances') },
            { key: 'movements', label: t('stock.tab.movements') },
            { key: 'requests', label: t('stock.tab.requests'), count: pending?.requests },
            { key: 'materials', label: t('stock.tab.materials') },
            { key: 'customer', label: t('stock.tab.customer') },
          ]}
        />
      )}
      {tab === 'balances' && d && (
        <BalancesTab
          key={`${sel.projectId}:${inventory}`}
          d={d}
          projectId={sel.projectId}
          inventory={inventory}
          onCommand={(kind, preset) => setModal({ kind, preset })}
        />
      )}
      {tab === 'movements' && sel.projectId && (
        <MovementsTab key={`${sel.projectId}:${kindParam}`} projectId={sel.projectId} initialKind={kindParam} />
      )}
      {tab === 'requests' && sel.projectId && d && (
        <RequestsTab key={sel.projectId} projectId={sel.projectId} accounts={d.accounts} />
      )}
      {tab === 'materials' && <MaterialsTab />}
      {tab === 'customer' && sel.projectId && (
        <CustomerMaterialsTab key={sel.projectId} projectId={sel.projectId} />
      )}
      {modal && d && (
        <CommandModal
          kind={modal.kind}
          projectId={sel.projectId}
          accounts={d.accounts}
          balances={d.balances}
          preset={modal.preset}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// D42: smetadagi, hali kirim qilinmagan material — «Kirim yo'q» (Tugagan emas)
const stateOf = (b: Balance): 'none' | 'out' | 'low' | 'enough' =>
  Number(b.available) <= 0
    ? Number(b.quantity) === 0 && Number(b.received_quantity) === 0
      ? 'none'
      : 'out'
    : b.low
      ? 'low'
      : 'enough';
function BalancesTab({
  d,
  projectId,
  inventory = false,
  onCommand,
}: {
  d: NonNullable<ReturnType<typeof useOverview>['data']>;
  projectId: string;
  /** Menyudagi "Inventarizatsiya" bandi: birinchi ombor hisobi tanlangan holda ochiladi, yo'riqnoma ko'rsatiladi. */
  inventory?: boolean;
  onCommand: (
    kind: Exclude<CommandKind, 'adjustment' | 'reversal'>,
    preset: { from_account_id?: string; to_account_id?: string; material_id?: string },
  ) => void;
}) {
  const { t, lang } = useT();
  const { me, permissions } = useAuth();
  const has = (p: string) => Boolean(permissions?.permissions.includes(p));
  const [account, setAccount] = useState<string>(() =>
    inventory ? (d.accounts.find((a) => a.kind === 'warehouse')?.id ?? 'all') : 'all',
  );
  const [search, setSearch] = useState('');
  const [reconcile, setReconcile] = useState<StockAccount | null>(null);
  const [minimum, setMinimum] = useState<{ account: StockAccount; balance: Balance } | null>(null);
  const [ledger, setLedger] = useState<{ account: StockAccount; balance: Balance } | null>(null);
  const rows = d.balances.filter(
    (b) =>
      (account === 'all' || b.account_id === account) &&
      (!search || b.material_name.toLocaleLowerCase().includes(search.toLocaleLowerCase())),
  );
  const accountOf = (id: string) => d.accounts.find((a) => a.id === id);
  const pricesVisible = d.balances.some((b) => b.value !== undefined);
  const planVisible = d.balances.some((b) => b.plan_quantity !== null);
  const planColumns: Column<Balance>[] = planVisible
    ? [
        {
          key: 'plan',
          header: t('stock.plan'),
          align: 'right',
          sortValue: (r) => Number(r.plan_quantity ?? -1),
          render: (r) =>
            r.plan_quantity === null ? (
              <span className="muted">—</span>
            ) : (
              <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                {r.over_plan && <Badge tone="warning">{t('stock.over_plan')}</Badge>}
                {formatQuantity(r.plan_quantity)}
              </span>
            ),
        },
        {
          key: 'received',
          header: t('stock.received'),
          align: 'right',
          render: (r) =>
            accountOf(r.account_id)?.kind === 'warehouse' ? (
              formatQuantity(r.received_quantity)
            ) : (
              <span className="muted">—</span>
            ),
        },
      ]
    : [];
  const columns: Column<Balance>[] = [
    {
      key: 'material',
      header: t('stock.material'),
      sortValue: (r) => r.material_name,
      render: (r) => (
        <>
          <div className="cell-main">{r.material_name}</div>
          <div className="cell-sub">{unitLabel(r.unit_id)}</div>
        </>
      ),
    },
    {
      key: 'account',
      header: t('stock.account'),
      sortValue: (r) => accountOf(r.account_id)?.name ?? '',
      render: (r) => {
        const a = accountOf(r.account_id);
        return a ? (
          <span className="row" style={{ gap: 6 }}>
            <Badge tone={a.kind === 'warehouse' ? 'info' : 'brand'}>{t(`stock.account.${a.kind}`)}</Badge>
            {a.name}
          </span>
        ) : (
          '—'
        );
      },
    },
    ...planColumns,
    {
      key: 'quantity',
      header: t('stock.quantity'),
      align: 'right',
      sortValue: (r) => Number(r.quantity),
      render: (r) => formatQuantity(r.quantity),
    },
    {
      key: 'reserved',
      header: t('stock.reserved'),
      align: 'right',
      render: (r) => (Number(r.reserved) ? formatQuantity(r.reserved) : <span className="muted">—</span>),
    },
    {
      key: 'available',
      header: t('stock.available'),
      align: 'right',
      sortValue: (r) => Number(r.available),
      render: (r) => (
        <b style={{ color: r.low ? 'var(--danger)' : undefined }}>{formatQuantity(r.available)}</b>
      ),
    },
    {
      // Figma "Holati": Tugagan (mavjud 0), Kam qoldi (minimaldan past), Yetarli
      key: 'state',
      header: t('stock.state'),
      sortValue: (r) => stateOf(r),
      render: (r) => {
        const s = stateOf(r);
        return (
          <span className={`status-text-${s === 'enough' ? 'active' : s === 'low' ? 'inactive' : s === 'none' ? 'muted' : 'danger'}`}>
            {t(`stock.state.${s}`)}
          </span>
        );
      },
    },
    ...(pricesVisible
      ? ([
          {
            key: 'value',
            header: t('stock.value'),
            align: 'right',
            sortValue: (r) => Number(r.value ?? 0),
            render: (r) => formatMoney(r.value, lang, false),
          },
        ] as Column<Balance>[])
      : []),
    {
      key: 'min',
      header: t('stock.minimum'),
      align: 'right',
      render: (r) => (
        <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
          {Number(r.minimum_quantity) ? formatQuantity(r.minimum_quantity) : <span className="muted">—</span>}
        </span>
      ),
    },
    {
      key: 'act',
      header: '',
      className: 'actions',
      render: (r) => {
        const a = accountOf(r.account_id);
        if (!a) return null;
        return (
          <span className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
            <Button
              size="sm"
              variant="ghost"
              icon={<History />}
              aria-label={t('stock.ledger')}
              onClick={() => setLedger({ account: a, balance: r })}
            />
            {a.kind === 'warehouse' && has('stock.send') && Number(r.available) > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onCommand('transfer', { from_account_id: a.id, material_id: r.material_id })}
              >
                {t('stock.transfer')}
              </Button>
            )}
            {a.kind === 'custody' &&
              has('stock.consume') &&
              (a.custodian_id === me?.id || me?.role === 'tenant_admin') &&
              Number(r.available) > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    onCommand('consumption', { from_account_id: a.id, material_id: r.material_id })
                  }
                >
                  {t('stock.consumption')}
                </Button>
              )}
            {a.kind === 'warehouse' && has('stock.send') && (
              <Button size="sm" variant="ghost" onClick={() => setMinimum({ account: a, balance: r })}>
                {t('stock.set_minimum')}
              </Button>
            )}
          </span>
        );
      },
    },
  ];
  return (
    <div className="stack" style={{ gap: 12 }}>
      {inventory && has('stock.reverse') && <Alert tone="info">{t('stock.inventory_hint')}</Alert>}
      <div className="toolbar">
        <Select aria-label={t('stock.account')} value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="all">{t('stock.all_accounts')}</option>
          {d.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {t(`stock.account.${a.kind}`)}: {a.name}
            </option>
          ))}
        </Select>
        <SearchInput value={search} onChange={setSearch} />
        <span className="spacer" />
        {has('stock.reverse') && account !== 'all' && accountOf(account) && (
          <Button
            variant="secondary"
            icon={<ClipboardCheck />}
            onClick={() => setReconcile(accountOf(account)!)}
          >
            {t('stock.reconcile')}
          </Button>
        )}
      </div>
      {d.accounts.length === 0 ? (
        <Alert tone="warning">{t('stock.no_accounts')}</Alert>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => `${r.account_id}:${r.material_id}`}
          empty={{ title: t('stock.no_balances') }}
          rowClassName={(r) => (r.low ? 'low' : undefined)}
        />
      )}
      {reconcile && (
        <ReconcileModal
          account={reconcile}
          balances={d.balances.filter((b) => b.account_id === reconcile.id)}
          onClose={() => setReconcile(null)}
        />
      )}
      {minimum && (
        <MinimumModal account={minimum.account} balance={minimum.balance} onClose={() => setMinimum(null)} />
      )}
      {ledger && (
        <LedgerModal account={ledger.account} balance={ledger.balance} onClose={() => setLedger(null)} />
      )}
      <span hidden>{projectId}</span>
    </div>
  );
}

function LedgerModal({
  account,
  balance,
  onClose,
}: {
  account: StockAccount;
  balance: Balance;
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const list = useListState();
  const query = useQuery({
    queryKey: ['stock-ledger', account.id, balance.material_id, list.offset, list.limit],
    queryFn: () =>
      api<ListResponse<LedgerRow>>(
        `/v1/stock/ledger${qs({ account_id: account.id, material_id: balance.material_id, limit: list.limit, offset: list.offset })}`,
      ),
  });
  const columns: Column<LedgerRow>[] = [
    { key: 'date', header: t('common.date'), render: (r) => formatDateTime(r.created_at, lang) },
    {
      key: 'kind',
      header: t('est.col.kind'),
      render: (r) => <Badge tone={kindTone[r.kind]}>{t(`stock.kind.${r.kind}`)}</Badge>,
    },
    {
      key: 'delta',
      header: t('stock.quantity'),
      align: 'right',
      render: (r) => (
        <span style={{ color: Number(r.quantity_delta) < 0 ? 'var(--danger)' : 'var(--success)' }}>
          {Number(r.quantity_delta) > 0 ? '+' : ''}
          {formatQuantity(r.quantity_delta)}
        </span>
      ),
    },
    {
      key: 'running',
      header: t('stock.running'),
      align: 'right',
      render: (r) => formatQuantity(r.running_quantity),
    },
    ...(query.data?.items.some((r) => r.value_delta !== undefined)
      ? ([
          {
            key: 'value',
            header: t('stock.value'),
            align: 'right',
            render: (r) => formatMoney(r.value_delta, lang, false),
          },
        ] as Column<LedgerRow>[])
      : []),
    { key: 'who', header: t('stock.created_by'), render: (r) => r.actor_name ?? '—' },
    { key: 'reason', header: t('stock.reason'), render: (r) => <span className="muted">{r.reason}</span> },
  ];
  return (
    <Modal
      open
      onClose={onClose}
      title={`${t('stock.ledger')} · ${balance.material_name}`}
      description={account.name}
      size="xl"
    >
      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(r) => r.id}
        loading={query.isLoading}
        dense
        pagination={list.pagination}
        empty={{ title: t('stock.movements_empty') }}
      />
    </Modal>
  );
}

type Direction = '' | 'in' | 'out';
function MovementsTab({ projectId, initialKind = '' }: { projectId: string; initialKind?: string }) {
  const { t, lang } = useT();
  const { me, permissions } = useAuth();
  const has = (p: string) => Boolean(permissions?.permissions.includes(p));
  const [status, setStatus] = useState<string>('open');
  // Menyudagi "Transferlar"/"Material qabul" bandi kind=transfer bilan keladi
  const [kind, setKind] = useState<string>(initialKind);
  // Figma "Kirim/Chiqim" segmenti (Barchasi/Kirimlar/Chiqimlar) — serverda `direction` filtri
  const [direction, setDirection] = useState<Direction>('');
  const [action, setAction] = useState<{
    command: StockCommand;
    action: 'accept' | 'review' | 'cancel' | 'dispute' | 'reverse';
  } | null>(null);
  const list = useListState();
  const query = useCommands(
    projectId,
    { ...(status ? { status } : {}), ...(kind ? { kind } : {}), ...(direction ? { direction } : {}) },
    list,
  );
  const actionsFor = (c: StockCommand) => {
    const out: {
      key: 'accept' | 'review' | 'cancel' | 'dispute' | 'reverse';
      label: string;
      variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    }[] = [];
    const open = ['pending', 'partial', 'disputed'].includes(c.status);
    if (open && c.kind === 'transfer' && has('stock.accept'))
      out.push({ key: 'accept', label: t('stock.accept'), variant: 'primary' });
    if (open && c.kind === 'return' && has('stock.receive'))
      out.push({ key: 'accept', label: t('stock.accept'), variant: 'primary' });
    if (open && c.kind === 'consumption' && has('stock.review') && c.created_by !== me?.id)
      out.push({ key: 'review', label: t('stock.review'), variant: 'primary' });
    if (
      open &&
      ((c.kind === 'transfer' && has('stock.send')) ||
        (c.kind === 'return' && has('stock.consume')) ||
        (c.kind === 'consumption' && has('stock.review')))
    ) {
      out.push({ key: 'cancel', label: t('stock.cancel_rest'), variant: 'ghost' });
      if (c.status !== 'disputed') out.push({ key: 'dispute', label: t('stock.dispute'), variant: 'ghost' });
    }
    if (c.status === 'posted' && c.kind !== 'reversal' && has('stock.reverse'))
      out.push({ key: 'reverse', label: t('stock.reverse'), variant: 'ghost' });
    return out;
  };
  const columns: Column<StockCommand>[] = [
    {
      key: 'date',
      header: t('common.date'),
      sortValue: (r) => r.created_at,
      render: (r) => formatDateTime(r.created_at, lang),
    },
    {
      key: 'kind',
      header: t('est.col.kind'),
      render: (r) => <Badge tone={kindTone[r.kind]}>{t(`stock.kind.${r.kind}`)}</Badge>,
    },
    {
      key: 'material',
      header: t('stock.material'),
      sortValue: (r) => r.material_name,
      render: (r) => (
        <>
          <div className="cell-main">{r.material_name}</div>
          {r.estimate_line_name && <div className="cell-sub">{r.estimate_line_name}</div>}
        </>
      ),
    },
    {
      key: 'route',
      header: `${t('stock.from')} → ${t('stock.to')}`,
      render: (r) => (
        <span>
          {r.from_name ?? '—'} → {r.to_name ?? (r.kind === 'consumption' ? t('stock.consumption') : '—')}
        </span>
      ),
    },
    {
      key: 'qty',
      header: t('stock.quantity'),
      align: 'right',
      render: (r) => (
        <span>
          {formatQuantity(r.quantity, r.unit_id)}
          {Number(r.accepted_quantity) > 0 && Number(r.accepted_quantity) < Number(r.quantity) && (
            <small className="muted" style={{ display: 'block' }}>
              {t('stock.accepted')}: {formatQuantity(r.accepted_quantity)}
            </small>
          )}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('common.status'),
      sortValue: (r) => r.status,
      render: (r) => <Badge tone={statusTone[r.status]}>{t(`stock.status.${r.status}`)}</Badge>,
    },
    {
      key: 'who',
      header: t('stock.created_by'),
      render: (r) => (
        <>
          <div>{r.created_by_name}</div>
          {r.reviewed_by_name && <div className="cell-sub">→ {r.reviewed_by_name}</div>}
        </>
      ),
    },
    {
      key: 'reason',
      header: t('stock.reason'),
      render: (r) => <span className="muted text-xs">{r.reason}</span>,
    },
    {
      key: 'act',
      header: '',
      className: 'actions',
      render: (r) => (
        <span className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
          {actionsFor(r).map((a) => (
            <Button
              key={a.key}
              size="sm"
              variant={a.variant ?? 'secondary'}
              onClick={() => setAction({ command: r, action: a.key })}
            >
              {a.label}
            </Button>
          ))}
        </span>
      ),
    },
  ];
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="toolbar">
        <Segmented<Direction>
          value={direction}
          onChange={(v) => {
            setDirection(v);
            setKind('');
            list.setOffset(0);
          }}
          items={[
            { key: '', label: t('stock.filter.all') },
            { key: 'in', label: t('stock.filter.in') },
            { key: 'out', label: t('stock.filter.out') },
          ]}
        />
        <Select aria-label={t('common.status')} value={status} onChange={(e) => {
            setStatus(e.target.value);
            list.setOffset(0);
          }}
        >
          <option value="open">{t('stock.status.open')}</option>
          <option value="">{t('common.all')}</option>
          {(['pending', 'partial', 'posted', 'cancelled', 'disputed'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`stock.status.${s}`)}
            </option>
          ))}
        </Select>
        <Select aria-label={t('est.col.kind')} value={kind} onChange={(e) => {
            setKind(e.target.value);
            setDirection('');
            list.setOffset(0);
          }}
        >
          <option value="">{t('common.all')}</option>
          {(
            ['receipt', 'transfer', 'consumption', 'return', 'adjustment', 'reversal', 'opening'] as const
          ).map((k) => (
            <option key={k} value={k}>
              {t(`stock.kind.${k}`)}
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
        empty={{ title: t('stock.movements_empty') }}
        pagination={list.pagination}
        dense
      />
      {action && (
        <CommandActionModal command={action.command} action={action.action} onClose={() => setAction(null)} />
      )}
    </div>
  );
}

function RequestsTab({ projectId, accounts }: { projectId: string; accounts: StockAccount[] }) {
  const { t, lang } = useT();
  const { me, permissions, can } = useAuth();
  const has = (p: string) => Boolean(permissions?.permissions.includes(p));
  // Talabnoma yaratish serverda ombor sahifasining "create" ruxsati bilan (brigadir, ombor mudiri); prorab, bosh
  // muhandis va admin faqat ko'radi. Admin ruxsatlar yuklanguncha ham tugmani ko'rmasin.
  const canRequest = me?.role !== 'tenant_admin' && can('stock', 'create');
  const list = useListState();
  const query = useRequests(projectId, list);
  const [create, setCreate] = useState(false);
  const [act, setAct] = useState<{
    request: MaterialRequest;
    action: 'fulfill' | 'reject' | 'cancel';
  } | null>(null);
  const statusBadge = (status: MaterialRequest['status']) => (
    <Badge tone={status === 'pending' ? 'warning' : status === 'fulfilled' ? 'success' : 'neutral'}>
      {t(`stock.request_status.${status}`)}
    </Badge>
  );
  // V-B (D23): talabnoma — bir nechta qator; bajarish, rad etish va bekor qilish qatorma-qator.
  const columns: Column<MaterialRequestGroup>[] = [
    {
      key: 'date',
      header: t('common.date'),
      sortValue: (g) => g.created_at,
      render: (g) => formatDateTime(g.created_at, lang),
    },
    {
      key: 'request',
      header: t('stock.request_no'),
      render: (g) => (
        <>
          <div className="cell-main">№ {g.group_id.slice(0, 8).toUpperCase()}</div>
          <div className="cell-sub">{[g.requested_by_name, g.zone_name].filter(Boolean).join(' · ')}</div>
        </>
      ),
    },
    {
      key: 'lines',
      header: t('stock.request_lines'),
      render: (g) => (
        <div className="stack" style={{ gap: 4 }}>
          {g.lines.map((r) => (
            <div key={r.id} className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
              <span>
                {r.material_name} — {formatQuantity(r.quantity, r.unit_id)}
                {r.review_note ? <span className="muted text-xs"> → {r.review_note}</span> : null}
              </span>
              <span className="row" style={{ gap: 4 }}>
                {g.lines.length > 1 && statusBadge(r.status)}
                {r.status === 'pending' && has('stock.send') && (
                  <Button size="sm" onClick={() => setAct({ request: r, action: 'fulfill' })}>
                    {t('stock.fulfill')}
                  </Button>
                )}
                {r.status === 'pending' && has('stock.send') && (
                  <Button size="sm" variant="ghost" onClick={() => setAct({ request: r, action: 'reject' })}>
                    {t('stock.reject')}
                  </Button>
                )}
                {r.status === 'pending' && r.requested_by === me?.id && (
                  <Button size="sm" variant="ghost" onClick={() => setAct({ request: r, action: 'cancel' })}>
                    {t('common.cancel')}
                  </Button>
                )}
              </span>
            </div>
          ))}
        </div>
      ),
    },
    { key: 'needed', header: t('stock.request_needed_by'), render: (g) => (g.needed_by ? g.needed_by : '—') },
    { key: 'status', header: t('common.status'), render: (g) => statusBadge(g.status) },
    {
      key: 'note',
      header: t('stock.request_note'),
      render: (g) => <span className="muted text-xs">{g.note}</span>,
    },
  ];
  const summary = query.data?.summary;
  return (
    <div className="stack" style={{ gap: 12 }}>
      {summary && (
        <div className="grid-4">
          <Stat label={t('stock.kpi.req_total')} value={summary.total} />
          <Stat
            label={t('stock.kpi.req_pending')}
            value={summary.pending}
            tone={summary.pending > 0 ? 'warning' : undefined}
          />
          <Stat label={t('stock.kpi.req_fulfilled')} value={summary.fulfilled} tone="success" />
          <Stat
            label={t('stock.kpi.req_rejected')}
            value={summary.rejected}
            tone={summary.rejected > 0 ? 'danger' : undefined}
          />
        </div>
      )}
      {canRequest && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button icon={<Plus />} onClick={() => setCreate(true)}>
            {t('stock.request_new')}
          </Button>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(g) => g.group_id}
        loading={query.isLoading}
        error={
          query.error
            ? errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)
            : null
        }
        onRetry={query.refetch}
        empty={{ title: t('stock.requests_empty') }}
        pagination={list.pagination}
      />
      {create && <RequestModal projectId={projectId} onClose={() => setCreate(false)} />}
      {act && (
        <RequestActionModal
          request={act.request}
          action={act.action}
          accounts={accounts}
          onClose={() => setAct(null)}
        />
      )}
    </div>
  );
}
type RequestLineForm = { material: string; label: string; unit: string; qty: string };
const emptyRequestLine = (): RequestLineForm => ({ material: '', label: '', unit: '', qty: '' });
function RequestModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { t } = useT();
  const zones = useZones(projectId);
  // V-B (D23): bir nechta material qatori; zona, sana va izoh talabnoma bo'yicha umumiy.
  const [lines, setLines] = useState<RequestLineForm[]>([emptyRequestLine()]);
  const [zone, setZone] = useState('');
  const [needed, setNeeded] = useState('');
  const [note, setNote] = useState('');
  const setLine = (i: number, patch: Partial<RequestLineForm>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const ready = lines.every((l) => l.material && l.qty);
  const save = useStockMutation(
    () =>
      api('/v1/stock/requests', {
        method: 'POST',
        body: {
          project_id: projectId,
          lines: lines.map((l) => ({ material_id: l.material, quantity: normalizeNumber(l.qty) })),
          ...(zone ? { zone_id: zone } : {}),
          ...(needed ? { needed_by: needed } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      }),
    onClose,
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={t('stock.request_new')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!ready}>
            {t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="stack">
        {lines.map((line, i) => (
          <div
            key={i}
            role="group"
            aria-label={`${t('stock.request_line')} ${i + 1}`}
            className="row"
            style={{ gap: 8, alignItems: 'flex-end' }}
          >
            <SearchSelect<Material>
              wrapClassName="grow"
              path="/v1/materials"
              label={t('stock.material')}
              value={line.material}
              valueLabel={line.label || undefined}
              onChange={(id, m) => setLine(i, { material: id, label: m?.name ?? '', unit: m?.unit_id ?? '' })}
              getId={(m) => m.id}
              getLabel={(m) => m.name}
              getSub={(m) => [unitLabel(m.unit_id), m.alias].filter(Boolean).join(' · ')}
            />
            <Input
              wrapClassName="grow"
              label={t('stock.request_qty')}
              suffix={line.unit ? unitLabel(line.unit) : undefined}
              inputMode="decimal"
              value={line.qty}
              onChange={(e) => setLine(i, { qty: e.target.value })}
            />
            {lines.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                icon={<X />}
                aria-label={t('stock.request_remove_line')}
                onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
              />
            )}
          </div>
        ))}
        <div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus />}
            onClick={() => setLines((ls) => [...ls, emptyRequestLine()])}
          >
            {t('stock.request_add_line')}
          </Button>
        </div>
        <div className="form-grid">
          <Input
            type="date"
            label={t('stock.request_needed_by')}
            value={needed}
            onChange={(e) => setNeeded(e.target.value)}
          />
          <Select label={t('stock.zone')} value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="">—</option>
            {(zones.data?.items ?? []).map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </Select>
        </div>
        <Textarea label={t('stock.request_note')} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}
function RequestActionModal({
  request,
  action,
  accounts,
  onClose,
}: {
  request: MaterialRequest;
  action: 'fulfill' | 'reject' | 'cancel';
  accounts: StockAccount[];
  onClose: () => void;
}) {
  const { t } = useT();
  const warehouses = accounts.filter((a) => a.kind === 'warehouse');
  const custodies = accounts.filter((a) => a.kind === 'custody' && a.custodian_role === 'brigadier');
  const requesterCustody = custodies.find((c) => c.custodian_id === request.requested_by);
  const [from, setFrom] = useState(warehouses[0]?.id ?? '');
  const [to, setTo] = useState(requesterCustody?.id ?? '');
  const [qty, setQty] = useState(request.quantity);
  const [note, setNote] = useState('');
  const save = useStockMutation(
    () =>
      api(`/v1/stock/requests/${request.id}/actions`, {
        method: 'POST',
        body: {
          version: request.version,
          action,
          ...(action === 'fulfill'
            ? { from_account_id: from, ...(to ? { to_account_id: to } : {}), quantity: normalizeNumber(qty) }
            : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      }),
    onClose,
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={
        action === 'fulfill'
          ? t('stock.fulfill')
          : action === 'reject'
            ? t('stock.reject')
            : t('common.cancel')
      }
      description={`${request.material_name} · ${formatQuantity(request.quantity, request.unit_id)} · ${request.requested_by_name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={action === 'fulfill' ? 'primary' : 'danger'}
            onClick={() => save.mutate(undefined)}
            loading={save.isPending}
            disabled={action === 'fulfill' && (!from || !qty)}
          >
            {t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="stack">
        {action === 'fulfill' && (
          <>
            <Select label={t('stock.fulfill_from')} value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">—</option>
              {warehouses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Select
              label={t('stock.fulfill_to')}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              hint={!requesterCustody ? t('error.TO_ACCOUNT_REQUIRED') : undefined}
            >
              <option value="">{requesterCustody ? '—' : t('erp.select_project')}</option>
              {custodies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Input
              label={`${t('stock.request_qty')} (${unitLabel(request.unit_id)})`}
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </>
        )}
        <Textarea label={t('stock.request_note')} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}

function MaterialsTab() {
  const { t } = useT();
  const { me, permissions } = useAuth();
  const queryClient = useQueryClient();
  const list = useListState();
  const materials = useQuery({
    queryKey: ['materials', list.q, list.offset, list.limit],
    queryFn: () =>
      api<ListResponse<Material>>(`/v1/materials${qs({ q: list.q, limit: list.limit, offset: list.offset })}`),
  });
  const [create, setCreate] = useState(false);
  // Admin materiallarni faqat ko'radi (2026-10-16); server ham rad etadi.
  const canCreate =
    me?.role !== 'tenant_admin' &&
    (permissions?.permissions.includes('stock.receive') || permissions?.permissions.includes('estimates.import'));
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="toolbar">
        <SearchInput value={list.search} onChange={list.setSearch} />
        <span className="spacer" />
        {canCreate && (
          <Button icon={<Plus />} onClick={() => setCreate(true)}>
            {t('est.material_new')}
          </Button>
        )}
      </div>
      <DataTable
        columns={[
          {
            key: 'name',
            header: t('est.material_name'),
            sortValue: (r) => r.name,
            render: (r) => <span className="cell-main">{r.name}</span>,
          },
          { key: 'unit', header: t('stock.material_unit'), render: (r) => r.unit_id },
        ]}
        rows={materials.data?.items}
        rowKey={(r) => r.id}
        loading={materials.isLoading}
        empty={{ title: t('stock.materials_empty') }}
        pagination={list.pagination}
        dense
      />
      {create && (
        <NewMaterialModal
          onClose={() => setCreate(false)}
          onCreated={() => {
            setCreate(false);
            void queryClient.invalidateQueries({ queryKey: ['materials'] });
          }}
        />
      )}
    </div>
  );
}
