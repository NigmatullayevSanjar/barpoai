import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { errorMessage, useT } from '@/lib/i18n';
import { formatQuantity } from '@/lib/format';
import { Alert, Badge, Spinner } from '@/components/ui';

/** V-E (D23): qavat × ish progress matritsasi — hamma raqam serverdan (decimal satr), frontend faqat ko'rsatadi. */
type FloorProgress = {
  floors: {
    id: string;
    name: string;
    parent_name: string | null;
    plan: string | null;
    fact: string;
    percent: string | null;
  }[];
  works: {
    description: string;
    unit_id: string;
    plan: string | null;
    fact: string;
    percent: string | null;
  }[];
  cells: {
    zone_id: string;
    description: string;
    unit_id: string;
    plan: string | null;
    fact: string;
    percent: string | null;
  }[];
};
const workKey = (w: { description: string; unit_id: string }) => `${w.description}\u0000${w.unit_id}`;

function ProgressCell({
  plan,
  fact,
  percent,
  unit,
}: {
  plan: string | null;
  fact: string;
  percent: string | null;
  unit: string;
}) {
  const hasFact = Number(fact) > 0;
  if (!plan && !hasFact) return <span className="muted">—</span>;
  if (percent === null) return <span>{formatQuantity(fact, unit)}</span>;
  const p = Number(percent);
  return (
    <>
      <Badge tone={p >= 100 ? 'success' : p > 0 ? 'warning' : 'neutral'}>{percent} %</Badge>
      <div className="muted text-xs">
        {formatQuantity(fact, unit)} / {formatQuantity(plan, unit)}
      </div>
    </>
  );
}

export function FloorProgressTab({ projectId }: { projectId: string }) {
  const { t } = useT();
  const query = useQuery({
    queryKey: ['project-floor-progress', projectId],
    queryFn: () => api<FloorProgress>(`/v1/projects/${projectId}/floor-progress`),
  });
  if (query.error)
    return (
      <Alert tone="danger">
        {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
      </Alert>
    );
  if (!query.data) return <Spinner />;
  const { floors, works, cells } = query.data;
  if (!floors.length) return <Alert tone="info">{t('projects.progress.no_floors')}</Alert>;
  if (!works.length) return <Alert tone="info">{t('projects.progress.no_works')}</Alert>;
  const cellMap = new Map(cells.map((c) => [`${c.zone_id}|${workKey(c)}`, c]));
  return (
    <section className="card stack">
      <p className="muted text-xs" style={{ margin: 0 }}>
        {t('projects.progress.hint')}
      </p>
      <div className="table-wrap">
        <table className="table table-dense">
          <thead>
            <tr>
              <th>{t('projects.progress.floor')}</th>
              {works.map((w) => (
                <th key={workKey(w)}>
                  {w.description}
                  <div className="muted text-xs">{w.unit_id}</div>
                </th>
              ))}
              <th>{t('projects.progress.total')}</th>
            </tr>
          </thead>
          <tbody>
            {floors.map((f) => (
              <tr key={f.id}>
                <th scope="row">{f.parent_name ? `${f.parent_name} / ${f.name}` : f.name}</th>
                {works.map((w) => {
                  const c = cellMap.get(`${f.id}|${workKey(w)}`);
                  return (
                    <td key={workKey(w)}>
                      {c ? (
                        <ProgressCell plan={c.plan} fact={c.fact} percent={c.percent} unit={w.unit_id} />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  );
                })}
                <td>
                  {f.percent !== null ? (
                    <Badge tone={Number(f.percent) >= 100 ? 'success' : 'warning'}>{f.percent} %</Badge>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <th scope="row">{t('projects.progress.total')}</th>
              {works.map((w) => (
                <td key={workKey(w)}>
                  <ProgressCell plan={w.plan} fact={w.fact} percent={w.percent} unit={w.unit_id} />
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
