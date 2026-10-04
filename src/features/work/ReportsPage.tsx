import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, Plus } from 'lucide-react';
import { api, ApiError, type ListResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatDateTime, formatQuantity, todayIso } from '@/lib/format';
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
  Textarea,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ProjectSelect, useProjectSelection } from '@/features/common/ProjectSelect';
import { normalizeNumber, useZones } from '@/features/estimates/model';
import { PhotoGallery } from './Files';
import { reportTone, useReport, useReports, useWorkMutation, type Report } from './model';

type WorkLine = {
  id: string;
  description: string;
  unit_id: string;
  effective_quantity: string;
  zone_name: string | null;
  estimate_name: string;
  fact_quantity: string;
};
/** Obyektning ish (material bo'lmagan) smeta qatorlari — narxsiz, hisobot yuboruvchi uchun ochiq */
function useWorkLines(projectId: string, enabled: boolean) {
  const query = useQuery({
    queryKey: ['work-lines', projectId],
    queryFn: () => api<ListResponse<WorkLine>>(`/v1/projects/${projectId}/work-lines`),
    enabled: enabled && Boolean(projectId),
  });
  return { lines: query.data?.items ?? [], loaded: query.isFetched };
}

export function ReportsPage() {
  const { t, lang } = useT();
  const { can } = useAuth();
  const sel = useProjectSelection();
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const query = useReports(sel.projectId, { ...(status ? { status } : {}), ...(kind ? { kind } : {}) });
  const rows = query.data?.items ?? [];
  const columns: Column<Report>[] = [
    {
      key: 'date',
      header: t('reports.date'),
      sortValue: (r) => r.report_date,
      render: (r) => (
        <>
          <div>{formatDate(r.report_date, lang)}</div>
          <div className="cell-sub">{t(`reports.kind.${r.kind}`)}</div>
        </>
      ),
    },
    {
      key: 'author',
      header: t('reports.author'),
      sortValue: (r) => r.author_name,
      render: (r) => r.author_name,
    },
    {
      key: 'content',
      header: t('reports.content'),
      render: (r) => (
        <>
          <div style={{ maxWidth: 420, whiteSpace: 'pre-line' }}>
            {r.content.length > 140 ? r.content.slice(0, 140) + '…' : r.content}
          </div>
          <div className="cell-sub">
            {[r.zone_name, r.file_count ? `📷 ${r.file_count}` : null].filter(Boolean).join(' · ')}
          </div>
        </>
      ),
    },
    {
      key: 'progress',
      header: t('reports.progress'),
      render: (r) =>
        r.estimate_line_name ? (
          <>
            <div>{formatQuantity(r.progress_quantity, r.estimate_unit)}</div>
            <div className="cell-sub">{r.estimate_line_name}</div>
          </>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'status',
      header: t('common.status'),
      sortValue: (r) => r.status,
      render: (r) => <Badge tone={reportTone[r.status]}>{t(`reports.status.${r.status}`)}</Badge>,
    },
  ];
  const pending = rows.filter((r) => r.status === 'submitted').length;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader
        title={t('reports.title')}
        description={t('reports.sub')}
        actions={
          can('reports', 'create') && sel.projectId ? (
            <Button icon={<Plus />} onClick={() => setCreate(true)}>
              {t('reports.new')}
            </Button>
          ) : undefined
        }
      />
      <div className="toolbar">
        <ProjectSelect value={sel.projectId} onChange={sel.setProjectId} projects={sel.projects} />
        <Select aria-label={t('reports.kind')} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">{t('common.all')}</option>
          <option value="daily">{t('reports.kind.daily')}</option>
          <option value="weekly">{t('reports.kind.weekly')}</option>
        </Select>
        <Select aria-label={t('common.status')} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('common.all')}</option>
          {(['submitted', 'returned', 'accepted'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`reports.status.${s}`)}
            </option>
          ))}
        </Select>
        {pending > 0 && (
          <Badge tone="warning">
            {t('reports.pending')}: {pending}
          </Badge>
        )}
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
        empty={{ title: t('reports.empty'), description: t('reports.empty_desc') }}
      />
      {create && (
        <ReportModal
          projectId={sel.projectId}
          onClose={() => setCreate(false)}
          onCreated={(id) => {
            setCreate(false);
            setSelected(id);
          }}
        />
      )}
      {selected && <ReportDrawer id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ReportModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useT();
  const zones = useZones(projectId);
  const { lines, loaded } = useWorkLines(projectId, true);
  const [form, setForm] = useState({
    kind: 'daily',
    report_date: todayIso(),
    zone_id: '',
    content: '',
    estimate_line_id: '',
    progress_quantity: '',
    forecast_end: '',
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const line = lines.find((l) => l.id === form.estimate_line_id);
  const save = useWorkMutation(
    () =>
      api<{ id: string }>('/v1/reports', {
        method: 'POST',
        body: {
          project_id: projectId,
          kind: form.kind,
          report_date: form.report_date,
          content: form.content.trim(),
          ...(form.zone_id ? { zone_id: form.zone_id } : {}),
          ...(form.estimate_line_id && form.progress_quantity
            ? {
                estimate_line_id: form.estimate_line_id,
                progress_quantity: normalizeNumber(form.progress_quantity),
              }
            : {}),
          ...(form.forecast_end ? { forecast_end: form.forecast_end } : {}),
        },
      }),
    (r) => onCreated((r as { id: string }).id),
    'reports.created',
  );
  const progressPair = Boolean(form.estimate_line_id) === Boolean(form.progress_quantity);
  return (
    <Modal
      open
      onClose={onClose}
      title={t('reports.new')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => save.mutate(undefined)}
            loading={save.isPending}
            disabled={form.content.trim().length < 5 || !progressPair}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Select label={t('reports.kind')} value={form.kind} onChange={(e) => set('kind', e.target.value)}>
          <option value="daily">{t('reports.kind.daily')}</option>
          <option value="weekly">{t('reports.kind.weekly')}</option>
        </Select>
        <Input
          type="date"
          label={t('reports.date')}
          value={form.report_date}
          onChange={(e) => set('report_date', e.target.value)}
        />
        <Select label={t('stock.zone')} value={form.zone_id} onChange={(e) => set('zone_id', e.target.value)}>
          <option value="">—</option>
          {(zones.data?.items ?? []).map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </Select>
        {form.kind === 'weekly' && (
          <Input
            type="date"
            label={t('reports.forecast_end')}
            hint={t('reports.forecast_hint')}
            value={form.forecast_end}
            onChange={(e) => set('forecast_end', e.target.value)}
          />
        )}
        <Textarea
          wrapClassName="span-2"
          label={t('reports.content')}
          hint={t('common.reason_hint')}
          rows={4}
          value={form.content}
          onChange={(e) => set('content', e.target.value)}
        />
        <Select
          wrapClassName="span-2"
          label={t('reports.progress_line')}
          hint={loaded && lines.length === 0 ? t('reports.no_work_lines') : t('reports.progress_hint')}
          value={form.estimate_line_id}
          onChange={(e) => set('estimate_line_id', e.target.value)}
        >
          <option value="">—</option>
          {lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.description} · {t('reports.plan')}: {formatQuantity(l.effective_quantity, l.unit_id)}
              {l.zone_name ? ` · ${l.zone_name}` : ''}
            </option>
          ))}
        </Select>
        {form.estimate_line_id && (
          <Input
            label={`${t('reports.progress_qty')}${line ? ` (${line.unit_id})` : ''}`}
            inputMode="decimal"
            value={form.progress_quantity}
            onChange={(e) => set('progress_quantity', e.target.value)}
          />
        )}
      </div>
    </Modal>
  );
}

function ReportDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, lang } = useT();
  const { me, can } = useAuth();
  const query = useReport(id);
  const d = query.data;
  const [reason, setReason] = useState('');
  const [content, setContent] = useState<string | null>(null);
  const [archive, setArchive] = useState(false);
  const [correction, setCorrection] = useState(false);
  const [delta, setDelta] = useState('');
  const [deltaReason, setDeltaReason] = useState('');
  const review = useWorkMutation(
    (action: 'accepted' | 'returned') =>
      api(`/v1/reports/${id}/review`, {
        method: 'POST',
        body: { version: d!.version, action, reason: reason.trim() },
      }),
    () => setReason(''),
  );
  const resubmit = useWorkMutation(
    () =>
      api(`/v1/reports/${id}/resubmit`, {
        method: 'POST',
        body: { version: d!.version, content: content!.trim() },
      }),
    () => setContent(null),
  );
  const archiveM = useWorkMutation(
    () =>
      api(`/v1/reports/${id}`, { method: 'DELETE', body: { version: d!.version, reason: reason.trim() } }),
    onClose,
  );
  const correct = useWorkMutation(
    () =>
      api(`/v1/progress-entries/${d!.progress!.id}/corrections`, {
        method: 'POST',
        body: { quantity_delta: normalizeNumber(delta), reason: deltaReason.trim() },
      }),
    () => {
      setCorrection(false);
      setDelta('');
      setDeltaReason('');
    },
  );
  if (!d)
    return (
      <Modal open onClose={onClose} drawer title={t('reports.detail')}>
        {query.isError ? (
          <Alert tone="danger">
            {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
          </Alert>
        ) : (
          <p className="muted">{t('common.loading')}</p>
        )}
      </Modal>
    );
  const isAuthor = d.author_id === me?.id;
  const canReview = can('reports', 'update') && !isAuthor;
  const effective = d.progress ? Number(d.progress.quantity) + Number(d.progress.corrected_delta) : null;
  return (
    <Modal
      open
      onClose={onClose}
      drawer
      title={`${t(`reports.kind.${d.kind}`)} · ${formatDate(d.report_date, lang)}`}
      description={`${d.project_name}${d.zone_name ? ` · ${d.zone_name}` : ''} · ${d.author_name}`}
    >
      <div className="stack" style={{ gap: 16 }}>
        <div className="row wrap" style={{ gap: 6 }}>
          <Badge tone={reportTone[d.status]}>{t(`reports.status.${d.status}`)}</Badge>
          {d.reviewed_by_name && (
            <small className="muted">
              {t('reports.reviewed_by')}: {d.reviewed_by_name}
            </small>
          )}
        </div>
        {content === null ? (
          <p style={{ whiteSpace: 'pre-wrap' }}>{d.content}</p>
        ) : (
          <Textarea
            label={t('reports.content')}
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        )}
        {d.estimate_line_name && (
          <div className="grid-3">
            <Stat
              label={t('reports.progress_line')}
              value={d.estimate_line_name}
              sub={`${t('reports.plan')}: ${formatQuantity(d.estimate_plan_quantity, d.estimate_unit)}`}
            />
            <Stat
              label={t('reports.progress_qty')}
              value={formatQuantity(d.progress_quantity, d.estimate_unit)}
            />
            {d.progress && (
              <Stat
                label={t('reports.effective_progress')}
                value={formatQuantity(effective, d.estimate_unit)}
                sub={
                  Number(d.progress.corrected_delta)
                    ? `${t('reports.corrections')}: ${formatQuantity(d.progress.corrected_delta)}`
                    : undefined
                }
              />
            )}
          </div>
        )}
        {d.forecast_end && (
          <Alert tone="info">
            {t('reports.forecast_end')}: {formatDate(d.forecast_end, lang)}
          </Alert>
        )}
        <section>
          <h3 style={{ marginBottom: 8 }}>{t('reports.photos')}</h3>
          <PhotoGallery
            files={d.files}
            projectId={d.project_id}
            reportId={d.id}
            canUpload={isAuthor && d.status !== 'accepted'}
            canDelete={(isAuthor || me?.role === 'tenant_admin') && d.status !== 'accepted'}
          />
        </section>
        {d.status === 'submitted' && canReview && (
          <section className="card card-pad stack">
            <Textarea
              label={t('reports.review_reason')}
              hint={t('common.reason_hint')}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="row">
              <Button
                onClick={() => review.mutate('accepted')}
                loading={review.isPending}
                disabled={reason.trim().length < 5}
              >
                {t('reports.accept')}
              </Button>
              <Button
                variant="danger"
                onClick={() => review.mutate('returned')}
                loading={review.isPending}
                disabled={reason.trim().length < 5}
              >
                {t('reports.return')}
              </Button>
            </div>
          </section>
        )}
        {d.status === 'returned' && isAuthor && (
          <div className="row wrap">
            {content === null ? (
              <Button onClick={() => setContent(d.content)}>{t('reports.resubmit')}</Button>
            ) : (
              <>
                <Button
                  onClick={() => resubmit.mutate(undefined)}
                  loading={resubmit.isPending}
                  disabled={(content ?? '').trim().length < 5}
                >
                  {t('common.save')}
                </Button>
                <Button variant="ghost" onClick={() => setContent(null)}>
                  {t('common.cancel')}
                </Button>
              </>
            )}
            <Button variant="ghost" icon={<Archive />} onClick={() => setArchive(true)}>
              {t('reports.archive')}
            </Button>
          </div>
        )}
        {d.status === 'accepted' && d.progress && can('reports', 'update') && (
          <section className="card card-pad stack">
            <div className="row-between">
              <b>{t('reports.corrections')}</b>
              <Button size="sm" variant="secondary" onClick={() => setCorrection(true)}>
                {t('reports.correction')}
              </Button>
            </div>
            {d.progress.corrections.length === 0 ? (
              <p className="muted text-sm">—</p>
            ) : (
              <ul className="text-sm" style={{ margin: 0, paddingLeft: 18 }}>
                {d.progress.corrections.map((c) => (
                  <li key={c.id}>
                    {formatQuantity(c.quantity_delta)} · {c.reason}{' '}
                    <span className="muted">
                      · {c.created_by_name} · {formatDateTime(c.created_at, lang)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        <section>
          <h3 style={{ marginBottom: 8 }}>{t('reports.history')}</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }} className="text-sm">
            {d.history.map((h, i) => (
              <li key={i}>
                <span className="muted">{formatDateTime(h.created_at, lang)}</span> · {h.actor_name ?? '—'} ·{' '}
                <code>{h.action}</code>
                {typeof h.details?.reason === 'string' ? <span> — {h.details.reason}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <ConfirmDialog
        open={archive}
        onClose={() => setArchive(false)}
        onConfirm={() => archiveM.mutate(undefined)}
        title={t('reports.archive')}
        danger
        loading={archiveM.isPending}
        message={
          <div className="stack">
            <p>{t('reports.archive_confirm')}</p>
            <Textarea
              label={t('common.reason')}
              hint={t('common.reason_hint')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        }
      />
      <Modal
        open={correction}
        onClose={() => setCorrection(false)}
        title={t('reports.correction')}
        description={t('reports.correction_hint')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCorrection(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => correct.mutate(undefined)}
              loading={correct.isPending}
              disabled={!delta || deltaReason.trim().length < 5}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="stack">
          <Input
            label={`${t('reports.correction_delta')}${d.estimate_unit ? ` (${d.estimate_unit})` : ''}`}
            inputMode="decimal"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
          />
          <Textarea
            label={t('common.reason')}
            hint={t('common.reason_hint')}
            value={deltaReason}
            onChange={(e) => setDeltaReason(e.target.value)}
          />
        </div>
      </Modal>
    </Modal>
  );
}
