import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type ListResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatQuantity } from '@/lib/format';
import { Alert, Button, Input, Modal, Select, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useMaterials, useZones, type EstimateLine, type EstimateSummary } from '@/features/estimates/model';
import { NewMaterialModal } from '@/features/estimates/EstimateEditor';
import { normalizeNumber } from '@/features/estimates/model';
import { stockKeys, type Balance, type StockAccount, type StockCommand, type CommandKind } from './model';

export function useStockMutation<T>(fn: (v: T) => Promise<unknown>, onDone?: () => void) {
  const { t } = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all(stockKeys.map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
      toast.success(t('stock.saved'));
      onDone?.();
    },
    onError: (e: ApiError) =>
      toast.error(
        e.code === 'VERSION_CONFLICT' ? t('common.version_conflict') : errorMessage(t, e.code, e.status),
      ),
  });
}

/** Smeta qatorlarini (material turi) tanlash uchun joriy obyekt smetalari */
function useMaterialLines(projectId: string, materialId: string) {
  const estimates = useQuery({
    queryKey: ['estimates', projectId],
    queryFn: () => api<ListResponse<EstimateSummary>>(`/v1/estimates?project_id=${projectId}&limit=100`),
    enabled: Boolean(projectId),
  });
  const first = estimates.data?.items[0];
  const detail = useQuery({
    queryKey: ['estimate', first?.id],
    queryFn: () => api<{ lines: EstimateLine[] }>(`/v1/estimates/${first!.id}`),
    enabled: Boolean(first),
  });
  return (detail.data?.lines ?? []).filter(
    (l) => l.kind === 'material' && (!materialId || l.material_id === materialId),
  );
}

