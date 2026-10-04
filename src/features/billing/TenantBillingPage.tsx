import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatMoney } from '@/lib/format';
import { Alert, Badge, Button, Modal, PageHeader, Stat, Textarea } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { AccessBadge } from '@/features/platform/pages';

type Billing = {
  tenant: {
    legal_name: string;
    status: string;
    trial_started_at: string | null;
    trial_ends_at: string | null;
    paid_until: string | null;
    access_state: 'pending' | 'trial' | 'paid' | 'overdue' | 'blocked' | 'archived';
    days_left: number;
    days_overdue: number;
    covered_until: string | null;
  };
  subscription: {
    code: string;
    version: number;
    monthly_price: string;
    next_period_start: string;
    limits: Record<string, number>;
  } | null;
  invoices: {
    id: string;
    period_start: string;
    period_end: string;
    due_at: string;
    amount: string;
  }[];
  entries: {
    id: string;
    invoice_id: string;
    kind: 'payment' | 'credit' | 'refund';
    amount: string;
    created_at: string;
  }[];
};
export function TenantBillingPage() {
  const { t, lang } = useT();
  const { issue } = useAuth();
  const toast = useToast();
  const query = useQuery({
    queryKey: ['tenant-billing'],
    queryFn: () => api<Billing>('/v1/billing'),
  });
  const [modal, setModal] = useState<'support' | 'plan_change' | null>(null);
  const [message, setMessage] = useState('');
  const send = useMutation({
    mutationFn: () =>
      api('/v1/support-requests', {
        method: 'POST',
        body: { kind: modal, message },
      }),
    onSuccess: () => {
      toast.success(t('billing.request_sent'));
      setModal(null);
      setMessage('');
    },
    onError: (e: ApiError) => toast.error(errorMessage(t, e.code, e.status)),
  });
  const d = query.data;
  const covered = (id: string) =>
    d?.entries
      .filter((e) => e.invoice_id === id)
      .reduce((s, e) => s + (e.kind === 'refund' ? -Number(e.amount) : Number(e.amount)), 0) ?? 0;
  const columns: Column<Billing['invoices'][number]>[] = [
    {
      key: 'period',
      header: t('tenants.period_start'),
      render: (r) => `${formatDate(r.period_start, lang)} — ${formatDate(r.period_end, lang)}`,
    },
    {
      key: 'due',
      header: t('tenants.due_at'),
      render: (r) => formatDate(r.due_at, lang),
    },
    {
      key: 'amount',
      header: t('tenants.amount'),
      align: 'right',
      render: (r) => formatMoney(r.amount, lang),
    },
    {
      key: 'covered',
      header: t('tenants.covered'),
      align: 'right',
      render: (r) => (
        <Badge tone={covered(r.id) >= Number(r.amount) ? 'success' : 'warning'}>
          {formatMoney(covered(r.id), lang, false)}
        </Badge>
      ),
    },
  ];
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader
        title={t('billing.tenant_title')}
        description={t('billing.tenant_sub')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setModal('plan_change')}>
              {t('billing.request_plan')}
            </Button>
            <Button onClick={() => setModal('support')}>{t('billing.request_support')}</Button>
          </>
        }
      />
      {issue === 'TENANT_BLOCKED' && <Alert tone="danger">{t('auth.blocked_desc')}</Alert>}
      {query.isError && (
        <Alert tone="danger">
          {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
        </Alert>
      )}
      {d && (
        <>
          <div className="grid-3">
            <div className="card stat">
              <div className="stat-label">{t('tenants.access')}</div>
              <div style={{ marginTop: 8 }}>
                <AccessBadge row={d.tenant} />
              </div>
              <div className="stat-sub">
                {t('tenants.covered')}: {formatDate(d.tenant.covered_until, lang)}
              </div>
            </div>
            <Stat
              label={t('tenants.plan')}
              value={d.subscription ? `${d.subscription.code} v${d.subscription.version}` : '—'}
              sub={d.subscription ? formatMoney(d.subscription.monthly_price, lang) : t('billing.no_plan')}
            />
            <Stat
              label={t('tenants.trial_ends')}
              value={formatDate(d.tenant.trial_ends_at, lang)}
              sub={`${t('tenants.paid_until')}: ${formatDate(d.tenant.paid_until, lang)}`}
            />
          </div>
          <Alert tone="info">{t('billing.checkout_unavailable')}</Alert>
          <section>
            <h2 style={{ marginBottom: 10 }}>{t('tenants.invoices')}</h2>
            <DataTable
              columns={columns}
              rows={d.invoices}
              rowKey={(r) => r.id}
              empty={{ title: t('common.empty') }}
            />
          </section>
        </>
      )}
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === 'plan_change' ? t('billing.request_plan') : t('billing.request_support')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => send.mutate()}
              loading={send.isPending}
              disabled={message.trim().length < 5}
            >
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <Textarea
          label={t('support.message')}
          hint={t('common.reason_hint')}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </Modal>
    </div>
  );
}
