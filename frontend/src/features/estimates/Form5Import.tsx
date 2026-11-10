import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { errorMessage, useT } from '@/lib/i18n';
import { formatMoney } from '@/lib/format';
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
type ExcelRow = {
  row: number;
  label: string;
  percent: string | null;
  amount: string | null;
  addable: boolean;
  added: boolean;
};
type SheetPreview = {
  id: string;
  digest: string;
  sheet: string;
  name: string;
  /** D35: mavjud smetaning yangi reviziyasi bo'lsa — o'sha smeta */
  target: { id: string; name: string; revision: number } | null;
  lines: number;
  /** Jamlar serverda (decimal); frontend qo'shmaydi */
  total: string;
  direct_total: string;
  excel_total: string | null;
  excel_difference: string | null;
  excel_rows: ExcelRow[];
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
  };
};
type RowIssue = { sheet?: string; row: number; field: string; message: string };
const rowList = (rows: number[]) => rows.slice(0, 30).join(', ') + (rows.length > 30 ? ', …' : '');

/**
 * D29: Form 5 (ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ) importi — varaqlarni tanlash → server tekshiruvi → hammasi bitta amalda
 * saqlanadi. Har varaq alohida smeta; «Excel jami» blokidagi ulushli qator (21 %) xizmat qatori bo'lib qo'shilishi mumkin.
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
  /** D35: varaq yuklanishi mumkin bo'lgan mavjud smetalar (reviziya huquqi bo'lmasa bo'sh) */
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
  // D35: varaq → mavjud smeta (yangi reviziya); bo'lmasa yangi smeta. Bir smetaga bitta varaq.
  const [sheetTargets, setSheetTargets] = useState<Record<string, string>>(() =>
    initial ? { [selectable[0]!.sheet]: initial.id } : {},
  );
  const [previews, setPreviews] = useState<SheetPreview[]>([]);
  const [issues, setIssues] = useState<RowIssue[]>([]);
  const [error, setError] = useState('');
  const money = (v: string | null) => formatMoney(v, lang, true, 'UZS');

  const previewMutation = useMutation({
    mutationFn: (addRows: Record<string, number[]>) =>
      api<{ sheets: SheetPreview[] }>('/v1/estimate-imports/form5/preview', {
        method: 'POST',
        body: {
          project_id: projectId,
          file_base64: file.base64,
          sheets: Object.entries(picked).map(([sheet, name]) => ({
            sheet,
            name: name.trim(),
            ...(addRows[sheet]?.length ? { add_rows: addRows[sheet] } : {}),
            ...(sheetTargets[sheet] ? { estimate_id: sheetTargets[sheet] } : {}),
          })),
        },
      }),
    onSuccess: (r) => {
      setPreviews(r.sheets);
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
  const addedRows = (except?: { sheet: string; row: number }) =>
    Object.fromEntries(
      previews.map((p) => [
        p.sheet,
        p.excel_rows
          .filter((x) => x.added !== (except?.sheet === p.sheet && except.row === x.row))
          .map((x) => x.row),
      ]),
    );
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
              onClick={() => previewMutation.mutate({})}
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
              disabled={busy}
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
                      <tbody>
                        {p.excel_rows.map((x) => (
                          <tr key={x.row}>
                            <td>{x.label}</td>
                            <td className="num">{x.percent ? `${x.percent} %` : ''}</td>
                            <td className="num">{money(x.amount)}</td>
                            <td>
                              {x.addable && (
                                <Button
                                  size="sm"
                                  variant={x.added ? 'secondary' : 'primary'}
                                  disabled={busy}
                                  onClick={() =>
                                    previewMutation.mutate(addedRows({ sheet: p.sheet, row: x.row }))
                                  }
                                >
                                  {t(x.added ? 'est.f5_remove' : 'est.f5_add')}
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {p.excel_rows.some((x) => x.addable) && (
                  <p className="muted text-sm">{t('est.f5_add_hint')}</p>
                )}
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
