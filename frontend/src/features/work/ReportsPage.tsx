import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, Plus } from 'lucide-react';
import { api, ApiError, type ListResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatDateTime, formatMoney, formatQuantity, todayIso, unitLabel } from '@/lib/format';
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Segmented,
  Select,
  Textarea,
  useListState,
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

/** Hisobot turi belgisi (Figma: kunlik — yashil kontur, haftalik — to'q kontur). */
function KindBadge({ kind }: { kind: Report['kind'] }) {
  const { t } = useT();
  return <Badge tone={kind === 'daily' ? 'success' : 'brand'}>{t(`reports.kind.${kind}`)}</Badge>;
}

/** Hisobotlar sahifasi (Figma "Hisobotlar va tahlillar"): tur segmenti, qidiruv, ro'yxat kartasi, yaratish oynasi. */
export function ReportsPage() {
  const { t, lang } = useT();
  const { can } = useAuth();
  const sel = useProjectSelection();
  const list = useListState();
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState<'' | 'daily' | 'weekly'>('');
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const query = useReports(
    sel.projectId,
    { ...(status ? { status } : {}), ...(kind ? { kind } : {}) },
    { offset: list.offset, limit: list.limit },
  );
  // Qidiruv sahifadagi qatorlar ustida (ro'yxat API'sida q yo'q): mazmun, muallif, zona.
  const needle = list.q.toLocaleLowerCase();
  const rows = (query.data?.items ?? []).filter(
    (r) =>
      !needle ||
      [r.content, r.author_name, r.zone_name].some((f) => (f ?? '').toLocaleLowerCase().includes(needle)),
  );
  const columns: Column<Report>[] = [
    {
      key: 'n',
      header: t('reports.col.n'),
      render: (r) => (
        <span className="muted" style={{ fontFamily: 'var(--font-mono)' }}>
          #{r.id.slice(0, 6)}
        </span>
      ),
    },
    {
      key: 'date',
      header: t('reports.date'),
      sortValue: (r) => r.report_date,
      render: (r) => (
        <span style={{ fontFamily: 'var(--font-mono)' }}>{formatDate(r.report_date, lang)}</span>
      ),
    },
    {
      key: 'kind',
      header: t('reports.kind'),
      sortValue: (r) => r.kind,
      render: (r) => <KindBadge kind={r.kind} />,
    },
    {
      key: 'content',
      header: t('reports.col.summary'),
      render: (r) => (
        <>
          <div style={{ maxWidth: 420, whiteSpace: 'pre-line' }}>
            {r.content.length > 140 ? r.content.slice(0, 140) + '…' : r.content}
          </div>
          <div className="cell-sub">
            {[
              r.zone_name,
              r.estimate_line_name
                ? `${r.estimate_line_name}: ${formatQuantity(r.progress_quantity, r.estimate_unit)}`
                : null,
              r.file_count ? `📷 ${r.file_count}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </>
      ),
    },
    {
      key: 'author',
      header: t('reports.col.author'),
      sortValue: (r) => r.author_name,
      render: (r) => r.author_name,
    },
    {
      key: 'status',
      header: t('reports.col.status'),
      sortValue: (r) => r.status,
      render: (r) => <Badge tone={reportTone[r.status]}>{t(`reports.status.${r.status}`)}</Badge>,
    },
  ];
  const pending = rows.filter((r) => r.status === 'submitted').length;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader title={t('reports.title')} description={t('reports.sub')} />
      <div className="toolbar blocks-toolbar">
        <Segmented<'' | 'daily' | 'weekly'>
          value={kind}
          onChange={(k) => {
            setKind(k);
            list.setOffset(0);
          }}
          items={[
            { key: '', label: t('common.all') },
            { key: 'daily', label: t('reports.kind.daily') },
            { key: 'weekly', label: t('reports.kind.weekly') },
          ]}
        />
        <ProjectSelect
          value={sel.projectId}
          onChange={(id) => {
            sel.setProjectId(id);
            list.setOffset(0);
          }}
          projects={sel.projects}
        />
        <SearchInput value={list.search} onChange={list.setSearch} placeholder={t('reports.search')} />
        <Select
          aria-label={t('common.status')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            list.setOffset(0);
          }}
        >
          <option value="">{t('common.all')}</option>
          {(['submitted', 'returned', 'accepted'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`reports.status.${s}`)}
            </option>
          ))}
        </Select>
        {pending > 0 && <Badge tone="warning">{t('reports.pending_on_page', { n: pending })}</Badge>}
        <span className="spacer" />
        {can('reports', 'create') && sel.projectId && (
          <Button icon={<Plus />} onClick={() => setCreate(true)}>
            {t('reports.new')}
          </Button>
        )}
      </div>
      <section className="card">
        <div className="card-header">
          <h3>{t('reports.list_title')}</h3>
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
          pagination={list.pagination}
          empty={{ title: t('reports.empty'), description: t('reports.empty_desc') }}
        />
      </section>
      {create && (
        <ReportModal
          projectId={sel.projectId}
          projectName={sel.projects.find((p) => p.id === sel.projectId)?.name ?? ''}
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

/** Hisobot yaratish (Figma "kunlik/haftalik hisobot yaratish"): raqamlangan bo'limlar, mavjud maydonlar bilan. */
function ReportModal({
  projectId,
  projectName,
  onClose,
  onCreated,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useT();
  const { me } = useAuth();
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
  const weekly = form.kind === 'weekly';
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
      <div className="stack" style={{ gap: 14 }}>
        <section className="form-section">
          <h4>{t('reports.section.main')}</h4>
          <div className="form-grid">
            <Select label={t('reports.kind')} value={form.kind} onChange={(e) => set('kind', e.target.value)}>
              <option value="daily">{t('reports.kind.daily')}</option>
              <option value="weekly">{t('reports.kind.weekly')}</option>
            </Select>
            <Input
              type="date"
              label={weekly ? t('reports.week_of') : t('reports.date')}
              value={form.report_date}
              onChange={(e) => set('report_date', e.target.value)}
            />
            <Input label={t('reports.object')} value={projectName} readOnly />
            <Input label={t('reports.responsible')} value={me?.display_name ?? ''} readOnly />
            <Select
              wrapClassName="span-2"
              label={t('stock.zone')}
              value={form.zone_id}
              onChange={(e) => set('zone_id', e.target.value)}
            >
              <option value="">—</option>
              {(zones.data?.items ?? []).map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </Select>
          </div>
        </section>
        <section className="form-section">
          <h4>{weekly ? t('reports.section.summary') : t('reports.section.works')}</h4>
          <div className="form-grid">
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
                label={`${t('reports.progress_qty')}${line ? ` (${unitLabel(line.unit_id)})` : ''}`}
                inputMode="decimal"
                value={form.progress_quantity}
                onChange={(e) => set('progress_quantity', e.target.value)}
              />
            )}
          </div>
        </section>
        {weekly ? (
          <section className="form-section">
            <h4>{t('reports.section.forecast')}</h4>
            <div className="form-grid">
              <Input
                type="date"
                label={t('reports.forecast_end')}
                hint={t('reports.forecast_hint')}
                value={form.forecast_end}
                onChange={(e) => set('forecast_end', e.target.value)}
              />
            </div>
          </section>
        ) : (
          <section className="form-section">
            <h4>{t('reports.section.photos')}</h4>
            <p className="muted text-sm">{t('reports.photos_after')}</p>
          </section>
        )}
      </div>
    </Modal>
  );
}

/** Hisobot kartasi (Figma "hisobotlar ko'rish"): ma'lumot kartasi, ishlar jadvali, foto, tekshiruvchi izohi, prognoz. */
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
  // Tekshiruvchi izohi: oxirgi qabul/qaytarish yozuvidagi sabab (tarixdan).
  const reviewNote = [...d.history]
    .reverse()
    .find((h) => /review|accept|return/.test(h.action) && typeof h.details?.reason === 'string')?.details
    ?.reason as string | undefined;
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
          <KindBadge kind={d.kind} />
          {d.reviewed_by_name && (
            <small className="muted">
              {t('reports.reviewed_by')}: {d.reviewed_by_name}
            </small>
          )}
        </div>
        <div className="card card-pad">
          <dl className="block-facts">
            <div>
              <dt>{d.kind === 'weekly' ? t('reports.week_of') : t('reports.date')}</dt>
              <dd>{formatDate(d.report_date, lang)}</dd>
            </div>
            <div>
              <dt>{t('reports.object')}</dt>
              <dd>
                {d.project_name}
                {d.zone_name ? ` · ${d.zone_name}` : ''}
              </dd>
            </div>
            <div>
              <dt>{t('reports.responsible')}</dt>
              <dd>{d.author_name}</dd>
            </div>
          </dl>
        </div>
        <section className="card">
          <div className="card-header">
            <h3>
              {d.kind === 'weekly'
                ? t('reports.section.summary').replace(/^\d+\.\s*/, '')
                : t('reports.content')}
            </h3>
          </div>
          <div className="card-pad">
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
          </div>
        </section>
        {d.estimate_line_name && (
          <section className="card">
            <div className="card-header">
              <h3>{t('reports.works_title')}</h3>
            </div>
            <div className="table-wrap">
            <table className="table table-dense" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>{t('reports.col.work')}</th>
                  <th>{t('reports.col.unit')}</th>
                  <th className="num">{t('reports.col.qty')}</th>
                  <th className="num">{t('reports.plan')}</th>
                  {d.progress && <th className="num">{t('reports.effective_progress')}</th>}
                  {d.progress && d.progress.labor_amount !== undefined && (
                    <th className="num">{t('reports.labor_amount')}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="cell-main">{d.estimate_line_name}</td>
                  <td>{d.estimate_unit}</td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {formatQuantity(d.progress_quantity)}
                  </td>
                  <td className="num">{formatQuantity(d.estimate_plan_quantity)}</td>
                  {d.progress && (
                    <td className="num">
                      {formatQuantity(effective)}
                      {Number(d.progress.corrected_delta) ? (
                        <small className="muted">
                          {' '}
                          ({t('reports.corrections')}: {formatQuantity(d.progress.corrected_delta)})
                        </small>
                      ) : null}
                    </td>
                  )}
                  {d.progress && d.progress.labor_amount !== undefined && (
                    <td className="num">
                      {d.progress.labor_amount === null ? (
                        <span className="muted">{t('reports.rate_missing')}</span>
                      ) : (
                        <>
                          <b>{formatMoney(d.progress.labor_amount, lang, false)}</b>
                          <small className="muted"> ({formatMoney(d.progress.labor_rate ?? '0', lang, false)})</small>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
            </div>
          </section>
        )}
        {d.forecast_end && (
          <Alert tone="warning">
            <b>{t('reports.forecast_updated')}</b>
            <div>{formatDate(d.forecast_end, lang)}</div>
          </Alert>
        )}
        <section className="card">
          <div className="card-header">
            <h3>{t('reports.photos')}</h3>
          </div>
          <div className="card-pad">
            <PhotoGallery
              files={d.files}
              projectId={d.project_id}
              reportId={d.id}
              canUpload={isAuthor && d.status !== 'accepted'}
              canDelete={(isAuthor || me?.role === 'tenant_admin') && d.status !== 'accepted'}
            />
          </div>
        </section>
        {reviewNote && d.status !== 'submitted' && (
          <div className="review-note">
            <b>
              {t('reports.reviewer_note')}
              {d.reviewed_by_name ? ` (${d.reviewed_by_name})` : ''}:
            </b>
            <span>{reviewNote}</span>
          </div>
        )}
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
