import { useQuery } from '@tanstack/react-query';
import { api, randomId, type ListResponse } from '@/lib/api';
import type { Zone } from '@/features/projects/types';

export type LineKind = 'material' | 'labor' | 'equipment' | 'service';
export const lineKinds: LineKind[] = ['material', 'labor', 'equipment', 'service'];
export type Unit = { id: string; name: string; dimension: string };
/** `alias` — qidiruv muqobil nom bo'yicha topganda (D32) */
export type Material = { id: string; name: string; unit_id: string; catalog_id: string | null; alias?: string | null };
export type EstimateSummary = {
  id: string;
  project_id: string;
  name: string;
  revision: number;
  created_by_name: string | null;
  created_at: string;
  line_count: number;
  total: string;
  material_total: string;
  work_total: string;
};
/** Obyekt bo'yicha smetalar jami (sahifalashsiz); pul maydonlari narx huquqisiz kelmaydi. */
export type EstimatesSummary = { count: number; line_count: number; total?: string; material_total?: string };
export type EstimateGroupTotal = { key: string; count: number; total?: string; value?: string };
export type EstimateTotals = {
  total?: string;
  material_total?: string;
  work_total?: string;
  by_kind: EstimateGroupTotal[];
  by_category: EstimateGroupTotal[];
  by_zone: EstimateGroupTotal[];
  /** S2: «Раздел» bo'yicha (key '' — bo'limsiz qatorlar) */
  by_section: EstimateGroupTotal[];
};
export type SuppliedBy = 'contractor' | 'customer';
export type EstimateLine = {
  id: string;
  kind: LineKind;
  description: string;
  category: string | null;
  /** S2: Form 5 ish qatorida to'liq norma shifri; resurs/material qatorida resurs kodi; «Раздел» matni */
  norm_code: string | null;
  resource_code: string | null;
  section_name: string | null;
  note: string | null;
  position: number;
  zone_id: string | null;
  zone_name: string | null;
  material_id: string | null;
  material_name: string | null;
  unit_id: string;
  quantity: string;
  norm: string | null;
  work_quantity: string | null;
  loss_percent: string;
  effective_quantity: string;
  /** S3: material kim beradi (buyurtmachi — faqat material qatorida) */
  supplied_by: SuppliedBy;
  unit_price?: string;
  total?: string;
  months: { month: string; quantity: string }[];
  fact_quantity: string;
  fact_value: string | null;
};
export type MarkupMode = 'free' | 'vmq583';
/** S3: narx zanjiri qatori (kalitlar tartibi serverdan); summalar va foizlar serverda hisoblanadi */
export type PriceSummaryLine = { key: string; amount: string; percent?: string };
export type PriceSummary = {
  markup_mode: MarkupMode;
  other_costs_percent: string;
  profit_percent: string;
  production_costs_percent: string;
  deduct_customer_materials: boolean;
  vat_percent: string | null;
  lines: PriceSummaryLine[];
  total: string;
  /** Zanjirdan tashqarida qolgan eski «… (21 %)» xizmat qatorlari (D29) */
  percent_lines: { id: string; description: string; total: string; percent: string | null }[];
  /** O'tkazilsa «boshqa xarajatlar» foizi (amaldagi + qatorlar); qator bo'lmasa null */
  converted_other_costs_percent: string | null;
};
export type EstimateDetail = {
  id: string;
  project_id: string;
  name: string;
  revision: number;
  created_at: string;
  /** S2: smeta sarlavhasi; `contract_amount` narx huquqisiz kelmaydi */
  basis: string | null;
  price_level_date: string | null;
  labor_rate_source: string | null;
  contract_number: string | null;
  contract_date: string | null;
  contract_amount?: string | null;
  /** S3: narx sozlamalari; foizlar narx huquqisiz kelmaydi */
  markup_mode: MarkupMode;
  deduct_customer_materials: boolean;
  other_costs_percent?: string;
  profit_percent?: string;
  production_costs_percent?: string;
  vat_percent?: string | null;
  price_summary?: PriceSummary;
  lines: EstimateLine[];
  totals: EstimateTotals;
};
/** S2: `GET /v1/estimates/:id/resources` — resurslar yig'masi; summalar narx huquqisiz kelmaydi. */
export type EstimateResources = {
  estimate_id: string;
  revision: number;
  items: {
    kind: LineKind;
    name: string;
    unit_id: string;
    resource_code: string | null;
    line_count: number;
    quantity: string;
    amount?: string;
  }[];
  by_kind: { key: LineKind; count: number; total?: string }[];
  total?: string;
};

