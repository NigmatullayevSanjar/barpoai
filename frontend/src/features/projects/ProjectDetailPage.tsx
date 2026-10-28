import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Archive, ArrowLeft, Image as ImageIcon, Pencil, Plus, Trash2, Upload, UserPlus } from 'lucide-react';
import { api, apiAll, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DetailError } from '@/app/guards';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { displayCurrency } from '@/lib/currency-store';
import {
  Badge,
  Button,
  ConfirmDialog,
  Input,
  Modal,
  Select,
  Stat,
  Tabs,
  Textarea,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { readAsBase64, useFileContent } from '@/features/work/model';
import {
  ProjectFields,
  checkDates,
  ProjectStatusBadge,
  projectSchema,
  toProjectBody,
  type ProjectForm,
} from './ProjectsPage';
import { PremisesTab } from './PremisesTab';
import { BlocksSection } from './BlocksSection';
import { useImageSrc } from './blocks';
import { zoneKinds, type Employee, type Member, type ProjectDetail, type Zone, type ZoneKind } from './types';

type Tab = 'overview' | 'zones' | 'premises' | 'members' | 'warehouses';
export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const { t, lang } = useT();
  const { can, me } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const startTab = params.get('tab');
  // Figma "obyekt ko'rish": sahifa bloklar bilan ochiladi; qolgan bo'limlar tablarda.
  const [tab, setTab] = useState<Tab>(
    startTab === 'overview' || startTab === 'premises' || startTab === 'members' || startTab === 'warehouses'
      ? startTab
      : 'zones',
  );
  const [edit, setEdit] = useState(false);
  const [archive, setArchive] = useState(false);
  const [reason, setReason] = useState('');
  const query = useQuery({
    queryKey: ['project', id],
    queryFn: () => api<ProjectDetail>(`/v1/projects/${id}`),
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['project', id] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
    ]);
  const onError = (e: ApiError) =>
    toast.error(
      e.code === 'VERSION_CONFLICT' ? t('common.version_conflict') : errorMessage(t, e.code, e.status),
    );
  const archiveMutation = useMutation({
    mutationFn: () =>
      api(`/v1/projects/${id}`, { method: 'DELETE', body: { version: query.data!.version, reason } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(t('common.saved'));
      navigate('/app/projects');
    },
    onError,
  });
  const d = query.data;
  // Hook erta qaytishlardan oldin: banner rasmi (files huquqi bo'lsa).
  const banner = useImageSrc(d?.image_file_id ?? null);
  if (query.isError)
    return (
      <DetailError
        error={query.error}
        onRetry={query.refetch}
        backTo={{ to: '/app/projects', label: t('common.back_to_list') }}
      />
    );
  if (!d)
    return (
      <div className="card">
        <div className="card-pad muted">{t('common.loading')}</div>
      </div>
    );
  const canEdit = can('projects', 'update');
  const canManageMembers = me?.role === 'tenant_admin' || can('employees', 'update');
  const endRef = d.forecast_end ?? d.planned_end;
  const daysToEnd = endRef ? Math.ceil((new Date(endRef).getTime() - Date.now()) / 86400000) : null;
  // Figma "obyekt ko'rish": orqaga va amallar qatori, rasmli banner (nom, manzil), faktlar, keyin bloklar.
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="project-top">
        <Link to="/app/projects" className="btn btn-secondary">
          <ArrowLeft size={16} /> {t('common.back')}
        </Link>
        <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {canEdit && (
            <Button variant="secondary" icon={<Pencil />} onClick={() => setEdit(true)}>
              {t('common.edit')}
            </Button>
          )}
          {can('projects', 'delete') && (
            <Button variant="ghost" icon={<Archive />} onClick={() => setArchive(true)}>
              {t('projects.archive')}
            </Button>
          )}
        </span>
      </div>
      <section className="block-banner">
        {banner && <img src={banner} alt={d.name} />}
        <div className="block-banner-text">
          <h1>{d.name}</h1>
          <p>{[d.code, d.address ?? d.customer_name].filter(Boolean).join(' · ') || t('projects.facts')}</p>
          <p>
            <ProjectStatusBadge status={d.status} />
          </p>
        </div>
      </section>
      <div className="card card-pad">
        <dl className="block-facts">
          <div>
            <dt>{t('projects.counter.open_tasks')}</dt>
            <dd>
              {d.counters.open_tasks}
              <small className="muted">
                {' '}
                · {t('projects.counter.overdue_tasks')}: {d.counters.overdue_tasks}
              </small>
            </dd>
          </div>
          <div>
            <dt>{t('projects.counter.estimates')}</dt>
            <dd>{d.counters.estimates}</dd>
          </div>
          <div>
            <dt>{t('projects.counter.pending_reports')}</dt>
            <dd>{d.counters.pending_reports}</dd>
          </div>
          <div>
            <dt>{t('projects.area_m2')}</dt>
            <dd>{d.area_m2 ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('projects.timeline')}</dt>
            <dd>
              {formatDate(endRef, lang)}
              {daysToEnd !== null && (
                <small className="muted">
                  {' '}
                  · {daysToEnd >= 0 ? t('projects.days_to_end', { n: daysToEnd }) : t('projects.overdue_by', { n: -daysToEnd })}
                </small>
              )}
            </dd>
          </div>
        </dl>
      </div>
      {d.finance && (
        <section className="stack" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>{t('projects.finance.title')}</h3>
          <div className="grid-4">
            <Stat
              label={`${t('projects.finance.plan')} (${displayCurrency()})`}
              value={formatMoney(d.finance.plan_total, lang, false)}
            />
            <Stat
              label={`${t('projects.finance.fact')} (${displayCurrency()})`}
              value={formatMoney(d.finance.fact_total, lang, false)}
              sub={d.finance.fact_percent !== null ? t('projects.finance.fact_percent', { p: d.finance.fact_percent }) : undefined}
            />
            <Stat
              label={`${t('projects.finance.remaining')} (${displayCurrency()})`}
              value={formatMoney(d.finance.remaining_plan, lang, false)}
              tone={d.finance.remaining_plan.startsWith('-') ? 'danger' : undefined}
              sub={d.finance.remaining_plan.startsWith('-') ? t('projects.finance.over_plan') : undefined}
            />
            <Stat
              label={t('projects.finance.progress')}
              value={d.finance.progress_percent !== null ? `${d.finance.progress_percent} %` : '—'}
            />
            <Stat
              label={`${t('projects.finance.paid')} (${displayCurrency()})`}
              value={formatMoney(d.finance.paid, lang, false)}
            />
            <Stat
              label={`${t('projects.finance.debt')} (${displayCurrency()})`}
              value={formatMoney(d.finance.debt, lang, false)}
              tone={Number(d.finance.debt) > 0 ? 'warning' : undefined}
            />
            <Stat
              label={`${t('projects.finance.advances')} (${displayCurrency()})`}
              value={formatMoney(d.finance.advances, lang, false)}
            />
            <Stat
              label={`${t('projects.finance.income')} (${displayCurrency()})`}
              value={formatMoney(d.finance.income, lang, false)}
            />
          </div>
        </section>
      )}
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { key: 'overview', label: t('projects.tab.overview') },
          { key: 'zones', label: t('projects.tab.zones'), count: d.zones.length },
          { key: 'premises', label: t('premises.tab') },
          { key: 'members', label: t('projects.tab.members'), count: d.members.length },
          { key: 'warehouses', label: t('projects.tab.warehouses'), count: d.warehouses.length },
        ]}
      />
      {tab === 'overview' && <Overview d={d} />}
      {tab === 'zones' && (
        <>
          <BlocksSection d={d} canEdit={canEdit} onChange={refresh} />
          <ZonesTab d={d} canEdit={canEdit} onChange={refresh} />
        </>
      )}
      {tab === 'premises' && <PremisesTab d={d} />}
      {tab === 'members' && <MembersTab d={d} canEdit={canManageMembers} onChange={refresh} />}
      {tab === 'warehouses' && <WarehousesTab d={d} canEdit={canEdit} onChange={refresh} />}
      {edit && <EditProjectModal d={d} onClose={() => setEdit(false)} onDone={refresh} />}
      <ConfirmDialog
        open={archive}
        onClose={() => setArchive(false)}
        onConfirm={() => archiveMutation.mutate()}
        title={t('projects.archive')}
        danger
        loading={archiveMutation.isPending}
        message={
          <div className="stack">
            <p>{t('projects.archive_confirm')}</p>
            <Textarea
              label={t('common.reason')}
              hint={t('common.reason_hint')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        }
      />
    </div>
  );
}

