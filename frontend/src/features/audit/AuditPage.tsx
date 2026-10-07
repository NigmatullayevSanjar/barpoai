import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError, qs } from '@/lib/api';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDateTime } from '@/lib/format';
import { Alert, Badge, Input, PageHeader, Pagination } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ExportButton } from '@/features/common/ExportButton';

type AuditRow = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};
const LIMIT = 50;
/** Audit jurnali: faqat kompaniya admini; filtrlar serverda, yozuvlar o'zgartirilmaydi. */
export function AuditPage() {
  const { t, lang } = useT();
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const filters = { action: action.trim() || undefined, from: from || undefined, to: to || undefined };
  const query = useQuery({
    queryKey: ['audit', filters, offset],
    queryFn: () =>
      api<{ items: AuditRow[]; total: number }>(`/v1/audit${qs({ ...filters, limit: LIMIT, offset })}`),
  });
  const columns: Column<AuditRow>[] = [
    {
      key: 'time',
      header: t('common.date'),
      width: 150,
      render: (r) => <span className="mono text-xs">{formatDateTime(r.created_at, lang)}</span>,
    },
    {
      key: 'actor',
      header: t('audit.actor'),
      render: (r) => (
        <>
          <div className="cell-main">{r.actor_name ?? t('audit.system')}</div>
          {r.actor_role && <div className="cell-sub">{t(`role.${r.actor_role}`)}</div>}
        </>
      ),
    },
    {
      key: 'action',
      header: t('audit.action'),
      render: (r) => <Badge tone="brand">{r.action}</Badge>,
    },
    {
      key: 'resource',
      header: t('audit.resource'),
      render: (r) => <span className="mono text-xs">{r.resource_id ? r.resource_id.slice(0, 8) : '—'}</span>,
    },
    {
      key: 'details',
      header: t('audit.details'),
      render: (r) =>
        Object.keys(r.details).length ? (
          <code className="text-xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {JSON.stringify(r.details)}
          </code>
        ) : (
          <span className="muted">—</span>
        ),
    },
  ];
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader
        title={t('audit.title')}
        description={t('audit.sub')}
        actions={<ExportButton path={`/v1/audit/export${qs(filters)}`} />}
      />
      <div className="toolbar">
        <Input
          aria-label={t('audit.filter_action')}
          placeholder={t('audit.filter_action')}
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setOffset(0);
          }}
        />
        <Input
          type="date"
          aria-label={t('audit.from')}
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setOffset(0);
          }}
        />
        <Input
          type="date"
          aria-label={t('audit.to')}
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setOffset(0);
          }}
        />
        {query.data && (
          <span className="muted text-sm">
            {t('common.total')}: {query.data.total}
          </span>
        )}
      </div>
      {query.isError && (
        <Alert tone="danger">
          {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
        </Alert>
      )}
      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(r) => r.id}
        loading={query.isLoading}
        dense
        empty={{ title: t('audit.empty') }}
      />
      {(query.data?.total ?? 0) > LIMIT && (
        <Pagination offset={offset} limit={LIMIT} count={query.data!.total} onChange={setOffset} />
      )}
    </div>
  );
}
