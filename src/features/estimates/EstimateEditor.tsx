import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Copy, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatMoney, formatQuantity, monthStart } from '@/lib/format';
import { Alert, Button, Input, Modal, PageHeader, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useProjects } from '@/features/projects/ProjectsPage';
import {
  effectiveOf,
  fromLine,
  lineKinds,
  newLine,
  normalizeNumber,
  toApiLine,
  totalOf,
  useMaterials,
  useUnits,
  useZones,
  validateLine,
  type EstimateDetail,
  type LineDraft,
  type Material,
} from './model';

/** Yangi smeta (/app/estimates/new?project=) yoki tahrir (/app/estimates/:id/edit → yangi reviziya). */
export function EstimateEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { t } = useT();
  const existing = useQuery({
    queryKey: ['estimate', id],
    queryFn: () => api<EstimateDetail>(`/v1/estimates/${id}`),
    enabled: Boolean(id),
  });
  if (id && !existing.data) {
    if (existing.isError)
      return (
        <Alert tone="danger">
          {errorMessage(t, (existing.error as ApiError).code, (existing.error as ApiError).status)}
        </Alert>
      );
    return (
      <div className="card">
        <div className="card-pad muted">{t('common.loading')}</div>
      </div>
    );
  }
  const projectId = existing.data?.project_id ?? params.get('project') ?? '';
  return <Editor key={existing.data?.id ?? 'new'} projectId={projectId} existing={existing.data ?? null} />;
}

