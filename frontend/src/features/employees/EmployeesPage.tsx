import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Copy, KeyRound, Plus, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { api, ApiError, type ListResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import { employeeRoles, type Role } from '@/lib/permissions';
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Switch,
  Textarea,
  useListState,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import type { Employee, EmployeeDetail, Project, Warehouse } from '@/features/projects/types';

const generatePassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
};
const permissionList = [
  'projects.read',
  'projects.write',
  'estimates.read',
  'estimates.import',
  'estimates.edit',
  'prices.read',
  'stock.read',
  'stock.receive',
  'stock.send',
  'stock.accept',
  'stock.consume',
  'stock.review',
  'stock.reverse',
  'finance.read',
  'finance.allocate',
  'finance.post',
  'finance.reverse',
  'tasks.read',
  'tasks.manage',
  'reports.read',
  'reports.submit',
  'reports.review',
  'files.read',
  'files.write',
  'integrations.read',
  'audit.read',
];

export function EmployeesPage() {
  const { t, lang } = useT();
  const { can } = useAuth();
  const list = useListState();
  const [role, setRole] = useState<'all' | Role>('all');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('active');
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<ListResponse<Employee>>('/v1/employees?limit=100'),
  });
  const rows = query.data?.items.filter(
    (e) => (role === 'all' || e.role === role) && (status === 'all' || (status === 'active') === e.active),
  );
  const columns: Column<Employee>[] = [
    {
      key: 'name',
      header: t('employees.name'),
      sortValue: (r) => r.display_name,
      render: (r) => (
        <>
          <div className="cell-main">{r.display_name}</div>
          <div className="cell-sub mono">
            {r.login}
            {r.phone ? ` · ${r.phone}` : ''}
          </div>
        </>
      ),
    },
    {
      key: 'role',
      header: t('common.role'),
      sortValue: (r) => r.role,
      render: (r) => <Badge tone="brand">{t(`role.${r.role}`)}</Badge>,
    },
    {
      key: 'position',
      header: t('employees.position'),
      render: (r) => r.position ?? <span className="muted">—</span>,
    },
    {
      key: 'projects',
      header: t('employees.projects'),
      render: (r) =>
        r.role === 'tenant_admin' ? (
          <span className="muted">{t('erp.all_projects')}</span>
        ) : r.projects.length ? (
          <span className="pill-list">
            {r.projects.map((p) => (
              <Badge key={p.project_id}>{p.project_name}</Badge>
            ))}
          </span>
        ) : (
          <span style={{ color: 'var(--warning)' }}>—</span>
        ),
    },
    {
      key: 'status',
      header: t('common.status'),
      sortValue: (r) => (r.active ? 1 : 0),
      render: (r) => (
        <span className="row" style={{ gap: 6 }}>
          <Badge tone={r.active ? 'success' : 'neutral'}>
            {r.active ? t('employees.active') : t('employees.inactive')}
          </Badge>
          {r.must_change_password && r.active && (
            <Badge tone="warning">{t('employees.pending_password')}</Badge>
          )}
          {r.telegram_linked && <Badge tone="info">Telegram</Badge>}
        </span>
      ),
    },
    {
      key: 'hired',
      header: t('employees.hired_at'),
      sortValue: (r) => r.hired_at ?? '',
      render: (r) => formatDate(r.hired_at, lang),
    },
  ];
  const createButton = can('employees', 'create') ? (
    <Button icon={<UserPlus />} onClick={() => setCreate(true)}>
      {t('employees.new')}
    </Button>
  ) : undefined;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader title={t('employees.title')} description={t('employees.sub')} actions={createButton} />
      <div className="toolbar">
        <SearchInput value={list.search} onChange={list.setSearch} />
        <Select
          aria-label={t('employees.filter_role')}
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
        >
          <option value="all">{t('common.all')}</option>
          {(['tenant_admin', ...employeeRoles] as Role[]).map((r) => (
            <option key={r} value={r}>
              {t(`role.${r}`)}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t('employees.filter_status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="active">{t('employees.active')}</option>
          <option value="inactive">{t('employees.inactive')}</option>
          <option value="all">{t('common.all')}</option>
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
        onRowClick={(r) => setSelected(r.id)}
        search={{ query: list.search, fields: (r) => [r.display_name, r.login, r.phone, r.position] }}
        empty={{ title: t('employees.empty'), description: t('employees.empty_desc'), action: createButton }}
      />
      <CreateEmployeeModal open={create} onClose={() => setCreate(false)} />
      {selected && <EmployeeDrawer id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function CreateEmployeeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<ListResponse<Project>>('/v1/projects?limit=100'),
    enabled: open,
  });
  const schema = z.object({
    display_name: z.string().trim().min(2, t('common.required')).max(120),
    login: z.string().regex(/^[a-zA-Z0-9._-]{3,64}$/, t('auth.login_name')),
    phone: z.string().trim(),
    role: z.enum(['foreman', 'brigadier', 'warehouse_manager', 'financier', 'accountant', 'manager']),
    position: z.string().trim().max(120),
    hired_at: z.string(),
    password: z.string().min(12, t('auth.password_rules')).max(128),
    project_ids: z.array(z.string()),
  });
  type Form = z.infer<typeof schema>;
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      display_name: '',
      login: '',
      phone: '',
      role: 'foreman',
      position: '',
      hired_at: '',
      password: generatePassword(),
      project_ids: [],
    },
  });
  const [done, setDone] = useState<{ login: string; password: string } | null>(null);
  const create = useMutation({
    mutationFn: (v: Form) =>
      api<Employee>('/v1/employees', {
        method: 'POST',
        body: {
          login: v.login,
          password: v.password,
          display_name: v.display_name,
          role: v.role,
          ...(v.phone ? { phone: v.phone } : {}),
          position: v.position || null,
          hired_at: v.hired_at || null,
          project_ids: v.project_ids,
        },
      }),
    onSuccess: async (_row, v) => {
      await queryClient.invalidateQueries({ queryKey: ['employees'] });
      setDone({ login: v.login, password: v.password });
    },
    onError: (e: ApiError) => {
      const field = e.fields?.[0]?.path?.[0];
      if (field === 'phone') form.setError('phone', { message: t('error.VALIDATION_ERROR') });
      else toast.error(errorMessage(t, e.code, e.status));
    },
  });
  const close = () => {
    setDone(null);
    form.reset({
      display_name: '',
      login: '',
      phone: '',
      role: 'foreman',
      position: '',
      hired_at: '',
      password: generatePassword(),
      project_ids: [],
    });
    onClose();
  };
  const submit = form.handleSubmit((v) => create.mutate(v));
  const selectedProjects = form.watch('project_ids');
  return (
    <Modal
      open={open}
      onClose={close}
      title={t('employees.new')}
      size="lg"
      footer={
        done ? (
          <Button onClick={close}>{t('common.close')}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} loading={create.isPending}>
              {t('common.create')}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="stack">
          <Alert tone="success">{t('employees.created')}</Alert>
          <code style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 6, userSelect: 'all' }}>
            {t('employees.created_password', done)}
          </code>
          <p className="muted text-sm">{t('employees.password_hint')}</p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="form-grid">
          <Input
            label={t('employees.name')}
            required
            error={form.formState.errors.display_name?.message}
            {...form.register('display_name')}
          />
          <Input
            label={t('employees.login')}
            required
            autoComplete="off"
            error={form.formState.errors.login?.message}
            {...form.register('login')}
          />
          <Input
            label={t('common.phone')}
            placeholder="+998 90 123 45 67"
            error={form.formState.errors.phone?.message}
            {...form.register('phone')}
          />
          <Select label={t('common.role')} {...form.register('role')}>
            {employeeRoles.map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </Select>
          <Input label={t('employees.position')} {...form.register('position')} />
          <Input type="date" label={t('employees.hired_at')} {...form.register('hired_at')} />
          <Input
            wrapClassName="span-2"
            label={t('employees.initial_password')}
            hint={t('employees.password_hint')}
            autoComplete="new-password"
            error={form.formState.errors.password?.message}
            suffix={
              <Button
                size="sm"
                variant="ghost"
                icon={<RefreshCw />}
                aria-label={t('employees.generate')}
                onClick={() => form.setValue('password', generatePassword())}
              />
            }
            {...form.register('password')}
          />
          <div className="field span-2">
            <span className="field-label">{t('employees.assign_projects')}</span>
            <div className="pill-list">
              {(projects.data?.items ?? []).map((p) => {
                const on = selectedProjects.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className="checkbox"
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 999,
                      padding: '4px 10px',
                      background: on ? 'var(--brand-50)' : undefined,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) =>
                        form.setValue(
                          'project_ids',
                          e.target.checked
                            ? [...selectedProjects, p.id]
                            : selectedProjects.filter((x) => x !== p.id),
                        )
                      }
                    />
                    {p.name}
                  </label>
                );
              })}
              {projects.data && projects.data.items.length === 0 && (
                <span className="muted text-sm">{t('projects.empty')}</span>
              )}
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

function EmployeeDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, lang } = useT();
  const { me, logout } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['employee', id],
    queryFn: () => api<EmployeeDetail>(`/v1/employees/${id}`),
  });
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<ListResponse<Project>>('/v1/projects?limit=100'),
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['employee', id] }),
      queryClient.invalidateQueries({ queryKey: ['employees'] }),
      queryClient.invalidateQueries({ queryKey: ['project'] }),
    ]);
  const onError = (e: ApiError) =>
    toast.error(
      e.code === 'VERSION_CONFLICT' ? t('common.version_conflict') : errorMessage(t, e.code, e.status),
    );
  const d = query.data;
  const isAdmin = d?.role === 'tenant_admin';
  const schema = z.object({
    display_name: z.string().trim().min(2).max(120),
    phone: z.string().trim(),
    role: z.string(),
    position: z.string().trim().max(120),
    hired_at: z.string(),
    active: z.boolean(),
  });
  type Form = z.infer<typeof schema>;
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    values: d
      ? {
          display_name: d.display_name,
          phone: d.phone ?? '',
          role: d.role,
          position: d.position ?? '',
          hired_at: d.hired_at ?? '',
          active: d.active,
        }
      : undefined,
  });
  const save = useMutation({
    mutationFn: (v: Form) =>
      api(`/v1/employees/${id}`, {
        method: 'PATCH',
        body: {
          version: d!.version,
          display_name: v.display_name,
          role: v.role,
          active: v.active,
          phone: v.phone ? v.phone : null,
          position: v.position || null,
          hired_at: v.hired_at || null,
        },
      }),
    onSuccess: async () => {
      await refresh();
      toast.success(t('employees.saved'));
    },
    onError,
  });
  const [assignProject, setAssignProject] = useState('');
  const [assignWarehouse, setAssignWarehouse] = useState('');
  const warehouses = useQuery({
    queryKey: ['warehouses', assignProject],
    queryFn: () => api<ListResponse<Warehouse>>(`/v1/warehouses?project_id=${assignProject}`),
    enabled: Boolean(assignProject) && d?.role === 'warehouse_manager',
  });
  const assign = useMutation({
    mutationFn: () =>
      api(`/v1/employees/${id}/assignments`, {
        method: 'POST',
        body: { project_id: assignProject, ...(assignWarehouse ? { warehouse_id: assignWarehouse } : {}) },
      }),
    onSuccess: async () => {
      await refresh();
      setAssignProject('');
      setAssignWarehouse('');
    },
    onError,
  });
  const unassign = useMutation({
    mutationFn: (body: { project_id: string; warehouse_id?: string }) =>
      api(`/v1/employees/${id}/assignments`, { method: 'DELETE', body }),
    onSuccess: refresh,
    onError,
  });
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const reset = useMutation({
    mutationFn: () => api<{ token: string }>(`/v1/employees/${id}/reset`, { method: 'POST' }),
    onSuccess: (r) => {
      setResetLink(`${location.origin}/reset-password#token=${r.token}`);
      setCopied(false);
    },
    onError,
  });
  const override = useMutation({
    mutationFn: (body: { permission: string; effect: 'grant' | 'deny' | 'inherit' }) =>
      api(`/v1/employees/${id}/permissions`, { method: 'POST', body }),
    onSuccess: refresh,
    onError,
  });
  const [ownership, setOwnership] = useState(false);
  const [ownershipRole, setOwnershipRole] = useState<string>('manager');
  const [ownershipReason, setOwnershipReason] = useState('');
  const transfer = useMutation({
    mutationFn: () =>
      api('/v1/company/ownership', {
        method: 'POST',
        body: { new_admin_id: id, previous_admin_role: ownershipRole, reason: ownershipReason },
      }),
    onSuccess: async () => {
      toast.success(t('employees.ownership_done'));
      await logout();
    },
    onError,
  });
  const assignedIds = new Set(d?.projects.map((p) => p.id));
  return (
    <Modal
      open
      onClose={onClose}
      drawer
      title={d?.display_name ?? t('employees.edit')}
      description={d ? `${d.login}${d.phone ? ` · ${d.phone}` : ''}` : undefined}
    >
      {query.isError && (
        <Alert tone="danger">
          {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
        </Alert>
      )}
      {d && (
        <div className="stack" style={{ gap: 20 }}>
          <form className="stack" onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
            <div className="form-grid">
              <Input
                label={t('employees.name')}
                error={form.formState.errors.display_name?.message}
                {...form.register('display_name')}
              />
              <Input label={t('common.phone')} {...form.register('phone')} />
              <Select label={t('common.role')} disabled={isAdmin} {...form.register('role')}>
                {isAdmin ? (
                  <option value="tenant_admin">{t('role.tenant_admin')}</option>
                ) : (
                  employeeRoles.map((r) => (
                    <option key={r} value={r}>
                      {t(`role.${r}`)}
                    </option>
                  ))
                )}
              </Select>
              <Input label={t('employees.position')} {...form.register('position')} />
              <Input type="date" label={t('employees.hired_at')} {...form.register('hired_at')} />
              <div className="field">
                <span className="field-label">{t('common.status')}</span>
                <Switch
                  checked={form.watch('active') ?? false}
                  disabled={isAdmin}
                  onChange={(v) => form.setValue('active', v, { shouldDirty: true })}
                  label={form.watch('active') ? t('employees.active') : t('employees.inactive')}
                />
              </div>
            </div>
            <p className="muted text-xs">{t('employees.role_change_note')}</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Button type="submit" loading={save.isPending} disabled={isAdmin}>
                {t('common.save')}
              </Button>
            </div>
          </form>

          {!isAdmin && (
            <section className="card">
              <div className="card-header">
                <h3>{t('employees.assignments')}</h3>
              </div>
              <div className="card-pad stack">
                {d.projects.length === 0 && <Alert tone="warning">{t('employees.no_assignments')}</Alert>}
                {d.projects.map((p) => (
                  <div key={p.id} className="row-between">
                    <span>
                      <span style={{ fontWeight: 500 }}>{p.name}</span>
                      {p.warehouses.length > 0 && (
                        <span className="pill-list" style={{ marginTop: 4 }}>
                          {p.warehouses.map((w) => (
                            <Badge key={w.id}>
                              {w.name}
                              <button
                                type="button"
                                aria-label={t('common.delete')}
                                style={{
                                  border: 0,
                                  background: 'none',
                                  padding: 0,
                                  marginLeft: 4,
                                  cursor: 'pointer',
                                }}
                                onClick={() => unassign.mutate({ project_id: p.id, warehouse_id: w.id })}
                              >
                                ×
                              </button>
                            </Badge>
                          ))}
                        </span>
                      )}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 />}
                      aria-label={t('projects.member_remove')}
                      onClick={() => unassign.mutate({ project_id: p.id })}
                    />
                  </div>
                ))}
                <div className="row wrap" style={{ alignItems: 'flex-end' }}>
                  <Select
                    wrapClassName="grow"
                    label={t('employees.add_assignment')}
                    value={assignProject}
                    onChange={(e) => {
                      setAssignProject(e.target.value);
                      setAssignWarehouse('');
                    }}
                  >
                    <option value="">—</option>
                    {(projects.data?.items ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {assignedIds.has(p.id) ? '✓ ' : ''}
                        {p.name}
                      </option>
                    ))}
                  </Select>
                  {d.role === 'warehouse_manager' && assignProject && (
                    <Select
                      wrapClassName="grow"
                      label={t('employees.warehouses')}
                      value={assignWarehouse}
                      onChange={(e) => setAssignWarehouse(e.target.value)}
                    >
                      <option value="">—</option>
                      {(warehouses.data?.items ?? []).map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </Select>
                  )}
                  <Button
                    icon={<Plus />}
                    disabled={!assignProject}
                    loading={assign.isPending}
                    onClick={() => assign.mutate()}
                  >
                    {t('common.add')}
                  </Button>
                </div>
              </div>
            </section>
          )}

          {!isAdmin && (
            <section className="card">
              <div className="card-header">
                <h3>{t('employees.reset')}</h3>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<KeyRound />}
                  loading={reset.isPending}
                  onClick={() => reset.mutate()}
                >
                  {t('employees.reset_create')}
                </Button>
              </div>
              <div className="card-pad stack">
                <p className="muted text-sm">{t('employees.reset_hint')}</p>
                {resetLink && (
                  <div className="row">
                    <code className="text-xs grow" style={{ wordBreak: 'break-all' }}>
                      {resetLink}
                    </code>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={copied ? <Check /> : <Copy />}
                      onClick={async () => {
                        await navigator.clipboard.writeText(resetLink).catch(() => undefined);
                        setCopied(true);
                      }}
                    >
                      {copied ? t('common.copied') : t('common.copy')}
                    </Button>
                  </div>
                )}
              </div>
            </section>
          )}

          {!isAdmin && me?.role === 'tenant_admin' && (
            <section className="card">
              <div className="card-header">
                <h3>{t('employees.overrides')}</h3>
              </div>
              <div className="card-pad stack">
                <p className="muted text-sm">{t('employees.overrides_hint')}</p>
                <div className="table-wrap">
                  <table className="table table-dense">
                    <tbody>
                      {permissionList.map((p) => {
                        const current = d.overrides.find((o) => o.permission === p)?.effect ?? 'inherit';
                        const effective = d.effective_permissions.includes(p);
                        return (
                          <tr key={p}>
                            <td className="mono">{p}</td>
                            <td>
                              <Badge tone={effective ? 'success' : 'neutral'}>
                                {effective ? t('common.yes') : t('common.no')}
                              </Badge>
                            </td>
                            <td style={{ width: 150 }}>
                              <select
                                className="select"
                                style={{ height: 30 }}
                                value={current}
                                onChange={(e) =>
                                  override.mutate({
                                    permission: p,
                                    effect: e.target.value as 'grant' | 'deny' | 'inherit',
                                  })
                                }
                              >
                                <option value="inherit">{t('employees.override.inherit')}</option>
                                <option value="grant">{t('employees.override.grant')}</option>
                                <option value="deny">{t('employees.override.deny')}</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {!isAdmin && me?.role === 'tenant_admin' && d.active && (
            <section className="card">
              <div className="card-header">
                <h3>{t('employees.ownership')}</h3>
                <Button size="sm" variant="danger" onClick={() => setOwnership(true)}>
                  {t('employees.ownership')}
                </Button>
              </div>
              <div className="card-pad">
                <p className="muted text-sm">{t('employees.ownership_hint')}</p>
              </div>
            </section>
          )}
        </div>
      )}
      <ConfirmDialog
        open={ownership}
        onClose={() => setOwnership(false)}
        onConfirm={() => transfer.mutate()}
        title={t('employees.ownership')}
        danger
        loading={transfer.isPending}
        message={
          <div className="stack">
            <p>{t('employees.ownership_hint')}</p>
            <Select
              label={t('employees.ownership_role')}
              value={ownershipRole}
              onChange={(e) => setOwnershipRole(e.target.value)}
            >
              {employeeRoles.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}`)}
                </option>
              ))}
            </Select>
            <Textarea
              label={t('common.reason')}
              hint={t('common.reason_hint')}
              value={ownershipReason}
              onChange={(e) => setOwnershipReason(e.target.value)}
            />
          </div>
        }
      />
      <span className="sr-only">{lang}</span>
    </Modal>
  );
}
