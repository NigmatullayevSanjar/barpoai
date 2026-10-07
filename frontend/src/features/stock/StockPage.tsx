import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  Flame,
  History,
  Plus,
  RotateCcw,
  ClipboardCheck,
} from 'lucide-react';
import { api, ApiError, qs, type ListResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDateTime, formatMoney, formatQuantity } from '@/lib/format';
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
  Tabs,
  Textarea,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ProjectSelect, useProjectSelection } from '@/features/common/ProjectSelect';
import { ExportButton } from '@/features/common/ExportButton';
import { NewMaterialModal } from '@/features/estimates/EstimateEditor';
import { normalizeNumber, useMaterials, useZones } from '@/features/estimates/model';
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

type Tab = 'balances' | 'movements' | 'requests' | 'materials';
export function StockPage() {
  const { t } = useT();
  const { me, permissions } = useAuth();
  const sel = useProjectSelection();
  const overview = useOverview(sel.projectId);
  const [tab, setTab] = useState<Tab>('balances');
  const has = (p: string) => me?.role === 'tenant_admin' || Boolean(permissions?.permissions.includes(p));
  const [modal, setModal] = useState<null | {
    kind: Exclude<CommandKind, 'adjustment' | 'reversal'>;
    preset?: { from_account_id?: string; to_account_id?: string; material_id?: string };
  }>(null);
  const d = overview.data;
  const pending = d?.pending;
  const low = d?.balances.filter((b) => b.low).length ?? 0;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader
        title={t('stock.title')}
        description={t('stock.sub')}
        actions={
          sel.projectId && (
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
          )
        }
      />
      <div className="toolbar">
        <ProjectSelect value={sel.projectId} onChange={sel.setProjectId} projects={sel.projects} />
      </div>
      {overview.isError && (
        <Alert tone="danger">
          {errorMessage(t, (overview.error as ApiError).code, (overview.error as ApiError).status)}
        </Alert>
      )}
      {d && (
        <div className="grid-4">
          <Stat
            label={t('stock.tab.balances')}
            value={d.balances.length}
            sub={low ? t('stock.low_items', { n: low }) : undefined}
          />
          <Stat
            label={t('stock.transfer')}
            value={pending?.transfers ?? 0}
            sub={t('stock.pending_transfers', { n: pending?.transfers ?? 0 })}
          />
          <Stat
            label={t('stock.consumption')}
            value={pending?.consumptions ?? 0}
            sub={t('stock.pending_consumptions', { n: pending?.consumptions ?? 0 })}
          />
          <Stat
            label={t('stock.tab.requests')}
            value={pending?.requests ?? 0}
            sub={t('stock.pending_requests', { n: pending?.requests ?? 0 })}
          />
        </div>
      )}
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { key: 'balances', label: t('stock.tab.balances') },
          { key: 'movements', label: t('stock.tab.movements') },
          { key: 'requests', label: t('stock.tab.requests'), count: pending?.requests },
          { key: 'materials', label: t('stock.tab.materials') },
        ]}
      />
      {tab === 'balances' && d && (
        <BalancesTab
          d={d}
          projectId={sel.projectId}
          onCommand={(kind, preset) => setModal({ kind, preset })}
        />
      )}
      {tab === 'movements' && sel.projectId && <MovementsTab projectId={sel.projectId} />}
      {tab === 'requests' && sel.projectId && d && (
        <RequestsTab projectId={sel.projectId} accounts={d.accounts} />
      )}
      {tab === 'materials' && <MaterialsTab />}
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

