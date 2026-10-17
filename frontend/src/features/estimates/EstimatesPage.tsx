import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calculator, FileSpreadsheet, Plus } from 'lucide-react';
import { api, ApiError, qs, type ListResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatMoney } from '@/lib/format';
import { displayCurrency } from '@/lib/currency-store';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  SearchInput,
  Stat,
  useListState,
} from '@/components/ui';
import { ProjectSelect, useProjectSelection } from '@/features/common/ProjectSelect';
import type { EstimateSummary, EstimatesSummary } from './model';
import { ImportWizard } from './ImportWizard';

/** Smetalar ro'yxati (Figma "smetalar"): KPI kartalar, qidiruv va amallar, kartadagi qatorlar. */
export function EstimatesPage() {
  const { t, lang } = useT();
  const { can, permissions, me } = useAuth();
  const navigate = useNavigate();
  const list = useListState();
  const sel = useProjectSelection();
  const [importOpen, setImportOpen] = useState(false);
  const query = useQuery({
    queryKey: ['estimates', sel.projectId, list.q, list.limit, list.offset],
    queryFn: () =>
      api<ListResponse<EstimateSummary> & { summary: EstimatesSummary }>(
        `/v1/estimates${qs({ project_id: sel.projectId, q: list.q, limit: list.limit, offset: list.offset })}`,
      ),
    enabled: Boolean(sel.projectId),
  });
  const pricesVisible = me?.role === 'tenant_admin' || permissions?.permissions.includes('prices.read');
  const summary = query.data?.summary;
  const rows = query.data?.items;
  const actions = can('estimates', 'create') && sel.projectId && (
    <>
      <Button variant="secondary" icon={<FileSpreadsheet />} onClick={() => setImportOpen(true)}>
        {t('est.import')}
      </Button>
      <Button icon={<Plus />} onClick={() => navigate(`/app/estimates/new?project=${sel.projectId}`)}>
        {t('est.new')}
      </Button>
    </>
  );
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader title={t('est.title')} description={t('est.sub')} />
      {summary && (
        <div className={pricesVisible ? 'grid-4' : 'grid-2'}>
          <Stat label={t('est.kpi.count')} value={summary.count} sub={t('est.kpi.count_sub')} />
          <Stat label={t('est.kpi.lines')} value={summary.line_count} sub={t('est.kpi.lines_sub')} />
          {pricesVisible && summary.total !== undefined && (
            <Stat
              label={t('est.kpi.total')}
              value={formatMoney(summary.total, lang, false)}
              sub={displayCurrency()}
            />
          )}
          {pricesVisible && summary.material_total !== undefined && (
            <Stat
              label={t('est.kpi.material')}
              value={formatMoney(summary.material_total, lang, false)}
              sub={displayCurrency()}
            />
          )}
        </div>
      )}
      <div className="toolbar blocks-toolbar">
        <ProjectSelect
          value={sel.projectId}
          onChange={(id) => {
            sel.setProjectId(id);
            list.setOffset(0);
          }}
          projects={sel.projects}
        />
        <SearchInput value={list.search} onChange={list.setSearch} placeholder={t('est.search')} />
        {!pricesVisible && <Badge tone="warning">{t('est.unit_price_hidden')}</Badge>}
        <span className="spacer" />
        {actions}
      </div>
      {!sel.projectId && !sel.loading ? (
        <div className="card">
          <p className="card-pad muted">{t('erp.no_project_access')}</p>
        </div>
      ) : query.isError ? (
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
            icon={<Calculator />}
            title={t('est.empty')}
            description={t('est.empty_desc')}
            action={actions || undefined}
          />
        </div>
      ) : (
        <div className="card">
          <ul className="est-list">
            {rows.map((r) => (
              <li key={r.id}>
                <Link to={`/app/estimates/${r.id}`} className="est-row">
                  <span className="est-main">
                    <span className="est-code">
                      {t('est.revision')} {r.revision}
                    </span>
                    <h3>{r.name}</h3>
                    <span className="est-sub">
                      {t('est.lines')}: {r.line_count}
                      {r.created_by_name ? ` · ${r.created_by_name}` : ''}
                    </span>
                  </span>
                  {pricesVisible && <span className="est-total">{formatMoney(r.total, lang)}</span>}
                  <span className="est-date">{formatDate(r.created_at, lang)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination
            offset={list.pagination.offset}
            limit={list.pagination.limit}
            count={rows.length}
            onChange={list.pagination.onChange}
            onLimitChange={list.pagination.onLimitChange}
          />
        </div>
      )}
      {importOpen && sel.projectId && (
        <ImportWizard projectId={sel.projectId} onClose={() => setImportOpen(false)} />
      )}
    </div>
  );
}