/** Tahrir qatori: barcha qiymatlar string, serverga shu holicha yuboriladi (decimal). */
export type LineDraft = {
  key: string;
  kind: LineKind;
  description: string;
  category: string;
  /** S2: tahrirda ko'rsatilmaydi, lekin yangi reviziyada yo'qolmasligi uchun saqlanadi */
  norm_code: string;
  resource_code: string;
  section_name: string;
  zone_id: string;
  material_id: string;
  material_name: string;
  material_unit: string;
  supplied_by: SuppliedBy;
  unit_id: string;
  mode: 'manual' | 'norm';
  quantity: string;
  norm: string;
  work_quantity: string;
  loss_percent: string;
  unit_price: string;
  note: string;
  months: { month: string; quantity: string }[];
};
export const newLine = (partial: Partial<LineDraft> = {}): LineDraft => ({
  key: randomId(),
  kind: 'material',
  description: '',
  category: '',
  norm_code: '',
  resource_code: '',
  section_name: '',
  zone_id: '',
  material_id: '',
  material_name: '',
  material_unit: '',
  supplied_by: 'contractor',
  unit_id: '',
  mode: 'manual',
  quantity: '',
  norm: '',
  work_quantity: '',
  loss_percent: '',
  unit_price: '',
  note: '',
  months: [],
  ...partial,
});
export const fromLine = (l: EstimateLine): LineDraft => ({
  key: l.id,
  kind: l.kind,
  description: l.description,
  category: l.category ?? '',
  norm_code: l.norm_code ?? '',
  resource_code: l.resource_code ?? '',
  section_name: l.section_name ?? '',
  zone_id: l.zone_id ?? '',
  material_id: l.material_id ?? '',
  material_name: l.material_name ?? '',
  material_unit: l.material_id ? l.unit_id : '',
  supplied_by: l.supplied_by ?? 'contractor',
  unit_id: l.unit_id,
  mode: l.norm !== null ? 'norm' : 'manual',
  quantity: l.norm !== null ? '' : trimZeros(l.quantity),
  norm: l.norm !== null ? trimZeros(l.norm) : '',
  work_quantity: l.work_quantity !== null ? trimZeros(l.work_quantity) : '',
  loss_percent: Number(l.loss_percent) ? trimZeros(l.loss_percent) : '',
  unit_price: l.unit_price !== undefined ? trimZeros(l.unit_price) : '',
  note: l.note ?? '',
  months: l.months.map((m) => ({ month: m.month.slice(0, 10), quantity: trimZeros(m.quantity) })),
});
export const trimZeros = (v: string) => (v.includes('.') ? v.replace(/\.?0+$/, '') : v);
const QTY = /^(0|[1-9]\d{0,17})(\.\d{1,6})?$/;
export const AMOUNT = /^(0|[1-9]\d{0,17})(\.\d{1,2})?$/;
/** S3: foiz 0-100, ko'pi bilan 4 kasr (serverdagi qoida bilan bir xil) */
export const PERCENT = /^(100(\.0{1,4})?|[1-9]?\d(\.\d{1,4})?)$/;
export const normalizeNumber = (v: string) => v.trim().replace(/\s/g, '').replace(',', '.');
/** Ko'rsatish uchun taxminiy hisob; server decimal bilan qayta hisoblaydi. */
export function effectiveOf(d: LineDraft) {
  const base =
    d.mode === 'norm'
      ? Number(normalizeNumber(d.norm)) * Number(normalizeNumber(d.work_quantity))
      : Number(normalizeNumber(d.quantity));
  const loss = d.loss_percent ? Number(normalizeNumber(d.loss_percent)) : 0;
  const v = base * (1 + loss / 100);
  return Number.isFinite(v) ? v : 0;
}
export const totalOf = (d: LineDraft) => effectiveOf(d) * (Number(normalizeNumber(d.unit_price)) || 0);
export function validateLine(
  d: LineDraft,
  t: (k: string, v?: Record<string, string>) => string,
) {
  const errors: Partial<Record<keyof LineDraft, string>> = {};
  if (!d.description.trim()) errors.description = t('est.err.description');
  if (d.kind === 'material' && !d.material_id) errors.material_id = t('est.err.material');
  if (!d.unit_id) errors.unit_id = t('est.err.unit');
  if (d.kind === 'material' && d.material_unit && d.material_unit !== d.unit_id)
    errors.unit_id = t('est.err.unit_mismatch', { unit: d.material_unit });
  if (d.mode === 'manual') {
    if (!QTY.test(normalizeNumber(d.quantity))) errors.quantity = t('est.err.quantity');
  } else {
    if (!QTY.test(normalizeNumber(d.norm))) errors.norm = t('est.err.norm_pair');
    if (!QTY.test(normalizeNumber(d.work_quantity))) errors.work_quantity = t('est.err.norm_pair');
  }
  if (d.loss_percent && !QTY.test(normalizeNumber(d.loss_percent)))
    errors.loss_percent = t('est.err.quantity');
  if (!AMOUNT.test(normalizeNumber(d.unit_price))) errors.unit_price = t('est.err.price');
  if (d.months.length) {
    const sum = d.months.reduce((s, m) => s + (Number(normalizeNumber(m.quantity)) || 0), 0);
    if (Math.abs(sum - effectiveOf(d)) > 0.000001) errors.months = t('est.err.months_sum');
  }
  return errors;
}
export function toApiLine(d: LineDraft, position: number) {
  const base = {
    kind: d.kind,
    description: d.description.trim(),
    unit_id: d.unit_id,
    unit_price: normalizeNumber(d.unit_price),
    position,
    ...(d.category.trim() ? { category: d.category.trim() } : {}),
    ...(d.norm_code.trim() ? { norm_code: d.norm_code.trim() } : {}),
    ...(d.resource_code.trim() ? { resource_code: d.resource_code.trim() } : {}),
    ...(d.section_name.trim() ? { section_name: d.section_name.trim() } : {}),
    ...(d.note.trim() ? { note: d.note.trim() } : {}),
    ...(d.zone_id ? { zone_id: d.zone_id } : {}),
    ...(d.kind === 'material' ? { material_id: d.material_id, supplied_by: d.supplied_by } : {}),
    ...(d.loss_percent ? { loss_percent: normalizeNumber(d.loss_percent) } : {}),
    ...(d.months.length
      ? {
          months: d.months.map((m) => ({
            month: m.month.slice(0, 7) + '-01',
            quantity: normalizeNumber(m.quantity),
          })),
        }
      : {}),
  };
  return d.mode === 'norm'
    ? {
        ...base,
        quantity: '0',
        norm: normalizeNumber(d.norm),
        work_quantity: normalizeNumber(d.work_quantity),
      }
    : { ...base, quantity: normalizeNumber(d.quantity) };
}
export const useUnits = () =>
  useQuery({
    queryKey: ['catalog'],
    queryFn: () => api<{ units: Unit[] }>('/v1/catalog'),
    staleTime: 3600000,
  });