function BalancesTab({
  d,
  projectId,
  onCommand,
}: {
  d: NonNullable<ReturnType<typeof useOverview>['data']>;
  projectId: string;
  onCommand: (
    kind: Exclude<CommandKind, 'adjustment' | 'reversal'>,
    preset: { from_account_id?: string; to_account_id?: string; material_id?: string },
  ) => void;
}) {
  const { t, lang } = useT();
  const { me, permissions } = useAuth();
  const has = (p: string) => me?.role === 'tenant_admin' || Boolean(permissions?.permissions.includes(p));
  const [account, setAccount] = useState<string>('all');
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
  const columns: Column<Balance>[] = [
    {
      key: 'material',
      header: t('stock.material'),
      sortValue: (r) => r.material_name,
      render: (r) => (
        <>
          <div className="cell-main">{r.material_name}</div>
          <div className="cell-sub">{r.unit_id}</div>
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
          {r.low && <Badge tone="danger">{t('stock.low')}</Badge>}
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
  const query = useQuery({
    queryKey: ['stock-ledger', account.id, balance.material_id],
    queryFn: () =>
      api<ListResponse<LedgerRow>>(
        `/v1/stock/ledger${qs({ account_id: account.id, material_id: balance.material_id, limit: 100 })}`,
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
        empty={{ title: t('stock.movements_empty') }}
      />
    </Modal>
  );
}

function MovementsTab({ projectId }: { projectId: string }) {
  const { t, lang } = useT();
  const { me, permissions } = useAuth();
  const has = (p: string) => me?.role === 'tenant_admin' || Boolean(permissions?.permissions.includes(p));
  const [status, setStatus] = useState<string>('open');
  const [kind, setKind] = useState<string>('');
  const [action, setAction] = useState<{
    command: StockCommand;
    action: 'accept' | 'review' | 'cancel' | 'dispute' | 'reverse';
  } | null>(null);
  const query = useCommands(projectId, { ...(status ? { status } : {}), ...(kind ? { kind } : {}) });
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
        <Select aria-label={t('common.status')} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">{t('stock.status.open')}</option>
          <option value="">{t('common.all')}</option>
          {(['pending', 'partial', 'posted', 'cancelled', 'disputed'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`stock.status.${s}`)}
            </option>
          ))}
        </Select>
        <Select aria-label={t('est.col.kind')} value={kind} onChange={(e) => setKind(e.target.value)}>
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
  const { me, permissions } = useAuth();
  const has = (p: string) => me?.role === 'tenant_admin' || Boolean(permissions?.permissions.includes(p));
  const query = useRequests(projectId);
  const [create, setCreate] = useState(false);
  const [act, setAct] = useState<{
    request: MaterialRequest;
    action: 'fulfill' | 'reject' | 'cancel';
  } | null>(null);
  const columns: Column<MaterialRequest>[] = [
    {
      key: 'date',
      header: t('common.date'),
      sortValue: (r) => r.created_at,
      render: (r) => formatDateTime(r.created_at, lang),
    },
    {
      key: 'material',
      header: t('stock.material'),
      render: (r) => (
        <>
          <div className="cell-main">{r.material_name}</div>
          {r.zone_name && <div className="cell-sub">{r.zone_name}</div>}
        </>
      ),
    },
    {
      key: 'qty',
      header: t('stock.request_qty'),
      align: 'right',
      render: (r) => formatQuantity(r.quantity, r.unit_id),
    },
    { key: 'by', header: t('stock.request_by'), render: (r) => r.requested_by_name },
    { key: 'needed', header: t('stock.request_needed_by'), render: (r) => (r.needed_by ? r.needed_by : '—') },
    {
      key: 'status',
      header: t('common.status'),
      render: (r) => (
        <Badge tone={r.status === 'pending' ? 'warning' : r.status === 'fulfilled' ? 'success' : 'neutral'}>
          {t(`stock.request_status.${r.status}`)}
        </Badge>
      ),
    },
    {
      key: 'note',
      header: t('stock.request_note'),
      render: (r) => (
        <span className="muted text-xs">
          {r.note}
          {r.review_note ? ` → ${r.review_note}` : ''}
        </span>
      ),
    },
    {
      key: 'act',
      header: '',
      className: 'actions',
      render: (r) =>
        r.status === 'pending' ? (
          <span className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
            {has('stock.send') && (
              <Button size="sm" onClick={() => setAct({ request: r, action: 'fulfill' })}>
                {t('stock.fulfill')}
              </Button>
            )}
            {has('stock.send') && (
              <Button size="sm" variant="ghost" onClick={() => setAct({ request: r, action: 'reject' })}>
                {t('stock.reject')}
              </Button>
            )}
            {r.requested_by === me?.id && (
              <Button size="sm" variant="ghost" onClick={() => setAct({ request: r, action: 'cancel' })}>
                {t('common.cancel')}
              </Button>
            )}
          </span>
        ) : null,
    },
  ];
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button icon={<Plus />} onClick={() => setCreate(true)}>
          {t('stock.request_new')}
        </Button>
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
        empty={{ title: t('stock.requests_empty') }}
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
function RequestModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { t } = useT();
  const materials = useMaterials();
  const zones = useZones(projectId);
  const [material, setMaterial] = useState('');
  const [qty, setQty] = useState('');
  const [zone, setZone] = useState('');
  const [needed, setNeeded] = useState('');
  const [note, setNote] = useState('');
  const save = useStockMutation(
    () =>
      api('/v1/stock/requests', {
        method: 'POST',
        body: {
          project_id: projectId,
          material_id: material,
          quantity: normalizeNumber(qty),
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
          <Button
            onClick={() => save.mutate(undefined)}
            loading={save.isPending}
            disabled={!material || !qty}
          >
            {t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <Select label={t('stock.material')} value={material} onChange={(e) => setMaterial(e.target.value)}>
          <option value="">—</option>
          {(materials.data?.items ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.unit_id})
            </option>
          ))}
        </Select>
        <div className="form-grid">
          <Input
            label={t('stock.request_qty')}
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
          <Input
            type="date"
            label={t('stock.request_needed_by')}
            value={needed}
            onChange={(e) => setNeeded(e.target.value)}
          />
          <Select
            wrapClassName="span-2"
            label={t('stock.zone')}
            value={zone}
            onChange={(e) => setZone(e.target.value)}
          >
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
              label={`${t('stock.request_qty')} (${request.unit_id})`}
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
  const materials = useMaterials();
  const [create, setCreate] = useState(false);
  const [search, setSearch] = useState('');
  const canCreate =
    me?.role === 'tenant_admin' ||
    permissions?.permissions.includes('stock.receive') ||
    permissions?.permissions.includes('estimates.import');
  const rows = useMemo(
    () =>
      (materials.data?.items ?? []).filter(
        (m) => !search || m.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
      ),
    [materials.data, search],
  );
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="toolbar">
        <SearchInput value={search} onChange={setSearch} />
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
        rows={rows}
        rowKey={(r) => r.id}
        loading={materials.isLoading}
        empty={{ title: t('stock.materials_empty') }}
        dense
      />
      {create && <NewMaterialModal onClose={() => setCreate(false)} onCreated={() => setCreate(false)} />}
    </div>
  );
}
