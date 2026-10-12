import { useState } from 'react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { formatDate, formatMoney, formatQuantity, todayIso } from '@/lib/format';
import { Alert, Button, Input, Modal, Select, Textarea } from '@/components/ui';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { normalizeNumber, useZones } from '@/features/estimates/model';
import type { StockCommand } from '@/features/stock/model';
import {
  cashKinds,
  payableKinds,
  useCashBalances,
  useFinanceMutation,
  usePayables,
  type Counterparty,
  type DocKind,
} from './model';

type Props = {
  projectId: string;
  kinds: DocKind[];
  initialKind?: DocKind;
  preset?: { counterparty_id?: string; allocated_invoice_id?: string; amount?: string };
  onClose: () => void;
};
/** Barcha moliyaviy hujjat turlari uchun bitta forma; maydonlar turga qarab ko'rinadi. */
export function DocumentModal({ projectId, kinds, initialKind, preset, onClose }: Props) {
  const { t, lang } = useT();
  const cash = useCashBalances();
  const zones = useZones(projectId);
  const [kind, setKind] = useState<DocKind>(initialKind ?? kinds[0]!);
  const [counterparty, setCounterparty] = useState(preset?.counterparty_id ?? '');
  const [counterpartyName, setCounterpartyName] = useState<string | undefined>();
  const [cashAccount, setCashAccount] = useState('');
  const [targetCash, setTargetCash] = useState('');
  const [amount, setAmount] = useState(preset?.amount ?? '');
  const [date, setDate] = useState(todayIso());
  const [due, setDue] = useState('');
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [receipt, setReceipt] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<StockCommand | null>(null);
  const [invoice, setInvoice] = useState(preset?.allocated_invoice_id ?? '');
  const [zone, setZone] = useState('');
  const payables = usePayables(projectId, counterparty ? { counterparty_id: counterparty } : {}, {
    offset: 0,
    limit: 100,
  });
  const needsCounterparty = [...payableKinds, 'payment', 'advance'].includes(kind);
  const needsCash = cashKinds.includes(kind);
  const receiptValue = selectedReceipt
    ? (Number(selectedReceipt.unit_cost ?? 0) * Number(selectedReceipt.accepted_quantity)).toFixed(2)
    : null;
  const save = useFinanceMutation(
    () =>
      api('/v1/finance/documents', {
        method: 'POST',
        body: {
          project_id: projectId,
          kind,
          amount: normalizeNumber(amount),
          ...(needsCounterparty || (kind === 'receipt' && counterparty)
            ? { counterparty_id: counterparty }
            : {}),
          ...(needsCash ? { cash_account_id: cashAccount } : {}),
          ...(kind === 'cash_transfer' ? { target_cash_account_id: targetCash } : {}),
          ...(kind === 'supplier_invoice' ? { matched_receipt_id: receipt } : {}),
          ...(kind === 'payment' ? { allocated_invoice_id: invoice } : {}),
          ...(zone ? { zone_id: zone } : {}),
          ...(reference.trim() ? { reference: reference.trim() } : {}),
          ...(due && payableKinds.includes(kind) ? { due_date: due } : {}),
          description: description.trim(),
          document_date: date,
        },
      }),
    onClose,
  );
  const valid =
    amount &&
    description.trim().length >= 5 &&
    (!needsCounterparty || counterparty) &&
    (!needsCash || cashAccount) &&
    (kind !== 'cash_transfer' || (targetCash && targetCash !== cashAccount)) &&
    (kind !== 'supplier_invoice' || receipt) &&
    (kind !== 'payment' || invoice);
  return (
    <Modal
      open
      onClose={onClose}
      title={t('fin.new_document')}
      size="lg"
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
        <Select
          label={t('fin.kind')}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as DocKind);
            setReceipt('');
            setSelectedReceipt(null);
            setInvoice('');
          }}
        >
          {kinds.map((k) => (
            <option key={k} value={k}>
              {t(`fin.kind.${k}`)}
            </option>
          ))}
        </Select>
        <div className="form-grid">
          {(needsCounterparty || kind === 'receipt') && (
            <SearchSelect<Counterparty>
              path="/v1/counterparties"
              params={{ archived: false }}
              label={t('fin.counterparty')}
              required={needsCounterparty}
              value={counterparty}
              valueLabel={
                counterpartyName ??
                payables.data?.items.find((p) => p.counterparty_id === counterparty)?.counterparty_name ??
                undefined
              }
              onChange={(id, item) => {
                setCounterparty(id);
                setCounterpartyName(item?.name);
                setInvoice('');
              }}
              getId={(c) => c.id}
              getLabel={(c) => c.name}
              getSub={(c) => t(`fin.counterparties.kind.${c.kind}`)}
            />
          )}
          {needsCash && (
            <Select
              label={t('fin.cash_account')}
              required
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
          {kind === 'cash_transfer' && (
            <Select
              label={t('fin.target_cash_account')}
              required
              value={targetCash}
              onChange={(e) => setTargetCash(e.target.value)}
            >
              <option value="">—</option>
              {(cash.data?.items ?? [])
                .filter((c) => !c.archived_at && c.id !== cashAccount)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          )}
          {kind === 'supplier_invoice' && (
            <SearchSelect<StockCommand>
              wrapClassName="span-2"
              path="/v1/stock/commands"
              params={{ project_id: projectId, kind: 'receipt', status: 'posted', unmatched: true }}
              label={t('fin.matched_receipt')}
              required
              hint={t('fin.matched_receipt_hint')}
              value={receipt}
              onChange={(id, r) => {
                setReceipt(id);
                setSelectedReceipt(r);
                if (r && r.unit_cost)
                  setAmount((Number(r.unit_cost) * Number(r.accepted_quantity)).toFixed(2));
              }}
              getId={(r) => r.id}
              getLabel={(r) =>
                `${formatDate(r.created_at, lang)} · ${r.material_name} · ${formatQuantity(r.accepted_quantity, r.unit_id)} · ${r.to_name}`
              }
            />
          )}
          {kind === 'payment' && (
            <Select
              wrapClassName="span-2"
              label={t('fin.allocated_invoice')}
              required
              hint={t('fin.pay_hint')}
              value={invoice}
              onChange={(e) => {
                setInvoice(e.target.value);
                const p = payables.data?.items.find((x) => x.id === e.target.value);
                if (p) {
                  setAmount(p.outstanding);
                  if (!counterparty && p.counterparty_id) setCounterparty(p.counterparty_id);
                }
              }}
            >
              <option value="">—</option>
              {(payables.data?.items ?? [])
                .filter((p) => p.project_id === projectId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {t(`fin.kind.${p.kind}`)} · {p.counterparty_name} · {p.description.slice(0, 40)} ·{' '}
                    {t('fin.outstanding')}: {formatMoney(p.outstanding, lang, true, 'UZS')}
                  </option>
                ))}
            </Select>
          )}
          <Input
            label={t('fin.amount')}
            required
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            hint={
              receiptValue
                ? `${t('fin.matched_receipt')}: ${formatMoney(receiptValue, lang, true, 'UZS')}`
                : undefined
            }
          />
          <Input
            type="date"
            label={t('fin.document_date')}
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {payableKinds.includes(kind) && (
            <Input
              type="date"
              label={t('fin.due_date')}
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          )}
          <Input
            label={t('fin.reference')}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          {!needsCash && (
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
          label={t('fin.description')}
          hint={t('common.reason_hint')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {kind === 'allocation' || kind === 'purchase_order' ? (
          <Alert tone="info">{t('fin.alloc.sub')}</Alert>
        ) : null}
      </div>
    </Modal>
  );
}
