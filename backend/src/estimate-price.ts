import { type Db, type Row } from './db.js';
import { dec, money, plannedQuantity } from './money.js';
import { invariant } from './errors.js';

/**
 * S3 (D36–D39): smetaning yakuniy qismi — «smeta narxi» zanjiri. Qator jamlari va plan_total o'zgarmaydi (D38).
 * Tartib (egasining `локалка` jamlar bloki va VMQ 583):
 *   ish haqi, mashinalar, pudratchi materiallari, buyurtmachi materiallari, xizmatlar → to'g'ridan-to'g'ri xarajatlar;
 *   boshqa xarajatlar = to'g'ridan-to'g'ri × (boshqa + foyda) % (D39: baza buyurtmachi materiallari bilan);
 *   ishlab chiqarish xarajatlari = to'g'ridan-to'g'ri × %; jami; buyurtmachi materiallari chegirmasi; QQSsiz jami;
 *   QQS (ixtiyoriy, D36); QQS bilan jami.
 * Hisob decimal bilan; har qator 0,01 gacha (half-up), keyingi qator yaxlitlangan qiymatlardan.
 */
export type PriceSettings = {
  markup_mode: 'free' | 'vmq583';
  other_costs_percent: string;
  profit_percent: string;
  production_costs_percent: string;
  deduct_customer_materials: boolean;
  vat_percent: string | null;
};
export type DirectCosts = {
  labor: string;
  equipment: string;
  contractor_materials: string;
  customer_materials: string;
  services: string;
};
export type PriceLine = { key: string; amount: string; percent?: string };

const pct = (v: string) => dec(v).toFixed();
export function priceChain(c: DirectCosts, s: PriceSettings) {
  const lines: PriceLine[] = [
    { key: 'labor', amount: money(c.labor) },
    { key: 'equipment', amount: money(c.equipment) },
    { key: 'contractor_materials', amount: money(c.contractor_materials) },
    { key: 'customer_materials', amount: money(c.customer_materials) },
    { key: 'services', amount: money(c.services) },
  ];
  const direct = lines.reduce((sum, l) => sum.plus(l.amount), dec('0'));
  lines.push({ key: 'direct_total', amount: money(direct) });
  const markup = dec(s.other_costs_percent).plus(s.profit_percent);
  const other = money(direct.mul(markup).div(100));
  lines.push({ key: 'other_costs', amount: other, percent: markup.toFixed() });
  const production = money(direct.mul(s.production_costs_percent).div(100));
  lines.push({
    key: 'production_costs',
    amount: production,
    percent: pct(s.production_costs_percent),
  });
  const total = direct.plus(other).plus(production);
  lines.push({ key: 'total', amount: money(total) });
  const deduction = s.deduct_customer_materials ? dec(money(c.customer_materials)) : dec('0');
  // decimal.js «-0.00» bermasligi uchun nol alohida
  lines.push({
    key: 'customer_deduction',
    amount: deduction.isZero() ? money(0) : money(deduction.negated()),
  });
  const net = total.minus(deduction);
  lines.push({ key: 'total_without_vat', amount: money(net) });
  if (s.vat_percent === null) return { lines, total: money(net) };
  const vat = money(net.mul(s.vat_percent).div(100));
  const withVat = net.plus(vat);
  lines.push({ key: 'vat', amount: vat, percent: pct(s.vat_percent) });
  lines.push({ key: 'total_with_vat', amount: money(withVat) });
  return { lines, total: money(withVat) };
}

/** VMQ 583: foyda 7 %, ishlab chiqarish xarajatlari 2,5 % (tog'li, cho'l, borish qiyin hududda 5 %); boshqa xarajatlar tahrirlanadi. */
export function assertPriceSettings(s: PriceSettings) {
  if (s.markup_mode !== 'vmq583') return;
  invariant(
    dec(s.profit_percent).eq(7) && ['2.5', '5'].includes(dec(s.production_costs_percent).toFixed()),
    'VMQ583_PRESET',
    400,
  );
}
/**
 * Sozlamalarni smetaga yozadi (berilmaganlari o'zgarmaydi), VMQ 583 shartini tekshiradi va yangilangan qatorni
 * qaytaradi. `changes` kalitlari zod `priceSettings` dan — SQL ga faqat shu ustun nomlari tushadi.
 */
export async function applyPriceSettings(db: Db, estimate: Row, changes: Partial<PriceSettings>) {
  const keys = Object.keys(changes) as (keyof PriceSettings)[];
  if (!keys.length) return estimate;
  assertPriceSettings(settingsOf({ ...estimate, ...changes }));
  return (
    await db.query(
      `UPDATE estimates SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')} WHERE id=$1 RETURNING *`,
      [estimate.id, ...keys.map((k) => changes[k])],
    )
  ).rows[0];
}
export const settingsOf = (e: Row): PriceSettings => ({
  markup_mode: e.markup_mode,
  other_costs_percent: e.other_costs_percent,
  profit_percent: e.profit_percent,
  production_costs_percent: e.production_costs_percent,
  deduct_customer_materials: e.deduct_customer_materials,
  vat_percent: e.vat_percent,
});

