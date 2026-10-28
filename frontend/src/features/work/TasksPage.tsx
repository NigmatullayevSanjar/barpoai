import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, Pencil, Plus } from 'lucide-react';
import { api, ApiError, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatDateTime, formatMoney, formatQuantity } from '@/lib/format';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
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
import { DataTable, type Column } from '@/components/ui/DataTable';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { ProjectSelect, useProjectSelection } from '@/features/common/ProjectSelect';
import { ExportButton } from '@/features/common/ExportButton';
import { useZones } from '@/features/estimates/model';
import type { Employee } from '@/features/projects/types';
import { PhotoGallery } from './Files';
import {
  daysUntil,
  priorities,
  priorityTone,
  statusTone,
  taskStatuses,
  useTask,
  useTasks,
  useWorkMutation,
  type Priority,
  type Task,
  type TaskStatus,
} from './model';

const useMembers = (projectId: string) =>
  useQuery({
    queryKey: ['project', projectId],
    queryFn: () =>
      api<{ members: { id: string; display_name: string; role: string; active: boolean }[] }>(
        `/v1/projects/${projectId}`,
      ),
    enabled: Boolean(projectId),
  });

/** Figma daraja belgisi: to'ldirilgan rangli pill. */
function PriorityBadge({ priority }: { priority: Priority }) {
  const { t } = useT();
  const tone = priorityTone[priority];
  return (
    <span className={`badge badge-fill badge-${tone === 'neutral' ? 'neutral' : tone}`}>
      {t(`tasks.priority.${priority}`)}
    </span>
  );
}