type CommandModalProps = {
  kind: Exclude<CommandKind, 'adjustment' | 'reversal'>;
  projectId: string;
  accounts: StockAccount[];
  balances: Balance[];
  preset?: Partial<{ from_account_id: string; to_account_id: string; material_id: string }>;
  onClose: () => void;
};
export function CommandModal({ kind, projectId, accounts, balances, preset, onClose }: CommandModalProps) {
  const { t } = useT();
  const { me } = useAuth();
  const materials = useMaterials();
  const zones = useZones(projectId);
  const warehouses = accounts.filter((a) => a.kind === 'warehouse');
  const custodies = accounts.filter((a) => a.kind === 'custody' && a.custodian_role === 'brigadier');
  const myCustody = custodies.find((c) => c.custodian_id === me?.id);
  const [from, setFrom] = useState(
    preset?.from_account_id ??
      (kind === 'consumption' || kind === 'return'
        ? (myCustody?.id ?? custodies[0]?.id ?? '')
        : (warehouses[0]?.id ?? '')),
  );
  const [to, setTo] = useState(
    preset?.to_account_id ??
      (kind === 'receipt' || kind === 'opening' || kind === 'return' ? (warehouses[0]?.id ?? '') : ''),
  );
  const [material, setMaterial] = useState(preset?.material_id ?? '');
  const [qty, setQty] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [reason, setReason] = useState('');
  const [line, setLine] = useState('');
  const [zone, setZone] = useState('');
  const [newMaterial, setNewMaterial] = useState(false);
  const lines = useMaterialLines(projectId, material);
  const sourceBalance = balances.find((b) => b.account_id === from && b.material_id === material);
  const available = sourceBalance ? Number(sourceBalance.available) : null;
  const needsSource = kind === 'transfer' || kind === 'consumption' || kind === 'return';
  const sourceMaterials = needsSource
    ? balances.filter((b) => b.account_id === from && Number(b.available) > 0)
    : [];
  const save = useStockMutation(
    () =>
      api('/v1/stock/commands', {
        method: 'POST',
        body: {
          project_id: projectId,
          kind,
          material_id: material,
          ...(needsSource ? { from_account_id: from } : {}),
          ...(kind !== 'consumption' ? { to_account_id: to } : {}),
          quantity: normalizeNumber(qty),
          ...(kind === 'receipt' || kind === 'opening' ? { unit_cost: normalizeNumber(unitCost) } : {}),
          ...(line ? { estimate_line_id: line } : {}),
          ...(zone ? { zone_id: zone } : {}),
          reason: reason.trim(),
        },
      }),
    onClose,
  );
  const unit = materials.data?.items.find((m) => m.id === material)?.unit_id ?? sourceBalance?.unit_id ?? '';
  const valid =
    material &&
    qty &&
    reason.trim().length >= 5 &&
    (!needsSource || from) &&
    (kind === 'consumption' || to) &&
    (!(kind === 'receipt' || kind === 'opening') || unitCost);
  const hints: Record<string, string> = {
    transfer: 'stock.transfer_hint',
    consumption: 'stock.consumption_hint',
    return: 'stock.return_hint',
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t(`stock.${kind}`)}
      description={hints[kind] ? t(hints[kind]!) : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!valid}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="stack">
        {needsSource && (
          <Select
            label={t('stock.from')}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setMaterial('');
            }}
          >
            <option value="">—</option>
            {(kind === 'transfer' ? warehouses : custodies).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        )}
        {kind !== 'consumption' && (
          <Select label={t('stock.to')} value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">—</option>
            {(kind === 'transfer' ? custodies : warehouses).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        )}
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Select
            wrapClassName="grow"
            label={t('stock.material')}
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
          >
            <option value="">—</option>
            {needsSource
              ? sourceMaterials.map((b) => (
                  <option key={b.material_id} value={b.material_id}>
                    {b.material_name} — {t('stock.available')}: {formatQuantity(b.available, b.unit_id)}
                  </option>
                ))
              : (materials.data?.items ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.unit_id})
                  </option>
                ))}
          </Select>
          {!needsSource && (
            <Button variant="secondary" onClick={() => setNewMaterial(true)}>
              +
            </Button>
          )}
        </div>
        <div className="form-grid">
          <Input
            label={`${t('stock.request_qty')}${unit ? ` (${unit})` : ''}`}
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            hint={
              available !== null ? `${t('stock.available')}: ${formatQuantity(available, unit)}` : undefined
            }
            error={
              available !== null && Number(normalizeNumber(qty)) > available
                ? t('error.INSUFFICIENT_AVAILABLE_STOCK')
                : undefined
            }
          />
          {(kind === 'receipt' || kind === 'opening') && (
            <Input
              label={`${t('stock.unit_cost')} (UZS)`}
              inputMode="decimal"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
            />
          )}
          {(kind === 'consumption' || kind === 'transfer') && (
            <Select label={t('stock.estimate_line')} value={line} onChange={(e) => setLine(e.target.value)}>
              <option value="">—</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.description} ({formatQuantity(l.effective_quantity, l.unit_id)})
                </option>
              ))}
            </Select>
          )}
          {kind === 'consumption' && (
            <Select label={t('stock.zone')} value={zone} onChange={(e) => setZone(e.target.value)}>
              <option value="">—</option>
              {(zones.data?.items ?? []).map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </Select>
          )}
        </div>
        <Textarea
          label={t('stock.reason')}
          hint={t('common.reason_hint')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      {newMaterial && (
        <NewMaterialModal
          onClose={() => setNewMaterial(false)}
          onCreated={(m) => {
            setMaterial(m.id);
            setNewMaterial(false);
          }}
        />
      )}
    </Modal>
  );
}

