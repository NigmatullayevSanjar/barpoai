import { useQuery } from '@tanstack/react-query';
import { api, type ListResponse } from '@/lib/api';
import type { Zone } from '@/features/projects/types';

export type LineKind = 'material' | 'labor' | 'equipment' | 'service';
export const lineKinds: LineKind[] = ['material', 'labor', 'equipment', 'service'];
export type Unit = { id: string; name: string; dimension: string };
export type Material = { id: string; name: string; unit_id: string; catalog_id: string | null };
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
export type EstimateLine = {
  id: string;
  kind: LineKind;
  description: string;
  category: string | null;
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
  unit_price?: string;
  total?: string;
  months: { month: string; quantity: string }[];
  fact_quantity: string;
  fact_value: string | null;
};
export type EstimateDetail = {
  id: string;
  project_id: string;
  name: string;
  revision: number;
  created_at: string;
  lines: EstimateLine[];
};

/** Tahrir qatori: barcha qiymatlar string, serverga shu holicha yuboriladi (decimal). */
export type LineDraft = {
  key: string;
  kind: LineKind;
  description: string;
  category: string;
  zone_id: string;
  material_id: string;
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
  key: crypto.randomUUID(),
  kind: 'material',
  description: '',
  category: '',
  zone_id: '',
  material_id: '',
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
  zone_id: l.zone_id ?? '',
  material_id: l.material_id ?? '',
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
const AMOUNT = /^(0|[1-9]\d{0,17})(\.\d{1,2})?$/;
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
  materials: Material[],
  t: (k: string, v?: Record<string, string>) => string,
) {
  const errors: Partial<Record<keyof LineDraft, string>> = {};
  if (!d.description.trim()) errors.description = t('est.err.description');
  if (d.kind === 'material' && !d.material_id) errors.material_id = t('est.err.material');
  if (!d.unit_id) errors.unit_id = t('est.err.unit');
  if (d.kind === 'material' && d.material_id) {
    const m = materials.find((x) => x.id === d.material_id);
    if (m && m.unit_id !== d.unit_id) errors.unit_id = t('est.err.unit_mismatch', { unit: m.unit_id });
  }
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
    ...(d.note.trim() ? { note: d.note.trim() } : {}),
    ...(d.zone_id ? { zone_id: d.zone_id } : {}),
    ...(d.kind === 'material' ? { material_id: d.material_id } : {}),
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
export const useMaterials = () =>
  useQuery({
    queryKey: ['materials'],
    queryFn: () => api<ListResponse<Material>>('/v1/materials?limit=100'),
  });
export const useZones = (projectId: string) =>
  useQuery({
    queryKey: ['zones', projectId],
    queryFn: () => api<ListResponse<Zone>>(`/v1/projects/${projectId}/zones`),
    enabled: Boolean(projectId),
  });
export const sumBy = <T>(rows: T[], pick: (r: T) => number) => rows.reduce((s, r) => s + pick(r), 0);
