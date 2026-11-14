import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { errorMessage, useT } from '@/lib/i18n';
import { formatMoney } from '@/lib/format';
import { normalizeNumber, PERCENT, trimZeros, type SuppliedBy } from './model';
import { Alert, Badge, Button, Input, Modal, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import type { EstimateSummary } from './model';

export type Form5Sheet = {
  sheet: string;
  form5: boolean;
  too_large: boolean;
  rows: number;
  works: number;
  resources: number;
  materials: number;
  priced: number;
};
/** Excel «jami» bloki qatori; platforma summasi va farq serverda hisoblanadi */
type ExcelRow = {
  row: number;
  label: string;
  rate: string | null;
  percent: string | null;
  amount: string | null;
  addable: boolean;
  key: string | null;
  platform_amount: string | null;
  difference: string | null;
};
/** Foizlar narx maydoni: narx huquqisiz foydalanuvchiga kelmaydi (sozlama boshqaruvi ko'rsatilmaydi) */
type Suggested = {
  markup_mode: string;
  other_costs_percent?: string;
  profit_percent?: string;
  production_costs_percent?: string;
  deduct_customer_materials: boolean;
  vat_percent?: string | null;
  gc_supplied_by: SuppliedBy;
};
/** Varaq bo'yicha narx sozlamalari (kiritish maydonlari, matn) */
type Controls = { other: string; vat: string; deduct: boolean; gc: SuppliedBy };
const controlsOf = (x: Suggested): Controls => ({
  other: x.other_costs_percent ? trimZeros(x.other_costs_percent) : '',
  vat: x.vat_percent ? trimZeros(x.vat_percent) : '',
  deduct: x.deduct_customer_materials,
  gc: x.gc_supplied_by,
});
/** Kiritilgan sozlama oxirgi tekshiruvdagidan farq qiladimi (farq qilsa — avval qayta tekshirish kerak) */
const sameControls = (a: Controls, b: Controls) =>
  trimZeros(normalizeNumber(a.other)) === trimZeros(normalizeNumber(b.other)) &&
  trimZeros(normalizeNumber(a.vat)) === trimZeros(normalizeNumber(b.vat)) &&
  a.deduct === b.deduct &&
  a.gc === b.gc;
type SheetPreview = {
  id: string;
  digest: string;
  sheet: string;
  name: string;
  /** D42: mavjud smetaning yangi reviziyasi bo'lsa — o'sha smeta */
  target: { id: string; name: string; revision: number } | null;
  lines: number;
  /** Jamlar serverda (decimal); frontend qo'shmaydi */
  total: string;
  direct_total: string;
  excel_total: string | null;
  excel_difference: string | null;
  excel_rows: ExcelRow[];
  suggested: Suggested;
  /** Shu tekshiruvda ishlatilgan sozlama va tanlov */
  settings: Omit<Suggested, 'gc_supplied_by'>;
  gc_supplied_by: SuppliedBy;
  /** Bosh pudratchi material qatorlari soni (tanlov shularga tegishli) */
  gc_materials: number;
  /** Narx huquqisiz kelmaydi */
  price_summary?: { total: string };
  zones: string[];
  created: { materials: number; zones: number };
  converted: { row: number }[];
  warnings: {
    unknown_units: { unit: string; rows: number }[];
    unpriced: number;
    quantity_mismatch: { row: number; excel: string; platform: string }[];
    quantity_mismatch_count: number;
    price_varies: { code: string | null; name: string; min_price: string; max_price: string }[];
    missing_unit: number[];
    skipped_works: number[];
    project_quantity: {
      row: number;
      code: string | null;
      name: string;
      unit: string | null;
      category: string | null;
      zone: string | null;
    }[];
    project_quantity_count: number;
  };
};
type RowIssue = { sheet?: string; row: number; field: string; message: string };
const rowList = (rows: number[]) => rows.slice(0, 30).join(', ') + (rows.length > 30 ? ', …' : '');
/** Bir xil nomli qatorlar bitta guruhda: «Nom: 21, 27, 33; …» (uzun ro'yxat matnni cho'zmasin). */
const rowsByName = (items: { row: number; name: string }[], more: boolean) => {
  const groups = new Map<string, number[]>();
  for (const p of items) groups.set(p.name, [...(groups.get(p.name) ?? []), p.row]);
  const list = [...groups].slice(0, 5).map(([name, rows]) => `${name}: ${rowList(rows)}`);
  return list.join('; ') + (more || groups.size > 5 ? '; …' : '');
};

/**
 * D29: Form 5 (ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ) importi — varaqlarni tanlash → server tekshiruvi → hammasi bitta amalda
 * saqlanadi. Har varaq alohida smeta; S3: «Excel jami» bloki platforma narx zanjiri bilan solishtiriladi, boshqa xarajat,
 * QQS va bosh pudratchi materiali sozlamalari tekshiruvda o'zgartirilib, tekshiruv qayta ishga tushiriladi.
 */
export function Form5Import({
  projectId,
  file,
  sheets,
  targets,
  initialTarget,
  onBack,
  onClose,
}: {
  projectId: string;
  file: { name: string; base64: string };
  sheets: Form5Sheet[];
  /** D42: varaq yuklanishi mumkin bo'lgan mavjud smetalar (reviziya huquqi bo'lmasa bo'sh) */
  targets: EstimateSummary[];
  /** 1-qadamda tanlangan smeta — yagona varaqqa oldindan qo'yiladi */
  initialTarget: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const selectable = sheets.filter((s) => s.form5 && !s.too_large);
  const [step, setStep] = useState<2 | 3>(2);
  // varaq → smeta nomi; ro'yxatda bo'lsa tanlangan
  const initial = selectable.length === 1 ? targets.find((x) => x.id === initialTarget) : undefined;
  const [picked, setPicked] = useState<Record<string, string>>(() =>
    Object.fromEntries(selectable.map((s) => [s.sheet, initial?.name ?? s.sheet.trim()])),
  );
  // D42: varaq → mavjud smeta (yangi reviziya); bo'lmasa yangi smeta. Bir smetaga bitta varaq.
  const [sheetTargets, setSheetTargets] = useState<Record<string, string>>(() =>
    initial ? { [selectable[0]!.sheet]: initial.id } : {},
  );
  const [previews, setPreviews] = useState<SheetPreview[]>([]);
  const [controls, setControls] = useState<Record<string, Controls>>({});
  const [issues, setIssues] = useState<RowIssue[]>([]);
  const [error, setError] = useState('');
  const money = (v: string | null) => formatMoney(v, lang, true, 'UZS');

  const previewMutation = useMutation({
    // withControls: sozlamalar bilan qayta tekshirish; aks holda server taklifi (`suggested`) olinadi
    mutationFn: (withControls: boolean) =>
      api<{ sheets: SheetPreview[] }>('/v1/estimate-imports/form5/preview', {
        method: 'POST',
        body: {
          project_id: projectId,
          file_base64: file.base64,
          sheets: Object.entries(picked).map(([sheet, name]) => {
            const c = controls[sheet];
            return {
              sheet,
              name: name.trim(),
              ...(sheetTargets[sheet] ? { estimate_id: sheetTargets[sheet] } : {}),
              ...(withControls && c
                ? {
                    settings: {
                      other_costs_percent: normalizeNumber(c.other),
                      vat_percent: normalizeNumber(c.vat) || null,
                      deduct_customer_materials: c.deduct,
                    },
                    gc_supplied_by: c.gc,
                  }
                : {}),
            };
          }),
        },
      }),
    onSuccess: (r, withControls) => {
      setPreviews(r.sheets);
      if (!withControls)
        setControls(Object.fromEntries(r.sheets.map((p) => [p.sheet, controlsOf(p.suggested)])));
      setIssues([]);
      setError('');
      setStep(3);
    },
    onError: (e: ApiError) => {
      if (e.code === 'IMPORT_NAMES_UNRESOLVED' || e.code === 'IMPORT_ROWS_INVALID') {
        setIssues((e.details as RowIssue[]) ?? []);
        setError(t(e.code === 'IMPORT_ROWS_INVALID' ? 'est.import_rows_invalid' : 'est.import_unresolved'));
      } else setError(errorMessage(t, e.code, e.status));
    },
  });
  const rerun = () => {
    const valid = Object.values(controls).every(
      (c) =>
        PERCENT.test(normalizeNumber(c.other)) && (!c.vat.trim() || PERCENT.test(normalizeNumber(c.vat))),
    );
    if (!valid) return setError(t('est.err.percent'));
    previewMutation.mutate(true);
  };
  const setControl = (sheet: string, patch: Partial<Controls>) =>
    setControls((all) => ({ ...all, [sheet]: { ...all[sheet]!, ...patch } }));
  const commitMutation = useMutation({
    mutationFn: () =>
      api<{ estimates: { id: string }[] }>('/v1/estimate-imports/form5/commit', {
        method: 'POST',
        body: { items: previews.map((p) => ({ id: p.id, digest: p.digest })) },
      }),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ['estimates'] });
      await queryClient.invalidateQueries({ queryKey: ['estimate'] });
      await queryClient.invalidateQueries({ queryKey: ['stock-overview', projectId] });
      toast.success(t('est.f5_done', { n: r.estimates.length }));
      onClose();
      if (r.estimates.length === 1) navigate(`/app/estimates/${r.estimates[0]!.id}`);
    },
    onError: (e: ApiError) =>
      setError(e.code === 'PREVIEW_EXPIRED' ? t('est.import_expired') : errorMessage(t, e.code, e.status)),
  });
  const names = Object.values(picked);
  const canPreview = names.length > 0 && names.every((n) => n.trim());
  const busy = previewMutation.isPending || commitMutation.isPending;
  // Sozlama o'zgartirilib, qayta tekshirilmagan bo'lsa saqlash yopiq (aks holda eski sozlama saqlanardi)
  const stale = previews.some(
    (p) =>
      p.price_summary !== undefined &&
      controls[p.sheet] !== undefined &&
      !sameControls(controls[p.sheet]!, controlsOf({ ...p.settings, gc_supplied_by: p.gc_supplied_by })),
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={t('est.import_title')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          {step === 2 && (
            <Button
              onClick={() => previewMutation.mutate(false)}
              loading={previewMutation.isPending}
              disabled={!canPreview}
            >
              {t('est.import_preview')}
            </Button>
          )}
          {step === 3 && (
            <Button
              onClick={() => commitMutation.mutate()}
              loading={commitMutation.isPending}
              disabled={busy || stale}
            >
              {t('est.f5_commit', { n: previews.length })}
            </Button>
          )}
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <div className="segmented">
          <button type="button" aria-pressed={false} onClick={onBack}>
            {t('est.import_step1')}
          </button>
          <button type="button" aria-pressed={step === 2} onClick={() => setStep(2)}>
            {t('est.f5_step2')}
          </button>
          <button type="button" aria-pressed={step === 3} disabled={!previews.length}>
            {t('est.import_step3')}
          </button>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        {issues.length > 0 && (
          <ul className="text-sm" style={{ margin: 0, paddingLeft: 18, maxHeight: 160, overflow: 'auto' }}>
            {issues.slice(0, 50).map((u, i) => (
              <li key={i}>
                {u.sheet ? `${u.sheet} · ` : ''}
                {t('est.import_row', { row: u.row })}: {t(`est.import_field.${u.field}`)} —{' '}
                <b>{u.message || t('est.import_empty_cell')}</b>
              </li>
            ))}
          </ul>
        )}
        {step === 2 && (
          <div className="stack">
            <p className="muted text-sm">{t('est.f5_detected', { file: file.name })}</p>
            <div className="row" style={{ gap: 8 }}>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setPicked(Object.fromEntries(selectable.map((s) => [s.sheet, s.sheet.trim()])))
                }
              >
                {t('est.f5_select_all')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setPicked({});
                  setSheetTargets({});
                }}
              >
                {t('est.f5_select_none')}
              </Button>
            </div>
            <div className="stack" style={{ gap: 8, maxHeight: 420, overflow: 'auto' }}>
              {sheets.map((s) => {
                const on = s.sheet in picked;
                const usable = s.form5 && !s.too_large;
                return (
                  <div
                    key={s.sheet}
                    className="row"
                    style={{ gap: 10, alignItems: 'center', opacity: usable ? 1 : 0.55 }}
                  >
                    <label className="checkbox" style={{ minWidth: 180 }}>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!usable}
                        onChange={(e) => {
                          setPicked((p) => {
                            const next = { ...p };
                            if (e.target.checked) next[s.sheet] = s.sheet.trim();
                            else delete next[s.sheet];
                            return next;
                          });
                          if (!e.target.checked)
                            setSheetTargets((m) => {
                              const next = { ...m };
                              delete next[s.sheet];
                              return next;
                            });
                        }}
                      />
                      {s.sheet}
                    </label>
                    {usable ? (
                      <>
                        <span className="muted text-sm" style={{ flex: 1 }}>
                          {t('est.f5_sheet_counts', {
                            works: s.works,
                            resources: s.resources,
                            materials: s.materials,
                            priced: s.priced,
                          })}
                        </span>
                        {on && targets.length > 0 && (
                          <Select
                            aria-label={t('est.import_target')}
                            value={sheetTargets[s.sheet] ?? ''}
                            onChange={(e) => {
                              const id = e.target.value;
                              setSheetTargets((m) => {
                                const next = { ...m };
                                if (id) next[s.sheet] = id;
                                else delete next[s.sheet];
                                return next;
                              });
                              const est = targets.find((x) => x.id === id);
                              if (est) setPicked((p) => ({ ...p, [s.sheet]: est.name }));
                            }}
                          >
                            <option value="">{t('est.import_target_new')}</option>
                            {targets.map((x) => (
                              <option
                                key={x.id}
                                value={x.id}
                                disabled={Object.entries(sheetTargets).some(
                                  ([sheet, id]) => id === x.id && sheet !== s.sheet,
                                )}
                              >
                                {t('est.import_target_revision', { name: x.name, revision: x.revision })}
                              </option>
                            ))}
                          </Select>
                        )}
                        {on && (
                          <Input
                            aria-label={t('est.name')}
                            value={picked[s.sheet]}
                            onChange={(e) => setPicked((p) => ({ ...p, [s.sheet]: e.target.value }))}
                          />
                        )}
                      </>
                    ) : (
                      <span className="muted text-sm">
                        {t(s.too_large ? 'est.f5_too_large' : 'est.f5_not_form5')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="stack" style={{ gap: 12, maxHeight: 520, overflow: 'auto' }}>
            {previews.map((p) => (
              <section key={p.sheet} className="card card-pad stack" style={{ gap: 8 }}>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <strong>{p.name}</strong>
                  <Badge>{t('est.f5_sheet_label', { sheet: p.sheet })}</Badge>
                </div>
                <Alert tone="success">{t('est.import_ok', { n: p.lines, total: money(p.total) })}</Alert>
                {p.target && (
                  <Alert tone="info">{t('est.import_revision_hint', { name: p.target.name })}</Alert>
                )}
                {p.excel_total && (
                  <p className="text-sm">
                    {t('est.f5_excel_compare', {
                      excel: money(p.excel_total),
                      platform: money(p.direct_total),
                      diff: money(p.excel_difference),
                    })}
                  </p>
                )}
                {p.excel_rows.length > 0 && (
                  <div className="table-wrap">
                    <table className="table table-dense">
                      <caption className="muted text-sm" style={{ textAlign: 'left' }}>
                        {t('est.f5_excel_title')}
                      </caption>
                      <thead>
                        <tr>
                          <th />
                          <th className="num">{t('est.f5_col_excel')}</th>
                          <th className="num">{t('est.f5_col_platform')}</th>
                          <th className="num">{t('est.f5_col_diff')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.excel_rows.map((x) => (
                          <tr key={x.row}>
                            <td>{x.label}</td>
                            <td className="num">{money(x.amount)}</td>
                            <td className="num">{money(x.platform_amount)}</td>
                            <td className="num">{money(x.difference)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {controls[p.sheet] && p.price_summary !== undefined && (
                  <div className="form-grid">
                    <Input
                      label={t('est.price.other_costs_percent')}
                      inputMode="decimal"
                      value={controls[p.sheet]!.other}
                      onChange={(e) => setControl(p.sheet, { other: e.target.value })}
                    />
                    <Input
                      label={t('est.f5_vat')}
                      inputMode="decimal"
                      value={controls[p.sheet]!.vat}
                      onChange={(e) => setControl(p.sheet, { vat: e.target.value })}
                    />
                    {p.gc_materials > 0 && (
                      <Select
                        label={t('est.f5_gc_supplied_by', { n: p.gc_materials })}
                        value={controls[p.sheet]!.gc}
                        onChange={(e) => setControl(p.sheet, { gc: e.target.value as SuppliedBy })}
                      >
                        <option value="contractor">{t('est.supplied_by.contractor')}</option>
                        <option value="customer">{t('est.supplied_by.customer')}</option>
                      </Select>
                    )}
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={controls[p.sheet]!.deduct}
                        onChange={(e) => setControl(p.sheet, { deduct: e.target.checked })}
                      />{' '}
                      {t('est.price.deduct')}
                    </label>
                  </div>
                )}
                {p.price_summary !== undefined && (
                  <div className="row" style={{ gap: 12, alignItems: 'center' }}>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={rerun}>
                      {t('est.f5_recalc')}
                    </Button>
                    <span>
                      {t('est.f5_price')}: <b>{money(p.price_summary.total)}</b>
                    </span>
                  </div>
                )}
                {stale && <p className="muted text-sm">{t('est.f5_recalc_needed')}</p>}
                {p.zones.length > 0 && (
                  <p className="text-sm">{t('est.f5_floors', { list: p.zones.join(', ') })}</p>
                )}
                {(p.created.materials > 0 || p.created.zones > 0) && (
                  <Alert tone="info">
                    {t('est.import_created', {
                      materials: p.created.materials,
                      zones: p.created.zones,
                    })}
                  </Alert>
                )}
                {p.converted.length > 0 && (
                  <Alert tone="info">
                    {t('est.import_converted', {
                      n: p.converted.length,
                      rows: rowList(p.converted.map((c) => c.row)),
                    })}
                  </Alert>
                )}
                <Form5Warnings preview={p} money={money} />
              </section>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Form5Warnings({
  preview: { warnings: w },
  money,
}: {
  preview: SheetPreview;
  money: (v: string | null) => string;
}) {
  const { t } = useT();
  const items = [
    w.unknown_units.length > 0 &&
      t('est.f5_warn_unknown_units', {
        list: w.unknown_units.map((u) => `${u.unit} (${u.rows})`).join(', '),
      }),
    w.unpriced > 0 && t('est.f5_warn_unpriced', { n: w.unpriced }),
    w.quantity_mismatch_count > 0 &&
      t('est.f5_warn_mismatch', {
        n: w.quantity_mismatch_count,
        rows: w.quantity_mismatch
          .slice(0, 10)
          .map((m) => `${m.row} (${m.excel} → ${m.platform})`)
          .join(', '),
      }),
    w.price_varies.length > 0 &&
      t('est.f5_warn_price_varies', {
        list: w.price_varies
          .slice(0, 10)
          .map((p) => `${p.name}: ${money(p.min_price)} – ${money(p.max_price)}`)
          .join('; '),
      }),
    w.missing_unit.length > 0 && t('est.f5_warn_missing_unit', { rows: rowList(w.missing_unit) }),
    w.skipped_works.length > 0 && t('est.f5_warn_skipped', { rows: rowList(w.skipped_works) }),
    w.project_quantity_count > 0 &&
      t('est.f5_warn_project_qty', {
        n: w.project_quantity_count,
        rows: rowsByName(w.project_quantity, w.project_quantity_count > w.project_quantity.length),
      }),
  ].filter(Boolean) as string[];
  if (!items.length) return null;
  return (
    <Alert tone="warning">
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </Alert>
  );
}
