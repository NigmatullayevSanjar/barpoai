import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Archive, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { api, ApiError, type ListResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  Input,
  Modal,
  PageHeader,
  Select,
  Stat,
  Tabs,
  Textarea,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import {
  ProjectFields,
  ProjectStatusBadge,
  projectSchema,
  toProjectBody,
  type ProjectForm,
} from './ProjectsPage';
import type { Employee, Member, ProjectDetail, Zone } from './types';

type Tab = 'overview' | 'zones' | 'members' | 'warehouses';
export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const { t, lang } = useT();
  const { can, me } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
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
  if (query.isError)
    return (
      <Alert tone="danger">
        {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
      </Alert>
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
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader
        breadcrumbs={
          <>
            <Link to="/app/projects">{t('projects.title')}</Link>
            <span>/</span>
            <span>{d.name}</span>
          </>
        }
        title={
          <span className="row">
            {d.name} <ProjectStatusBadge status={d.status} />
          </span>
        }
        description={[d.code, d.customer_name, d.address].filter(Boolean).join(' · ') || undefined}
        actions={
          <>
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
          </>
        }
      />
      <div className="grid-4">
        <Stat
          label={t('projects.counter.open_tasks')}
          value={d.counters.open_tasks}
          sub={`${t('projects.counter.overdue_tasks')}: ${d.counters.overdue_tasks}`}
        />
        <Stat label={t('projects.counter.estimates')} value={d.counters.estimates} />
        <Stat label={t('projects.counter.pending_reports')} value={d.counters.pending_reports} />
        <Stat
          label={t('projects.timeline')}
          value={formatDate(endRef, lang)}
          sub={
            daysToEnd === null
              ? undefined
              : daysToEnd >= 0
                ? t('projects.days_to_end', { n: daysToEnd })
                : t('projects.overdue_by', { n: -daysToEnd })
          }
        />
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { key: 'overview', label: t('projects.tab.overview') },
          { key: 'zones', label: t('projects.tab.zones'), count: d.zones.length },
          { key: 'members', label: t('projects.tab.members'), count: d.members.length },
          { key: 'warehouses', label: t('projects.tab.warehouses'), count: d.warehouses.length },
        ]}
      />
      {tab === 'overview' && <Overview d={d} />}
      {tab === 'zones' && <ZonesTab d={d} canEdit={canEdit} onChange={refresh} />}
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
  const form = useForm<ProjectForm & { forecast_end: string; actual_start: string; actual_end: string }>({
    resolver: zodResolver(
      projectSchema(t).extend({
        forecast_end: projectSchema(t).shape.planned_start,
        actual_start: projectSchema(t).shape.planned_start,
        actual_end: projectSchema(t).shape.planned_start,
      }),
    ),
    defaultValues: {
      name: d.name,
      code: d.code ?? '',
      customer_name: d.customer_name ?? '',
      address: d.address ?? '',
      description: d.description ?? '',
      status: d.status,
      planned_start: d.planned_start ?? '',
      planned_end: d.planned_end ?? '',
      forecast_end: d.forecast_end ?? '',
      actual_start: d.actual_start ?? '',
      actual_end: d.actual_end ?? '',
    },
  });
  const save = useMutation({
    mutationFn: (v: ProjectForm & { forecast_end: string; actual_start: string; actual_end: string }) =>
      api(`/v1/projects/${d.id}`, {
        method: 'PATCH',
        body: {
          ...toProjectBody(v),
          version: d.version,
          forecast_end: v.forecast_end || null,
          actual_start: v.actual_start || null,
          actual_end: v.actual_end || null,
        },
      }),
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
          <Input type="date" label={t('projects.actual_end')} {...form.register('actual_end')} />
          <Input type="date" label={t('projects.forecast_end')} {...form.register('forecast_end')} />
        </div>
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
  const create = useMutation({
    mutationFn: () =>
      api(`/v1/projects/${d.id}/zones`, {
        method: 'POST',
        body: { name, ...(parent ? { parent_id: parent } : {}) },
      }),
    onSuccess: async () => {
      await onChange();
      setOpen(false);
      setName('');
      setParent('');
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
            >
              {depth > 0 && <span className="muted">└ </span>}
              {zone.name}
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
              disabled={name.trim().length < 1}
            >
              {t('common.add')}
            </Button>
          </>
        }
      >
        <div className="stack">
          <Input label={t('projects.zone_name')} value={name} onChange={(e) => setName(e.target.value)} />
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
    </section>
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
    queryFn: () => api<ListResponse<Employee>>('/v1/employees?limit=100'),
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
