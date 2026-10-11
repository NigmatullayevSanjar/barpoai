import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Download, Pencil, Plus, RotateCcw, Upload } from 'lucide-react';
import { api, ApiError, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { saveBase64File } from '@/lib/download';
import { errorMessage, useT } from '@/lib/i18n';
import { formatQuantity } from '@/lib/format';
import {
  Alert,
  Badge,
  Button,
  Input,
  Modal,
  SearchInput,
  Select,
  Switch,
  useListState,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import {
  premiseKinds,
  type Premise,
  type PremiseImportPreview,
  type PremiseImportSummary,
  type PremiseKind,
  type PremiseList,
  type ProjectDetail,
} from './types';

const AREA_RE = /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/;
const INT_RE = /^-?\d{1,4}$/;
const actionTone = { create: 'success', update: 'info', unchanged: 'neutral', error: 'danger' } as const;

function useTemplateDownload(projectId: string) {
  const { t, lang } = useT();
  const toast = useToast();
  return useMutation({
    mutationFn: () =>
      api<{ filename: string; mime_type: string; base64: string }>(
        `/v1/projects/${projectId}/premises/template${qs({ lang })}`,
      ),
    onSuccess: (file) => saveBase64File(file),
    onError: (e: ApiError) => toast.error(errorMessage(t, e.code, e.status)),
  });
}

export function PremisesTab({ d }: { d: ProjectDetail }) {
  const { t } = useT();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canWrite = can('projects', 'create');
  const list = useListState();
  const [blockId, setBlockId] = useState('');
  const [floor, setFloor] = useState('');
  const [kind, setKind] = useState('');
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<Premise | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const template = useTemplateDownload(d.id);
  const floorValid = floor === '' || INT_RE.test(floor.trim());
  const filters = {
    q: list.q.slice(0, 20),
    block_id: blockId,
    floor: floorValid ? floor.trim() : '',
    kind,
    archived: archived ? 'true' : 'false',
  };
  const query = useQuery({
    queryKey: ['premises', d.id, 'list', filters, list.offset, list.limit],
    queryFn: () =>
      api<PremiseList>(
        `/v1/projects/${d.id}/premises${qs({ ...filters, limit: list.limit, offset: list.offset })}`,
      ),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['premises', d.id] });
  const toggleArchive = useMutation({
    mutationFn: (p: Premise) =>
      api<Premise>(`/v1/projects/${d.id}/premises/${p.id}/${p.archived_at ? 'unarchive' : 'archive'}`, {
        method: 'POST',
        body: { version: p.version },
      }),
    onSuccess: async () => {
      await refresh();
      toast.success(t('common.saved'));
    },
    onError: (e: ApiError) =>
      toast.error(
        e.code === 'VERSION_CONFLICT' ? t('common.version_conflict') : errorMessage(t, e.code, e.status),
      ),
  });
  const blocks = d.zones.filter((z) => z.kind === 'block');
  const filtered = Boolean(filters.q || blockId || filters.floor || kind || archived);
  const dash = <span className="muted">—</span>;
  const columns: Column<Premise>[] = [
    { key: 'block', header: t('premises.block'), render: (r) => r.block_name ?? dash },
    { key: 'zone', header: t('premises.zone'), render: (r) => r.zone_name ?? dash },
    { key: 'floor', header: t('premises.floor'), render: (r) => r.floor ?? dash },
    {
      key: 'number',
      header: t('premises.number'),
      render: (r) => <span className="cell-main">{r.number}</span>,
    },
    { key: 'kind', header: t('premises.kind'), render: (r) => t(`premises.kind.${r.kind}`) },
    { key: 'rooms', header: t('premises.rooms'), render: (r) => r.rooms ?? dash },
    {
      key: 'area',
      header: t('premises.area'),
      align: 'right',
      render: (r) => formatQuantity(r.area_m2),
    },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            render: (r: Premise) => (
              <span className="row" style={{ justifyContent: 'flex-end' }}>
                {!r.archived_at && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Pencil />}
                    aria-label={t('common.edit')}
                    onClick={() => setEditing(r)}
                  />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  icon={r.archived_at ? <RotateCcw /> : <Archive />}
                  aria-label={r.archived_at ? t('premises.unarchive') : t('premises.archive')}
                  title={r.archived_at ? t('premises.unarchive') : t('premises.archive')}
                  disabled={toggleArchive.isPending}
                  onClick={() => toggleArchive.mutate(r)}
                />
              </span>
            ),
          },
        ]
      : []),
  ];
  return (
    <section className="card">
      <div className="card-header">
        <h3>{t('premises.title')}</h3>
        <span className="row">
          <Button
            variant="secondary"
            icon={<Download />}
            loading={template.isPending}
            onClick={() => template.mutate()}
          >
            {t('premises.template')}
          </Button>
          {canWrite && (
            <>
              <Button variant="secondary" icon={<Upload />} onClick={() => setImporting(true)}>
                {t('premises.import')}
              </Button>
              <Button icon={<Plus />} onClick={() => setEditing('new')}>
                {t('premises.add')}
              </Button>
            </>
          )}
        </span>
      </div>
      <div className="card-pad stack" style={{ gap: 12 }}>
        <div className="toolbar">
          <SearchInput value={list.search} onChange={list.setSearch} placeholder={t('premises.search')} />
          <Select
            aria-label={t('premises.block')}
            value={blockId}
            onChange={(e) => {
              setBlockId(e.target.value);
              list.setOffset(0);
            }}
          >
            <option value="">{t('premises.block_all')}</option>
            <option value="none">{t('premises.block_none')}</option>
            {blocks.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </Select>
          <Input
            aria-label={t('premises.floor')}
            placeholder={t('premises.floor')}
            inputMode="numeric"
            style={{ width: 110 }}
            value={floor}
            error={floorValid ? undefined : t('premises.floor_invalid')}
            onChange={(e) => {
              setFloor(e.target.value);
              list.setOffset(0);
            }}
          />
          <Select
            aria-label={t('premises.kind')}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              list.setOffset(0);
            }}
          >
            <option value="">{t('premises.kind_all')}</option>
            {premiseKinds.map((k) => (
              <option key={k} value={k}>
                {t(`premises.kind.${k}`)}
              </option>
            ))}
          </Select>
          <Switch
            checked={archived}
            onChange={(v) => {
              setArchived(v);
              list.setOffset(0);
            }}
            label={t('premises.archived')}
          />
        </div>
        {query.data && (
          <p className="text-sm">
            {t('premises.total', {
              count: query.data.total_count,
              area: formatQuantity(query.data.total_area_m2),
            })}
          </p>
        )}
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
          pagination={list.pagination}
          empty={
            filtered
              ? { title: t('premises.empty_filtered') }
              : {
                  title: t('premises.empty'),
                  description: canWrite ? t('premises.empty_desc') : undefined,
                }
          }
        />
      </div>
      {editing && (
        <PremiseModal
          d={d}
          premise={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={refresh}
        />
      )}
      {importing && <ImportModal d={d} onClose={() => setImporting(false)} onDone={refresh} />}
    </section>
  );
}

