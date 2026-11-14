import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { api, ApiError, type ListResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatMoney } from '@/lib/format';
import { Alert, Button, Input, Modal, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { lineKinds, useUnits, type EstimateSummary } from './model';
import { Form5Import, type Form5Sheet } from './Form5Import';

const fields = [
  'description',
  'kind',
  'unit_id',
  'quantity',
  'unit_price',
  'material_name',
  'zone_name',
  'norm_code',
  'resource_code',
  'section_name',
  'category',
  'note',
  'norm',
  'work_quantity',
  'loss_percent',
  'supplied_by',
] as const;
type Field = (typeof fields)[number];
const required: Field[] = ['description', 'quantity', 'unit_price'];
type Inspect = { sheet: string; header_row: number; headers: string[]; rows: number; sample: string[][] };
/** D29: Form 5 varag'i bor fayl — ustun moslash o'rniga varaqlar ro'yxati */
type InspectResult = ({ format: 'table' } & Inspect) | { format: 'form5'; sheets: Form5Sheet[] };
/**
 * Sarlavhalarni avtomatik taxmin qilish (uz/ru/en): [maydon, mos keladigan, mos kelmaydigan] — tartib muhim,
 * bitta sarlavha faqat bitta maydonga tegadi (birinchi kelgan oladi). "Jami/Итого" ustunlari hech qachon moslanmaydi.
 */
const guessOrder: [Field, RegExp, RegExp?][] = [
  ['unit_price', /narx|цена|price/i],
  // «Ед. изм.», «Единица» — so'z boshida; «ведомость» ichidagi «ед» emas
  ['unit_id', /o.lchov|birlik(?!.*narx)|(^|[^а-яё])ед|unit/i],
  ['quantity', /miqdor|кол|qty|quantity/i],
  ['description', /nom|наимен|descr/i, /material|материал|zon|зон|blok|блок/i],
  ['resource_code', /resurs\s*(kod|shifr)|(код|шифр)\s*ресурс|resource\s*code/i],
  ['norm_code', /norma.*kod|shifr|шифр|код.*норм|обоснован|norm.*code/i],
  ['section_name', /bo.lim|раздел|section/i],
  ['category', /kateg|катег|category/i],
  ['kind', /tur|тип|kind/i],
  ['material_name', /material|материал/i],
  ['zone_name', /zona|блок|зона|zone|blok/i],
  ['note', /izoh|примеч|note/i],
  ['norm', /norma|норма|norm/i, /kod|код|шифр|code/i],
  ['work_quantity', /hajm|объ[её]м|work/i],
  ['loss_percent', /yo.qot|потер|loss/i],
  ['supplied_by', /kim beradi|кто постав|поставщик материал|supplied/i],
];
const totalHeader = /jami|итого|всего|total/i;
function guessMapping(headers: string[]) {
  const guess: Partial<Record<Field, string>> = {};
  for (const [field, match, skip] of guessOrder) {
    const h = headers.find(
      (x) => match.test(x) && !skip?.test(x) && !totalHeader.test(x) && !Object.values(guess).includes(x),
    );
    if (h) guess[field] = h;
  }
  return guess;
}
type Preview = {
  id: string;
  digest: string;
  expires_at: string;
  /** Import paytida avtomatik yaratilgan material va zonalar soni */
  created?: { materials: number; zones: number };
  converted?: { row: number; from: string; to: string }[];
  preview: { name: string; lines: { total: string; unit_price: string; quantity: string }[] };
  /** D42: mavjud smetaning yangi reviziyasi bo'lsa — o'sha smeta */
  target: { id: string; name: string; revision: number } | null;
  /** Jami serverda (decimal); frontend qo'shmaydi */
  total: string;
};

/** Uch qadam: fayl → ustunlarni moslash → server tekshiruvi → commit. Preview smetani saqlamaydi; Excelda bor, lekin bazada yo'q material va zonalar yaratiladi. */
export function ImportWizard({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { t, lang } = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const units = useUnits();
  const { can } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  // D42: '' — yangi smeta; aks holda shu smetaning yangi reviziyasi (reja almashadi, fakt qoladi)
  const [target, setTarget] = useState('');
  const canRevise = can('estimates', 'update');
  const estimates = useQuery({
    queryKey: ['estimates', projectId, 'import-targets'],
    queryFn: () => api<ListResponse<EstimateSummary>>(`/v1/estimates?project_id=${projectId}&limit=100`),
    enabled: canRevise,
  });
  const targets = estimates.data?.items ?? [];
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [inspect, setInspect] = useState<Inspect | null>(null);
  const [form5, setForm5] = useState<Form5Sheet[] | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<Field, string>>>({});
  const [defaultKind, setDefaultKind] = useState('');
  const [defaultUnit, setDefaultUnit] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [unresolved, setUnresolved] = useState<{ row: number; field: string; message: string }[]>([]);
  const [error, setError] = useState('');

  const readFile = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(f);
    });
  const inspectMutation = useMutation({
    mutationFn: async (f: File) => {
      // Server chegarasi bilan bir xil (10 MB): katta fayl yuborilmaydi, aniq xabar ko'rsatiladi.
      if (f.size > 10 * 1024 * 1024) throw new ApiError('ESTIMATE_FILE_TOO_LARGE', 400);
      const base64 = await readFile(f);
      const result = await api<InspectResult>('/v1/estimate-imports/inspect', {
        method: 'POST',
        body: { file_base64: base64 },
      });
      return { base64, result, fileName: f.name };
    },
    onSuccess: ({ base64, result, fileName }) => {
      setFile({ name: fileName, base64 });
      setError('');
      if (result.format === 'form5') {
        setForm5(result.sheets);
        return;
      }
      setInspect(result);
      if (!name) setName(fileName.replace(/\.xlsx$/i, ''));
      const guess = guessMapping(result.headers);
      setMapping(guess);
      // «Turi» ustuni topilmasa hamma qator uchun tur oldindan tanlanadi (o'zgartirish mumkin).
      setDefaultKind(guess.kind ? '' : 'labor');
      setStep(2);
    },
    onError: (e: ApiError) => setError(errorMessage(t, e.code, e.status)),
  });
  const previewMutation = useMutation({
    mutationFn: () =>
      api<Preview>('/v1/estimate-imports/preview', {
        method: 'POST',
        body: {
          project_id: projectId,
          name: name.trim(),
          file_base64: file!.base64,
          mapping: Object.fromEntries(Object.entries(mapping).filter(([, v]) => v)),
          ...(target ? { estimate_id: target } : {}),
          ...(defaultKind || defaultUnit
            ? {
                defaults: {
                  ...(defaultKind ? { kind: defaultKind } : {}),
                  ...(defaultUnit ? { unit_id: defaultUnit } : {}),
                },
              }
            : {}),
        },
      }),
    onSuccess: (p) => {
      setPreview(p);
      setUnresolved([]);
      setError('');
      setStep(3);
    },
    onError: (e: ApiError) => {
      if (e.code === 'IMPORT_NAMES_UNRESOLVED' || e.code === 'IMPORT_ROWS_INVALID') {
        setUnresolved((e.details as typeof unresolved) ?? []);
        setError(t(e.code === 'IMPORT_ROWS_INVALID' ? 'est.import_rows_invalid' : 'est.import_unresolved'));
      } else {
        const field = e.fields?.[0];
        setError(
          errorMessage(t, e.code, e.status) + (field ? ` (${field.path.join('.')}: ${field.message})` : ''),
        );
      }
    },
  });
  const commitMutation = useMutation({
    mutationFn: () =>
      api<{ id: string }>(`/v1/estimate-imports/${preview!.id}/commit`, {
        method: 'POST',
        body: { digest: preview!.digest },
      }),
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: ['estimates'] });
      await queryClient.invalidateQueries({ queryKey: ['estimate', row.id] });
      await queryClient.invalidateQueries({ queryKey: ['stock-overview', projectId] });
      toast.success(t('est.import_done'));
      onClose();
      navigate(`/app/estimates/${row.id}`);
    },
    onError: (e: ApiError) =>
      setError(e.code === 'PREVIEW_EXPIRED' ? t('est.import_expired') : errorMessage(t, e.code, e.status)),
  });
  const canPreview =
    file &&
    name.trim() &&
    required.every((f) => mapping[f]) &&
    (mapping.kind || defaultKind) &&
    (mapping.unit_id || defaultUnit || mapping.material_name);
  if (form5 && file)
    return (
      <Form5Import
        projectId={projectId}
        file={file}
        sheets={form5}
        targets={canRevise ? targets : []}
        initialTarget={target}
        onBack={() => {
          setForm5(null);
          setStep(1);
        }}
        onClose={onClose}
      />
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
              onClick={() => previewMutation.mutate()}
              loading={previewMutation.isPending}
              disabled={!canPreview}
            >
              {t('est.import_preview')}
            </Button>
          )}
          {step === 3 && (
            <Button onClick={() => commitMutation.mutate()} loading={commitMutation.isPending}>
              {t('est.import_commit')}
            </Button>
          )}
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <div className="segmented">
          {([1, 2, 3] as const).map((s) => (
            <button key={s} type="button" aria-pressed={step === s} onClick={() => s < step && setStep(s)}>
              {t(`est.import_step${s}`)}
            </button>
          ))}
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        {unresolved.length > 0 && (
          <ul className="text-sm" style={{ margin: 0, paddingLeft: 18, maxHeight: 160, overflow: 'auto' }}>
            {unresolved.slice(0, 50).map((u, i) => (
              <li key={i}>
                {t('est.import_row', { row: u.row })}: {t(`est.import_field.${u.field}`)} —{' '}
                <b>{u.message || t('est.import_empty_cell')}</b>
              </li>
            ))}
          </ul>
        )}
        {step === 1 && (
          <div className="stack">
            {targets.length > 0 && (
              <Select
                label={t('est.import_target')}
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  const picked = targets.find((x) => x.id === e.target.value);
                  if (picked) setName(picked.name);
                }}
              >
                <option value="">{t('est.import_target_new')}</option>
                {targets.map((x) => (
                  <option key={x.id} value={x.id}>
                    {t('est.import_target_revision', { name: x.name, revision: x.revision })}
                  </option>
                ))}
              </Select>
            )}
            <Input label={t('est.name')} value={name} onChange={(e) => setName(e.target.value)} />
            <label className="field">
              <span className="field-label">{t('est.import_file')}</span>
              <span className="btn btn-secondary" style={{ width: 'fit-content' }}>
                <Upload size={16} /> {file?.name ?? t('est.import_choose')}
                <input
                  type="file"
                  accept=".xlsx"
                  hidden
                  onChange={(e) => e.target.files?.[0] && inspectMutation.mutate(e.target.files[0])}
                />
              </span>
            </label>
            {inspectMutation.isPending && <p className="muted text-sm">{t('common.loading')}</p>}
          </div>
        )}
        {step === 2 && inspect && (
          <div className="stack">
            <p className="muted text-sm">
              {t('est.import_rows', { n: inspect.rows })} ·{' '}
              {t('est.import_header_row', { row: inspect.header_row })} · {t('est.import_map_hint')}
            </p>
            <div className="form-grid">
              {fields.map((f) => (
                <Select
                  key={f}
                  label={`${t(`est.import_field.${f}`)}${required.includes(f) ? ' *' : ''}`}
                  value={mapping[f] ?? ''}
                  onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value }))}
                >
                  <option value="">{t('est.import_not_mapped')}</option>
                  {inspect.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              ))}
              {!mapping.kind && (
                <Select
                  label={t('est.import_default_kind')}
                  value={defaultKind}
                  onChange={(e) => setDefaultKind(e.target.value)}
                >
                  <option value="">—</option>
                  {lineKinds.map((k) => (
                    <option key={k} value={k}>
                      {t(`est.kind.${k}`)}
                    </option>
                  ))}
                </Select>
              )}
              {!mapping.unit_id && (
                <Select
                  label={t('est.import_default_unit')}
                  value={defaultUnit}
                  onChange={(e) => setDefaultUnit(e.target.value)}
                >
                  <option value="">—</option>
                  {(units.data?.units ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.id} — {u.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <div className="table-wrap">
              <table className="table table-dense">
                <thead>
                  <tr>
                    {inspect.headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inspect.sample.map((row, i) => (
                    <tr key={i}>
                      {inspect.headers.map((_, j) => (
                        <td key={j}>{row[j]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {step === 3 && preview && (
          <div className="stack">
            <Alert tone="success">
              {t('est.import_ok', {
                n: preview.preview.lines.length,
                total: formatMoney(preview.total, lang, true, 'UZS'),
              })}
            </Alert>
            {preview.target && (
              <Alert tone="info">{t('est.import_revision_hint', { name: preview.target.name })}</Alert>
            )}
            {preview.created && (preview.created.materials > 0 || preview.created.zones > 0) && (
              <Alert tone="info">
                {t('est.import_created', { materials: preview.created.materials, zones: preview.created.zones })}
              </Alert>
            )}
            {!!preview.converted?.length && (
              <Alert tone="info">
                {t('est.import_converted', {
                  n: preview.converted.length,
                  rows:
                    preview.converted
                      .slice(0, 30)
                      .map((c) => c.row)
                      .join(', ') + (preview.converted.length > 30 ? ', …' : ''),
                })}
              </Alert>
            )}
            <p className="muted text-sm">{t('est.editor_hint')}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