export const useZones = (projectId: string) =>
  useQuery({
    queryKey: ['zones', projectId],
    queryFn: () => api<ListResponse<Zone>>(`/v1/projects/${projectId}/zones`),
    enabled: Boolean(projectId),
  });

/** S4: oylik bajarilgan ishlar dalolatnomasi (F-2 / F-3), `GET /v1/estimates/:id/acts`; barcha raqamlar serverdan. */
export type ActRange = 'start' | 'year' | 'period';
export type ActBasis = 'work' | 'norm' | 'consumption' | 'progress';
export type ActLine = {
  id: string;
  kind: LineKind;
  description: string;
  unit_id: string;
  norm: string | null;
  unit_price: string;
  supplied_by: SuppliedBy;
  section_name: string | null;
  norm_code: string | null;
  resource_code: string | null;
  position: number;
  basis: ActBasis;
  quantity: Record<ActRange, string>;
  amount: Record<ActRange, string>;
};
export type ActTotals = { lines: PriceSummaryLine[]; total: string };
export type EstimateAct = {
  estimate: { id: string; name: string; revision: number; project_id: string };
  parties: {
    contractor: string | null;
    contractor_address: string | null;
    contractor_phone: string | null;
    customer: string | null;
    project: string | null;
    project_address: string | null;
    estimate: string | null;
    revision: number;
  };
  period: { from: string; to: string; year_from: string };
  settings: {
    markup_mode: MarkupMode;
    other_costs_percent: string;
    profit_percent: string;
    production_costs_percent: string;
    deduct_customer_materials: boolean;
    vat_percent: string | null;
  };
  lines: ActLine[];
  totals: Record<ActRange, ActTotals>;
  contract: {
    number: string | null;
    date: string | null;
    amount: string | null;
    amount_without_vat: string | null;
    vat: string | null;
    percent: Record<ActRange, string | null>;
  };
  warnings: {
    /** Joriy reviziyada yo'q qatorlar fakti (uch jamg'arma) — summaga kirmaydi */
    removed_lines: { description: string; unit_id: string; quantity: Record<ActRange, string> }[];
    unlinked_consumption: { name: string; unit_id: string; quantity: string }[];
    /** Form 5 resursiga yoki foizli qatorga yozilgan qabul qilingan hajm — hisobga olinmaydi */
    ignored_progress: { description: string; unit_id: string; quantity: Record<ActRange, string> }[];
  };
};
