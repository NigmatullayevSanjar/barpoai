import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  Image as ImageIcon,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { api, ApiError, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DetailError, NotFound } from '@/app/guards';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatMoney, formatQuantity } from '@/lib/format';
import { Button, EmptyState, ErrorState, Loading, Modal, Pagination, Select } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import {
  BlockModal,
  ZoneStatusBadge,
  imageProblem,
  responsiblesText,
  uploadImage,
  useImageSrc,
} from './blocks';
import type { Premise, PremiseList, ProjectDetail, Zone, ZoneKind } from './types';

const PAGE = 25;
type Rooms = number | null;

/** Zonadan yuqoriga (o'zi ham): birinchi `kind` turidagi zona. */
function climb(byId: Map<string, Zone>, zone: Zone | undefined, kind: ZoneKind) {
  for (let cur = zone; cur; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined)
    if (cur.kind === kind) return cur;
  return undefined;
}
const period = (from: string | null, to: string | null, lang: 'uz' | 'ru') =>
  from || to ? `${from ? formatDate(from, lang) : '…'} – ${to ? formatDate(to, lang) : '…'}` : '—';

/** Qator ekranga kirgandan keyingina rasm yuklanadi (jadvalda 25 tagacha reja rasmi bor). */
function useSeen<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') return setSeen(true);
    const io = new IntersectionObserver(([entry]) => entry?.isIntersecting && setSeen(true));
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

/** Xonadon reja rasmi: kichik rasm (bosilsa katta), tahrir huquqi bo'lsa yuklash / almashtirish / olib tashlash. */
function PlanCell({
  projectId,
  premise,
  canEdit,
}: {
  projectId: string;
  premise: Premise;
  canEdit: boolean;
}) {
  const { t } = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [ref, seen] = useSeen<HTMLSpanElement>();
  const [big, setBig] = useState(false);
  const src = useImageSrc(seen ? premise.plan_file_id : null);
  const setPlan = useMutation({
    mutationFn: async (file: File | null) => {
      const planId = file ? (await uploadImage(projectId, file)).id : null;
      return api(`/v1/projects/${projectId}/premises/${premise.id}/plan`, {
        method: 'PATCH',
        body: { version: premise.version, plan_file_id: planId },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['premises', projectId] });
      toast.success(t('common.saved'));
    },
    onError: (e: ApiError) =>
      toast.error(
        e.code === 'VERSION_CONFLICT' ? t('common.version_conflict') : errorMessage(t, e.code, e.status),
      ),
  });
  const pick = (f: File) => {
    const problem = imageProblem(f);
    if (problem) return toast.error(errorMessage(t, problem, 400));
    setPlan.mutate(f);
  };
  return (
    <span className="plan-cell" ref={ref}>
      {premise.plan_file_id ? (
        <button
          type="button"
          className="plan-thumb"
          aria-label={t('blocks.plan_open')}
          disabled={!src}
          onClick={() => setBig(true)}
        >
          {src ? <img src={src} alt="" /> : <ImageIcon aria-hidden />}
        </button>
      ) : (
        !canEdit && <span className="muted">—</span>
      )}
      {canEdit && (
        <>
          <Button
            variant="ghost"
            size="sm"
            icon={<Upload />}
            loading={setPlan.isPending}
            aria-label={premise.plan_file_id ? t('blocks.plan_replace') : t('blocks.plan_upload')}
            title={premise.plan_file_id ? t('blocks.plan_replace') : t('blocks.plan_upload')}
            onClick={() => input.current?.click()}
          />
          {premise.plan_file_id && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 />}
              disabled={setPlan.isPending}
              aria-label={t('blocks.plan_remove')}
              title={t('blocks.plan_remove')}
              onClick={() => setPlan.mutate(null)}
            />
          )}
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pick(f);
              e.target.value = '';
            }}
          />
        </>
      )}
      {big && src && (
        <Modal
          open
          onClose={() => setBig(false)}
          title={t('blocks.plan_title', { number: premise.number })}
          size="lg"
        >
          <img className="plan-large" src={src} alt={t('blocks.plan_title', { number: premise.number })} />
        </Modal>
      )}
    </span>
  );
}