function Overview({ d }: { d: ProjectDetail }) {
  const { t, lang } = useT();
  const { can } = useAuth();
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <section className="card">
        <div className="card-header">
          <h3>{t('projects.tab.overview')}</h3>
        </div>
        <div className="card-pad">
          <dl className="kv">
            <dt>{t('projects.code')}</dt>
            <dd>{d.code ?? '—'}</dd>
            <dt>{t('projects.customer')}</dt>
            <dd>{d.customer_name ?? '—'}</dd>
            <dt>{t('projects.address')}</dt>
            <dd>{d.address ?? '—'}</dd>
            <dt>{t('projects.area_m2')}</dt>
            <dd>{d.area_m2 ?? '—'}</dd>
            <dt>{t('projects.planned_start')}</dt>
            <dd>{formatDate(d.planned_start, lang)}</dd>
            <dt>{t('projects.planned_end')}</dt>
            <dd>{formatDate(d.planned_end, lang)}</dd>
            <dt>{t('projects.actual_start')}</dt>
            <dd>{formatDate(d.actual_start, lang)}</dd>
            <dt>{t('projects.actual_end')}</dt>
            <dd>{formatDate(d.actual_end, lang)}</dd>
            <dt>{t('projects.forecast_end')}</dt>
            <dd>{formatDate(d.forecast_end, lang)}</dd>
            <dt>{t('common.created_at')}</dt>
            <dd>{formatDateTime(d.created_at, lang)}</dd>
          </dl>
          {d.description && (
            <>
              <div className="divider" />
              <p style={{ whiteSpace: 'pre-wrap' }}>{d.description}</p>
            </>
          )}
        </div>
      </section>
      <section className="card">
        <div className="card-header">
          <h3>{t('nav.group.main')}</h3>
        </div>
        <div className="card-pad stack">
          {can('tasks') && (
            <Link to={`/app/tasks?project=${d.id}`} className="btn btn-secondary">
              {t('projects.open_tasks')}
            </Link>
          )}
          {can('estimates') && (
            <Link to={`/app/estimates?project=${d.id}`} className="btn btn-secondary">
              {t('projects.open_estimates')}
            </Link>
          )}
          {can('stock') && (
            <Link to={`/app/stock?project=${d.id}`} className="btn btn-secondary">
              {t('projects.open_stock')}
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}

function EditProjectModal({
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
  const { can } = useAuth();
  const canImage = can('files', 'create');
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [removed, setRemoved] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const current = useFileContent(canImage && !removed && !picked ? d.image_file_id : null);
  useEffect(() => {
    if (!picked) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(picked);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [picked]);
  const pickFile = (f: File) => {
    if (!['image/jpeg', 'image/png'].includes(f.type))
      return toast.error(errorMessage(t, 'FILE_SIGNATURE_INVALID', 400));
    if (f.size > 5 * 1024 * 1024) return toast.error(errorMessage(t, 'FILE_SIZE_INVALID', 400));
    setPicked(f);
    setRemoved(false);
  };
  // Bir xil tanlangan fayl qayta urinishda qayta yuklanmasin (server idempotency kaliti bo'yicha bir marta saqlaydi).
  const uploadKey = useMemo(() => crypto.randomUUID(), [picked]);
  const shown = preview ?? (current.data ? `data:${current.data.mime_type};base64,${current.data.base64}` : null);
  const hasImage = Boolean(picked) || (!removed && Boolean(d.image_file_id));
  const form = useForm<ProjectForm & { forecast_end: string; actual_start: string; actual_end: string }>({
    resolver: zodResolver(
      projectSchema(t)
        .extend({
          forecast_end: projectSchema(t).shape.planned_start,
          actual_start: projectSchema(t).shape.planned_start,
          actual_end: projectSchema(t).shape.planned_start,
        })
        .superRefine((v, ctx) => checkDates(v, ctx, t)),
    ),
    defaultValues: {
      name: d.name,
      code: d.code ?? '',
      customer_name: d.customer_name ?? '',
      address: d.address ?? '',
      description: d.description ?? '',
      status: d.status,
      // Sana maydonlari faqat YYYY-MM-DD qabul qiladi (server ham shuni kutadi).
      planned_start: d.planned_start?.slice(0, 10) ?? '',
      planned_end: d.planned_end?.slice(0, 10) ?? '',
      area_m2: d.area_m2 ?? '',
      forecast_end: d.forecast_end?.slice(0, 10) ?? '',
      actual_start: d.actual_start?.slice(0, 10) ?? '',
      actual_end: d.actual_end?.slice(0, 10) ?? '',
    },
  });
  const save = useMutation({
    mutationFn: async (v: ProjectForm & { forecast_end: string; actual_start: string; actual_end: string }) => {
      let imageId = removed ? null : d.image_file_id;
      if (picked) {
        const uploaded = await api<{ id: string }>('/v1/files', {
          method: 'POST',
          idempotencyKey: uploadKey,
          body: {
            project_id: d.id,
            name: picked.name.slice(0, 200),
            mime_type: picked.type,
            base64: await readAsBase64(picked),
          },
        });
        imageId = uploaded.id;
      }
      return api(`/v1/projects/${d.id}`, {
        method: 'PATCH',
        body: {
          ...toProjectBody(v),
          version: d.version,
          image_file_id: imageId,
          forecast_end: v.forecast_end || null,
          actual_start: v.actual_start || null,
          actual_end: v.actual_end || null,
        },
      });
    },
    onSuccess: async () => {
      await onDone();
      toast.success(t('common.saved'));
      onClose();
    },
    onError: (e: ApiError) =>
      toast.error(
        e.code === 'VERSION_CONFLICT' ? t('common.version_conflict') : errorMessage(t, e.code, e.status),
      ),
  });
  const submit = form.handleSubmit((v) => save.mutate(v));
  return (
    <Modal
      open
      onClose={onClose}
      title={t('projects.edit')}
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
      <form onSubmit={submit} noValidate className="stack">
        <ProjectFields form={form as never} />
        <div className="form-grid">
          <Input type="date" label={t('projects.actual_start')} {...form.register('actual_start')} />
          <Input
            type="date"
            label={t('projects.actual_end')}
            error={form.formState.errors.actual_end?.message}
            {...form.register('actual_end')}
          />
          <Input type="date" label={t('projects.forecast_end')} {...form.register('forecast_end')} />
        </div>
        {canImage && (
          <div className="stack" style={{ gap: 8 }}>
            <span className="text-sm">{t('projects.image')}</span>
            <div className="row" style={{ gap: 12 }}>
              <div
                style={{
                  width: 96,
                  height: 96,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: 'var(--surface-2)',
                }}
              >
                {shown ? (
                  <img src={shown} alt={d.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <ImageIcon size={20} style={{ margin: 36, color: 'var(--muted)' }} />
                )}
              </div>
              <Button variant="secondary" icon={<Upload />} onClick={() => input.current?.click()}>
                {t('projects.image_pick')}
              </Button>
              {hasImage && (
                <Button
                  variant="ghost"
                  icon={<Trash2 />}
                  onClick={() => {
                    setPicked(null);
                    setRemoved(true);
                  }}
                >
                  {t('projects.image_remove')}
                </Button>
              )}
              <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickFile(f);
                  e.target.value = '';
                }}
              />
            </div>
            <p className="muted text-xs">{t('projects.image_hint')}</p>
          </div>
        )}
      </form>
    </Modal>
  );
}

function ZonesTab({
  d,
  canEdit,
  onChange,
}: {
  d: ProjectDetail;
  canEdit: boolean;
  onChange: () => Promise<unknown>;
}) {
  const { t } = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const [kind, setKind] = useState<ZoneKind>('other');
  const [floors, setFloors] = useState('');
  const [editing, setEditing] = useState<Zone | null>(null);
  const create = useMutation({
    mutationFn: () =>
      api(`/v1/projects/${d.id}/zones`, {
        method: 'POST',
        body: {
          name,
          ...(parent ? { parent_id: parent } : {}),
          kind,
          ...(kind === 'block' && floors ? { floors_count: Number(floors) } : {}),
        },
      }),
    onSuccess: async () => {
      await onChange();
      setOpen(false);
      setName('');
      setParent('');
      setKind('other');
      setFloors('');
      toast.success(t('common.saved'));
    },
    onError: (e: ApiError) => toast.error(errorMessage(t, e.code, e.status)),
  });
  const tree = useMemo(() => {
    const byParent = new Map<string | null, Zone[]>();
    for (const z of d.zones) byParent.set(z.parent_id, [...(byParent.get(z.parent_id) ?? []), z]);
    const out: { zone: Zone; depth: number }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const z of byParent.get(parentId) ?? []) {
        out.push({ zone: z, depth });
        walk(z.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [d.zones]);
  return (
    <section className="card">
      <div className="card-header">
        <h3>{t('projects.tab.zones')}</h3>
        {canEdit && (
          <Button size="sm" icon={<Plus />} onClick={() => setOpen(true)}>
            {t('projects.zone_new')}
          </Button>
        )}
      </div>
      {tree.length === 0 ? (
        <p className="muted card-pad">{t('projects.zones_empty')}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: '6px 0' }}>
          {tree.map(({ zone, depth }) => (
            <li
              key={zone.id}
              style={{
                padding: '8px 20px',
                paddingLeft: 20 + depth * 22,
                borderBottom: '1px solid var(--border)',
              }}
              className="row-between"
            >
              <span className="row" style={{ gap: 8 }}>
                <span>
                  {depth > 0 && <span className="muted">└ </span>}
                  {zone.name}
                </span>
                <Badge tone={zone.kind === 'block' ? 'brand' : 'neutral'}>
                  {t(`projects.zone_kind.${zone.kind}`)}
                </Badge>
                {zone.kind === 'block' && zone.floors_count && (
                  <span className="muted text-sm">{t('projects.zone_floors_n', { n: zone.floors_count })}</span>
                )}
              </span>
              {canEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Pencil />}
                  aria-label={t('projects.zone_edit')}
                  onClick={() => setEditing(zone)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('projects.zone_new')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => create.mutate()}
              loading={create.isPending}
              disabled={name.trim().length < 1 || !floorsValid(floors)}
            >
              {t('common.add')}
            </Button>
          </>
        }
      >
        <div className="stack">
          <Input label={t('projects.zone_name')} value={name} onChange={(e) => setName(e.target.value)} />
          <ZoneKindFields kind={kind} floors={floors} onKind={setKind} onFloors={setFloors} />
          <Select
            label={t('projects.zone_parent')}
            value={parent}
            onChange={(e) => setParent(e.target.value)}
          >
            <option value="">{t('projects.zone_root')}</option>
            {tree.map(({ zone, depth }) => (
              <option key={zone.id} value={zone.id}>
                {'— '.repeat(depth)}
                {zone.name}
              </option>
            ))}
          </Select>
        </div>
      </Modal>
      {editing && (
        <EditZoneModal key={editing.id} d={d} zone={editing} onClose={() => setEditing(null)} onDone={onChange} />
      )}
    </section>
  );
}

/** Qavatlar soni: bo'sh yoki 1..500 butun son (serverdagi zoneFloors bilan bir xil). */
const floorsValid = (floors: string) => floors === '' || /^(?:[1-9]\d{0,2}|500)$/.test(floors);
function ZoneKindFields({
  kind,
  floors,
  onKind,
  onFloors,
}: {
  kind: ZoneKind;
  floors: string;
  onKind: (k: ZoneKind) => void;
  onFloors: (v: string) => void;
}) {
  const { t } = useT();
  return (
    <>
      <Select label={t('projects.zone_kind')} value={kind} onChange={(e) => onKind(e.target.value as ZoneKind)}>
        {zoneKinds.map((k) => (
          <option key={k} value={k}>
            {t(`projects.zone_kind.${k}`)}
          </option>
        ))}
      </Select>
      {kind === 'block' && (
        <Input
          type="number"
          min={1}
          max={500}
          label={t('projects.zone_floors')}
          value={floors}
          error={floorsValid(floors) ? undefined : t('projects.zone_floors_invalid')}
          onChange={(e) => onFloors(e.target.value)}
        />
      )}
    </>
  );
}

function EditZoneModal({
  d,
  zone,
  onClose,
  onDone,
}: {
  d: ProjectDetail;
  zone: Zone;
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  const { t } = useT();
  const toast = useToast();
  const [name, setName] = useState(zone.name);
  const [kind, setKind] = useState<ZoneKind>(zone.kind);
  const [floors, setFloors] = useState(zone.floors_count ? String(zone.floors_count) : '');
  const save = useMutation({
    mutationFn: () =>
      api(`/v1/projects/${d.id}/zones/${zone.id}`, {
        method: 'PATCH',
        body: {
          version: zone.version,
          name,
          kind,
          floors_count: kind === 'block' && floors ? Number(floors) : null,
        },
      }),
    onSuccess: async () => {
      await onDone();
      onClose();
      toast.success(t('common.saved'));
    },
    onError: (e: ApiError) =>
      toast.error(
        e.code === 'VERSION_CONFLICT' ? t('common.version_conflict') : errorMessage(t, e.code, e.status),
      ),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={t('projects.zone_edit')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={name.trim().length < 1 || !floorsValid(floors)}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <Input label={t('projects.zone_name')} value={name} onChange={(e) => setName(e.target.value)} />
        <ZoneKindFields kind={kind} floors={floors} onKind={setKind} onFloors={setFloors} />
      </div>
    </Modal>
  );
}

function MembersTab({
  d,
  canEdit,
  onChange,
}: {
  d: ProjectDetail;
  canEdit: boolean;
  onChange: () => Promise<unknown>;
}) {
  const { t } = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [remove, setRemove] = useState<Member | null>(null);
  const [userId, setUserId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const employees = useQuery({
    queryKey: ['employees'],
    queryFn: () => apiAll<Employee>('/v1/employees'),
    enabled: canEdit,
  });
  const candidates =
    employees.data?.items.filter(
      (e) => e.active && e.role !== 'tenant_admin' && !d.members.some((m) => m.id === e.id),
    ) ?? [];
  const selected = candidates.find((c) => c.id === userId);
  const onError = (e: ApiError) => toast.error(errorMessage(t, e.code, e.status));
  const assign = useMutation({
    mutationFn: () =>
      api(`/v1/employees/${userId}/assignments`, {
        method: 'POST',
        body: { project_id: d.id, ...(warehouseId ? { warehouse_id: warehouseId } : {}) },
      }),
    onSuccess: async () => {
      await onChange();
      setOpen(false);
      setUserId('');
      setWarehouseId('');
      toast.success(t('common.saved'));
    },
    onError,
  });
  const unassign = useMutation({
    mutationFn: (m: Member) =>
      api(`/v1/employees/${m.id}/assignments`, { method: 'DELETE', body: { project_id: d.id } }),
    onSuccess: async () => {
      await onChange();
      setRemove(null);
      toast.success(t('common.saved'));
    },
    onError,
  });
  const columns: Column<Member>[] = [
    {
      key: 'name',
      header: t('employees.name'),
      sortValue: (r) => r.display_name,
      render: (r) => <span className="cell-main">{r.display_name}</span>,
    },
    {
      key: 'role',
      header: t('common.role'),
      sortValue: (r) => r.role,
      render: (r) => <Badge tone="brand">{t(`role.${r.role}`)}</Badge>,
    },
    { key: 'phone', header: t('common.phone'), render: (r) => r.phone ?? '—' },
    {
      key: 'wh',
      header: t('employees.warehouses'),
      render: (r) => r.warehouses.map((w) => w.name).join(', ') || '—',
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (r) => (
        <Badge tone={r.active ? 'success' : 'neutral'}>
          {r.active ? t('employees.active') : t('employees.inactive')}
        </Badge>
      ),
    },
    ...(canEdit
      ? [
          {
            key: 'act',
            header: '',
            className: 'actions',
            render: (r: Member) =>
              r.role !== 'tenant_admin' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 />}
                  aria-label={t('projects.member_remove')}
                  onClick={() => setRemove(r)}
                />
              ) : null,
          } as Column<Member>,
        ]
      : []),
  ];
  return (
    <section className="stack" style={{ gap: 10 }}>
      {canEdit && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button icon={<UserPlus />} onClick={() => setOpen(true)}>
            {t('projects.member_add')}
          </Button>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={d.members}
        rowKey={(r) => r.id}
        empty={{ title: t('projects.members_empty') }}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('projects.member_add')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => assign.mutate()} loading={assign.isPending} disabled={!userId}>
              {t('common.add')}
            </Button>
          </>
        }
      >
        <div className="stack">
          <Select
            label={t('projects.select_employee')}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">—</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name} · {t(`role.${c.role}`)}
              </option>
            ))}
          </Select>
          {selected?.role === 'warehouse_manager' && (
            <Select
              label={t('projects.select_warehouse')}
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">—</option>
              {d.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      </Modal>
      <ConfirmDialog
        open={remove !== null}
        onClose={() => setRemove(null)}
        onConfirm={() => remove && unassign.mutate(remove)}
        title={t('projects.member_remove')}
        message={t('projects.member_remove_confirm')}
        danger
        loading={unassign.isPending}
      />
    </section>
  );
}

function WarehousesTab({
  d,
  canEdit,
  onChange,
}: {
  d: ProjectDetail;
  canEdit: boolean;
  onChange: () => Promise<unknown>;
}) {
  const { t } = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => api('/v1/warehouses', { method: 'POST', body: { project_id: d.id, name } }),
    onSuccess: async () => {
      await onChange();
      setOpen(false);
      setName('');
      toast.success(t('common.saved'));
    },
    onError: (e: ApiError) => toast.error(errorMessage(t, e.code, e.status)),
  });
  return (
    <section className="card">
      <div className="card-header">
        <h3>{t('projects.tab.warehouses')}</h3>
        {canEdit && (
          <Button size="sm" icon={<Plus />} onClick={() => setOpen(true)}>
            {t('projects.warehouse_new')}
          </Button>
        )}
      </div>
      {d.warehouses.length === 0 ? (
        <p className="muted card-pad">{t('projects.warehouses_empty')}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: '6px 0' }}>
          {d.warehouses.map((w) => (
            <li
              key={w.id}
              className="row-between"
              style={{ padding: '8px 20px', borderBottom: '1px solid var(--border)' }}
            >
              <span>{w.name}</span>
              <Link to={`/app/stock?project=${d.id}&account=${w.account_id ?? ''}`} className="text-sm">
                {t('projects.open_stock')}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('projects.warehouse_new')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => create.mutate()}
              loading={create.isPending}
              disabled={name.trim().length < 1}
            >
              {t('common.add')}
            </Button>
          </>
        }
      >
        <Input label={t('projects.warehouse_name')} value={name} onChange={(e) => setName(e.target.value)} />
      </Modal>
    </section>
  );
}
