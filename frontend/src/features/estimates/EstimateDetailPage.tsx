import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowLeft, ChevronDown, Download, History, Pencil, Settings } from 'lucide-react';
import { saveBase64File } from '@/lib/download';
import { api, ApiError } from '@/lib/api';
import { DetailError } from '@/app/guards';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatDateTime, formatMoney, formatQuantity, unitLabel } from '@/lib/format';
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
  Tabs,
  Textarea,
} from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useProjects } from '@/features/projects/ProjectsPage';
import {
  AMOUNT,
  lineKinds,
  normalizeNumber,
  PERCENT,
  trimZeros,
  type EstimateDetail,
  type EstimateGroupTotal,
  type EstimateLine,
  type EstimateResources,
  type EstimateTotals,
  type LineKind,
  type MarkupMode,
  type PriceSummary,
} from './model';

type Tab = 'lines' | 'summary' | 'resources' | 'revisions';
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
  const [section, setSection] = useState('all');
  const [headerEdit, setHeaderEdit] = useState(false);
  const [archive, setArchive] = useState(false);
  const [reason, setReason] = useState('');
  const d = query.data;
  const project = projects.data?.items.find((p) => p.id === d?.project_id);
  const pricesVisible = d?.totals.total !== undefined;
  // S2: «Раздел» ro'yxati — qatorlarning birinchi uchragan tartibida; bo'limsiz qatorlar bo'lsa alohida variant.
  const sections = useMemo(
    () => [...new Set((d?.lines ?? []).map((l) => l.section_name).filter((s): s is string => Boolean(s)))],
    [d],
  );
  const hasUnsectioned = (d?.lines ?? []).some((l) => !l.section_name);
  const visible = useMemo(
    () =>
      (d?.lines ?? []).filter(
        (l) =>
          (kind === 'all' || l.kind === kind) &&
          (section === 'all' || (l.section_name ?? '') === section) &&
          (!search ||
            [
              l.description,
              l.category,
              l.material_name,
              l.zone_name,
              l.note,
              l.norm_code,
              l.resource_code,
              l.section_name,
            ].some((f) => (f ?? '').toLocaleLowerCase().includes(search.toLocaleLowerCase()))),
      ),
    [d, kind, section, search],
  );
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
    onSuccess: saveBase64File,
    onError: (e: ApiError) => toast.error(errorMessage(t, e.code, e.status)),
  });
  if (query.isError)
    return (
      <DetailError
        error={query.error}
        onRetry={query.refetch}
        backTo={{ to: '/app/estimates', label: t('common.back_to_list') }}
      />
    );
  if (!d)
    return (
      <div className="card">
        <div className="card-pad muted">{t('common.loading')}</div>
      </div>
    );
  // Figma "smeta ko'rish": orqaga tugmasi va sarlavha, ma'lumot kartasi, amallar paneli, ierarxik jadval, hisoblash kartasi.
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="project-top">
        <span className="row" style={{ gap: 12, minWidth: 0 }}>
          <Link
            to={`/app/estimates?project=${d.project_id}`}
            className="btn btn-secondary btn-icon"
            aria-label={t('common.back_to_list')}
          >
            <ArrowLeft size={16} />
          </Link>
          <PageHeader title={d.name} description={project?.name ?? ''} />
        </span>
      </div>
      <div className="card card-pad">
        <dl className="block-facts">
          <div>
            <dt>{t('est.name')}</dt>
            <dd>{d.name}</dd>
          </div>
          <div>
            <dt>{t('est.revision')}</dt>
            <dd>
              <Badge tone="brand">
                {t('est.revision')} {d.revision}
              </Badge>
            </dd>
          </div>
          <div>
            <dt>{t('est.info.project')}</dt>
            <dd>{project?.name ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('est.info.date')}</dt>
            <dd>{formatDateTime(d.created_at, lang)}</dd>
          </div>
          <div>
            <dt>{t('est.lines')}</dt>
            <dd>
              {d.lines.length}
              <small className="muted">
                {' '}
                ·{' '}
                {lineKinds
                  .map((k) => `${t(`est.kind.${k}`)}: ${d.lines.filter((l) => l.kind === k).length}`)
                  .join(' · ')}
              </small>
            </dd>
          </div>
          <div>
            <dt>{t('est.header.basis')}</dt>
            <dd>{d.basis || '—'}</dd>
          </div>
          <div>
            <dt>{t('est.header.price_level_date')}</dt>
            <dd>{formatDate(d.price_level_date, lang)}</dd>
          </div>
          <div>
            <dt>{t('est.header.labor_rate_source')}</dt>
            <dd>{d.labor_rate_source || '—'}</dd>
          </div>
          <div>
            <dt>{t('est.header.contract')}</dt>
            <dd>
              {d.contract_number || d.contract_date
                ? [d.contract_number, d.contract_date ? formatDate(d.contract_date, lang) : null]
                    .filter(Boolean)
                    .join(' · ')
                : '—'}
            </dd>
          </div>
          {pricesVisible && d.contract_amount && (
            <div>
              <dt>{t('est.header.contract_amount')}</dt>
              <dd>{formatMoney(d.contract_amount, lang)}</dd>
            </div>
          )}
        </dl>
        {can('estimates', 'update') && (
          <div style={{ marginTop: 12 }}>
            <Button variant="secondary" icon={<Pencil />} onClick={() => setHeaderEdit(true)}>
              {t('est.header.edit')}
            </Button>
          </div>
        )}
      </div>
      {headerEdit && (
        <HeaderModal estimate={d} pricesVisible={pricesVisible} onClose={() => setHeaderEdit(false)} />
      )}
      {!pricesVisible && <Alert tone="warning">{t('est.unit_price_hidden')}</Alert>}
      <div className="toolbar blocks-toolbar">
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
        {sections.length > 0 && (
          <Select
            aria-label={t('est.filter_section')}
            value={section}
            onChange={(e) => setSection(e.target.value)}
          >
            <option value="all">{t('common.all')}</option>
            {sections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {hasUnsectioned && <option value="">{t('est.unsectioned')}</option>}
          </Select>
        )}
        <span className="spacer" />
        {can('estimates', 'update') && (
          <Button variant="secondary" icon={<Pencil />} onClick={() => navigate(`/app/estimates/${id}/edit`)}>
            {t('common.edit')}
          </Button>
        )}
        <Button
          variant="secondary"
          icon={<Download />}
          loading={exportMutation.isPending}
          onClick={() => exportMutation.mutate()}
        >
          {t('est.export')}
        </Button>
        {can('estimates', 'delete') && (
          <Button
            variant="ghost"
            icon={<Archive />}
            onClick={() => setArchive(true)}
            aria-label={t('est.archive')}
          />
        )}
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { key: 'lines', label: t('est.lines'), count: d.lines.length },
          { key: 'summary', label: t('est.summary') },
          { key: 'resources', label: t('est.resources') },
          { key: 'revisions', label: t('est.revisions') },
        ]}
      />
      {tab === 'lines' && (
        <>
          <LinesTable
            lines={visible}
            pricesVisible={pricesVisible}
            categories={search || kind !== 'all' || section !== 'all' ? undefined : d.totals.by_category}
            total={
              search
                ? undefined
                : section !== 'all'
                  ? kind === 'all'
                    ? d.totals.by_section.find((g) => g.key === section)?.total
                    : undefined
                  : kind === 'all'
                    ? d.totals.total
                    : d.totals.by_kind.find((g) => g.key === kind)?.total
            }
          />
          {pricesVisible && (
            <section className="card card-pad est-calc">
              <div className="stat-label" style={{ marginBottom: 12 }}>
                {t('est.calc')}
              </div>
              <dl>
                <dt>{t('est.material_total')}</dt>
                <dd>{formatMoney(d.totals.material_total, lang, false)}</dd>
                <dt>{t('est.work_total')}</dt>
                <dd>{formatMoney(d.totals.work_total, lang, false)}</dd>
                <div className="est-grand-total">
                  <span>{t('est.calc.total')}</span>
                  <span>{formatMoney(d.totals.total, lang)}</span>
                </div>
              </dl>
            </section>
          )}
          {d.price_summary && <PriceSummaryCard estimate={d} summary={d.price_summary} />}
        </>
      )}
      {tab === 'summary' && <SummaryTab totals={d.totals} pricesVisible={pricesVisible} />}
      {tab === 'resources' && <ResourcesTab id={id} revision={d.revision} pricesVisible={pricesVisible} />}
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