function RoomsTable({
  d,
  block,
  rooms,
  entrance,
  floor,
  byId,
  canPlan,
}: {
  d: ProjectDetail;
  block: Zone;
  rooms: Rooms;
  entrance: string;
  floor: string;
  byId: Map<string, Zone>;
  canPlan: boolean;
}) {
  const { t, lang } = useT();
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: ['premises', d.id, 'block', block.id, 'rooms', rooms ?? 'none', entrance, floor, offset],
    queryFn: () =>
      api<PremiseList>(
        `/v1/projects/${d.id}/premises${qs({
          block_id: block.id,
          zone_id: entrance,
          floor,
          rooms: rooms ?? 'none',
          limit: PAGE,
          offset,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });
  const dash = <span className="muted">—</span>;
  const columns: Column<Premise>[] = [
    {
      key: 'plan',
      header: t('blocks.col_plan'),
      width: 170,
      render: (r) => <PlanCell projectId={d.id} premise={r} canEdit={canPlan} />,
    },
    {
      key: 'number',
      header: t('premises.number'),
      width: 110,
      render: (r) => <span className="cell-main">{r.number}</span>,
    },
    {
      key: 'entrance',
      header: t('projects.zone_kind.entrance'),
      render: (r) => climb(byId, r.zone_id ? byId.get(r.zone_id) : undefined, 'entrance')?.name ?? dash,
    },
    { key: 'floor', header: t('premises.floor'), width: 90, render: (r) => r.floor ?? dash },
    {
      key: 'area',
      header: t('blocks.col_area'),
      width: 150,
      align: 'right',
      render: (r) => formatQuantity(r.area_m2),
    },
    {
      key: 'cost',
      header: t('blocks.col_cost'),
      width: 200,
      align: 'right',
      render: (r) => formatMoney(r.cost, lang),
    },
  ];
  const total = query.data?.total_count ?? 0;
  return (
    <DataTable
      columns={columns}
      rows={query.data?.items}
      rowKey={(r) => r.id}
      loading={query.isLoading}
      error={
        query.error ? errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status) : null
      }
      onRetry={query.refetch}
      empty={{ title: t('blocks.premises_empty_filtered') }}
      footer={
        total > PAGE && (
          <Pagination
            offset={offset}
            limit={PAGE}
            count={offset + PAGE < total ? PAGE : 0}
            onChange={setOffset}
          />
        )
      }
    />
  );
}

/** Akkordeon: "{n} xonali xonadonlar"; ochilganda shu guruh xonadonlari yuklanadi. */
function RoomsGroup({
  d,
  block,
  rooms,
  count,
  entrance,
  floor,
  byId,
  canPlan,
  defaultOpen,
}: {
  d: ProjectDetail;
  block: Zone;
  rooms: Rooms;
  count: number;
  entrance: string;
  floor: string;
  byId: Map<string, Zone>;
  canPlan: boolean;
  defaultOpen: boolean;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const label =
    rooms === null
      ? t('blocks.rooms_none')
      : rooms === 0
        ? t('blocks.rooms_studio')
        : t('blocks.rooms_n', { n: rooms });
  return (
    <section className="rooms-group">
      <h3>
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          <ChevronRight className="chevron" aria-hidden />
          <span className="rooms-group-title">{label}</span>
          <span className="rooms-group-count">{t('blocks.group_count', { n: count })}</span>
        </button>
      </h3>
      {open && (
        <div id={id}>
          <RoomsTable
            key={`${entrance}|${floor}`}
            d={d}
            block={block}
            rooms={rooms}
            entrance={entrance}
            floor={floor}
            byId={byId}
            canPlan={canPlan}
          />
        </div>
      )}
    </section>
  );
}

function BlockView({ d, block }: { d: ProjectDetail; block: Zone }) {
  const { t, lang } = useT();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [edit, setEdit] = useState(false);
  const [entrance, setEntrance] = useState('');
  const [floor, setFloor] = useState('');
  const byId = useMemo(() => new Map(d.zones.map((z) => [z.id, z])), [d.zones]);
  const entrances = d.zones.filter((z) => z.kind === 'entrance' && climb(byId, z, 'block')?.id === block.id);
  const filtered = Boolean(entrance || floor);
  const canEdit = can('projects', 'update');
  const blockImage = useImageSrc(block.image_file_id);
  const projectImage = useImageSrc(block.image_file_id ? null : d.image_file_id);
  const banner = blockImage ?? projectImage;
  const groups = useQuery({
    queryKey: ['premises', d.id, 'block', block.id, 'groups', entrance, floor],
    queryFn: () =>
      api<PremiseList>(
        `/v1/projects/${d.id}/premises${qs({ block_id: block.id, zone_id: entrance, floor, limit: 1 })}`,
      ),
    placeholderData: keepPreviousData,
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['project', d.id] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
    ]);
  const byRooms = groups.data?.by_rooms ?? [];
  return (
    <div className="stack" style={{ gap: 16 }}>
      <Link to={`/app/projects/${d.id}?tab=zones`} className="block-back">
        <ArrowLeft size={16} aria-hidden />
        {d.name}
      </Link>
      <section className="block-banner">
        {banner && <img src={banner} alt="" />}
        <div className="block-banner-text">
          <h1>
            {d.name} / {t('blocks.block_label')} {block.name}
          </h1>
          {d.address && <p>{d.address}</p>}
        </div>
      </section>
      <section className="card card-pad block-summary">
        <dl className="block-facts">
          <div>
            <dt>{t('blocks.field.status')}</dt>
            <dd>
              <ZoneStatusBadge status={block.status} />
            </dd>
          </div>
          <div>
            <dt>{t('blocks.field.floors')}</dt>
            <dd>{block.floors_count ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('blocks.field.land_area')}</dt>
            <dd>{block.area_m2 ? t('blocks.area_value', { n: formatQuantity(block.area_m2) }) : '—'}</dd>
          </div>
          <div>
            <dt>{t('blocks.plan_period')}</dt>
            <dd>{period(block.planned_start, block.planned_end, lang)}</dd>
          </div>
          <div>
            <dt>{t('blocks.fact_period')}</dt>
            <dd>{period(block.actual_start, block.actual_end, lang)}</dd>
          </div>
          <div>
            <dt>{t('blocks.responsible')}</dt>
            <dd>{responsiblesText(block)}</dd>
          </div>
          {block.estimate_total !== null && (
            <div>
              <dt>{t('blocks.field.estimate')}</dt>
              <dd>{formatMoney(block.estimate_total, lang)}</dd>
            </div>
          )}
        </dl>
        {canEdit && (
          <Button variant="secondary" icon={<Pencil />} onClick={() => setEdit(true)}>
            {t('common.edit')}
          </Button>
        )}
      </section>
      <div className="toolbar block-toolbar">
        <Select
          wrapClassName="block-filter"
          aria-label={t('projects.zone_kind.entrance')}
          value={entrance}
          onChange={(e) => setEntrance(e.target.value)}
        >
          <option value="">{t('blocks.entrance_all')}</option>
          {entrances.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </Select>
        {!!block.floors_count && (
          <Select
            wrapClassName="block-filter"
            aria-label={t('premises.floor')}
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
          >
            <option value="">{t('blocks.floor_all')}</option>
            {Array.from({ length: block.floors_count }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {t('blocks.floor_n', { n: i + 1 })}
              </option>
            ))}
          </Select>
        )}
        <span className="spacer" />
        {can('stock') && (
          <Link to={`/app/stock?project=${d.id}`} className="btn btn-primary">
            <Plus />
            {t('blocks.add_material')}
          </Link>
        )}
        {can('estimates') && (
          <Link to={`/app/estimates?project=${d.id}`} className="btn btn-primary">
            {t('blocks.field.estimate')}
          </Link>
        )}
      </div>
      <section className="card">
        {groups.error && !groups.data ? (
          <ErrorState
            message={errorMessage(t, (groups.error as ApiError).code, (groups.error as ApiError).status)}
            onRetry={() => groups.refetch()}
          />
        ) : !groups.data ? (
          <Loading rows={5} />
        ) : byRooms.length === 0 ? (
          <EmptyState
            icon={<Building2 />}
            title={filtered ? t('blocks.premises_empty_filtered') : t('blocks.premises_empty')}
            description={filtered ? undefined : t('blocks.premises_empty_desc')}
            action={
              filtered ? undefined : (
                <Link to={`/app/projects/${d.id}?tab=premises`} className="btn btn-secondary">
                  {t('blocks.premises_open')}
                </Link>
              )
            }
          />
        ) : (
          byRooms.map((g) => (
            <RoomsGroup
              key={g.rooms ?? 'none'}
              d={d}
              block={block}
              rooms={g.rooms}
              count={g.count}
              entrance={entrance}
              floor={floor}
              byId={byId}
              canPlan={canEdit && can('files', 'create')}
              defaultOpen={byRooms.length === 1}
            />
          ))
        )}
      </section>
      {edit && <BlockModal d={d} zone={block} onClose={() => setEdit(false)} onDone={refresh} />}
    </div>
  );
}

export function BlockPage() {
  const { id = '', blockId = '' } = useParams();
  const { t } = useT();
  const query = useQuery({
    queryKey: ['project', id],
    queryFn: () => api<ProjectDetail>(`/v1/projects/${id}`),
  });
  const backTo = { to: `/app/projects/${id}`, label: t('blocks.back_to_project') };
  if (query.isError) return <DetailError error={query.error} onRetry={query.refetch} backTo={backTo} />;
  const d = query.data;
  if (!d)
    return (
      <div className="card">
        <div className="card-pad muted">{t('common.loading')}</div>
      </div>
    );
  const block = d.zones.find((z) => z.id === blockId && z.kind === 'block');
  if (!block) return <NotFound record backTo={backTo} />;
  return <BlockView key={block.id} d={d} block={block} />;
}
