import { Fragment, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { saveBase64File } from '@/lib/download';
import { errorMessage, useT } from '@/lib/i18n';
import { formatMoney, formatQuantity, unitLabel } from '@/lib/format';
import { Alert, Button, Input, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { trimZeros, type ActRange, type EstimateAct } from './model';

const percentText = (v: string) => `${trimZeros(v).replace('.', ',')} %`;
const boldChainKeys = new Set(['direct_total', 'total', 'total_without_vat', 'total_with_vat']);
const ranges: ActRange[] = ['period', 'year', 'start'];
const pad = (n: number) => String(n).padStart(2, '0');
/** Joriy oy "YYYY-MM" (Toshkent vaqti bilan). */
const currentMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' }).slice(0, 7);
/** "YYYY-MM" → oyning birinchi va oxirgi kuni (faqat sana qismlari, summa yo'q). */
function monthRange(ym: string) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  if (!y || !m) return { from: '', to: '' };
  return { from: `${ym}-01`, to: `${ym}-${pad(new Date(y, m, 0).getDate())}` };
}

/**
 * S4: «Bajarilgan ishlar dalolatnomasi (F-2, F-3)» — tanlangan davr, yil boshidan va qurilish boshidan bo'yicha.
 * Barcha miqdor, summa va foizlar serverdan; frontend hech narsa qo'shmaydi.
 */
export function ActDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, lang } = useT();
  const toast = useToast();
  const [byDates, setByDates] = useState(false);
  const [month, setMonth] = useState(currentMonth);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const { from, to } = byDates ? { from: rangeFrom, to: rangeTo } : monthRange(month);
  const ready = Boolean(from && to);
  const query = useQuery({
    queryKey: ['estimate-act', id, from, to],
    queryFn: () => api<EstimateAct>(`/v1/estimates/${id}/acts?from=${from}&to=${to}`),
    enabled: ready,
  });
  const exportMutation = useMutation({
    mutationFn: () =>
      api<{ filename: string; mime_type: string; base64: string }>(
        `/v1/estimates/${id}/acts/export?from=${from}&to=${to}`,
      ),
    onSuccess: saveBase64File,
    onError: (e: ApiError) => toast.error(errorMessage(t, e.code, e.status)),
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
  const act = query.data;
  const periodLines = (act?.lines ?? []).filter((l) => /[1-9]/.test(l.quantity.period));
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={t('est.act.title')}
      footer={
        <>
          <Button
            variant="secondary"
            icon={<Download />}
            loading={exportMutation.isPending}
            disabled={!ready}
            onClick={() => exportMutation.mutate()}
          >
            {t('est.act.export')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 16 }}>
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
        </div>
        {query.isError && (
          <Alert tone="danger">
            {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
          </Alert>
        )}
        {ready && query.isPending && <p className="muted">{t('common.loading')}</p>}
        {act && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
              }}
            >
              {ranges.map((r) => (
                <div key={r} className="card card-pad">
                  <div className="stat-label">{t(`est.act.range.${r}`)}</div>
                  <b>{formatMoney(act.totals[r].total, lang)}</b>
                  {act.contract.percent[r] && (
                    <div className="muted text-sm">
                      {t('est.act.contract_percent')}: {percentText(act.contract.percent[r])}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {act.contract.amount === null && <p className="muted text-sm">{t('est.act.no_contract')}</p>}
            {act.warnings.removed_lines.length > 0 && (
              <Alert tone="warning">
                <div className="stack" style={{ gap: 4 }}>
                  <span>{t('est.act.warn_removed')}</span>
                  {act.warnings.removed_lines.map((w, i) => (
                    <span key={i}>
                      {w.description}: {formatQuantity(w.quantity.period, w.unit_id)} (
                      {t('est.act.range.start')}: {formatQuantity(w.quantity.start, w.unit_id)})
                    </span>
                  ))}
                </div>
              </Alert>
            )}
            {act.warnings.ignored_progress.length > 0 && (
              <Alert tone="warning">
                <div className="stack" style={{ gap: 4 }}>
                  <span>{t('est.act.warn_ignored')}</span>
                  {act.warnings.ignored_progress.map((w, i) => (
                    <span key={i}>
                      {w.description}: {formatQuantity(w.quantity.start, w.unit_id)}
                    </span>
                  ))}
                </div>
              </Alert>
            )}
            {act.warnings.unlinked_consumption.length > 0 && (
              <Alert tone="warning">
                <div className="stack" style={{ gap: 4 }}>
                  <span>{t('est.act.warn_unlinked')}</span>
                  {act.warnings.unlinked_consumption.map((w, i) => (
                    <span key={i}>
                      {w.name}: {formatQuantity(w.quantity, w.unit_id)}
                    </span>
                  ))}
                </div>
              </Alert>
            )}
            {periodLines.length === 0 ? (
              <p className="muted">{t('est.act.empty')}</p>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="table table-dense">
                    <thead>
                      <tr>
                        <th>{t('est.res.code')}</th>
                        <th>{t('common.name')}</th>
                        <th>{t('est.col.unit')}</th>
                        <th className="num">{t('est.col.quantity')}</th>
                        <th className="num">{t('est.col.unit_price')}</th>
                        <th className="num">{t('est.res.amount')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periodLines.map((l, i) => (
                        <Fragment key={l.id}>
                          {l.section_name && l.section_name !== periodLines[i - 1]?.section_name && (
                            <tr>
                              <td colSpan={6}>
                                <b>{l.section_name}</b>
                              </td>
                            </tr>
                          )}
                          <tr>
                            <td className="muted">{l.norm_code ?? l.resource_code ?? '—'}</td>
                            <td>{l.description}</td>
                            <td>{unitLabel(l.unit_id)}</td>
                            <td className="num">{formatQuantity(l.quantity.period)}</td>
                            <td className="num">{formatMoney(l.unit_price, lang, false)}</td>
                            <td className="num">{formatMoney(l.amount.period, lang, false)}</td>
                          </tr>
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <section className="est-chain">
                  <dl>
                    {act.totals.period.lines.map((l) => (
                      <div key={l.key} className={boldChainKeys.has(l.key) ? 'est-chain-total' : undefined}>
                        <dt>{t(`est.price.${l.key}`)}</dt>
                        <dd className="est-chain-percent">{l.percent ? percentText(l.percent) : ''}</dd>
                        <dd>{formatMoney(l.amount, lang)}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