function PremiseModal({
  d,
  premise,
  onClose,
  onDone,
}: {
  d: ProjectDetail;
  premise: Premise | null;
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  const { t } = useT();
  const toast = useToast();
  const [number, setNumber] = useState(premise?.number ?? '');
  const [kind, setKind] = useState<PremiseKind>(premise?.kind ?? 'apartment');
  const [zoneId, setZoneId] = useState(premise?.zone_id ?? '');
  const [floor, setFloor] = useState(premise?.floor != null ? String(premise.floor) : '');
  const [rooms, setRooms] = useState(premise?.rooms != null ? String(premise.rooms) : '');
  const [area, setArea] = useState(premise?.area_m2 ?? '');
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const areaNorm = area.trim().replace(',', '.');
  const errs = {
    number: !number.trim() || number.trim().length > 20 ? t('premises.number_invalid') : undefined,
    floor: floor.trim() && !INT_RE.test(floor.trim()) ? t('premises.floor_invalid') : undefined,
    rooms: rooms.trim() && !/^\d{1,3}$/.test(rooms.trim()) ? t('premises.rooms_invalid') : undefined,
    area: !AREA_RE.test(areaNorm) || !/[1-9]/.test(areaNorm) ? t('premises.area_invalid') : undefined,
  };
  const valid = !errs.number && !errs.floor && !errs.rooms && !errs.area;
  const save = useMutation({
    mutationFn: () => {
      const body = {
        number: number.trim(),
        kind,
        zone_id: zoneId || null,
        floor: floor.trim() ? Number(floor.trim()) : null,
        rooms: rooms.trim() ? Number(rooms.trim()) : null,
        area_m2: areaNorm,
      };
      return premise
        ? api<Premise>(`/v1/projects/${d.id}/premises/${premise.id}`, {
            method: 'PATCH',
            body: { version: premise.version, ...body },
          })
        : api<Premise>(`/v1/projects/${d.id}/premises`, { method: 'POST', body });
    },
    onSuccess: async () => {
      await onDone();
      toast.success(t('common.saved'));
      onClose();
    },
    onError: (e: ApiError) =>
      setError(
        e.code === 'VERSION_CONFLICT' ? t('common.version_conflict') : errorMessage(t, e.code, e.status),
      ),
  });
  const submit = () => {
    setTouched(true);
    if (valid) save.mutate();
  };
  const show = (m?: string) => (touched ? m : undefined);
  return (
    <Modal
      open
      onClose={onClose}
      title={premise ? t('premises.edit') : t('premises.add')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <div className="stack">
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="form-grid">
            <Input
              label={t('premises.number')}
              required
              maxLength={20}
              value={number}
              error={show(errs.number)}
              onChange={(e) => setNumber(e.target.value)}
            />
            <Select
              label={t('premises.kind')}
              value={kind}
              onChange={(e) => setKind(e.target.value as PremiseKind)}
            >
              {premiseKinds.map((k) => (
                <option key={k} value={k}>
                  {t(`premises.kind.${k}`)}
                </option>
              ))}
            </Select>
            <Select
              wrapClassName="span-2"
              label={t('premises.zone_field')}
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
            >
              <option value="">—</option>
              {d.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} ({t(`projects.zone_kind.${z.kind}`)})
                </option>
              ))}
            </Select>
            <Input
              label={t('premises.floor')}
              inputMode="numeric"
              value={floor}
              error={show(errs.floor)}
              onChange={(e) => setFloor(e.target.value)}
            />
            <Input
              label={t('premises.rooms')}
              inputMode="numeric"
              value={rooms}
              error={show(errs.rooms)}
              onChange={(e) => setRooms(e.target.value)}
            />
            <Input
              label={t('premises.area')}
              required
              inputMode="decimal"
              placeholder="65.40"
              value={area}
              error={show(errs.area)}
              onChange={(e) => setArea(e.target.value)}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}

