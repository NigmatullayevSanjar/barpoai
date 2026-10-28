import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Plus } from 'lucide-react';
import { api, apiAll, ApiError, qs, type ListResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatMoney } from '@/lib/format';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Segmented,
  Select,
  Textarea,
  useListState,
} from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useImageSrc } from './blocks';
import { statusTone, type Project, type ProjectStatus } from './types';

export const projectStatuses: ProjectStatus[] = ['planning', 'active', 'paused', 'completed'];
export const useProjects = () =>
  useQuery({ queryKey: ['projects'], queryFn: () => apiAll<Project>('/v1/projects') });

const AREA_RE = /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/;
export function checkDates(
  v: { planned_start: string; planned_end: string; actual_start?: string; actual_end?: string },
  ctx: z.RefinementCtx,
  t: (k: string) => string,
) {
  if (v.planned_start && v.planned_end && v.planned_end < v.planned_start)
    ctx.addIssue({ code: 'custom', path: ['planned_end'], message: t('projects.date_order') });
  if (v.actual_start && v.actual_end && v.actual_end < v.actual_start)
    ctx.addIssue({ code: 'custom', path: ['actual_end'], message: t('projects.date_order') });
}
export function projectSchema(t: (k: string) => string) {
  return z.object({
    name: z.string().trim().min(2, t('common.required')).max(200),
    code: z.string().trim().max(40),
    customer_name: z.string().trim().max(200),
    address: z.string().trim().max(500),
    description: z.string().trim().max(4000),
    status: z.enum(['planning', 'active', 'paused', 'completed']),
    planned_start: z.string(),
    planned_end: z.string(),
    area_m2: z
      .string()
      .trim()
      .refine((x) => x === '' || (AREA_RE.test(x) && /[1-9]/.test(x)), t('projects.area_invalid')),
    brigade_percent: z
      .string()
      .trim()
      .refine(
        (x) => x === '' || /^(100|\d{1,2})(\.\d{1,2})?$/.test(x),
        t('projects.brigade_percent_invalid'),
      ),
  });
}
export type ProjectForm = z.infer<ReturnType<typeof projectSchema>>;
export const toProjectBody = (v: ProjectForm) => ({
  name: v.name,
  code: v.code || null,
  customer_name: v.customer_name || null,
  address: v.address || null,
  description: v.description || null,
  status: v.status,
  planned_start: v.planned_start || null,
  planned_end: v.planned_end || null,
  area_m2: v.area_m2 || null,
  brigade_percent: v.brigade_percent || null,
});
export function ProjectFields({ form }: { form: ReturnType<typeof useForm<ProjectForm>> }) {
  const { t } = useT();
  const e = form.formState.errors;
  return (
    <div className="form-grid">
      <Input
        wrapClassName="span-2"
        label={t('projects.name')}
        required
        error={e.name?.message}
        {...form.register('name')}
      />
      <Input
        label={t('projects.code')}
        placeholder="NAV-28"
        error={e.code?.message}
        {...form.register('code')}
      />
      <Select label={t('projects.status')} {...form.register('status')}>
        {projectStatuses.map((s) => (
          <option key={s} value={s}>
            {t(`projects.status.${s}`)}
          </option>
        ))}
      </Select>
      <Input
        label={t('projects.customer')}
        error={e.customer_name?.message}
        {...form.register('customer_name')}
      />
      <Input label={t('projects.address')} error={e.address?.message} {...form.register('address')} />
      <Input type="date" label={t('projects.planned_start')} {...form.register('planned_start')} />
      <Input
        type="date"
        label={t('projects.planned_end')}
        error={e.planned_end?.message}
        {...form.register('planned_end')}
      />
      <Input
        label={t('projects.area_m2')}
        inputMode="decimal"
        placeholder="1250.50"
        error={e.area_m2?.message}
        {...form.register('area_m2')}
      />
      <Input
        label={t('projects.brigade_percent')}
        inputMode="decimal"
        placeholder="20"
        error={e.brigade_percent?.message}
        {...form.register('brigade_percent')}
      />
      <Textarea
        wrapClassName="span-2"
        label={t('projects.description')}
        rows={3}
        {...form.register('description')}
      />
    </div>
  );
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { t } = useT();
  return <Badge tone={statusTone[status]}>{t(`projects.status.${status}`)}</Badge>;
}

