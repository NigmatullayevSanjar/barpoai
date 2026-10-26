import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatDateTime, formatMoney, formatQuantity } from '@/lib/format';
import { Alert, Button, Input, Modal, Select, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useApiError } from './pages';

/**
 * D21: kompaniya xatolarini tuzatish — umumiy audit yozuvidan. Ombor harakati va moliyaviy hujjat storno qilinadi,
 * qabul qilingan hisobotdagi ish hajmi tuzatish yozuvi bilan to'g'rilanadi. Server hujjatni kompaniya admini nomidan
 * yozadi, auditga platforma xodimini qo'yadi; bu oyna faqat ko'rsatadi va sababni oladi.
 */
export type CorrectionTarget = {
  kind: 'stock' | 'finance' | 'progress';
  tenantId: string;
  resourceId: string;
};
type StockPreview = {
  kind: string;
  status: string;
  quantity: string;
  material_name: string;
  unit_id: string;
  project_name: string;
  created_by_name: string;
  created_at: string;
  reversed: boolean;
};
type FinancePreview = {
  kind: string;
  amount: string;
  description: string;
  document_date: string;
  counterparty_name: string | null;
  project_name: string;
  created_by_name: string;
  reversed: boolean;
};
type ProgressPreview = {
  kind: string;
  report_date: string;
  project_name: string;
  author_name: string;
  items: { id: string; description: string; unit_id: string; quantity: string; total: string }[];
};
const base = (x: CorrectionTarget) => `/v1/platform/tenants/${x.tenantId}`;
const previewPath = (x: CorrectionTarget) =>
  x.kind === 'stock'
    ? `${base(x)}/stock-commands/${x.resourceId}`
    : x.kind === 'finance'
      ? `${base(x)}/finance-documents/${x.resourceId}`
      : `${base(x)}/reports/${x.resourceId}/progress`;

export function CorrectionModal({ target, onClose }: { target: CorrectionTarget; onClose: () => void }) {
  const { t, lang } = useT();
  const toast = useToast();
  const onError = useApiError();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [entryId, setEntryId] = useState('');
  const [delta, setDelta] = useState('');
  const preview = useQuery({
    queryKey: ['platform-correction', target.kind, target.tenantId, target.resourceId],
    queryFn: () => api<StockPreview & FinancePreview & ProgressPreview>(previewPath(target)),
  });
  const submit = useMutation({
    mutationFn: () =>
      target.kind === 'progress'
        ? api(`${base(target)}/progress-entries/${entryId}/corrections`, {
            method: 'POST',
            body: { quantity_delta: delta.trim(), reason: reason.trim() },
          })
        : api(
            `${base(target)}/${target.kind === 'stock' ? 'stock-commands' : 'finance-documents'}/${target.resourceId}/reverse`,
            { method: 'POST', body: { reason: reason.trim() } },
          ),
    onSuccess: async () => {
      toast.success(t('correct.done'));
      await queryClient.invalidateQueries({ queryKey: ['platform-audit'] });
      onClose();
    },
    onError,
  });
  const p = preview.data;
  const entry = p?.items?.find((i) => i.id === entryId);
  const deltaOk = /^-?(0|[1-9]\d{0,17})(\.\d{1,6})?$/.test(delta.trim()) && Number(delta) !== 0;
  const reversed = target.kind !== 'progress' && Boolean(p?.reversed);
  // Natija manfiy bo'lmasligini server tekshiradi (NEGATIVE_PROGRESS); frontend hisob-kitob qilmaydi.
  const ready =
    reason.trim().length >= 5 && !reversed && (target.kind !== 'progress' || (Boolean(entry) && deltaOk));
  const title =
    target.kind === 'stock'
      ? t('correct.stock_title')
      : target.kind === 'finance'
        ? t('correct.finance_title')
        : t('correct.progress_title');
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={t('correct.hint')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={target.kind === 'progress' ? 'primary' : 'danger'}
            onClick={() => submit.mutate()}
            loading={submit.isPending}
            disabled={!ready}
          >
            {target.kind === 'progress' ? t('correct.submit_progress') : t('correct.submit_reverse')}
          </Button>
        </>
      }
    >
      <div className="stack">
        {preview.isLoading && <p className="muted">{t('common.loading')}</p>}
        {preview.isError && (
          <Alert tone="danger">
            {errorMessage(t, (preview.error as ApiError).code, (preview.error as ApiError).status)}
          </Alert>
        )}
        {p && target.kind === 'stock' && (
          <dl className="kv">
            <dt>{t('correct.kind')}</dt>
            <dd>{t(`stock.kind.${p.kind}`)}</dd>
            <dt>{t('correct.material')}</dt>
            <dd>{p.material_name}</dd>
            <dt>{t('correct.quantity')}</dt>
            <dd className="mono">{formatQuantity(p.quantity, p.unit_id)}</dd>
            <dt>{t('correct.status')}</dt>
            <dd>{t(`stock.status.${p.status}`)}</dd>
            <dt>{t('correct.project')}</dt>
            <dd>{p.project_name}</dd>
            <dt>{t('correct.created_by')}</dt>
            <dd>
              {p.created_by_name} · {formatDateTime(p.created_at, lang)}
            </dd>
          </dl>
        )}
        {p && target.kind === 'finance' && (
          <dl className="kv">
            <dt>{t('correct.kind')}</dt>
            <dd>{t(`fin.kind.${p.kind}`)}</dd>
            <dt>{t('correct.amount')}</dt>
            <dd className="mono">{formatMoney(p.amount, lang)}</dd>
            <dt>{t('correct.counterparty')}</dt>
            <dd>{p.counterparty_name ?? '—'}</dd>
            <dt>{t('correct.date')}</dt>
            <dd>{formatDate(p.document_date, lang)}</dd>
            <dt>{t('correct.description')}</dt>
            <dd>{p.description}</dd>
            <dt>{t('correct.project')}</dt>
            <dd>{p.project_name}</dd>
            <dt>{t('correct.created_by')}</dt>
            <dd>{p.created_by_name}</dd>
          </dl>
        )}
        {p && target.kind === 'progress' && (
          <>
            <dl className="kv">
              <dt>{t('correct.report')}</dt>
              <dd>
                {formatDate(p.report_date, lang)} · {p.author_name}
              </dd>
              <dt>{t('correct.project')}</dt>
              <dd>{p.project_name}</dd>
            </dl>
            {p.items.length === 0 ? (
              <Alert tone="info">{t('correct.no_entries')}</Alert>
            ) : (
              <div className="form-grid">
                <Select
                  wrapClassName="span-2"
                  label={t('correct.entry')}
                  value={entryId}
                  onChange={(e) => setEntryId(e.target.value)}
                >
                  <option value="">—</option>
                  {p.items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.description} — {formatQuantity(i.total, i.unit_id)}
                    </option>
                  ))}
                </Select>
                <Input
                  label={t('correct.current')}
                  value={entry ? formatQuantity(entry.total, entry.unit_id) : ''}
                  readOnly
                />
                <Input
                  label={t('correct.delta')}
                  hint={t('correct.delta_hint')}
                  inputMode="decimal"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                />
              </div>
            )}
          </>
        )}
        {reversed && <Alert tone="warning">{t('correct.already_reversed')}</Alert>}
        <Textarea
          label={t('common.reason')}
          hint={t('common.reason_hint')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={5}
          required
        />
      </div>
    </Modal>
  );
}
