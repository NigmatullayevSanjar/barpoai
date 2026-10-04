import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { errorMessage, useT } from '@/lib/i18n';
import { formatMoney } from '@/lib/format';
import { Alert, Button, Input, Modal, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { lineKinds, useUnits } from './model';

const fields = [
  'description',
  'kind',
  'unit_id',
  'quantity',
  'unit_price',
  'material_name',
  'zone_name',
  'category',
  'note',
  'norm',
  'work_quantity',
  'loss_percent',
] as const;
type Field = (typeof fields)[number];
const required: Field[] = ['description', 'quantity', 'unit_price'];
type Inspect = { sheet: string; headers: string[]; rows: number; sample: string[][] };
type Preview = {
  id: string;
  digest: string;
  expires_at: string;
  preview: { name: string; lines: { total?: string; unit_price: string; quantity: string }[] };
};

/** Uch qadam: fayl → ustunlarni moslash → server tekshiruvi → commit. Preview hech narsa yaratmaydi. */
export function ImportWizard({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { t, lang } = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const units = useUnits();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [inspect, setInspect] = useState<Inspect | null>(null);
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
      const base64 = await readFile(f);
      const result = await api<Inspect>('/v1/estimate-imports/inspect', {
        method: 'POST',
        body: { file_base64: base64 },
      });
      return { base64, result, fileName: f.name };
    },
    onSuccess: ({ base64, result, fileName }) => {
      setFile({ name: fileName, base64 });
      setInspect(result);
      if (!name) setName(fileName.replace(/\.xlsx$/i, ''));
      // Sarlavhalarni avtomatik taxmin qilish (uz/ru/en)
      const guess: Partial<Record<Field, string>> = {};
      const patterns: Record<Field, RegExp> = {
        description: /nom|наимен|descr|ish/i,
        kind: /tur|тип|kind/i,
        unit_id: /birlik|ед|unit/i,
        quantity: /miqdor|кол|qty|quantity/i,
        unit_price: /narx|цена|price/i,
        material_name: /material|материал/i,
        zone_name: /zona|блок|зона|zone|blok/i,
        category: /kateg|катег|category/i,
        note: /izoh|примеч|note/i,
        norm: /norma|норма|norm/i,
        work_quantity: /hajm|объ[её]м|work/i,
        loss_percent: /yo.qot|потер|loss/i,
      };
      for (const f of fields) {
        const h = result.headers.find((x) => patterns[f].test(x) && !Object.values(guess).includes(x));
        if (h) guess[f] = h;
      }
      setMapping(guess);
      setStep(2);
      setError('');
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
      if (e.code === 'IMPORT_NAMES_UNRESOLVED') {
        setUnresolved(((e as ApiError & { details?: unknown }).details as typeof unresolved) ?? []);
        setError(t('est.import_unresolved'));
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
      toast.success(t('est.import_done'));
      onClose();
      navigate(`/app/estimates/${row.id}`);
    },
    onError: (e: ApiError) =>
      setError(e.code === 'PREVIEW_EXPIRED' ? t('est.import_expired') : errorMessage(t, e.code, e.status)),
  });
  const total =
    preview?.preview.lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price), 0) ?? 0;
  const canPreview =
    file &&
    name.trim() &&
    required.every((f) => mapping[f]) &&
    (mapping.kind || defaultKind) &&
    (mapping.unit_id || defaultUnit || mapping.material_name);
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
                {t('est.import_row', { row: u.row })}: {t(`est.import_field.${u.field}`)} — <b>{u.message}</b>
              </li>
            ))}
          </ul>
        )}
        {step === 1 && (
          <div className="stack">
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
              {t('est.import_rows', { n: inspect.rows })} · {t('est.import_map_hint')}
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
              {t('est.import_ok', { n: preview.preview.lines.length, total: formatMoney(total, lang) })}
            </Alert>
            <p className="muted text-sm">{t('est.editor_hint')}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
