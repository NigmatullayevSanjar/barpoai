import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, Plus } from 'lucide-react';
import { api, ApiError, type ListResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatMoney } from '@/lib/format';
import { Badge, Button, PageHeader, SearchInput, useListState } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ProjectSelect, useProjectSelection } from '@/features/common/ProjectSelect';
import type { EstimateSummary } from './model';
import { ImportWizard } from './ImportWizard';

export function EstimatesPage() {
  const { t, lang } = useT();
  const { can, permissions, me } = useAuth();
  const navigate = useNavigate();
  const list = useListState();
  const sel = useProjectSelection();
  const [importOpen, setImportOpen] = useState(false);
  const query = useQuery({
    queryKey: ['estimates', sel.projectId],
    queryFn: () => api<ListResponse<EstimateSummary>>(`/v1/estimates?project_id=${sel.projectId}&limit=100`),
    enabled: Boolean(sel.projectId),
  });
  const pricesVisible = me?.role === 'tenant_admin' || permissions?.permissions.includes('prices.read');
  const columns: Column<EstimateSummary>[] = [
    {
      key: 'name',
      header: t('est.name'),
      sortValue: (r) => r.name,
      render: (r) => (
        <>
          <div className="cell-main">{r.name}</div>
          <div className="cell-sub">
            {t('est.revision')} {r.revision} · {r.created_by_name ?? '—'}
          </div>
        </>
      ),
    },
    {
      key: 'lines',
      header: t('est.lines'),
      align: 'right',
      sortValue: (r) => r.line_count,
      render: (r) => r.line_count,
    },
    ...(pricesVisible
      ? ([
          {
            key: 'material',
            header: t('est.material_total'),
            align: 'right',
            sortValue: (r) => Number(r.material_total),
            render: (r) => formatMoney(r.material_total, lang, false),
          },
          {
            key: 'work',
            header: t('est.work_total'),
            align: 'right',
            sortValue: (r) => Number(r.work_total),
            render: (r) => formatMoney(r.work_total, lang, false),
          },
          {
            key: 'total',
            header: t('est.total'),
            align: 'right',
            sortValue: (r) => Number(r.total),
            render: (r) => <b>{formatMoney(r.total, lang)}</b>,
          },
        ] as Column<EstimateSummary>[])
      : []),
    {
      key: 'created',
      header: t('common.created_at'),
      sortValue: (r) => r.created_at,
      render: (r) => formatDate(r.created_at, lang),
    },
  ];
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
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader title={t('est.title')} description={t('est.sub')} actions={actions || undefined} />
      <div className="toolbar">
        <ProjectSelect value={sel.projectId} onChange={sel.setProjectId} projects={sel.projects} />
        <SearchInput value={list.search} onChange={list.setSearch} />
        {!pricesVisible && <Badge tone="warning">{t('est.unit_price_hidden')}</Badge>}
      </div>
      {!sel.projectId && !sel.loading ? (
        <div className="card">
          <p className="card-pad muted">{t('erp.no_project_access')}</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={query.data?.items}
          rowKey={(r) => r.id}
          loading={query.isLoading || sel.loading}
          error={
            query.error
              ? errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)
              : null
          }
          onRetry={query.refetch}
          onRowClick={(r) => navigate(`/app/estimates/${r.id}`)}
          search={{ query: list.search, fields: (r) => [r.name, r.created_by_name] }}
          empty={{ title: t('est.empty'), description: t('est.empty_desc'), action: actions || undefined }}
        />
      )}
      {importOpen && sel.projectId && (
        <ImportWizard projectId={sel.projectId} onClose={() => setImportOpen(false)} />
      )}
    </div>
  );
}
