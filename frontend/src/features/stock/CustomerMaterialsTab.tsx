import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError, qs } from '@/lib/api';
import { errorMessage, useT } from '@/lib/i18n';
import { formatMoney, formatQuantity, unitLabel } from '@/lib/format';
import { Alert, Button, Input } from '@/components/ui';
import { ExportButton } from '@/features/common/ExportButton';

type Amount = { quantity: string; value?: string };
type Flow = 'opening' | 'received' | 'consumed' | 'adjusted' | 'closing';
type CustomerMaterial = {
  material_id: string;
  name: string;
  unit_id: string;
  mixed: boolean;
  works: string[];
} & Record<Flow, Amount>;
type CustomerMaterialsReport = {
  period: { from: string; to: string };
  contracts: { number: string; date: string | null }[];
  materials: CustomerMaterial[];
  lines: {
    estimate_id: string;
    estimate_name: string;
    line_id: string;
    work: string | null;
    material_id: string;
    description: string;
    unit_id: string;
    normative: string | null;
    actual: string;
    deviation: string | null;
  }[];
  totals: Record<Flow, { value?: string }>;
  warnings: {
    mixed: string[];
    adjusted: { name: string; unit_id: string; quantity: string }[];
    unlinked: { name: string; unit_id: string; quantity: string }[];
  };
};

const pad = (n: number) => String(n).padStart(2, '0');
/** Joriy oy "YYYY-MM" (Toshkent vaqti bilan). */
const currentMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' }).slice(0, 7);
/** "YYYY-MM" → oyning birinchi va oxirgi kuni. */
function monthRange(ym: string) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  if (!y || !m) return { from: '', to: '' };
  return { from: `${ym}-01`, to: `${ym}-${pad(new Date(y, m, 0).getDate())}` };
}

/**
 * S5: «Buyurtmachi materiallari» hisoboti — davr boshidagi qoldiq, berilgan, sarflangan va davr oxiridagi qoldiq,
 * ish bo'yicha normativ va haqiqiy sarf. Barcha miqdor va summalar serverdan; summa ruxsati bo'lmasa `value` kelmaydi.
 */