export function ReconcileModal({
  account,
  balances,
  onClose,
}: {
  account: StockAccount;
  balances: Balance[];
  onClose: () => void;
}) {
  const { t } = useT();
  const materials = useMaterials();
  const [material, setMaterial] = useState(balances[0]?.material_id ?? '');
  const [counted, setCounted] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [reason, setReason] = useState('');
  const current = balances.find((b) => b.material_id === material);
  const increase = current
    ? Number(normalizeNumber(counted)) > Number(current.quantity)
    : Number(normalizeNumber(counted)) > 0;
  const save = useStockMutation(
    () =>
      api(`/v1/stock/accounts/${account.id}/reconcile`, {
        method: 'POST',
        body: {
          material_id: material,
          counted_quantity: normalizeNumber(counted),
          ...(increase ? { unit_cost: normalizeNumber(unitCost) } : {}),
          reason: reason.trim(),
        },
      }),
    onClose,
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={`${t('stock.reconcile')} · ${account.name}`}
      description={t('stock.reconcile_hint')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => save.mutate(undefined)}
            loading={save.isPending}
            disabled={!material || !counted || reason.trim().length < 5 || (increase && !unitCost)}
          >
            {t('common.save')}
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
        {current && (
          <Alert tone={Number(current.reserved) > 0 ? 'warning' : 'info'}>
            {t('stock.quantity')}: {formatQuantity(current.quantity, current.unit_id)} · {t('stock.reserved')}
            : {formatQuantity(current.reserved)}
          </Alert>
        )}
        <div className="form-grid">
          <Input
            label={t('stock.counted')}
            inputMode="decimal"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
          />
          {increase && (
            <Input
              label={`${t('stock.unit_cost')} (UZS)`}
              inputMode="decimal"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
            />
          )}
        </div>
        <Textarea
          label={t('stock.reason')}
          hint={t('common.reason_hint')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </Modal>
  );
}

export function MinimumModal({
  account,
  balance,
  onClose,
}: {
  account: StockAccount;
  balance: Balance;
  onClose: () => void;
}) {
  const { t } = useT();
  const [qty, setQty] = useState(balance.minimum_quantity);
  const save = useStockMutation(
    () =>
      api(`/v1/stock/accounts/${account.id}/minimum`, {
        method: 'POST',
        body: { material_id: balance.material_id, quantity: normalizeNumber(qty) },
      }),
    onClose,
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={`${t('stock.set_minimum')} · ${balance.material_name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Input
        label={`${t('stock.minimum')} (${balance.unit_id})`}
        inputMode="decimal"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
      />
    </Modal>
  );
}

/** Jo'natishni qabul qilish (qisman), sarfni tasdiqlash, bekor qilish, kelishmovchilik, reversal */
export function CommandActionModal({
  command,
  action,
  onClose,
}: {
  command: StockCommand;
  action: 'accept' | 'review' | 'cancel' | 'dispute' | 'reverse';
  onClose: () => void;
}) {
  const { t } = useT();
  const [qty, setQty] = useState(command.remaining_quantity);
  const [reason, setReason] = useState('');
  const save = useStockMutation(
    () =>
      action === 'reverse'
        ? api(`/v1/stock/commands/${command.id}/reverse`, { method: 'POST', body: { reason: reason.trim() } })
        : api(`/v1/stock/commands/${command.id}/actions`, {
            method: 'POST',
            body: {
              version: command.version,
              action,
              ...(action === 'accept' ? { quantity: normalizeNumber(qty) } : {}),
              ...(reason.trim() ? { reason: reason.trim() } : {}),
            },
          }),
    onClose,
  );
  const titles = {
    accept: 'stock.accept',
    review: 'stock.review',
    cancel: 'stock.cancel_rest',
    dispute: 'stock.dispute',
    reverse: 'stock.reverse',
  } as const;
  const needReason = action === 'reverse' || action === 'dispute' || action === 'cancel';
  return (
    <Modal
      open
      onClose={onClose}
      title={t(titles[action])}
      description={
        action === 'reverse'
          ? t('stock.reverse_confirm')
          : `${command.material_name} · ${formatQuantity(command.remaining_quantity, command.unit_id)}`
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={action === 'reverse' || action === 'cancel' ? 'danger' : 'primary'}
            onClick={() => save.mutate(undefined)}
            loading={save.isPending}
            disabled={needReason && reason.trim().length < 5}
          >
            {t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="stack">
        {action === 'accept' && (
          <Input
            label={`${t('stock.accept_qty')} (${command.unit_id})`}
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        )}
        <Textarea
          label={t('stock.reason')}
          hint={needReason ? t('common.reason_hint') : undefined}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </Modal>
  );
}