function Editor({ projectId, existing }: { projectId: string; existing: EstimateDetail | null }) {
  const { t, lang } = useT();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projects = useProjects();
  const units = useUnits();
  const materials = useMaterials();
  const zones = useZones(projectId);
  const [name, setName] = useState(existing?.name ?? '');
  const [lines, setLines] = useState<LineDraft[]>(() =>
    existing ? existing.lines.map(fromLine) : [newLine()],
  );
  const [touched, setTouched] = useState(false);
  const [monthsFor, setMonthsFor] = useState<string | null>(null);
  const [materialModal, setMaterialModal] = useState<string | null>(null);
  const materialList = materials.data?.items ?? [];
  const project = projects.data?.items.find((p) => p.id === projectId);
  const errorsByKey = useMemo(
    () => new Map(lines.map((l) => [l.key, validateLine(l, materialList, t)])),
    [lines, materialList, t],
  );
  const invalidCount = [...errorsByKey.values()].filter((e) => Object.keys(e).length > 0).length;
  const total = lines.reduce((s, l) => s + totalOf(l), 0);
  const update = (key: string, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const setMaterial = (key: string, materialId: string) => {
    const m = materialList.find((x) => x.id === materialId);
    update(key, {
      material_id: materialId,
      unit_id: m?.unit_id ?? '',
      description: lines.find((l) => l.key === key)?.description || (m?.name ?? ''),
    });
  };
  const save = useMutation({
    mutationFn: () => {
      const body = { project_id: projectId, name: name.trim(), lines: lines.map((l, i) => toApiLine(l, i)) };
      return existing
        ? api<EstimateDetail>(`/v1/estimates/${existing.id}`, {
            method: 'PATCH',
            body: { ...body, version: existing.revision },
          })
        : api<EstimateDetail>('/v1/estimates', { method: 'POST', body });
    },
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: ['estimates'] });
      await queryClient.invalidateQueries({ queryKey: ['estimate', row.id] });
      toast.success(existing ? t('est.saved', { revision: row.revision }) : t('est.created'));
      navigate(`/app/estimates/${row.id}`);
    },
    onError: (e: ApiError) =>
      toast.error(
        e.code === 'VERSION_CONFLICT' ? t('common.version_conflict') : errorMessage(t, e.code, e.status),
      ),
  });
  const submit = () => {
    setTouched(true);
    if (!name.trim() || lines.length === 0 || invalidCount > 0) return;
    save.mutate();
  };
  const allowed = existing ? can('estimates', 'update') : can('estimates', 'create');
  if (!allowed) return <Alert tone="danger">{t('common.forbidden_desc')}</Alert>;
  const unitOptions = units.data?.units ?? [];
  const zoneOptions = zones.data?.items ?? [];
  return (
    <div className="stack" style={{ gap: 14, paddingBottom: 70 }}>
      <PageHeader
        breadcrumbs={
          <>
            <Link to={`/app/estimates?project=${projectId}`}>{t('est.title')}</Link>
            <span>/</span>
            <span>{project?.name ?? ''}</span>
          </>
        }
        title={existing ? t('est.editor_edit') : t('est.editor_new')}
        description={existing ? t('est.editor_hint') : undefined}
      />
      <div className="row wrap" style={{ alignItems: 'flex-end', gap: 12 }}>
        <Input
          wrapClassName="grow"
          label={t('est.name')}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={touched && !name.trim() ? t('common.required') : undefined}
          style={{ maxWidth: 480 }}
        />
        <Button
          variant="secondary"
          icon={<Plus />}
          onClick={() =>
            setLines((ls) => [
              ...ls,
              newLine({
                kind: ls.at(-1)?.kind ?? 'material',
                category: ls.at(-1)?.category ?? '',
                zone_id: ls.at(-1)?.zone_id ?? '',
              }),
            ])
          }
        >
          {t('est.add_line')}
        </Button>
      </div>
      {touched && invalidCount > 0 && (
        <Alert tone="danger">{t('est.line_errors', { n: invalidCount })}</Alert>
      )}
      <div className="table-wrap">
        <table className="table grid-editor">
          <thead>
            <tr>
              <th style={{ width: 36 }}>{t('est.col.n')}</th>
              <th style={{ width: 110 }}>{t('est.col.kind')}</th>
              <th style={{ width: 130 }}>{t('est.col.category')}</th>
              <th style={{ minWidth: 220 }}>{t('est.col.description')}</th>
              <th style={{ width: 190 }}>{t('est.col.material')}</th>
              <th style={{ width: 130 }}>{t('est.col.zone')}</th>
              <th style={{ width: 90 }}>{t('est.col.unit')}</th>
              <th style={{ width: 230 }}>{t('est.col.quantity')}</th>
              <th style={{ width: 80 }}>{t('est.col.loss')}</th>
              <th style={{ width: 110 }}>{t('est.col.effective')}</th>
              <th style={{ width: 120 }}>{t('est.col.unit_price')}</th>
              <th style={{ width: 130 }}>{t('est.col.total')}</th>
              <th style={{ width: 160 }}>{t('est.col.note')}</th>
              <th style={{ width: 110 }} />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={14} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                  {t('est.no_lines')}
                </td>
              </tr>
            )}
            {lines.map((l, i) => {
              const e = touched ? (errorsByKey.get(l.key) ?? {}) : {};
              return (
                <tr key={l.key}>
                  <td className="cell-calc" style={{ textAlign: 'left' }}>
                    {i + 1}
                  </td>
                  <td>
                    <select
                      className="select"
                      value={l.kind}
                      aria-label={t('est.col.kind')}
                      onChange={(ev) =>
                        update(l.key, { kind: ev.target.value as LineDraft['kind'], material_id: '' })
                      }
                    >
                      {lineKinds.map((k) => (
                        <option key={k} value={k}>
                          {t(`est.kind.${k}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="input"
                      value={l.category}
                      list="est-categories"
                      aria-label={t('est.col.category')}
                      onChange={(ev) => update(l.key, { category: ev.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={l.description}
                      aria-label={t('est.col.description')}
                      aria-invalid={e.description ? 'true' : undefined}
                      onChange={(ev) => update(l.key, { description: ev.target.value })}
                    />
                    {e.description && <span className="cell-error">{e.description}</span>}
                  </td>
                  <td>
                    {l.kind === 'material' ? (
                      <>
                        <div className="row" style={{ gap: 4 }}>
                          <select
                            className="select grow"
                            value={l.material_id}
                            aria-label={t('est.col.material')}
                            aria-invalid={e.material_id ? 'true' : undefined}
                            onChange={(ev) => setMaterial(l.key, ev.target.value)}
                          >
                            <option value="">—</option>
                            {materialList.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.unit_id})
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Plus />}
                            aria-label={t('est.material_new')}
                            onClick={() => setMaterialModal(l.key)}
                          />
                        </div>
                        {e.material_id && <span className="cell-error">{e.material_id}</span>}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <select
                      className="select"
                      value={l.zone_id}
                      aria-label={t('est.col.zone')}
                      onChange={(ev) => update(l.key, { zone_id: ev.target.value })}
                    >
                      <option value="">—</option>
                      {zoneOptions.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="select"
                      value={l.unit_id}
                      disabled={l.kind === 'material' && Boolean(l.material_id)}
                      aria-label={t('est.col.unit')}
                      aria-invalid={e.unit_id ? 'true' : undefined}
                      onChange={(ev) => update(l.key, { unit_id: ev.target.value })}
                    >
                      <option value="">—</option>
                      {unitOptions.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.id}
                        </option>
                      ))}
                    </select>
                    {e.unit_id && <span className="cell-error">{e.unit_id}</span>}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <span className="mode-toggle">
                        <button
                          type="button"
                          aria-pressed={l.mode === 'manual'}
                          onClick={() => update(l.key, { mode: 'manual' })}
                        >
                          {t('est.manual_mode')}
                        </button>
                        <button
                          type="button"
                          aria-pressed={l.mode === 'norm'}
                          onClick={() => update(l.key, { mode: 'norm' })}
                        >
                          {t('est.norm_mode')}
                        </button>
                      </span>
                      {l.mode === 'manual' ? (
                        <input
                          className="input num grow"
                          inputMode="decimal"
                          value={l.quantity}
                          aria-label={t('est.col.quantity')}
                          aria-invalid={e.quantity ? 'true' : undefined}
                          onChange={(ev) => update(l.key, { quantity: ev.target.value })}
                        />
                      ) : (
                        <>
                          <input
                            className="input num"
                            style={{ width: 64 }}
                            inputMode="decimal"
                            placeholder={t('est.col.norm')}
                            value={l.norm}
                            aria-label={t('est.col.norm')}
                            aria-invalid={e.norm ? 'true' : undefined}
                            onChange={(ev) => update(l.key, { norm: ev.target.value })}
                          />
                          <span className="muted">×</span>
                          <input
                            className="input num"
                            style={{ width: 72 }}
                            inputMode="decimal"
                            placeholder={t('est.col.work_quantity')}
                            value={l.work_quantity}
                            aria-label={t('est.col.work_quantity')}
                            aria-invalid={e.work_quantity ? 'true' : undefined}
                            onChange={(ev) => update(l.key, { work_quantity: ev.target.value })}
                          />
                        </>
                      )}
                    </div>
                    {(e.quantity || e.norm || e.work_quantity) && (
                      <span className="cell-error">{e.quantity ?? e.norm ?? e.work_quantity}</span>
                    )}
                  </td>
                  <td>
                    <input
                      className="input num"
                      inputMode="decimal"
                      value={l.loss_percent}
                      placeholder="0"
                      aria-label={t('est.col.loss')}
                      aria-invalid={e.loss_percent ? 'true' : undefined}
                      onChange={(ev) => update(l.key, { loss_percent: ev.target.value })}
                    />
                  </td>
                  <td className="cell-calc">{formatQuantity(effectiveOf(l))}</td>
                  <td>
                    <input
                      className="input num"
                      inputMode="decimal"
                      value={l.unit_price}
                      aria-label={t('est.col.unit_price')}
                      aria-invalid={e.unit_price ? 'true' : undefined}
                      onChange={(ev) => update(l.key, { unit_price: ev.target.value })}
                    />
                    {e.unit_price && <span className="cell-error">{e.unit_price}</span>}
                  </td>
                  <td className="cell-calc">{formatMoney(totalOf(l), lang, false)}</td>
                  <td>
                    <input
                      className="input"
                      value={l.note}
                      aria-label={t('est.col.note')}
                      onChange={(ev) => update(l.key, { note: ev.target.value })}
                    />
                  </td>
                  <td>
                    <div className="row" style={{ gap: 2 }}>
                      <Button
                        size="sm"
                        variant={l.months.length ? 'secondary' : 'ghost'}
                        icon={<CalendarDays />}
                        aria-label={t('est.col.months')}
                        onClick={() => setMonthsFor(l.key)}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Copy />}
                        aria-label={t('est.duplicate_line')}
                        onClick={() =>
                          setLines((ls) => {
                            const idx = ls.findIndex((x) => x.key === l.key);
                            const copy = {
                              ...l,
                              key: crypto.randomUUID(),
                              months: l.months.map((m) => ({ ...m })),
                            };
                            return [...ls.slice(0, idx + 1), copy, ...ls.slice(idx + 1)];
                          })
                        }
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 />}
                        aria-label={t('est.delete_line')}
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      />
                    </div>
                    {e.months && <span className="cell-error">{e.months}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={11} style={{ textAlign: 'right' }}>
                {t('est.total')}
              </td>
              <td className="cell-calc">{formatMoney(total, lang)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <datalist id="est-categories">
        {[...new Set(lines.map((l) => l.category).filter(Boolean))].map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <div className="sticky-actions">
        <span className="muted text-sm">
          {t('est.lines')}: {lines.length} · {t('est.total')}: <b>{formatMoney(total, lang)}</b>
        </span>
        <span className="row">
          <Button
            variant="secondary"
            onClick={() =>
              navigate(existing ? `/app/estimates/${existing.id}` : `/app/estimates?project=${projectId}`)
            }
          >
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {t('common.save')}
          </Button>
        </span>
      </div>
      {monthsFor && (
        <MonthsModal
          line={lines.find((l) => l.key === monthsFor)!}
          onClose={() => setMonthsFor(null)}
          onChange={(months) => update(monthsFor, { months })}
        />
      )}
      {materialModal && (
        <NewMaterialModal
          onClose={() => setMaterialModal(null)}
          onCreated={(m) => {
            // Yangi material ro'yxat yangilanishini kutmasdan qatorga yoziladi.
            const current = lines.find((l) => l.key === materialModal);
            update(materialModal, {
              material_id: m.id,
              unit_id: m.unit_id,
              description: current?.description || m.name,
            });
            setMaterialModal(null);
          }}
        />
      )}
    </div>
  );
}

function MonthsModal({
  line,
  onClose,
  onChange,
}: {
  line: LineDraft;
  onClose: () => void;
  onChange: (months: LineDraft['months']) => void;
}) {
  const { t } = useT();
  const [rows, setRows] = useState(
    line.months.length ? line.months : [{ month: monthStart(), quantity: '' }],
  );
  const sum = rows.reduce((s, r) => s + (Number(normalizeNumber(r.quantity)) || 0), 0);
  const target = effectiveOf(line);
  const ok = Math.abs(sum - target) < 0.000001;
  return (
    <Modal
      open
      onClose={onClose}
      title={t('est.months_title')}
      description={t('est.months_hint')}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              onChange([]);
              onClose();
            }}
          >
            {t('est.months_clear')}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!ok}
            onClick={() => {
              onChange(rows.filter((r) => r.quantity));
              onClose();
            }}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="stack">
        {rows.map((r, i) => (
          <div key={i} className="row">
            <input
              type="month"
              className="input"
              value={r.month.slice(0, 7)}
              onChange={(e) =>
                setRows((rs) => rs.map((x, j) => (j === i ? { ...x, month: e.target.value + '-01' } : x)))
              }
            />
            <input
              className="input num"
              inputMode="decimal"
              value={r.quantity}
              onChange={(e) =>
                setRows((rs) => rs.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))
              }
            />
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 />}
              aria-label={t('common.delete')}
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
            />
          </div>
        ))}
        <div className="row-between">
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus />}
            onClick={() =>
              setRows((rs) => {
                const last = rs.at(-1)?.month ?? monthStart();
                const d = new Date(last + 'T00:00:00Z');
                d.setUTCMonth(d.getUTCMonth() + 1);
                return [...rs, { month: d.toISOString().slice(0, 10), quantity: '' }];
              })
            }
          >
            {t('est.months_add')}
          </Button>
          <span
            className={ok ? 'text-sm' : 'text-sm'}
            style={{ color: ok ? 'var(--success)' : 'var(--danger)' }}
          >
            {t('est.months_sum')}: {formatQuantity(sum)} / {formatQuantity(target)}
          </span>
        </div>
      </div>
    </Modal>
  );
}

export function NewMaterialModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (m: Material) => void;
}) {
  const { t } = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const units = useUnits();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pcs');
  const create = useMutation({
    mutationFn: () =>
      api<Material>('/v1/materials', { method: 'POST', body: { name: name.trim(), unit_id: unit } }),
    onSuccess: async (m) => {
      await queryClient.invalidateQueries({ queryKey: ['materials'] });
      toast.success(t('est.material_created'));
      onCreated(m);
    },
    onError: (e: ApiError) =>
      toast.error(e.status === 403 ? t('est.material_no_permission') : errorMessage(t, e.code, e.status)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={t('est.material_new')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => create.mutate()}
            loading={create.isPending}
            disabled={name.trim().length < 1}
          >
            {t('common.create')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <Input label={t('est.material_name')} value={name} onChange={(e) => setName(e.target.value)} />
        <Select label={t('est.material_unit')} value={unit} onChange={(e) => setUnit(e.target.value)}>
          {(units.data?.units ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.id} — {u.name}
            </option>
          ))}
        </Select>
      </div>
    </Modal>
  );
}