/**
 * Figma "smeta ko'rish" jadvali: kategoriya qatori yig'iladi, kategoriya jami serverdagi `totals.by_category` dan
 * (faqat filtrsiz ko'rinishda), pastda umumiy jami. Frontend summalarni qo'shmaydi.
 */
function LinesTable({
  lines,
  pricesVisible,
  total,
  categories,
}: {
  lines: EstimateLine[];
  pricesVisible: boolean;
  total?: string;
  categories?: EstimateGroupTotal[];
}) {
  const { t, lang } = useT();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (c: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  // Ustunlar: 8 asosiy (shifr bilan) + narx, stavka, jami (narx ko'rinsa) + fakt, oylar, izoh. Jami summasi «Jami» ustuni ostida.
  const colSpan = pricesVisible ? 14 : 11;
  // Har kategoriya bitta guruh (birinchi uchragan tartibda): bir ish bir necha qavatda takrorlansa ham guruh bitta,
  // ostidagi jami (serverdagi kategoriya jami) shu guruh qatorlariga teng.
  const groups: { category: string; lines: EstimateLine[] }[] = [];
  const byCategory = new Map<string, { category: string; lines: EstimateLine[] }>();
  for (const l of lines) {
    const c = l.category ?? '';
    let group = byCategory.get(c);
    if (!group) {
      group = { category: c, lines: [] };
      byCategory.set(c, group);
      groups.push(group);
    }
    group.lines.push(l);
  }
  let n = 0;
  return (
    <div className="table-wrap">
      <table className="table table-dense est-table" style={{ minWidth: 1100 }}>
        <thead>
          <tr>
            <th>{t('est.col.n')}</th>
            <th>{t('est.col.kind')}</th>
            <th>{t('est.col.code')}</th>
            <th>{t('est.col.description')}</th>
            <th>{t('est.col.zone')}</th>
            <th>{t('est.col.unit')}</th>
            <th className="num">{t('est.col.quantity')}</th>
            <th className="num">{t('est.col.effective')}</th>
            {pricesVisible && <th className="num">{t('est.col.unit_price')}</th>}
            {pricesVisible && <th className="num">{t('est.col.labor_rate')}</th>}
            {pricesVisible && <th className="num">{t('est.col.total')}</th>}
            <th className="num">{t('est.col.fact')}</th>
            <th>{t('est.col.months')}</th>
            <th>{t('est.col.note')}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const open = !collapsed.has(g.category);
            const subtotal = categories?.find((c) => (c.key ?? '') === g.category)?.total;
            const name = g.category || t('est.uncategorized');
            return (
              <FragmentRow
                key={g.category}
                category={name}
                open={open}
                onToggle={() => toggle(g.category)}
                colSpan={colSpan}
                count={g.lines.length}
                subtotal={pricesVisible && open && groups.length > 1 ? subtotal : undefined}
                subtotalLabel={t('est.category_total', { name })}
              >
                {open &&
                  g.lines.map((l) => {
                    const i = n++;
                    const plan = Number(l.effective_quantity);
                    const fact = Number(l.fact_quantity);
                    const pct = plan > 0 ? Math.round((fact / plan) * 100) : null;
                    return (
                      <tr key={l.id}>
                <td>{i + 1}</td>
                <td>
                  <Badge tone={l.kind === 'material' ? 'info' : l.kind === 'labor' ? 'brand' : 'neutral'}>
                    {t(`est.kind.${l.kind}`)}
                  </Badge>
                </td>
                <td className="muted" style={{ fontSize: 'var(--fs-xs)', overflowWrap: 'anywhere', minWidth: 90 }}>
                  {l.norm_code ?? l.resource_code ?? '—'}
                </td>
                <td>
                  <div className="cell-main">{l.description}</div>
                  {l.material_name && <div className="cell-sub">{l.material_name}</div>}
                </td>
                <td>{l.zone_name ?? '—'}</td>
                <td>{unitLabel(l.unit_id)}</td>
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
                    {l.labor_rate ? (
                      formatMoney(l.labor_rate, lang, false)
                    ) : l.auto_labor_rate ? (
                      <span className="muted" title={t('est.labor_rate_auto_hint')}>
                        {formatMoney(l.auto_labor_rate, lang, false)} <small>{t('est.labor_rate_auto')}</small>
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                )}
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
                      </tr>
                    );
                  })}
              </FragmentRow>
            );
          })}
        </tbody>
        {pricesVisible && total !== undefined && (
          <tfoot>
            <tr className="est-grand">
              <td colSpan={10} style={{ textAlign: 'right' }}>
                {t('est.total')}
              </td>
              <td className="num">{formatMoney(total, lang, false)}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
/** Kategoriya sarlavhasi (yig'iladi), qatorlar va kategoriya jami (narx bilan, serverdan). */
function FragmentRow({
  category,
  open,
  onToggle,
  colSpan,
  count,
  subtotal,
  subtotalLabel,
  children,
}: {
  category: string;
  open: boolean;
  onToggle: () => void;
  colSpan: number;
  count: number;
  subtotal?: string;
  subtotalLabel: string;
  children: React.ReactNode;
}) {
  const { t, lang } = useT();
  return (
    <>
      <tr className="est-category">
        <td colSpan={colSpan}>
          <button type="button" aria-expanded={open} onClick={onToggle} title={open ? t('est.collapse') : t('est.expand')}>
            <ChevronDown aria-hidden />
            {category}
            <span className="muted" style={{ fontWeight: 400 }}>
              · {count}
            </span>
          </button>
        </td>
      </tr>
      {children}
      {subtotal !== undefined && (
        <tr className="est-subtotal">
          <td colSpan={10} style={{ textAlign: 'right' }}>
            {subtotalLabel}
          </td>
          <td className="num">{formatMoney(subtotal, lang, false)}</td>
          <td colSpan={colSpan - 11} />
        </tr>
      )}
    </>
  );
}

function SummaryTab({ totals, pricesVisible }: { totals: EstimateTotals; pricesVisible: boolean }) {
  const { t, lang } = useT();
  const Table = ({
    title,
    rows,
    name,
  }: {
    title: string;
    rows: EstimateGroupTotal[];
    name: (key: string) => string;
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
          {rows.map((g) => (
            <tr key={g.key} style={{ borderTop: '1px solid var(--border)' }}>
              <td>{name(g.key)}</td>
              <td className="num">{g.count}</td>
              {pricesVisible && <td className="num">{formatMoney(g.total, lang, false)}</td>}
              {pricesVisible && (
                <td className="num">
                  {g.value && g.value !== '0.00' ? (
                    formatMoney(g.value, lang, false)
                  ) : (
                    <span className="muted">—</span>
                  )}
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
      <Table title={t('est.by_kind')} rows={totals.by_kind} name={(k) => t(`est.kind.${k}`)} />
      <Table title={t('est.by_category')} rows={totals.by_category} name={(k) => k || '—'} />
      <Table title={t('est.by_zone')} rows={totals.by_zone} name={(k) => k || '—'} />
    </div>
  );
}

const boldChainKeys = new Set(['direct_total', 'total', 'total_without_vat', 'total_with_vat']);
const percentText = (v: string) => `${trimZeros(v).replace('.', ',')} %`;

/**
 * S3: «Smeta yakuni» — narx zanjiri (to'g'ridan-to'g'ri xarajat → boshqa xarajat → ishlab chiqarish → QQS).
 * Barcha summa va foizlar serverdan (`price_summary`); frontend hech narsa qo'shmaydi.
 */
function PriceSummaryCard({ estimate, summary }: { estimate: EstimateDetail; summary: PriceSummary }) {
  const { t, lang } = useT();
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState(false);
  const convert = useMutation({
    mutationFn: () =>
      api(`/v1/estimates/${estimate.id}/percent-lines/convert`, {
        method: 'POST',
        body: { version: estimate.revision },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['estimate', estimate.id] });
      await queryClient.invalidateQueries({ queryKey: ['estimates'] });
      await queryClient.invalidateQueries({ queryKey: ['estimate-revisions', estimate.id] });
      toast.success(t('common.saved'));
    },
    onError: (e: ApiError) => toast.error(errorMessage(t, e.code, e.status)),
  });
  const canEdit = can('estimates', 'update');
  return (
    <section className="card card-pad stack est-chain" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <div className="stat-label">{t('est.price.title')}</div>
        <Badge tone="brand">{t(`est.markup.${summary.markup_mode}`)}</Badge>
        <span className="spacer" />
        {canEdit && (
          <Button size="sm" variant="secondary" icon={<Settings />} onClick={() => setSettings(true)}>
            {t('est.price.settings')}
          </Button>
        )}
      </div>
      {summary.percent_lines.length > 0 && (
        <Alert tone="warning">
          <div className="stack" style={{ gap: 8 }}>
            <span>
              {t('est.price.percent_lines', {
                list: summary.percent_lines.map((x) => x.description).join('; '),
              })}
            </span>
            {canEdit && (
              <div>
                <Button size="sm" variant="secondary" loading={convert.isPending} onClick={() => convert.mutate()}>
                  {t('est.price.convert', { percent: percentText(summary.converted_other_costs_percent ?? '0') })}
                </Button>
              </div>
            )}
          </div>
        </Alert>
      )}
      <dl>
        {summary.lines.map((l) => (
          <div key={l.key} className={boldChainKeys.has(l.key) ? 'est-chain-total' : undefined}>
            <dt>{t(`est.price.${l.key}`)}</dt>
            <dd className="est-chain-percent">{l.percent ? percentText(l.percent) : ''}</dd>
            <dd>{formatMoney(l.amount, lang)}</dd>
          </div>
        ))}
      </dl>
      {settings && <PriceSettingsModal estimate={estimate} onClose={() => setSettings(false)} />}
    </section>
  );
}

type VatChoice = 'none' | '12' | '6' | 'custom';
const vatChoiceOf = (vat: string | null | undefined): VatChoice => {
  if (vat === null || vat === undefined) return 'none';
  const v = trimZeros(vat);
  return v === '12' || v === '6' ? v : 'custom';
};

/** S3: narx sozlamalari (rejim, boshqa/ishlab chiqarish xarajati, foyda, QQS). Yangi reviziya yaratmaydi; faqat o'zgargan maydonlar yuboriladi. */
function PriceSettingsModal({ estimate, onClose }: { estimate: EstimateDetail; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const initial = {
    other: trimZeros(estimate.other_costs_percent ?? ''),
    profit: trimZeros(estimate.profit_percent ?? ''),
    production: trimZeros(estimate.production_costs_percent ?? ''),
  };
  const [mode, setMode] = useState<MarkupMode>(estimate.markup_mode);
  const [other, setOther] = useState(initial.other);
  const [profit, setProfit] = useState(initial.profit);
  const [production, setProduction] = useState(initial.production);
  const [mountain, setMountain] = useState(initial.production === '5');
  const [deduct, setDeduct] = useState(estimate.deduct_customer_materials);
  const [vatChoice, setVatChoice] = useState<VatChoice>(vatChoiceOf(estimate.vat_percent));
  const [vatCustom, setVatCustom] = useState(
    vatChoiceOf(estimate.vat_percent) === 'custom' ? trimZeros(estimate.vat_percent ?? '') : '',
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const vmq = mode === 'vmq583';
  const changeMode = (next: MarkupMode) => {
    setMode(next);
    if (next === 'vmq583' && estimate.markup_mode !== 'vmq583') setOther('20');
    if (next === 'free') {
      setOther(initial.other);
      setProfit(initial.profit);
      setProduction(initial.production);
    }
  };
  const mutation = useMutation({
    mutationFn: (body: Record<string, string | boolean | null>) =>
      api(`/v1/estimates/${estimate.id}/header`, { method: 'PATCH', body }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['estimate', estimate.id] });
      toast.success(t('common.saved'));
      onClose();
    },
    onError: (e: ApiError) => toast.error(errorMessage(t, e.code, e.status)),
  });
  const submit = () => {
    const otherN = normalizeNumber(other);
    const profitN = vmq ? '7' : normalizeNumber(profit);
    const productionN = vmq ? (mountain ? '5' : '2.5') : normalizeNumber(production);
    const vatN = vatChoice === 'none' ? null : vatChoice === 'custom' ? normalizeNumber(vatCustom) : vatChoice;
    const bad: Record<string, string> = {};
    if (!PERCENT.test(otherN)) bad.other = t('est.err.percent');
    if (!PERCENT.test(profitN)) bad.profit = t('est.err.percent');
    if (!PERCENT.test(productionN)) bad.production = t('est.err.percent');
    if (vatN !== null && !PERCENT.test(vatN)) bad.vat = t('est.err.percent');
    setErrors(bad);
    if (Object.keys(bad).length) return;
    const next: Record<string, string | boolean | null> = {
      markup_mode: mode,
      other_costs_percent: otherN,
      profit_percent: profitN,
      production_costs_percent: productionN,
      deduct_customer_materials: deduct,
      vat_percent: vatN,
    };
    const old = estimate as unknown as Record<string, string | boolean | null | undefined>;
    // foiz: «21» va serverdagi «21.0000» bir xil (matn bo'yicha, arifmetikasiz)
    const changed = Object.fromEntries(
      Object.entries(next).filter(([key, value]) => {
        const was = old[key] ?? null;
        return typeof value === 'string' && typeof was === 'string'
          ? trimZeros(value) !== trimZeros(was)
          : value !== was;
      }),
    );
    if (!Object.keys(changed).length) return onClose();
    mutation.mutate(changed);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('est.price.settings')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <Select label={t('est.price.mode')} value={mode} onChange={(e) => changeMode(e.target.value as MarkupMode)}>
          <option value="free">{t('est.markup.free')}</option>
          <option value="vmq583">{t('est.markup.vmq583')}</option>
        </Select>
        <Input
          label={t('est.price.other_costs_percent')}
          inputMode="decimal"
          value={other}
          onChange={(e) => setOther(e.target.value)}
          error={errors.other}
        />
        {vmq ? (
          <>
            <Input label={t('est.price.profit_percent')} value="7" disabled readOnly />
            <label className="checkbox">
              <input type="checkbox" checked={mountain} onChange={(e) => setMountain(e.target.checked)} />{' '}
              {t('est.price.mountain')}
            </label>
          </>
        ) : (
          <>
            <Input
              label={t('est.price.profit_percent')}
              inputMode="decimal"
              value={profit}
              onChange={(e) => setProfit(e.target.value)}
              error={errors.profit}
            />
            <Input
              label={t('est.price.production_costs_percent')}
              inputMode="decimal"
              value={production}
              onChange={(e) => setProduction(e.target.value)}
              error={errors.production}
            />
          </>
        )}
        <label className="checkbox">
          <input type="checkbox" checked={deduct} onChange={(e) => setDeduct(e.target.checked)} />{' '}
          {t('est.price.deduct')}
        </label>
        <Select label={t('est.price.vat')} value={vatChoice} onChange={(e) => setVatChoice(e.target.value as VatChoice)}>
          <option value="none">{t('est.price.vat_none')}</option>
          <option value="12">12 %</option>
          <option value="6">6 %</option>
          <option value="custom">{t('est.price.vat_custom')}</option>
        </Select>
        {vatChoice === 'custom' && (
          <Input
            label={t('est.price.vat_percent')}
            inputMode="decimal"
            value={vatCustom}
            onChange={(e) => setVatCustom(e.target.value)}
            error={errors.vat}
          />
        )}
      </div>
    </Modal>
  );
}

/** S2: smeta sarlavhasi (asos, narx darajasi, shartnoma). Yangi reviziya yaratmaydi; bo'sh maydon tozalanadi. */
function HeaderModal({
  estimate,
  pricesVisible,
  onClose,
}: {
  estimate: EstimateDetail;
  pricesVisible: boolean;
  onClose: () => void;
}) {
  const { t } = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [basis, setBasis] = useState(estimate.basis ?? '');
  const [priceLevelDate, setPriceLevelDate] = useState(estimate.price_level_date ?? '');
  const [laborRateSource, setLaborRateSource] = useState(estimate.labor_rate_source ?? '');
  const [contractNumber, setContractNumber] = useState(estimate.contract_number ?? '');
  const [contractDate, setContractDate] = useState(estimate.contract_date ?? '');
  const [contractAmount, setContractAmount] = useState(estimate.contract_amount ?? '');
  const [amountError, setAmountError] = useState('');
  const mutation = useMutation({
    mutationFn: (body: Record<string, string | null>) =>
      api(`/v1/estimates/${estimate.id}/header`, { method: 'PATCH', body }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['estimate', estimate.id] });
      toast.success(t('common.saved'));
      onClose();
    },
    onError: (e: ApiError) => toast.error(errorMessage(t, e.code, e.status)),
  });
  const orNull = (v: string) => v.trim() || null;
  const submit = () => {
    const amount = normalizeNumber(contractAmount);
    if (pricesVisible && amount && !AMOUNT.test(amount)) {
      setAmountError(t('est.err.price'));
      return;
    }
    setAmountError('');
    // Faqat o'zgargan maydonlar yuboriladi: boshqa oynada saqlangan tahrir ustidan yozilmaydi, auditda ham faqat o'zgarish
    const next: Record<string, string | null> = {
      basis: orNull(basis),
      price_level_date: orNull(priceLevelDate),
      labor_rate_source: orNull(laborRateSource),
      contract_number: orNull(contractNumber),
      contract_date: orNull(contractDate),
      ...(pricesVisible ? { contract_amount: amount || null } : {}),
    };
    const changed = Object.fromEntries(
      Object.entries(next).filter(([key, value]) => {
        const old = (estimate as unknown as Record<string, string | null | undefined>)[key] ?? null;
        // summa: «311671640» va serverdagi «311671640.00» bir xil (matn bo'yicha, arifmetikasiz)
        return key === 'contract_amount' && value !== null && old !== null
          ? trimZeros(value) !== trimZeros(old)
          : value !== old;
      }),
    );
    if (!Object.keys(changed).length) return onClose();
    mutation.mutate(changed);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('est.header.edit')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <Textarea label={t('est.header.basis')} value={basis} onChange={(e) => setBasis(e.target.value)} />
        <Input
          type="date"
          label={t('est.header.price_level_date')}
          value={priceLevelDate}
          onChange={(e) => setPriceLevelDate(e.target.value)}
        />
        <Input
          label={t('est.header.labor_rate_source')}
          value={laborRateSource}
          onChange={(e) => setLaborRateSource(e.target.value)}
        />
        <Input
          label={t('est.header.contract_number')}
          value={contractNumber}
          onChange={(e) => setContractNumber(e.target.value)}
        />
        <Input
          type="date"
          label={t('est.header.contract_date')}
          value={contractDate}
          onChange={(e) => setContractDate(e.target.value)}
        />
        {pricesVisible && (
          <Input
            label={t('est.header.contract_amount')}
            inputMode="decimal"
            value={contractAmount}
            onChange={(e) => setContractAmount(e.target.value)}
            error={amountError || undefined}
          />
        )}
      </div>
    </Modal>
  );
}

/**
 * S2: resurslar yig'masi — mehnat, mashinalar, materiallar, xizmatlar bo'yicha kod + nom + birlik bo'yicha jamlangan miqdor.
 * Summalar va jami serverdan (frontend qo'shmaydi).
 */
function ResourcesTab({ id, revision, pricesVisible }: { id: string; revision: number; pricesVisible: boolean }) {
  const { t, lang } = useT();
  const query = useQuery({
    queryKey: ['estimate-resources', id, revision],
    queryFn: () => api<EstimateResources>(`/v1/estimates/${id}/resources`),
  });
  if (query.isError)
    return (
      <Alert tone="danger">{errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}</Alert>
    );
  if (!query.data) return <p className="muted">{t('common.loading')}</p>;
  const { items, by_kind: byKind, total } = query.data;
  if (!items.length) return <p className="muted">{t('est.res.empty')}</p>;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <p className="muted text-sm">{t('est.res.hint')}</p>
      {byKind.map((g) => (
        <section key={g.key} className="card">
          <div className="card-header">
            <h3>{t(`est.res.kind.${g.key}`)}</h3>
            {pricesVisible && g.total !== undefined && <b>{formatMoney(g.total, lang)}</b>}
          </div>
          <div className="table-wrap">
            <table className="table table-dense">
              <thead>
                <tr>
                  <th>{t('est.res.code')}</th>
                  <th>{t('common.name')}</th>
                  <th>{t('est.col.unit')}</th>
                  <th className="num">{t('est.col.quantity')}</th>
                  {pricesVisible && <th className="num">{t('est.res.amount')}</th>}
                  <th className="num">{t('est.lines')}</th>
                </tr>
              </thead>
              <tbody>
                {items
                  .filter((r) => r.kind === g.key)
                  .map((r, i) => (
                    <tr key={`${r.resource_code ?? ''}|${r.name}|${r.unit_id}|${i}`}>
                      <td className="muted">{r.resource_code ?? '—'}</td>
                      <td>{r.name}</td>
                      <td>{unitLabel(r.unit_id)}</td>
                      <td className="num">{formatQuantity(r.quantity)}</td>
                      {pricesVisible && <td className="num">{formatMoney(r.amount, lang, false)}</td>}
                      <td className="num">{r.line_count}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {pricesVisible && total !== undefined && (
        <section className="card card-pad est-calc">
          <dl>
            <div className="est-grand-total">
              <span>{t('est.res.total')}</span>
              <span>{formatMoney(total, lang)}</span>
            </div>
          </dl>
        </section>
      )}
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
