import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { api, ApiError, type ListResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import {
  Badge,
  Button,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Textarea,
  useListState,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { statusTone, type Project, type ProjectStatus } from './types';

export const projectStatuses: ProjectStatus[] = ['planning', 'active', 'paused', 'completed'];
export const useProjects = () =>
  useQuery({ queryKey: ['projects'], queryFn: () => api<ListResponse<Project>>('/v1/projects?limit=100') });

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
      <Input type="date" label={t('projects.planned_end')} {...form.register('planned_end')} />
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

export function ProjectsPage() {
  const { t, lang } = useT();
  const { can } = useAuth();
  const navigate = useNavigate();
  const list = useListState();
  const [status, setStatus] = useState<'all' | ProjectStatus>('all');
  const [open, setOpen] = useState(false);
  const query = useProjects();
  const rows = query.data?.items.filter((p) => status === 'all' || p.status === status);
  const columns: Column<Project>[] = [
    {
      key: 'name',
      header: t('projects.name'),
      sortValue: (r) => r.name,
      render: (r) => (
        <>
          <div className="cell-main">{r.name}</div>
          <div className="cell-sub">{[r.code, r.customer_name].filter(Boolean).join(' · ')}</div>
        </>
      ),
    },
    {
      key: 'status',
      header: t('projects.status'),
      sortValue: (r) => r.status,
      render: (r) => <ProjectStatusBadge status={r.status} />,
    },
    {
      key: 'address',
      header: t('projects.address'),
      render: (r) => r.address ?? <span className="muted">—</span>,
    },
    {
      key: 'start',
      header: t('projects.planned_start'),
      sortValue: (r) => r.planned_start ?? '',
      render: (r) => formatDate(r.planned_start, lang),
    },
    {
      key: 'end',
      header: t('projects.planned_end'),
      sortValue: (r) => r.planned_end ?? '',
      render: (r) => formatDate(r.planned_end, lang),
    },
    {
      key: 'forecast',
      header: t('projects.forecast_end'),
      sortValue: (r) => r.forecast_end ?? '',
      render: (r) =>
        r.forecast_end ? (
          <span
            style={{ color: r.planned_end && r.forecast_end > r.planned_end ? 'var(--warning)' : undefined }}
          >
            {formatDate(r.forecast_end, lang)}
          </span>
        ) : (
          <span className="muted">—</span>
        ),
    },
  ];
  const createButton = can('projects', 'create') ? (
    <Button icon={<Plus />} onClick={() => setOpen(true)}>
      {t('projects.new')}
    </Button>
  ) : undefined;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader title={t('projects.title')} description={t('projects.sub')} actions={createButton} />
      <div className="toolbar">
        <SearchInput value={list.search} onChange={list.setSearch} />
        <Select
          aria-label={t('projects.status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="all">{t('common.all')}</option>
          {projectStatuses.map((s) => (
            <option key={s} value={s}>
              {t(`projects.status.${s}`)}
            </option>
          ))}
        </Select>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={query.isLoading}
        error={
          query.error
            ? errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)
            : null
        }
        onRetry={query.refetch}
        onRowClick={(r) => navigate(`/app/projects/${r.id}`)}
        search={{ query: list.search, fields: (r) => [r.name, r.code, r.customer_name, r.address] }}
        empty={{
          title: t('projects.empty'),
          description: can('projects', 'create') ? t('projects.empty_desc') : t('erp.no_project_access'),
          action: createButton,
        }}
      />
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
    resolver: zodResolver(projectSchema(t)),
    defaultValues: {
      name: '',
      code: '',
      customer_name: '',
      address: '',
      description: '',
      status: 'planning',
      planned_start: '',
      planned_end: '',
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
