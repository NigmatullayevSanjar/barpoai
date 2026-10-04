import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Image as ImageIcon } from 'lucide-react';
import { api, ApiError, qs } from '@/lib/api';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatDateTime } from '@/lib/format';
import { Alert, Badge, EmptyState, Modal, PageHeader, Pagination, Segmented } from '@/components/ui';
import { ProjectSelect, useProjectSelection } from '@/features/common/ProjectSelect';
import { useFileContent } from '@/features/work/model';

type ProjectFile = {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  created_at: string;
  report_id: string | null;
  task_id: string | null;
  uploaded_by_name: string;
  report_date: string | null;
  report_status: string | null;
  task_title: string | null;
};
const LIMIT = 48;
function Thumb({ file, onOpen }: { file: ProjectFile; onOpen: () => void }) {
  const content = useFileContent(file.id);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card"
      style={{ padding: 0, overflow: 'hidden', cursor: 'pointer', textAlign: 'left' }}
      aria-label={file.name}
    >
      <div style={{ height: 140, background: 'var(--surface-2)', display: 'grid', placeItems: 'center' }}>
        {content.data ? (
          <img
            src={`data:${content.data.mime_type};base64,${content.data.base64}`}
            alt={file.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <ImageIcon size={24} style={{ color: 'var(--muted)' }} />
        )}
      </div>
      <div className="card-pad" style={{ padding: '8px 10px' }}>
        <div className="text-sm truncate" style={{ fontWeight: 500 }}>
          {file.report_id ? `${file.report_date ? formatDate(file.report_date) : ''}` : file.task_title}
        </div>
        <small className="muted">
          {file.uploaded_by_name} · {formatDate(file.created_at)}
        </small>
      </div>
    </button>
  );
}
/** Obyekt fayllari: hisobot va vazifa fotosuratlari, manba konteksti bilan. Yuklash o'z sahifalarida qoladi. */
export function FilesPage() {
  const { t, lang } = useT();
  const sel = useProjectSelection();
  const [kind, setKind] = useState<'all' | 'reports' | 'tasks'>('all');
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<ProjectFile | null>(null);
  const opened = useFileContent(open?.id ?? null);
  const query = useQuery({
    queryKey: ['files', 'project', sel.projectId, offset],
    queryFn: () =>
      api<{ items: ProjectFile[] }>(`/v1/files${qs({ project_id: sel.projectId, limit: LIMIT, offset })}`),
    enabled: Boolean(sel.projectId),
  });
  const items = (query.data?.items ?? []).filter((f) =>
    kind === 'all' ? true : kind === 'reports' ? Boolean(f.report_id) : Boolean(f.task_id),
  );
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader title={t('files.title')} description={t('files.sub')} />
      <div className="toolbar">
        <ProjectSelect value={sel.projectId} onChange={sel.setProjectId} projects={sel.projects} />
        <Segmented<'all' | 'reports' | 'tasks'>
          value={kind}
          onChange={setKind}
          items={[
            { key: 'all', label: t('files.filter.all') },
            { key: 'reports', label: t('files.filter.reports') },
            { key: 'tasks', label: t('files.filter.tasks') },
          ]}
        />
      </div>
      {query.isError && (
        <Alert tone="danger">
          {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
        </Alert>
      )}
      {query.data && items.length === 0 ? (
        <div className="card">
          <EmptyState icon={<ImageIcon />} title={t('files.empty')} description={t('files.empty_desc')} />
        </div>
      ) : (
        <div className="grid-4">
          {items.map((f) => (
            <Thumb key={f.id} file={f} onOpen={() => setOpen(f)} />
          ))}
        </div>
      )}
      {(query.data?.items.length ?? 0) >= LIMIT && (
        <Pagination offset={offset} limit={LIMIT} count={offset + LIMIT + 1} onChange={setOffset} />
      )}
      {open && (
        <Modal open onClose={() => setOpen(null)} title={open.name} size="lg">
          <div className="stack">
            <div className="row wrap text-sm">
              {open.report_id ? (
                <Badge tone="info">
                  {t('files.from_report')} · {formatDate(open.report_date, lang)}
                </Badge>
              ) : (
                <Badge tone="brand">
                  {t('files.from_task')} · {open.task_title}
                </Badge>
              )}
              <span className="muted">
                {t('files.uploaded_by')}: {open.uploaded_by_name} · {formatDateTime(open.created_at, lang)} ·{' '}
                {t('files.size')}: {Math.round(open.size / 1024)} KB
              </span>
              <Link
                to={
                  open.report_id
                    ? `/app/reports?project=${sel.projectId}`
                    : `/app/tasks?project=${sel.projectId}`
                }
              >
                {open.report_id ? t('page.reports') : t('page.tasks')}
              </Link>
            </div>
            {opened.data ? (
              <img
                src={`data:${opened.data.mime_type};base64,${opened.data.base64}`}
                alt={open.name}
                style={{ maxWidth: '100%', borderRadius: 8 }}
              />
            ) : (
              <Alert tone="info">{t('common.loading')}</Alert>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