export const defaultSettings: PriceSettings = {
  markup_mode: 'free',
  other_costs_percent: '0',
  profit_percent: '0',
  production_costs_percent: '0',
  deduct_customer_materials: true,
  vat_percent: null,
};
/** Saqlanmagan qatorlar (import previewi) bo'yicha to'g'ridan-to'g'ri xarajatlar; qator jami saqlashdagi formula bilan. */
export function directCostsOf(lines: Row[]): DirectCosts {
  const sum = (pick: (l: Row) => boolean) => {
    let total = dec('0');
    for (const l of lines.filter(pick))
      total = total.plus(money(dec(plannedQuantity(l as any)).mul(l.unit_price)));
    return money(total);
  };
  return {
    labor: sum((l) => l.kind === 'labor'),
    equipment: sum((l) => l.kind === 'equipment'),
    contractor_materials: sum((l) => l.kind === 'material' && l.supplied_by !== 'customer'),
    customer_materials: sum((l) => l.kind === 'material' && l.supplied_by === 'customer'),
    services: sum((l) => l.kind === 'service'),
  };
}
/**
 * Form 5 jamlar blokidan taklif (D37): ulushli «прочие» qatorlari — boshqa xarajatlar foizi (yig'indisi), НДС ulushi —
 * QQS; bosh pudratchi (buyurtmachi) materiallari yoki «ВОЗВРАТ» qatori bo'lsa — bosh pudratchi materiallarini buyurtmachi beradi.
 */
export function suggestFromExcel(
  rows: { key: string | null; percent: string | null; addable: boolean; amount: string | null }[],
) {
  // Sozlama ustuni numeric(7,4): taklif ham 4 kasrgacha (preview va saqlangan zanjir bir xil bo'lsin)
  const other = rows
    .filter((r) => r.addable && r.percent && r.key === 'other_costs')
    .reduce((s, r) => s.plus(r.percent!), dec('0'))
    .toDecimalPlaces(4);
  const vat = rows.find((r) => r.key === 'vat' && r.percent)?.percent ?? null;
  return {
    settings: {
      ...defaultSettings,
      other_costs_percent: other.gt(100) ? '100' : other.toFixed(),
      vat_percent: vat === null ? null : dec(vat).toDecimalPlaces(4).toFixed(),
    },
    gc_supplied_by: rows.some(
      (r) =>
        (r.key === 'customer_materials' || r.key === 'customer_deduction') &&
        r.amount !== null &&
        dec(r.amount).abs().gt(0),
    )
      ? ('customer' as const)
      : ('contractor' as const),
  };
}
/**
 * D29 bilan qo'shilgan foizli «xizmat» qatori (masalan, «ПРОЧИЕ ЗАТРАТЫ СУБПОДРЯДЧИКА (21 %)»): xizmat, normasiz,
 * miqdori 1, birligi komplekt, nomi «(NN %)» bilan tugaydi. D39: to'g'ridan-to'g'ri xarajatlarga kirmaydi.
 */
export const percentLineSql = `(l.kind='service' AND l.norm IS NULL AND l.quantity=1 AND l.unit_id='set' AND l.description ~ '\\((\\d+(\\.\\d+)?) %\\)$')`;
/** Foizli qator nomidagi foiz (masalan, «… (21 %)» → «21»). */
export const percentOfLine = (description: string) =>
  description.match(/\((\d+(?:\.\d+)?) %\)$/)?.[1] ?? null;

/** Smetaning joriy qatorlari bo'yicha zanjir va foizli qatorlar (ogohlantirish uchun). */
export async function estimatePriceSummary(db: Db, tenantId: string, estimate: Row) {
  const sums = (
    await db.query(
      `SELECT coalesce(sum(l.total) FILTER(WHERE l.kind='labor'),0)::text labor,
         coalesce(sum(l.total) FILTER(WHERE l.kind='equipment'),0)::text equipment,
         coalesce(sum(l.total) FILTER(WHERE l.kind='material' AND l.supplied_by='contractor'),0)::text contractor_materials,
         coalesce(sum(l.total) FILTER(WHERE l.kind='material' AND l.supplied_by='customer'),0)::text customer_materials,
         coalesce(sum(l.total) FILTER(WHERE l.kind='service' AND NOT ${percentLineSql}),0)::text services,
         coalesce(jsonb_agg(jsonb_build_object('id',l.id,'description',l.description,'total',l.total::text) ORDER BY l.position)
           FILTER(WHERE ${percentLineSql}),'[]') percent_lines
       FROM estimate_lines l WHERE l.tenant_id=$1 AND l.estimate_id=$2 AND l.archived_at IS NULL`,
      [tenantId, estimate.id],
    )
  ).rows[0];
  const { percent_lines, ...costs } = sums;
  const settings = settingsOf(estimate);
  const lines = (percent_lines as Row[]).map((l): Row => ({
    ...l,
    percent: percentOfLine(l.description),
  }));
  return {
    ...settings,
    ...priceChain(costs as DirectCosts, settings),
    percent_lines: lines,
    // O'tkazilsa «boshqa xarajatlar» qancha bo'ladi (amaldagi foiz + qatorlar foizi) — UI tasdiq uchun ko'rsatadi
    converted_other_costs_percent: lines.length ? convertedPercent(settings, lines) : null,
  };
}
/** Foizli qatorlar sozlamaga o'tkazilgandagi «boshqa xarajatlar» foizi (4 kasrgacha). */
export function convertedPercent(settings: PriceSettings, lines: Row[]) {
  return lines
    .reduce(
      (s, l) => s.plus(percentOfLine(String(l.description)) ?? '0'),
      dec(settings.other_costs_percent),
    )
    .toDecimalPlaces(4)
    .toFixed();
}