/** Figma obyekt kartasi: rasm, nom va holat, manzil, progress, smeta/xarajat va mas'ul. */
function ProjectCard({ p }: { p: Project }) {
  const { t, lang } = useT();
  const image = useImageSrc(p.image_file_id);
  const progress = p.progress_percent == null ? null : Math.round(Number(p.progress_percent));
  return (
    <Link to={`/app/projects/${p.id}`} className="project-card">
      <div className="project-card-media">
        {image ? <img src={image} alt="" /> : <Building2 aria-hidden />}
      </div>
      <div className="project-card-head">
        <h3>{p.name}</h3>
        <ProjectStatusBadge status={p.status} />
      </div>
      <div className="project-card-addr">
        {[p.code, p.address ?? p.customer_name].filter(Boolean).join(' · ') || '—'}
      </div>
      <div className="project-card-progress">
        <span className="row-between">
          <span className="muted">{t('projects.progress')}</span>
          <b>{progress === null ? t('projects.no_progress') : `${progress}%`}</b>
        </span>
        <span className="progress">
          <span style={{ width: `${Math.min(100, progress ?? 0)}%` }} />
        </span>
      </div>
      <div className="project-card-foot">
        {p.plan_total !== undefined ? (
          <span>
            <span className="label">{t('projects.plan_vs_actual')}</span>
            <div className="value">
              {formatMoney(p.plan_total, lang, false)}{' '}
              <small>/ {formatMoney(p.fact_total ?? '0', lang, false)}</small>
            </div>
          </span>
        ) : (
          <span />
        )}
        <span className="project-card-person">
          {p.responsible_name ? (
            <>
              <Avatar name={p.responsible_name} size="sm" />
              <span>{p.responsible_name}</span>
            </>
          ) : (
            <span className="muted">{t('projects.no_responsible')}</span>
          )}
        </span>
      </div>
    </Link>
  );
}

export function ProjectsPage() {
  const { t } = useT();
  const { can } = useAuth();
  const list = useListState();
  const [status, setStatus] = useState<'all' | ProjectStatus>('all');
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ['projects', 'list', list.q, status, list.offset, list.limit],
    queryFn: () =>
      api<ListResponse<Project>>(
        `/v1/projects${qs({
          q: list.q,
          status: status === 'all' ? undefined : status,
          limit: list.limit,
          offset: list.offset,
        })}`,
      ),
  });
  const rows = query.data?.items;
  const createButton = can('projects', 'create') ? (
    <Button icon={<Plus />} onClick={() => setOpen(true)}>
      {t('projects.new')}
    </Button>
  ) : undefined;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader title={t('projects.title')} description={t('projects.sub')} />
      <div className="toolbar blocks-toolbar">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder={t('projects.search')} />
        <Segmented<'all' | ProjectStatus>
          value={status}
          onChange={(s) => {
            setStatus(s);
            list.setOffset(0);
          }}
          items={[
            { key: 'all', label: t('projects.filter_all') },
            ...projectStatuses.map((s) => ({ key: s, label: t(`projects.status.${s}`) })),
          ]}
        />
        <span className="spacer" />
        {createButton}
      </div>
      {query.isError ? (
        <div className="card">
          <ErrorState
            message={errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : !rows ? (
        <div className="skeleton" style={{ height: 160 }} />
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Building2 />}
            title={t('projects.empty')}
            description={can('projects', 'create') ? t('projects.empty_desc') : t('erp.no_project_access')}
            action={createButton}
          />
        </div>
      ) : (
        <>
          <div className="project-grid">
            {rows.map((p) => (
              <ProjectCard key={p.id} p={p} />
            ))}
          </div>
          <div className="card">
            <Pagination
              offset={list.pagination.offset}
              limit={list.pagination.limit}
              count={rows.length}
              onChange={list.pagination.onChange}
              onLimitChange={list.pagination.onLimitChange}
            />
          </div>
        </>
      )}
      <CreateProjectModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function CreateProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<ProjectForm>({
    resolver: zodResolver(projectSchema(t).superRefine((v, ctx) => checkDates(v, ctx, t))),
    defaultValues: {
      name: '',
      code: '',
      customer_name: '',
      address: '',
      description: '',
      status: 'planning',
      planned_start: '',
      planned_end: '',
      area_m2: '',
      brigade_percent: '',
    },
  });
  const create = useMutation({
    mutationFn: (v: ProjectForm) => api<Project>('/v1/projects', { method: 'POST', body: toProjectBody(v) }),
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(t('projects.created'));
      form.reset();
      onClose();
      navigate(`/app/projects/${row.id}`);
    },
    onError: (e: ApiError) => toast.error(errorMessage(t, e.code, e.status)),
  });
  const submit = form.handleSubmit((v) => create.mutate(v));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('projects.new')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <ProjectFields form={form} />
      </form>
    </Modal>
  );
}