/** Vazifalar sahifasi (Figma "Vazifalar va ish rejalari"): filtr kartasi, Kanban yoki jadval, vazifa oynasi. */
export function TasksPage() {
  const { t, lang } = useT();
  const { can } = useAuth();
  const sel = useProjectSelection();
  const list = useListState();
  const [view, setView] = useState<'board' | 'table'>('board');
  const [mine, setMine] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [priority, setPriority] = useState<'' | Priority>('');
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const query = useTasks(
    sel.projectId,
    { ...(status ? { status } : {}), ...(mine ? { mine: true } : {}) },
    { offset: list.offset, limit: list.limit },
  );
  // Qidiruv va daraja filtri sahifadagi qatorlar ustida (ro'yxat API'sida q yo'q).
  const needle = list.q.toLocaleLowerCase();
  const tasks = (query.data?.items ?? []).filter(
    (x) =>
      (!priority || x.priority === priority) &&
      (!needle ||
        [x.title, x.assignee_name, x.zone_name, x.estimate_line_name].some((f) =>
          (f ?? '').toLocaleLowerCase().includes(needle),
        )),
  );
  const Deadline = ({ task }: { task: Task }) => {
    if (!task.deadline) return <span className="muted">—</span>;
    const d = daysUntil(task.deadline)!;
    const color =
      task.status === 'accepted'
        ? undefined
        : d < 0
          ? 'var(--danger)'
          : d <= 2
            ? 'var(--warning)'
            : undefined;
    return (
      <span style={{ color }}>
        {formatDate(task.deadline, lang)}
        {task.status !== 'accepted' && (
          <small style={{ display: 'block' }}>
            {d < 0
              ? t('tasks.days_over', { n: -d })
              : d === 0
                ? t('tasks.due_today')
                : t('tasks.days_left', { n: d })}
          </small>
        )}
      </span>
    );
  };
  const columns: Column<Task>[] = [
    {
      key: 'title',
      header: t('tasks.task'),
      sortValue: (r) => r.title,
      render: (r) => (
        <>
          <div className="cell-main">{r.title}</div>
          <div className="cell-sub">
            {[
              r.estimate_line_name
                ? `${r.estimate_line_name}${r.estimate_percent ? ` · ${r.estimate_percent} %` : ''}`
                : null,
              r.zone_name,
              r.file_count ? `📎 ${r.file_count}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </>
      ),
    },
    {
      key: 'status',
      header: t('common.status'),
      sortValue: (r) => r.status,
      render: (r) => <Badge tone={statusTone[r.status]}>{t(`tasks.status.${r.status}`)}</Badge>,
    },
    {
      key: 'priority',
      header: t('tasks.priority'),
      sortValue: (r) => priorities.indexOf(r.priority),
      render: (r) => <PriorityBadge priority={r.priority} />,
    },
    {
      key: 'assignee',
      header: t('tasks.assignee'),
      sortValue: (r) => r.assignee_name,
      render: (r) => r.assignee_name,
    },
    { key: 'reviewer', header: t('tasks.reviewer'), render: (r) => r.reviewer_name },
    {
      key: 'deadline',
      header: t('tasks.deadline'),
      sortValue: (r) => r.deadline ?? '9',
      render: (r) => <Deadline task={r} />,
    },
  ];
  const columnsShown = taskStatuses.filter((s) =>
    status === '' || status === 'open' ? s !== 'accepted' || status === '' : s === status,
  );
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader title={t('tasks.title')} description={t('tasks.sub')} />
      <div className="toolbar blocks-toolbar">
        <ProjectSelect
          value={sel.projectId}
          onChange={(id) => {
            sel.setProjectId(id);
            list.setOffset(0);
          }}
          projects={sel.projects}
        />
        <SearchInput value={list.search} onChange={list.setSearch} placeholder={t('tasks.search')} />
        <Select
          aria-label={t('common.status')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            list.setOffset(0);
          }}
        >
          <option value="">{t('tasks.all')}</option>
          <option value="open">{t('stock.status.open')}</option>
          {taskStatuses.map((s) => (
            <option key={s} value={s}>
              {t(`tasks.status.${s}`)}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t('tasks.filter_priority')}
          value={priority}
          onChange={(e) => setPriority(e.target.value as typeof priority)}
        >
          <option value="">{t('tasks.all_priorities')}</option>
          {priorities.map((p) => (
            <option key={p} value={p}>
              {t(`tasks.priority.${p}`)}
            </option>
          ))}
        </Select>
        {can('tasks', 'update') && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={mine}
              onChange={(e) => {
                setMine(e.target.checked);
                list.setOffset(0);
              }}
            />{' '}
            {t('tasks.mine')}
          </label>
        )}
        <Segmented<'board' | 'table'>
          value={view}
          onChange={setView}
          items={[
            { key: 'board', label: t('tasks.view.board') },
            { key: 'table', label: t('tasks.view.table') },
          ]}
        />
        <span className="spacer" />
        {sel.projectId && (
          <>
            <ExportButton
              path={`/v1/tasks/export${qs({ project_id: sel.projectId, status: status || undefined, mine: mine || undefined })}`}
            />
            {can('tasks', 'create') && (
              <Button icon={<Plus />} onClick={() => setCreate(true)}>
                {t('tasks.new')}
              </Button>
            )}
          </>
        )}
      </div>
      {query.isError && (
        <Alert tone="danger">
          {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
        </Alert>
      )}
      {view === 'board' ? (
        <div className="kanban">
          {columnsShown.map((s) => {
            const col = tasks.filter((x) => x.status === s);
            const tone = statusTone[s];
            const dotColor =
              tone === 'success'
                ? '#16a34a'
                : tone === 'warning'
                  ? '#f97316'
                  : tone === 'danger'
                    ? '#e11d48'
                    : tone === 'info'
                      ? '#2563eb'
                      : '#e11d48';
            return (
              <section key={s} className="kanban-col">
                <header>
                  <span>
                    <span className="kanban-dot" style={{ color: dotColor }} aria-hidden />
                    {t(`tasks.status.${s}`)}
                  </span>
                  <span className="kanban-count">{col.length}</span>
                </header>
                {col.length === 0 && (
                  <p className="muted text-xs" style={{ padding: 8 }}>
                    {t('tasks.empty')}
                  </p>
                )}
                {col.map((task) => (
                  <button key={task.id} className="kanban-card" onClick={() => setSelected(task.id)}>
                    <div className="row-between">
                      <PriorityBadge priority={task.priority} />
                      <small className="muted">
                        {task.deadline ? formatDate(task.deadline, lang) : t('tasks.no_deadline')}
                      </small>
                    </div>
                    <b>{task.title}</b>
                    {task.estimate_line_name && (
                      <small className="muted truncate">
                        {task.estimate_line_name}
                        {task.estimate_percent ? ` · ${task.estimate_percent} %` : ''}
                      </small>
                    )}
                    <div className="kanban-card-foot">
                      <span className="truncate">{task.zone_name ?? ''}</span>
                      <span className="row">
                        <Avatar name={task.assignee_name} size="sm" />
                        <span className="truncate">{task.assignee_name}</span>
                      </span>
                    </div>
                    {task.overdue && <Badge tone="danger">{t('tasks.overdue')}</Badge>}
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={tasks}
          rowKey={(r) => r.id}
          loading={query.isLoading}
          onRowClick={(r) => setSelected(r.id)}
          pagination={list.pagination}
          empty={{ title: t('tasks.empty'), description: t('tasks.empty_desc') }}
        />
      )}
      {view === 'board' && !query.isError && (
        <div className="card">
          <Pagination
            offset={list.offset}
            limit={list.limit}
            count={query.data?.items.length ?? 0}
            onChange={list.setOffset}
            onLimitChange={list.setLimit}
          />
        </div>
      )}
      {create && <TaskModal projectId={sel.projectId} onClose={() => setCreate(false)} />}
      {selected && <TaskDrawer id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

type EstimateLineOption = {
  id: string;
  description: string;
  unit_id: string;
  effective_quantity: string;
  estimate_name: string;
};
function TaskModal({ projectId, task, onClose }: { projectId: string; task?: Task; onClose: () => void }) {
  const { t } = useT();
  const { can } = useAuth();
  const members = useMembers(projectId);
  const zones = useZones(projectId);
  const [form, setForm] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    assignee_id: task?.assignee_id ?? '',
    reviewer_id: task?.reviewer_id ?? '',
    priority: task?.priority ?? 'normal',
    deadline: task?.deadline ? task.deadline.slice(0, 16) : '',
    zone_id: task?.zone_id ?? '',
    estimate_line_id: task?.estimate_line_id ?? '',
    planned_start: task?.planned_start ?? '',
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const same = form.assignee_id && form.assignee_id === form.reviewer_id;
  const save = useWorkMutation(
    () => {
      const deadline = form.deadline ? new Date(form.deadline).toISOString() : null;
      return task
        ? api(`/v1/tasks/${task.id}`, {
            method: 'PATCH',
            body: {
              version: task.version,
              title: form.title.trim(),
              assignee_id: form.assignee_id,
              reviewer_id: form.reviewer_id,
              deadline,
              description: form.description.trim() || null,
              zone_id: form.zone_id || null,
              priority: form.priority,
              estimate_line_id: form.estimate_line_id || null,
              planned_start: form.planned_start || null,
            },
          })
        : api('/v1/tasks', {
            method: 'POST',
            body: {
              project_id: projectId,
              title: form.title.trim(),
              assignee_id: form.assignee_id,
              reviewer_id: form.reviewer_id,
              priority: form.priority,
              ...(deadline ? { deadline } : {}),
              ...(form.zone_id ? { zone_id: form.zone_id } : {}),
              ...(form.description.trim() ? { description: form.description.trim() } : {}),
              ...(form.estimate_line_id ? { estimate_line_id: form.estimate_line_id } : {}),
              ...(form.planned_start ? { planned_start: form.planned_start } : {}),
            },
          });
    },
    onClose,
    task ? 'tasks.saved' : 'tasks.created',
  );
  const people = (members.data?.members ?? []).filter((m) => m.active);
  return (
    <Modal
      open
      onClose={onClose}
      title={task ? t('tasks.edit') : t('tasks.new')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => save.mutate(undefined)}
            loading={save.isPending}
            disabled={!form.title.trim() || !form.assignee_id || !form.reviewer_id || Boolean(same)}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Input
          wrapClassName="span-2"
          label={t('tasks.task')}
          required
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
        />
        <Select
          label={t('tasks.assignee')}
          required
          value={form.assignee_id}
          onChange={(e) => set('assignee_id', e.target.value)}
        >
          <option value="">—</option>
          {people.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name} · {t(`role.${m.role}`)}
            </option>
          ))}
        </Select>
        <Select
          label={t('tasks.reviewer')}
          required
          value={form.reviewer_id}
          onChange={(e) => set('reviewer_id', e.target.value)}
          error={same ? t('tasks.self_review') : undefined}
        >
          <option value="">—</option>
          {people.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name} · {t(`role.${m.role}`)}
            </option>
          ))}
        </Select>
        <Select
          label={t('tasks.priority')}
          value={form.priority}
          onChange={(e) => set('priority', e.target.value)}
        >
          {priorities.map((p) => (
            <option key={p} value={p}>
              {t(`tasks.priority.${p}`)}
            </option>
          ))}
        </Select>
        <Input
          type="datetime-local"
          label={t('tasks.deadline')}
          value={form.deadline}
          onChange={(e) => set('deadline', e.target.value)}
        />
        <Select label={t('stock.zone')} value={form.zone_id} onChange={(e) => set('zone_id', e.target.value)}>
          <option value="">—</option>
          {(zones.data?.items ?? []).map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          label={t('tasks.planned_start')}
          value={form.planned_start}
          onChange={(e) => set('planned_start', e.target.value)}
        />
        {can('estimates') && (
          <SearchSelect<EstimateLineOption>
            wrapClassName="span-2"
            path="/v1/estimate-lines"
            params={{ project_id: projectId }}
            label={t('tasks.estimate_line')}
            hint={t('tasks.estimate_line_hint')}
            value={form.estimate_line_id}
            valueLabel={task?.estimate_line_name ?? undefined}
            onChange={(id) => set('estimate_line_id', id)}
            getId={(l) => l.id}
            getLabel={(l) => l.description}
            getSub={(l) => `${formatQuantity(l.effective_quantity, l.unit_id)} · ${l.estimate_name}`}
          />
        )}
        <Textarea
          wrapClassName="span-2"
          label={t('tasks.description')}
          rows={3}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </div>
    </Modal>
  );
}

/** Vazifa oynasi (Figma "vazifani ko'rish"): ma'lumotlar kartasi, amallar, fayllar, tarix. */
function TaskDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, lang } = useT();
  const { me, can } = useAuth();
  const query = useTask(id);
  const d = query.data;
  const [note, setNote] = useState('');
  const [edit, setEdit] = useState(false);
  const [archive, setArchive] = useState(false);
  const [reason, setReason] = useState('');
  const transition = useWorkMutation(
    (status: TaskStatus) =>
      api(`/v1/tasks/${id}/transition`, {
        method: 'POST',
        body: { version: d!.version, status, ...(note.trim() ? { note: note.trim() } : {}) },
      }),
    () => setNote(''),
  );
  const archiveM = useWorkMutation(
    () => api(`/v1/tasks/${id}`, { method: 'DELETE', body: { version: d!.version, reason: reason.trim() } }),
    onClose,
  );
  if (!d)
    return (
      <Modal open onClose={onClose} drawer title={t('tasks.task')}>
        {query.isError ? (
          <Alert tone="danger">
            {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
          </Alert>
        ) : (
          <p className="muted">{t('common.loading')}</p>
        )}
      </Modal>
    );
  const isAssignee = d.assignee_id === me?.id;
  const isReviewer = d.reviewer_id === me?.id || me?.role === 'tenant_admin';
  const open = d.status !== 'accepted';
  const canManage = can('tasks', 'update') && !['accepted', 'submitted'].includes(d.status);
  return (
    <Modal
      open
      onClose={onClose}
      drawer
      title={d.title}
      description={`${d.project_name}${d.zone_name ? ` · ${d.zone_name}` : ''}`}
    >
      <div className="stack" style={{ gap: 16 }}>
        <div className="row wrap" style={{ gap: 6 }}>
          <Badge tone={statusTone[d.status]}>{t(`tasks.status.${d.status}`)}</Badge>
          <PriorityBadge priority={d.priority} />
          {d.overdue && <Badge tone="danger">{t('tasks.overdue')}</Badge>}
        </div>
        <div className="card card-pad">
          <dl className="block-facts">
            <div>
              <dt>{t('tasks.assignee')}</dt>
              <dd>{d.assignee_name}</dd>
            </div>
            <div>
              <dt>{t('tasks.reviewer')}</dt>
              <dd>{d.reviewer_name}</dd>
            </div>
            <div>
              <dt>{t('tasks.deadline')}</dt>
              <dd>{d.deadline ? formatDateTime(d.deadline, lang) : t('tasks.no_deadline')}</dd>
            </div>
            {d.planned_start && (
              <div>
                <dt>{t('tasks.planned_start')}</dt>
                <dd>{formatDate(d.planned_start, lang)}</dd>
              </div>
            )}
            {d.estimate_line_name && (
              <div>
                <dt>{t('tasks.estimate_line')}</dt>
                <dd>
                  {d.estimate_line_name}{' '}
                  {d.estimate_line_archived && (
                    <Badge tone="warning">{t('tasks.estimate_old_revision')}</Badge>
                  )}
                  <small className="muted" style={{ display: 'block' }}>
                    {t('tasks.estimate_plan')}: {formatQuantity(d.estimate_plan_quantity, d.estimate_unit)} ·{' '}
                    {t('tasks.estimate_fact')}: {formatQuantity(d.estimate_fact_quantity, d.estimate_unit)}
                    {d.estimate_percent ? ` (${d.estimate_percent} %)` : ''}
                    {d.estimate_fact_value
                      ? ` · ${t('tasks.estimate_consumed')}: ${formatMoney(d.estimate_fact_value, lang)}`
                      : ''}
                  </small>
                </dd>
              </div>
            )}
            <div>
              <dt>{t('tasks.created_by')}</dt>
              <dd>
                {d.created_by_name}
                <small className="muted"> · {formatDateTime(d.created_at, lang)}</small>
              </dd>
            </div>
          </dl>
          {d.description && <p style={{ whiteSpace: 'pre-wrap', marginTop: 14 }}>{d.description}</p>}
        </div>
        {open && (isAssignee || isReviewer) && (
          <section className="card card-pad stack">
            <Textarea
              label={t('tasks.note')}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="row wrap">
              {isAssignee && (d.status === 'todo' || d.status === 'returned') && (
                <Button onClick={() => transition.mutate('in_progress')} loading={transition.isPending}>
                  {t('tasks.start')}
                </Button>
              )}
              {isAssignee && (d.status === 'in_progress' || d.status === 'returned') && (
                <Button onClick={() => transition.mutate('submitted')} loading={transition.isPending}>
                  {t('tasks.submit')}
                </Button>
              )}
              {isReviewer && d.status === 'submitted' && (
                <Button onClick={() => transition.mutate('accepted')} loading={transition.isPending}>
                  {t('tasks.accept')}
                </Button>
              )}
              {isReviewer && d.status === 'submitted' && (
                <Button
                  variant="danger"
                  disabled={note.trim().length < 5}
                  onClick={() => transition.mutate('returned')}
                  loading={transition.isPending}
                >
                  {t('tasks.return')}
                </Button>
              )}
            </div>
            {isReviewer && d.status === 'submitted' && (
              <p className="muted text-xs">
                {t('tasks.return_reason')}: {t('common.reason_hint')}
              </p>
            )}
          </section>
        )}
        <section>
          <h3 style={{ marginBottom: 8 }}>{t('tasks.files')}</h3>
          <PhotoGallery
            files={d.files}
            projectId={d.project_id}
            taskId={d.id}
            canUpload={open && (isAssignee || isReviewer || can('tasks', 'update'))}
            canDelete={can('tasks', 'update')}
          />
        </section>
        <section>
          <h3 style={{ marginBottom: 8 }}>{t('tasks.history')}</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }} className="text-sm">
            {d.history.map((h, i) => (
              <li key={i}>
                <span className="muted">{formatDateTime(h.created_at, lang)}</span> · {h.actor_name ?? '—'} ·{' '}
                <code>{h.action}</code>
                {typeof h.details?.note === 'string' && h.details.note ? (
                  <span> — {h.details.note}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
        {(canManage || can('tasks', 'delete')) && (
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            {canManage && (
              <Button variant="secondary" icon={<Pencil />} onClick={() => setEdit(true)}>
                {t('common.edit')}
              </Button>
            )}
            {can('tasks', 'delete') && !['accepted', 'submitted'].includes(d.status) && (
              <Button variant="ghost" icon={<Archive />} onClick={() => setArchive(true)}>
                {t('tasks.archive')}
              </Button>
            )}
          </div>
        )}
      </div>
      {edit && <TaskModal projectId={d.project_id} task={d} onClose={() => setEdit(false)} />}
      <ConfirmDialog
        open={archive}
        onClose={() => setArchive(false)}
        onConfirm={() => archiveM.mutate(undefined)}
        title={t('tasks.archive')}
        danger
        loading={archiveM.isPending}
        message={
          <div className="stack">
            <p>{t('tasks.archive_confirm')}</p>
            <Textarea
              label={t('common.reason')}
              hint={t('common.reason_hint')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        }
      />
    </Modal>
  );
}
export type { Employee };