export function CustomerMaterialsTab({ projectId }: { projectId: string }) {
  const { t, lang } = useT();
  const [byDates, setByDates] = useState(false);
  const [month, setMonth] = useState(currentMonth);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const { from, to } = byDates ? { from: rangeFrom, to: rangeTo } : monthRange(month);
  const ready = Boolean(from && to);
  const query = useQuery({
    queryKey: ['customer-materials', projectId, from, to],
    queryFn: () =>
      api<CustomerMaterialsReport>(`/v1/stock/customer-materials${qs({ project_id: projectId, from, to })}`),
    enabled: ready,
  });
  const switchMode = () => {
    if (!byDates) {
      setRangeFrom(from);
      setRangeTo(to);
    } else if (rangeFrom) {
      setMonth(rangeFrom.slice(0, 7));
    }
    setByDates(!byDates);
  };
  const report = query.data;
  const materials = report?.materials ?? [];
  const money = materials.some((m) => m.closing.value !== undefined);
  const adjusted = materials.some((m) => /[1-9]/.test(m.adjusted.quantity));
  const flows: Flow[] = adjusted
    ? ['opening', 'received', 'consumed', 'adjusted', 'closing']
    : ['opening', 'received', 'consumed', 'closing'];
  const span = money ? 2 : 1;
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {byDates ? (
          <>
            <Input
              type="date"
              label={t('est.act.from')}
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
            />
            <Input
              type="date"
              label={t('est.act.to')}
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
            />
          </>
        ) : (
          <Input
            type="month"
            label={t('est.act.month')}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        )}
        <Button variant="secondary" onClick={switchMode}>
          {byDates ? t('est.act.by_month') : t('est.act.by_dates')}
        </Button>
        <span className="spacer" />
        <ExportButton
          path={`/v1/stock/customer-materials/export${qs({ project_id: projectId, from, to })}`}
          disabled={!ready}
        />
      </div>
      {query.isError && (
        <Alert tone="danger">
          {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
        </Alert>
      )}
      {ready && query.isPending && <p className="muted">{t('common.loading')}</p>}
      {report && (
        <>
          {report.warnings.mixed.length > 0 && (
            <Alert tone="warning">
              <div className="stack" style={{ gap: 4 }}>
                <span>{t('stock.cm.warn_mixed')}</span>
                {report.warnings.mixed.map((name) => (
                  <span key={name}>{name}</span>
                ))}
              </div>
            </Alert>
          )}
          {report.warnings.adjusted.length > 0 && (
            <Alert tone="warning">
              <div className="stack" style={{ gap: 4 }}>
                <span>{t('stock.cm.warn_adjusted')}</span>
                {report.warnings.adjusted.map((w, i) => (
                  <span key={i}>
                    {w.name}: {formatQuantity(w.quantity, w.unit_id)}
                  </span>
                ))}
              </div>
            </Alert>
          )}
          {report.warnings.unlinked.length > 0 && (
            <Alert tone="warning">
              <div className="stack" style={{ gap: 4 }}>
                <span>{t('stock.cm.warn_unlinked')}</span>
                {report.warnings.unlinked.map((w, i) => (
                  <span key={i}>
                    {w.name}: {formatQuantity(w.quantity, w.unit_id)}
                  </span>
                ))}
              </div>
            </Alert>
          )}
          {materials.length === 0 ? (
            <p className="muted">{t('stock.cm.empty')}</p>
          ) : (
            <div className="table-wrap">
              <table className="table table-dense">
                <thead>
                  <tr>
                    <th rowSpan={money ? 2 : 1}>{t('stock.material')}</th>
                    <th rowSpan={money ? 2 : 1}>{t('est.col.unit')}</th>
                    {flows.map((f) => (
                      <th key={f} className="num" colSpan={span}>
                        {t(`stock.cm.${f}`)}
                      </th>
                    ))}
                  </tr>
                  {money && (
                    <tr>
                      {flows.map((f) => (
                        <Fragment key={f}>
                          <th className="num">{t('stock.cm.qty')}</th>
                          <th className="num">{t('stock.cm.sum')}</th>
                        </Fragment>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {materials.map((m) => (
                    <tr key={m.material_id}>
                      <td>
                        <div className="cell-main">{m.name}</div>
                        {m.works.length > 0 && <div className="cell-sub">{m.works.join(', ')}</div>}
                      </td>
                      <td>{unitLabel(m.unit_id)}</td>
                      {flows.map((f) => (
                        <Fragment key={f}>
                          <td className="num">{formatQuantity(m[f].quantity)}</td>
                          {money && <td className="num">{formatMoney(m[f].value, lang, false)}</td>}
                        </Fragment>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {money && (
                  <tfoot>
                    <tr>
                      <td colSpan={2}>
                        <b>{t('stock.cm.total')}</b>
                      </td>
                      {flows.map((f) => (
                        <Fragment key={f}>
                          <td />
                          <td className="num">
                            <b>{formatMoney(report.totals[f].value, lang, false)}</b>
                          </td>
                        </Fragment>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
          {report.lines.length > 0 && (
            <>
              <h3>{t('stock.cm.lines_title')}</h3>
              <div className="table-wrap">
                <table className="table table-dense">
                  <thead>
                    <tr>
                      <th>{t('stock.cm.estimate')}</th>
                      <th>{t('stock.cm.work')}</th>
                      <th>{t('stock.material')}</th>
                      <th>{t('est.col.unit')}</th>
                      <th className="num">{t('stock.cm.normative')}</th>
                      <th className="num">{t('stock.cm.actual')}</th>
                      <th className="num">{t('stock.cm.difference')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.lines.map((l) => (
                      <tr key={l.line_id}>
                        <td>{l.estimate_name}</td>
                        <td>{l.work ?? '—'}</td>
                        <td>{l.description}</td>
                        <td>{unitLabel(l.unit_id)}</td>
                        <td className="num">{formatQuantity(l.normative)}</td>
                        <td className="num">{formatQuantity(l.actual)}</td>
                        <td
                          className="num"
                          style={{
                            color:
                              // musbat (minus belgisiz, noldan farqli) — ortiqcha sarf
                              l.deviation !== null &&
                              !l.deviation.startsWith('-') &&
                              /[1-9]/.test(l.deviation)
                                ? 'var(--danger)'
                                : undefined,
                          }}
                        >
                          {formatQuantity(l.deviation)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
