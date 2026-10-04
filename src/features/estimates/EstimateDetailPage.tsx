import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Download, History, Pencil } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatDateTime, formatMoney, formatQuantity } from '@/lib/format';
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Stat,
  Tabs,
  Textarea,
} from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useProjects } from '@/features/projects/ProjectsPage';
import { lineKinds, sumBy, type EstimateDetail, type EstimateLine, type LineKind } from './model';

type Tab = 'lines' | 'summary' | 'revisions';
export function EstimateDetailPage() {
  const { id = '' } = useParams();
  const { t, lang } = useT();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['estimate', id],
    queryFn: () => api<EstimateDetail>(`/v1/estimates/${id}`),
  });
  const projects = useProjects();
  const [tab, setTab] = useState<Tab>('lines');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | LineKind>('all');
  const [archive, setArchive] = useState(false);
  const [reason, setReason] = useState('');
  const d = query.data;
  const project = projects.data?.items.find((p) => p.id === d?.project_id);
  const pricesVisible = Boolean(d?.lines.length === 0 || d?.lines.some((l) => l.unit_price !== undefined));
  const visible = useMemo(
    () =>
      (d?.lines ?? []).filter(
        (l) =>
          (kind === 'all' || l.kind === kind) &&
          (!search ||
            [l.description, l.category, l.material_name, l.zone_name, l.note].some((f) =>
              (f ?? '').toLocaleLowerCase().includes(search.toLocaleLowerCase()),
            )),
      ),
    [d, kind, search],
  );
  const total = sumBy(d?.lines ?? [], (l) => Number(l.total ?? 0));
  const archiveMutation = useMutation({
    mutationFn: () =>
      api(`/v1/estimates/${id}`, { method: 'DELETE', body: { version: d!.revision, reason } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['estimates'] });
      toast.success(t('common.saved'));
      navigate(`/app/estimates?project=${d!.project_id}`);
    },
    onError: (e: ApiError) => toast.error(errorMessage(t, e.code, e.status)),
  });
  const exportMutation = useMutation({
    mutationFn: () =>
      api<{ filename: string; mime_type: string; base64: string }>(`/v1/estimates/${id}/export`),
    onSuccess: (file) => {
      const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: file.mime_type }));
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    },
    onError: (e: ApiError) => toast.error(errorMessage(t, e.code, e.status)),
  });
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
  const materialTotal = sumBy(
    d.lines.filter((l) => l.kind === 'material'),
    (l) => Number(l.total ?? 0),
  );
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader
        breadcrumbs={
          <>
            <Link to={`/app/estimates?project=${d.project_id}`}>{t('est.title')}</Link>
            <span>/</span>
            <span>{project?.name ?? ''}</span>
          </>
        }
        title={
          <span className="row">
            {d.name}{' '}
            <Badge tone="brand">
              {t('est.revision')} {d.revision}
            </Badge>
          </span>
        }
        description={`${formatDateTime(d.created_at, lang)} · ${t('est.lines')}: ${d.lines.length}`}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Download />}
              loading={exportMutation.isPending}
              onClick={() => exportMutation.mutate()}
            >
              {t('est.export')}
            </Button>
            {can('estimates', 'update') && (
              <Button icon={<Pencil />} onClick={() => navigate(`/app/estimates/${id}/edit`)}>
                {t('common.edit')}
              </Button>
            )}
            {can('estimates', 'delete') && (
              <Button
                variant="ghost"
                icon={<Archive />}
                onClick={() => setArchive(true)}
                aria-label={t('est.archive')}
              />
            )}
          </>
        }
      />
      {pricesVisible ? (
        <div className="grid-4">
          <Stat accent label={t('est.total')} value={formatMoney(total, lang, false)} sub="UZS" />
          <Stat label={t('est.material_total')} value={formatMoney(materialTotal, lang, false)} sub="UZS" />
          <Stat
            label={t('est.work_total')}
            value={formatMoney(total - materialTotal, lang, false)}
            sub="UZS"
          />
          <Stat
            label={t('est.lines')}
            value={d.lines.length}
            sub={lineKinds
              .map((k) => `${t(`est.kind.${k}`)}: ${d.lines.filter((l) => l.kind === k).length}`)
              .join(' · ')}
          />
        </div>
      ) : (
        <Alert tone="warning">{t('est.unit_price_hidden')}</Alert>
      )}
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { key: 'lines', label: t('est.lines'), count: d.lines.length },
          { key: 'summary', label: t('est.summary') },
          { key: 'revisions', label: t('est.revisions') },
        ]}
      />
      {tab === 'lines' && (
        <>
          <div className="toolbar">
            <SearchInput value={search} onChange={setSearch} placeholder={t('est.search_lines')} />
            <Select
              aria-label={t('est.filter_kind')}
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="all">{t('common.all')}</option>
              {lineKinds.map((k) => (
                <option key={k} value={k}>
                  {t(`est.kind.${k}`)}
                </option>
              ))}
            </Select>
          </div>
          <LinesTable lines={visible} pricesVisible={pricesVisible} />
        </>
      )}
      {tab === 'summary' && <SummaryTab lines={d.lines} pricesVisible={pricesVisible} />}
      {tab === 'revisions' && <RevisionsTab id={id} current={d.revision} />}
      <ConfirmDialog
        open={archive}
        onClose={() => setArchive(false)}
        onConfirm={() => archiveMutation.mutate()}
        title={t('est.archive')}
        danger
        loading={archiveMutation.isPending}
        message={
          <div className="stack">
            <p>{t('est.archive_confirm')}</p>
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

function LinesTable({ lines, pricesVisible }: { lines: EstimateLine[]; pricesVisible: boolean }) {
  const { t, lang } = useT();
  const total = sumBy(lines, (l) => Number(l.total ?? 0));
  let lastCategory: string | null | undefined;
  return (
    <div className="table-wrap">
      <table className="table table-dense" style={{ minWidth: 1100 }}>
        <thead>
          <tr>
            <th>{t('est.col.n')}</th>
            <th>{t('est.col.kind')}</th>
            <th>{t('est.col.description')}</th>
            <th>{t('est.col.zone')}</th>
            <th>{t('est.col.unit')}</th>
            <th className="num">{t('est.col.quantity')}</th>
            <th className="num">{t('est.col.effective')}</th>
            {pricesVisible && <th className="num">{t('est.col.unit_price')}</th>}
            {pricesVisible && <th className="num">{t('est.col.total')}</th>}
            <th className="num">{t('est.col.fact')}</th>
            <th>{t('est.col.months')}</th>
            <th>{t('est.col.note')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const showCategory = (l.category ?? '') !== (lastCategory ?? '');
            lastCategory = l.category ?? '';
            const plan = Number(l.effective_quantity);
            const fact = Number(l.fact_quantity);
            const pct = plan > 0 ? Math.round((fact / plan) * 100) : null;
            return (
              <FragmentRow
                key={l.id}
                showCategory={showCategory}
                category={l.category}
                colSpan={pricesVisible ? 12 : 10}
              >
                <td>{i + 1}</td>
                <td>
                  <Badge tone={l.kind === 'material' ? 'info' : l.kind === 'labor' ? 'brand' : 'neutral'}>
                    {t(`est.kind.${l.kind}`)}
                  </Badge>
                </td>
                <td>
                  <div className="cell-main">{l.description}</div>
                  {l.material_name && <div className="cell-sub">{l.material_name}</div>}
                </td>
                <td>{l.zone_name ?? '—'}</td>
                <td>{l.unit_id}</td>
                <td className="num">
                  {l.norm !== null
                    ? `${formatQuantity(l.norm)} × ${formatQuantity(l.work_quantity)}`
                    : formatQuantity(l.quantity)}
                  {Number(l.loss_percent) ? (
                    <small className="muted"> +{formatQuantity(l.loss_percent)}%</small>
                  ) : null}
                </td>
                <td className="num">{formatQuantity(l.effective_quantity)}</td>
                {pricesVisible && <td className="num">{formatMoney(l.unit_price, lang, false)}</td>}
                {pricesVisible && (
                  <td className="num">
                    <b>{formatMoney(l.total, lang, false)}</b>
                  </td>
                )}
                <td className="num">
                  {fact > 0 ? (
                    <span>
                      {formatQuantity(fact)}{' '}
                      {pct !== null && (
                        <small
                          className={pct > 100 ? '' : 'muted'}
                          style={{ color: pct > 100 ? 'var(--danger)' : undefined }}
                        >
                          ({pct}%)
                        </small>
                      )}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  {l.months.length ? <Badge>{l.months.length}</Badge> : <span className="muted">—</span>}
                </td>
                <td className="muted">{l.note ?? ''}</td>
              </FragmentRow>
            );
          })}
        </tbody>
        {pricesVisible && (
          <tfoot>
            <tr>
              <td colSpan={8} style={{ textAlign: 'right', fontWeight: 600 }}>
                {t('est.total')}
              </td>
              <td className="num" style={{ fontWeight: 700 }}>
                {formatMoney(total, lang, false)}
              </td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
function FragmentRow({
  showCategory,
  category,
  colSpan,
  children,
}: {
  showCategory: boolean;
  category: string | null;
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <>
      {showCategory && category && (
        <tr>
          <td
            colSpan={colSpan}
            style={{
              background: 'var(--surface-2)',
              fontWeight: 600,
              fontSize: 'var(--fs-xs)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--text-3)',
            }}
          >
            {category}
          </td>
        </tr>
      )}
      <tr>{children}</tr>
    </>
  );
}

function SummaryTab({ lines, pricesVisible }: { lines: EstimateLine[]; pricesVisible: boolean }) {
  const { t, lang } = useT();
  const group = (key: (l: EstimateLine) => string) => {
    const map = new Map<string, { plan: number; factValue: number; count: number }>();
    for (const l of lines) {
      const k = key(l);
      const g = map.get(k) ?? { plan: 0, factValue: 0, count: 0 };
      g.plan += Number(l.total ?? 0);
      g.factValue += Number(l.fact_value ?? 0);
      g.count += 1;
      map.set(k, g);
    }
    return [...map.entries()].sort((a, b) => b[1].plan - a[1].plan);
  };
  const Table = ({
    title,
    rows,
  }: {
    title: string;
    rows: [string, { plan: number; factValue: number; count: number }][];
  }) => (
    <section className="card">
      <div className="card-header">
        <h3>{title}</h3>
      </div>
      <table className="summary-table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>{t('common.name')}</th>
            <th className="num">{t('est.lines')}</th>
            {pricesVisible && <th className="num">{t('est.plan')}</th>}
            {pricesVisible && <th className="num">{t('est.fact')}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, g]) => (
            <tr key={k} style={{ borderTop: '1px solid var(--border)' }}>
              <td>{k}</td>
              <td className="num">{g.count}</td>
              {pricesVisible && <td className="num">{formatMoney(g.plan, lang, false)}</td>}
              {pricesVisible && (
                <td className="num">
                  {g.factValue ? formatMoney(g.factValue, lang, false) : <span className="muted">—</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
  return (
    <div className="grid-3" style={{ alignItems: 'start' }}>
      <Table title={t('est.by_kind')} rows={group((l) => t(`est.kind.${l.kind}`))} />
      <Table title={t('est.by_category')} rows={group((l) => l.category ?? '—')} />
      <Table title={t('est.by_zone')} rows={group((l) => l.zone_name ?? '—')} />
    </div>
  );
}

function RevisionsTab({ id, current }: { id: string; current: number }) {
  const { t, lang } = useT();
  const query = useQuery({
    queryKey: ['estimate-revisions', id],
    queryFn: () =>
      api<{
        items: {
          revision: number;
          created_at: string;
          created_by_name: string | null;
          line_count: number;
          total: string;
          name: string;
        }[];
      }>(`/v1/estimates/${id}/revisions`),
  });
  const [view, setView] = useState<number | null>(null);
  const snapshot = useQuery({
    queryKey: ['estimate-revision', id, view],
    queryFn: () => api<{ revision: number; lines: EstimateLine[] }>(`/v1/estimates/${id}/revisions/${view}`),
    enabled: view !== null,
  });
  return (
    <>
      <div className="table-wrap">
        <table className="table table-dense">
          <thead>
            <tr>
              <th>{t('est.revision')}</th>
              <th>{t('est.name')}</th>
              <th>{t('est.author')}</th>
              <th>{t('common.date')}</th>
              <th className="num">{t('est.lines')}</th>
              <th className="num">{t('est.total')}</th>
            </tr>
          </thead>
          <tbody>
            {(query.data?.items ?? []).map((r) => (
              <tr key={r.revision} className="clickable" onClick={() => setView(r.revision)}>
                <td>
                  <Badge tone={r.revision === current ? 'success' : 'neutral'}>
                    {r.revision}
                    {r.revision === current ? ` · ${t('est.current')}` : ''}
                  </Badge>
                </td>
                <td>{r.name}</td>
                <td>{r.created_by_name ?? '—'}</td>
                <td>{formatDate(r.created_at, lang)}</td>
                <td className="num">{r.line_count}</td>
                <td className="num">{formatMoney(r.total, lang, false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view !== null && (
        <Modal
          open
          onClose={() => setView(null)}
          title={t('est.revision_view', { revision: view })}
          size="xl"
        >
          {snapshot.data ? (
            <LinesTable
              lines={snapshot.data.lines.map((l) => ({
                ...l,
                months: l.months ?? [],
                fact_quantity: '0',
                fact_value: null,
              }))}
              pricesVisible={snapshot.data.lines.some((l) => l.unit_price !== undefined)}
            />
          ) : (
            <p className="muted">{t('common.loading')}</p>
          )}
        </Modal>
      )}
      <History size={0} />
    </>
  );
}
