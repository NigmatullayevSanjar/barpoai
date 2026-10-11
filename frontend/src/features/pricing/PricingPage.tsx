import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, ApiError, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCurrency } from '@/lib/currency';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatMoney, formatQuantity } from '@/lib/format';
import {
  Alert,
  Button,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Stat,
  Textarea,
  useListState,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { ProjectSelect, useProjectSelection } from '@/features/common/ProjectSelect';
import { ExportButton } from '@/features/common/ExportButton';
import { premiseKinds } from '@/features/projects/types';
import type { PriceGroup, PriceLine, PriceList, PriceListDetail } from './types';

const MARKUP_RE = /^(0|[1-9]\d{0,3})(\.\d{1,2})?$/;

function NewVersionModal({
  projectId,
  initialMarkup,
  onClose,
  onCreated,
}: {
  projectId: string;
  initialMarkup: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [markup, setMarkup] = useState(initialMarkup);
  const [note, setNote] = useState('');
  const valid = MARKUP_RE.test(markup.trim()) && Number(markup) <= 1000;
  const create = useMutation({
    mutationFn: () =>
      api<PriceList>('/v1/pricing/price-lists', {
        method: 'POST',
        body: {
          project_id: projectId,
          markup_percent: markup.trim(),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['price-lists', projectId] });
      onCreated(created.id);
      toast.success(t('common.saved'));
      onClose();
    },
  });
  const err = create.error as ApiError | null;
  return (
    <Modal
      open
      onClose={onClose}
      title={t('pricing.new_version')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={create.isPending} disabled={!valid} onClick={() => create.mutate()}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        {err && <Alert tone="danger">{errorMessage(t, err.code, err.status)}</Alert>}
        <Input
          label={t('pricing.markup')}
          inputMode="decimal"
          value={markup}
          error={markup === '' || valid ? undefined : t('pricing.markup_invalid')}
          onChange={(e) => setMarkup(e.target.value)}
        />
        <Textarea label={t('pricing.note')} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="muted">{t('pricing.rate_hint')}</p>
      </div>
    </Modal>
  );
}

export function PricingPage() {
  const { t, lang } = useT();
  const { can } = useAuth();
  const { display: currency } = useCurrency();
  const sel = useProjectSelection();
  const list = useListState();
  const [kind, setKind] = useState('');
  const [picked, setPicked] = useState('');
  const [creating, setCreating] = useState(false);
  const canCreate = can('pricing', 'create');
  const projectId = sel.projectId;

  const versions = useQuery({
    queryKey: ['price-lists', projectId],
    queryFn: () =>
      api<{ items: PriceList[] }>(`/v1/pricing/price-lists${qs({ project_id: projectId, limit: 100 })}`),
    enabled: Boolean(projectId),
  });
  const items = versions.data?.items ?? [];
  const current = items.find((v) => v.id === picked) ?? items[0] ?? null;
  const detail = useQuery({
    queryKey: ['price-list', current?.id, list.q, kind, list.offset, list.limit],
    queryFn: () =>
      api<PriceListDetail>(
        `/v1/pricing/price-lists/${current!.id}${qs({ limit: list.limit, offset: list.offset, q: list.q, kind })}`,
      ),
    enabled: Boolean(current),
  });

  const readiness = useQuery({
    queryKey: ['price-list-readiness', projectId],
    queryFn: () =>
      api<{ premises_count: number; has_costs: boolean }>(`/v1/pricing/readiness${qs({ project_id: projectId })}`),
    enabled: Boolean(projectId),
  });
  // Bo'sh holat sababi serverdan: xonadon yo'q yoki reja/fakt xarajat yo'q; javob kelmaguncha tugma ochiq qoladi.
  const blocker = !readiness.data
    ? null
    : readiness.data.premises_count === 0
      ? 'no_premises'
      : readiness.data.has_costs
        ? null
        : 'no_costs';
  const openProject = (
    <Link className="btn btn-secondary" to={`/app/projects/${projectId}`}>
      {t('pricing.open_project')}
    </Link>
  );
  const label = (v: PriceList) => `v${v.version} · ${formatDate(v.created_at, lang)} · ${v.created_by_name}`;
  const usd = currency === 'USD' && Boolean(current?.usd_rate);
  const noRateInUsd = currency === 'USD' && current !== null && !current.usd_rate;
  const dash = <span className="muted">—</span>;
  const uzs = (v: string) => formatMoney(v, lang, true, 'UZS');
  const usdFmt = (v: string | null) => (v === null ? dash : formatMoney(v, lang, true, 'USD'));
  const newButton = (
    <Button icon={<Plus />} disabled={blocker !== null} onClick={() => setCreating(true)}>
      {t('pricing.new_version')}
    </Button>
  );

  const groupColumns: Column<PriceGroup>[] = [
    {
      key: 'group',
      header: t('pricing.col.group'),
      render: (g) => <span className="cell-main">{g.zone_name ?? t('pricing.common_group')}</span>,
    },
    { key: 'premises', header: t('pricing.col.premises'), align: 'right', render: (g) => g.premises },
    { key: 'area', header: t('pricing.col.area'), align: 'right', render: (g) => formatQuantity(g.area_m2) },
    { key: 'plan', header: `${t('pricing.col.plan')} (UZS)`, align: 'right', render: (g) => uzs(g.plan_value) },
    { key: 'fact', header: `${t('pricing.col.fact')} (UZS)`, align: 'right', render: (g) => uzs(g.fact_value) },
    {
      key: 'forecast',
      header: `${t('pricing.col.forecast')} (UZS)`,
      align: 'right',
      render: (g) => uzs(g.forecast_value),
    },
    {
      key: 'forecast_m2',
      header: `${t('pricing.col.forecast_m2')} (UZS)`,
      align: 'right',
      render: (g) => uzs(g.forecast_m2),
    },
  ];
  const lineColumns: Column<PriceLine>[] = [
    { key: 'block', header: t('pricing.col.block'), render: (r) => r.block_name ?? dash },
    { key: 'entrance', header: t('pricing.col.entrance'), render: (r) => r.entrance_name ?? dash },
    { key: 'floor', header: t('pricing.col.floor'), render: (r) => r.floor ?? dash },
    { key: 'number', header: t('pricing.col.number'), render: (r) => <span className="cell-main">{r.number}</span> },
    { key: 'kind', header: t('pricing.col.kind'), render: (r) => t(`premises.kind.${r.kind}`) },
    { key: 'rooms', header: t('pricing.col.rooms'), render: (r) => r.rooms ?? dash },
    { key: 'area', header: t('pricing.col.area'), align: 'right', render: (r) => formatQuantity(r.area_m2) },
    { key: 'cost_m2', header: `${t('pricing.col.cost_m2')} (UZS)`, align: 'right', render: (r) => uzs(r.cost_m2) },
    { key: 'cost', header: `${t('pricing.col.cost')} (UZS)`, align: 'right', render: (r) => uzs(r.cost) },
    usd
      ? {
          key: 'sale_m2',
          header: `${t('pricing.col.sale_m2')} (USD)`,
          align: 'right',
          render: (r) => usdFmt(r.sale_m2_usd),
        }
      : {
          key: 'sale_m2',
          header: `${t('pricing.col.sale_m2')} (UZS)`,
          align: 'right',
          render: (r) => uzs(r.sale_m2),
        },
    usd
      ? {
          key: 'price',
          header: `${t('pricing.col.price')} (USD)`,
          align: 'right',
          render: (r) => <span className="cell-main">{usdFmt(r.price_usd)}</span>,
        }
      : {
          key: 'price',
          header: `${t('pricing.col.price')} (UZS)`,
          align: 'right',
          render: (r) => <span className="cell-main">{uzs(r.price)}</span>,
        },
  ];

  const queryError = (versions.error ?? detail.error) as ApiError | null;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader
        title={t('pricing.title')}
        description={t('pricing.sub')}
        actions={
          projectId && (
            <span className="row">
              {canCreate && newButton}
              {current && (
                <ExportButton
                  path={`/v1/pricing/price-lists/${current.id}/export${qs({ currency })}`}
                  disabled={currency === 'USD' && !current.usd_rate}
                />
              )}
            </span>
          )
        }
      />
      <div className="toolbar">
        <ProjectSelect
          value={projectId}
          onChange={(id) => {
            sel.setProjectId(id);
            setPicked('');
            list.setOffset(0);
          }}
          projects={sel.projects}
        />
        {items.length > 0 && (
          <Select
            aria-label={t('pricing.version')}
            value={current?.id ?? ''}
            onChange={(e) => {
              setPicked(e.target.value);
              list.setOffset(0);
            }}
          >
            {items.map((v) => (
              <option key={v.id} value={v.id}>
                {label(v)}
              </option>
            ))}
          </Select>
        )}
      </div>
      <p className="muted">{t('pricing.estimates_hint')}</p>
      {queryError && <Alert tone="danger">{errorMessage(t, queryError.code, queryError.status)}</Alert>}
      {projectId && versions.isSuccess && !current && (
        <EmptyState
          title={t(blocker ? `pricing.${blocker}` : 'pricing.empty')}
          description={blocker ? t(`pricing.${blocker}_desc`) : undefined}
          action={blocker === 'no_premises' ? openProject : canCreate && !blocker ? newButton : undefined}
        />
      )}
      {current && blocker && (
        <Alert tone="warning">
          <span className="row" style={{ gap: 12 }}>
            <span>
              {t(`pricing.${blocker}`)}. {t(`pricing.${blocker}_desc`)}
            </span>
            {blocker === 'no_premises' && openProject}
          </span>
        </Alert>
      )}
      {current && (
        <>
          <div className="muted">
            {t(current.usd_rate ? 'pricing.meta' : 'pricing.meta_no_rate', {
              version: current.version,
              date: formatDate(current.created_at, lang),
              author: current.created_by_name,
              markup: current.markup_percent,
              rate: formatMoney(current.usd_rate, lang, true, 'UZS'),
              rateDate: current.usd_rate_date ? formatDate(current.usd_rate_date, lang) : '—',
            })}
          </div>
          {current.note && <div>{current.note}</div>}
          {noRateInUsd && <Alert tone="warning">{t('pricing.version_no_rate')}</Alert>}
          <div className="grid-4">
            <Stat
              label={t('pricing.area_total')}
              value={`${formatQuantity(current.area_total)} m²`}
              sub={`${t('pricing.premises_count')}: ${current.premises_count}`}
            />
            <Stat label={t('pricing.plan_total')} value={uzs(current.plan_total)} />
            <Stat label={t('pricing.fact_total')} value={uzs(current.fact_total)} />
            <Stat
              label={t('pricing.forecast_total')}
              value={uzs(current.forecast_total)}
              sub={currency === 'USD' ? t('pricing.totals_uzs') : undefined}
            />
          </div>
          <section className="card">
            <DataTable dense columns={groupColumns} rows={current.groups} rowKey={(g) => g.zone_id ?? 'common'} />
          </section>
          <section className="card card-pad stack" style={{ gap: 12 }}>
            <div className="toolbar">
              <SearchInput value={list.search} onChange={list.setSearch} />
              <Select
                aria-label={t('pricing.col.kind')}
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  list.setOffset(0);
                }}
              >
                <option value="">{t('premises.kind_all')}</option>
                {premiseKinds.map((k) => (
                  <option key={k} value={k}>
                    {t(`premises.kind.${k}`)}
                  </option>
                ))}
              </Select>
            </div>
            <DataTable
              dense
              columns={lineColumns}
              rows={detail.data?.lines}
              rowKey={(r) => r.id}
              loading={detail.isLoading}
              pagination={list.pagination}
            />
          </section>
        </>
      )}
      {creating && (
        <NewVersionModal
          key={projectId}
          projectId={projectId}
          initialMarkup={items[0]?.markup_percent ?? ''}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setPicked(id);
            list.setOffset(0);
          }}
        />
      )}
    </div>
  );
}