function SummaryBadges({ s }: { s: PremiseImportSummary }) {
  const { t } = useT();
  return (
    <span className="row" style={{ flexWrap: 'wrap' }}>
      {(['create', 'update', 'unchanged', 'error'] as const).map((a) => (
        <Badge key={a} tone={actionTone[a]}>
          {t(`premises.action.${a}`)}: {s[a]}
        </Badge>
      ))}
    </span>
  );
}

function ImportModal({
  d,
  onClose,
  onDone,
}: {
  d: ProjectDetail;
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  const { t } = useT();
  const toast = useToast();
  const template = useTemplateDownload(d.id);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<PremiseImportPreview | null>(null);
  const [result, setResult] = useState<PremiseImportSummary | null>(null);
  const [error, setError] = useState('');
  const readFile = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(f);
    });
  const previewMutation = useMutation({
    mutationFn: async (f: File) => {
      const file_base64 = await readFile(f);
      return api<PremiseImportPreview>(`/v1/projects/${d.id}/premises/import/preview`, {
        method: 'POST',
        body: { file_base64 },
      });
    },
    onSuccess: (p) => {
      setPreview(p);
      setError('');
      setStep(2);
    },
    onError: (e: ApiError) => setError(errorMessage(t, e.code, e.status)),
  });
  const commit = useMutation({
    mutationFn: () =>
      api<PremiseImportSummary>(`/v1/projects/${d.id}/premises/import/${preview!.id}/commit`, {
        method: 'POST',
        body: { digest: preview!.digest },
      }),
    onSuccess: async (r) => {
      await onDone();
      toast.success(t('premises.import_done'));
      setResult(r);
      setError('');
      setStep(3);
    },
    onError: (e: ApiError) => setError(errorMessage(t, e.code, e.status)),
  });
  const rowError = (code: string) => {
    const key = `premises.row_error.${code}`;
    const text = t(key);
    return text === key ? code : text;
  };
  const canCommit = !!preview && preview.id !== null && preview.summary.create + preview.summary.update > 0;
  const blocked = !!preview && preview.id === null;
  return (
    <Modal
      open
      onClose={onClose}
      title={t('premises.import')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {step === 3 ? t('common.close') : t('common.cancel')}
          </Button>
          {step === 2 && (
            <Button onClick={() => commit.mutate()} loading={commit.isPending} disabled={!canCommit}>
              {t('premises.import_commit')}
            </Button>
          )}
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        {error && <Alert tone="danger">{error}</Alert>}
        {step === 1 && (
          <div className="stack">
            <p className="muted text-sm">{t('premises.import_hint')}</p>
            <p className="text-sm">
              <b>{t('premises.import_columns')}:</b> {t('premises.import_columns_list')}
            </p>
            <span className="row">
              <Button
                variant="secondary"
                icon={<Download />}
                loading={template.isPending}
                onClick={() => template.mutate()}
              >
                {t('premises.template')}
              </Button>
            </span>
            <label className="field">
              <span className="field-label">{t('premises.import_file')}</span>
              <span className="btn btn-secondary" style={{ width: 'fit-content' }}>
                <Upload size={16} /> {fileName || t('premises.import_choose')}
                <input
                  type="file"
                  accept=".xlsx"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    setFileName(f.name);
                    previewMutation.mutate(f);
                  }}
                />
              </span>
            </label>
            {previewMutation.isPending && <p className="muted text-sm">{t('common.loading')}</p>}
          </div>
        )}
        {step === 2 && preview && (
          <div className="stack">
            <SummaryBadges s={preview.summary} />
            {blocked ? (
              <Alert tone="danger">{t('premises.import_blocked')}</Alert>
            ) : canCommit ? null : (
              <Alert tone="info">{t('premises.import_nothing')}</Alert>
            )}
            <div className="table-wrap" style={{ maxHeight: 360, overflow: 'auto' }}>
              <table className="table table-dense">
                <thead>
                  <tr>
                    <th>{t('premises.row')}</th>
                    <th>{t('premises.block')}</th>
                    <th>{t('premises.entrance')}</th>
                    <th>{t('premises.floor')}</th>
                    <th>{t('premises.number')}</th>
                    <th>{t('premises.kind')}</th>
                    <th>{t('premises.rooms')}</th>
                    <th>{t('premises.area')}</th>
                    <th>{t('premises.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td>{r.block ?? '—'}</td>
                      <td>{r.entrance ?? '—'}</td>
                      <td>{r.floor ?? '—'}</td>
                      <td>{r.number ?? '—'}</td>
                      <td>
                        {r.kind
                          ? t(`premises.kind.${r.kind}`) === `premises.kind.${r.kind}`
                            ? r.kind
                            : t(`premises.kind.${r.kind}`)
                          : '—'}
                      </td>
                      <td>{r.rooms ?? '—'}</td>
                      <td>{r.area_m2 ?? '—'}</td>
                      <td>
                        <Badge tone={actionTone[r.action]}>{t(`premises.action.${r.action}`)}</Badge>
                        {r.errors.map((e, i) => (
                          <div key={i} className="text-sm" style={{ color: 'var(--danger)' }}>
                            {t(`premises.field.${e.field}`)}: {rowError(e.code)}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {step === 3 && result && (
          <div className="stack">
            <Alert tone="success">{t('premises.import_done')}</Alert>
            <SummaryBadges s={result} />
          </div>
        )}
      </div>
    </Modal>
  );
}
