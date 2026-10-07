import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Copy, Link2, Plus, ShieldBan, ShieldCheck, Archive, UserPlus } from 'lucide-react';
import { api, ApiError, qs, type ListResponse } from '@/lib/api';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Stat,
  Textarea,
  useListState,
  type Tone,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';

type AccessState = 'pending' | 'trial' | 'paid' | 'overdue' | 'blocked' | 'archived';
type Tenant = {
  id: string;
  legal_name: string;
  registration_key: string;
  status: string;
  alias: string | null;
  version: number;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  paid_until: string | null;
  created_at: string;
  access_state: AccessState;
  covered_until: string | null;
  days_left: number;
  days_overdue: number;
  active_users: number;
  admin_name: string | null;
  plan_code: string | null;
  block_reason: string | null;
};
type Plan = {
  id: string;
  code: string;
  version: number;
  monthly_price: string;
  limits: Record<string, number>;
  created_at: string;
};
const stateTone: Record<AccessState, Tone> = {
  pending: 'neutral',
  trial: 'info',
  paid: 'success',
  overdue: 'warning',
  blocked: 'danger',
  archived: 'neutral',
};

function useApiError() {
  const { t } = useT();
  const toast = useToast();
  return (e: unknown) => toast.error(errorMessage(t, (e as ApiError).code, (e as ApiError).status));
}
export function AccessBadge({ row }: { row: Pick<Tenant, 'access_state' | 'days_left' | 'days_overdue'> }) {
  const { t } = useT();
  return (
    <span className="row" style={{ gap: 6 }}>
      <Badge tone={stateTone[row.access_state]}>{t(`tenants.state.${row.access_state}`)}</Badge>
      {row.access_state === 'trial' || row.access_state === 'paid' ? (
        <small className="muted">{t('tenants.days_left', { n: row.days_left })}</small>
      ) : null}
      {row.access_state === 'overdue' ? (
        <small style={{ color: 'var(--warning)' }}>
          {t('tenants.days_overdue', { n: row.days_overdue })}
        </small>
      ) : null}
    </span>
  );
}

/* ---------------- Dashboard ---------------- */
export function PlatformDashboard() {
  const { t, lang } = useT();
  const tenants = useQuery({
    queryKey: ['platform-tenants'],
    queryFn: () => api<ListResponse<Tenant>>('/v1/platform/tenants?limit=100'),
  });
  const summary = useQuery({
    queryKey: ['platform-summary'],
    queryFn: () =>
      api<{
        invoiced: string;
        cash_received: string;
        refunded: string;
        debt: string;
        credit_balance: string;
        profit: null;
      }>('/v1/platform/billing/summary'),
  });
  const count = (s: AccessState) => tenants.data?.items.filter((x) => x.access_state === s).length ?? 0;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader title={t('platform.dashboard_title')} description={t('platform.dashboard_sub')} />
      <div className="grid-4">
        <Stat accent label={t('platform.tenants_total')} value={tenants.data?.items.length ?? '—'} />
        <Stat label={t('platform.tenants_trial')} value={count('trial')} />
        <Stat label={t('platform.tenants_paid')} value={count('paid')} />
        <Stat
          label={t('platform.tenants_overdue')}
          value={count('overdue')}
          sub={`${t('platform.tenants_blocked')}: ${count('blocked')} · ${t('platform.tenants_pending')}: ${count('pending')}`}
        />
      </div>
      <div className="grid-4">
        <Stat
          label={t('platform.invoiced')}
          value={summary.data ? formatMoney(summary.data.invoiced, lang, false) : '—'}
          sub="UZS"
        />
        <Stat
          label={t('platform.cash_received')}
          value={summary.data ? formatMoney(summary.data.cash_received, lang, false) : '—'}
          sub="UZS"
        />
        <Stat
          label={t('platform.debt')}
          value={summary.data ? formatMoney(summary.data.debt, lang, false) : '—'}
          sub="UZS"
        />
        <Stat
          label={t('platform.refunded')}
          value={summary.data ? formatMoney(summary.data.refunded, lang, false) : '—'}
          sub={`${t('platform.credit_balance')}: ${summary.data ? formatMoney(summary.data.credit_balance, lang, false) : '—'} · ${t('platform.profit_note')}`}
        />
      </div>
      <section>
        <h2 style={{ marginBottom: 10 }}>{t('nav.debtors')}</h2>
        <TenantsTable
          rows={tenants.data?.items.filter((x) => x.access_state === 'overdue')}
          loading={tenants.isLoading}
          error={tenants.error}
          refetch={tenants.refetch}
          emptyTitle={t('common.empty')}
        />
      </section>
    </div>
  );
}

function TenantsTable({
  rows,
  loading,
  error,
  refetch,
  search,
  emptyTitle,
  action,
}: {
  rows?: Tenant[];
  loading: boolean;
  error: unknown;
  refetch: () => void;
  search?: string;
  emptyTitle?: string;
  action?: React.ReactNode;
}) {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const columns: Column<Tenant>[] = [
    {
      key: 'name',
      header: t('tenants.legal_name'),
      sortValue: (r) => r.legal_name,
      render: (r) => (
        <>
          <div className="cell-main">
            {r.alias ? `${r.alias} · ` : ''}
            {r.legal_name}
          </div>
          <div className="cell-sub mono">{r.registration_key}</div>
        </>
      ),
    },
    {
      key: 'admin',
      header: t('tenants.admin'),
      render: (r) => r.admin_name ?? <span className="muted">—</span>,
    },
    {
      key: 'users',
      header: t('tenants.users'),
      align: 'right',
      sortValue: (r) => r.active_users,
      render: (r) => r.active_users,
    },
    {
      key: 'plan',
      header: t('tenants.plan'),
      render: (r) => r.plan_code ?? <span className="muted">—</span>,
    },
    {
      key: 'access',
      header: t('tenants.access'),
      sortValue: (r) => r.access_state,
      render: (r) => <AccessBadge row={r} />,
    },
    {
      key: 'until',
      header: t('tenants.covered'),
      sortValue: (r) => r.covered_until ?? '',
      render: (r) => formatDate(r.covered_until, lang),
    },
    {
      key: 'created',
      header: t('common.created_at'),
      sortValue: (r) => r.created_at,
      render: (r) => formatDate(r.created_at, lang),
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      loading={loading}
      error={error ? errorMessage(t, (error as ApiError).code, (error as ApiError).status) : null}
      onRetry={refetch}
      onRowClick={(r) => navigate(`/admin/tenants/${r.id}`)}
      search={
        search !== undefined
          ? {
              query: search,
              fields: (r) => [r.legal_name, r.registration_key, r.alias, r.admin_name],
            }
          : undefined
      }
      empty={{ title: emptyTitle ?? t('common.empty'), action }}
    />
  );
}

/* ---------------- Tenants list ---------------- */
export function TenantsPage() {
  const { t } = useT();
  const list = useListState();
  const [filter, setFilter] = useState<'all' | AccessState>('all');
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ['platform-tenants'],
    queryFn: () => api<ListResponse<Tenant>>('/v1/platform/tenants?limit=100'),
  });
  const rows = query.data?.items.filter((r) => filter === 'all' || r.access_state === filter);
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader
        title={t('tenants.title')}
        description={t('tenants.sub')}
        actions={
          <Button icon={<Plus />} onClick={() => setOpen(true)}>
            {t('tenants.new')}
          </Button>
        }
      />
      <div className="toolbar">
        <SearchInput value={list.search} onChange={list.setSearch} />
        <Select
          aria-label={t('tenants.access')}
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
        >
          <option value="all">{t('common.all')}</option>
          {(['pending', 'trial', 'paid', 'overdue', 'blocked', 'archived'] as AccessState[]).map((s) => (
            <option key={s} value={s}>
              {t(`tenants.state.${s}`)}
            </option>
          ))}
        </Select>
      </div>
      <TenantsTable
        rows={rows}
        loading={query.isLoading}
        error={query.error}
        refetch={query.refetch}
        search={list.search}
        action={
          <Button icon={<Plus />} onClick={() => setOpen(true)}>
            {t('tenants.new')}
          </Button>
        }
      />
      <CreateTenantModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
function CreateTenantModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const onError = useApiError();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const schema = z.object({
    legal_name: z.string().trim().min(2, t('common.required')).max(200),
    registration_key: z.string().trim().min(2, t('common.required')).max(100),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { legal_name: '', registration_key: '' },
  });
  const create = useMutation({
    mutationFn: (v: z.infer<typeof schema>) =>
      api<Tenant>('/v1/platform/tenants', { method: 'POST', body: v }),
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: ['platform-tenants'] });
      toast.success(t('tenants.created'));
      form.reset();
      onClose();
      navigate(`/admin/tenants/${row.id}`);
    },
    onError,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('tenants.new')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={form.handleSubmit((v) => create.mutate(v))} loading={create.isPending}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <form className="stack" onSubmit={form.handleSubmit((v) => create.mutate(v))} noValidate>
        <Input
          label={t('tenants.legal_name')}
          required
          error={form.formState.errors.legal_name?.message}
          {...form.register('legal_name')}
        />
        <Input
          label={t('tenants.registration_key')}
          required
          error={form.formState.errors.registration_key?.message}
          {...form.register('registration_key')}
        />
      </form>
    </Modal>
  );
}

/* ---------------- Tenant detail ---------------- */
type TenantDetail = Tenant & {
  admin: {
    id: string;
    login: string;
    display_name: string;
    phone: string | null;
    created_at: string;
  } | null;
  users: { active: number; total: number };
  subscription: {
    plan_version_id: string;
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
    covered: string;
    plan_code: string;
    source: 'manual' | 'auto';
  }[];
  credits: {
    id: string;
    kind: 'overpayment' | 'applied' | 'manual';
    amount: string;
    invoice_id: string | null;
    note: string;
    created_at: string;
  }[];
  credit_balance: string;
  entries: {
    id: string;
    invoice_id: string;
    kind: 'payment' | 'credit' | 'refund';
    amount: string;
    external_ref: string;
    reason: string;
    created_at: string;
  }[];
  pending_invite: { id: string; expires_at: string; created_at: string } | null;
};
export function TenantDetailPage() {
  const { id = '' } = useParams();
  const { t, lang } = useT();
  const toast = useToast();
  const onError = useApiError();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['platform-tenant', id],
    queryFn: () => api<TenantDetail>(`/v1/platform/tenants/${id}`),
  });
  const plans = useQuery({
    queryKey: ['platform-plans'],
    queryFn: () => api<ListResponse<Plan>>('/v1/platform/plans'),
  });
  const [invite, setInvite] = useState<{
    registration_url: string;
    expires_at: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<'blocked' | 'active' | 'archived' | null>(null);
  const [reason, setReason] = useState('');
  const [planModal, setPlanModal] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [entryModal, setEntryModal] = useState<string | null>(null);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['platform-tenant', id] }),
      queryClient.invalidateQueries({ queryKey: ['platform-tenants'] }),
    ]);

  const issueInvite = useMutation({
    mutationFn: () =>
      api<{ registration_url: string; expires_at: string }>(`/v1/platform/tenants/${id}/invites`, {
        method: 'POST',
      }),
    onSuccess: async (r) => {
      setInvite(r);
      setCopied(false);
      await refresh();
    },
    onError,
  });
  const setStatus = useMutation({
    mutationFn: (status: 'blocked' | 'active' | 'archived') =>
      api(`/v1/platform/tenants/${id}`, {
        method: 'PATCH',
        body: { status, version: query.data!.version, reason },
      }),
    onSuccess: async () => {
      setConfirm(null);
      setReason('');
      await refresh();
      toast.success(t('common.saved'));
    },
    onError: (e: ApiError) =>
      e.code === 'VERSION_CONFLICT' ? (toast.error(t('common.version_conflict')), refresh()) : onError(e),
  });
  const aliasForm = useForm<{ alias: string }>({
    values: { alias: query.data?.alias ?? '' },
  });
  const saveAlias = useMutation({
    mutationFn: (v: { alias: string }) =>
      api(`/v1/platform/tenants/${id}/alias`, { method: 'POST', body: v }),
    onSuccess: async () => {
      await refresh();
      toast.success(t('common.saved'));
    },
    onError,
  });

  const d = query.data;
  if (query.isError)
    return (
      <Alert tone="danger">
        {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
      </Alert>
    );
  if (!d)
    return (
      <div className="card">
        <div className="card-pad muted">{t('common.loading')}</div>
      </div>
    );
  const invoiceCols: Column<TenantDetail['invoices'][number]>[] = [
    {
      key: 'period',
      header: t('tenants.period_start'),
      render: (r) => `${formatDate(r.period_start, lang)} — ${formatDate(r.period_end, lang)}`,
    },
    {
      key: 'plan',
      header: t('tenants.plan'),
      render: (r) => (
        <span className="row">
          {r.plan_code}
          <Badge tone={r.source === 'auto' ? 'info' : 'neutral'}>{t(`tenants.source.${r.source}`)}</Badge>
        </span>
      ),
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
        <Badge
          tone={
            Number(r.covered) >= Number(r.amount) ? 'success' : Number(r.covered) > 0 ? 'warning' : 'neutral'
          }
        >
          {formatMoney(r.covered, lang, false)}
        </Badge>
      ),
    },
    {
      key: 'act',
      header: '',
      className: 'actions',
      render: (r) => (
        <Button size="sm" variant="secondary" onClick={() => setEntryModal(r.id)}>
          {t('tenants.record_payment')}
        </Button>
      ),
    },
  ];
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader
        breadcrumbs={
          <>
            <Link to="/admin/tenants">{t('tenants.title')}</Link>
            <span>/</span>
            <span>{d.legal_name}</span>
          </>
        }
        title={
          <span className="row">
            {d.legal_name} <AccessBadge row={d} />
          </span>
        }
        description={<span className="mono">{d.registration_key}</span>}
        actions={
          <>
            {d.status === 'active' && (
              <Button variant="secondary" icon={<ShieldBan />} onClick={() => setConfirm('blocked')}>
                {t('tenants.block')}
              </Button>
            )}
            {d.status === 'blocked' && (
              <Button icon={<ShieldCheck />} onClick={() => setConfirm('active')}>
                {t('tenants.unblock')}
              </Button>
            )}
            {d.status !== 'archived' && d.status !== 'pending' && (
              <Button variant="ghost" icon={<Archive />} onClick={() => setConfirm('archived')}>
                {t('tenants.archive')}
              </Button>
            )}
          </>
        }
      />
      <div className="grid-3" style={{ alignItems: 'start' }}>
        <section className="card">
          <div className="card-header">
            <h3>{t('tenants.detail')}</h3>
          </div>
          <div className="card-pad stack">
            <dl className="kv">
              <dt>{t('tenants.admin')}</dt>
              <dd>
                {d.admin
                  ? `${d.admin.display_name} (${d.admin.login}${d.admin.phone ? `, ${d.admin.phone}` : ''})`
                  : '—'}
              </dd>
              <dt>{t('tenants.users')}</dt>
              <dd>
                {d.users.active} / {d.users.total}
              </dd>
              <dt>{t('tenants.trial_ends')}</dt>
              <dd>{formatDate(d.trial_ends_at, lang)}</dd>
              <dt>{t('tenants.paid_until')}</dt>
              <dd>{formatDate(d.paid_until, lang)}</dd>
              <dt>{t('tenants.credit_balance')}</dt>
              <dd>{formatMoney(d.credit_balance, lang)}</dd>
              <dt>{t('common.created_at')}</dt>
              <dd>{formatDateTime(d.created_at, lang)}</dd>
              {d.block_reason && d.status !== 'active' && (
                <>
                  <dt>{t('common.reason')}</dt>
                  <dd>{d.block_reason}</dd>
                </>
              )}
            </dl>
            <form className="row" onSubmit={aliasForm.handleSubmit((v) => saveAlias.mutate(v))}>
              <Input wrapClassName="grow" label={t('tenants.alias')} {...aliasForm.register('alias')} />
              <Button
                type="submit"
                variant="secondary"
                loading={saveAlias.isPending}
                style={{ alignSelf: 'flex-end' }}
              >
                {t('common.save')}
              </Button>
            </form>
          </div>
        </section>
        <section className="card">
          <div className="card-header">
            <h3>{t('tenants.invite')}</h3>
          </div>
          <div className="card-pad stack">
            {d.status !== 'pending' ? (
              <p className="muted text-sm">{t('tenants.invite_only_pending')}</p>
            ) : (
              <>
                <p className="muted text-sm">{t('tenants.invite_hint')}</p>
                {d.pending_invite && !invite && (
                  <Alert tone="info">
                    {t('tenants.invite')}: {formatDateTime(d.pending_invite.expires_at, lang)}
                  </Alert>
                )}
                {invite && (
                  <div className="stack">
                    <code className="text-xs" style={{ wordBreak: 'break-all' }}>
                      {invite.registration_url}
                    </code>
                    <div className="row">
                      <Button
                        variant="secondary"
                        icon={copied ? <Check /> : <Copy />}
                        onClick={async () => {
                          await navigator.clipboard.writeText(invite.registration_url).catch(() => undefined);
                          setCopied(true);
                        }}
                      >
                        {copied ? t('common.copied') : t('common.copy')}
                      </Button>
                      <small className="muted">{formatDateTime(invite.expires_at, lang)}</small>
                    </div>
                  </div>
                )}
                <div>
                  <Button
                    icon={<Link2 />}
                    loading={issueInvite.isPending}
                    onClick={() => issueInvite.mutate()}
                  >
                    {t('tenants.invite_new')}
                  </Button>
                </div>
              </>
            )}
          </div>
        </section>
        <section className="card">
          <div className="card-header">
            <h3>{t('tenants.plan')}</h3>
            <Button size="sm" variant="secondary" onClick={() => setPlanModal(true)}>
              {t('tenants.set_plan')}
            </Button>
          </div>
          <div className="card-pad">
            {d.subscription ? (
              <dl className="kv">
                <dt>{t('plans.code')}</dt>
                <dd>
                  {d.subscription.code} v{d.subscription.version}
                </dd>
                <dt>{t('plans.price')}</dt>
                <dd>{formatMoney(d.subscription.monthly_price, lang)}</dd>
                <dt>{t('tenants.next_period')}</dt>
                <dd>{formatDate(d.subscription.next_period_start, lang)}</dd>
                <dt>{t('plans.limits')}</dt>
                <dd>
                  {Object.entries(d.subscription.limits)
                    .map(
                      ([k, v]) =>
                        `${t(`plans.limit_${k}`) === `plans.limit_${k}` ? k : t(`plans.limit_${k}`)}: ${v}`,
                    )
                    .join(' · ') || '—'}
                </dd>
              </dl>
            ) : (
              <p className="muted text-sm">{t('billing.no_plan')}</p>
            )}
          </div>
        </section>
      </div>
      <section>
        <div className="row-between" style={{ marginBottom: 10 }}>
          <h2>{t('tenants.invoices')}</h2>
          <Button
            icon={<Plus />}
            variant="secondary"
            disabled={!d.subscription}
            onClick={() => setInvoiceModal(true)}
          >
            {t('tenants.new_invoice')}
          </Button>
        </div>
        <DataTable
          columns={invoiceCols}
          rows={d.invoices}
          rowKey={(r) => r.id}
          empty={{ title: t('common.empty') }}
        />
      </section>
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && setStatus.mutate(confirm)}
        title={
          confirm === 'blocked'
            ? t('tenants.block')
            : confirm === 'active'
              ? t('tenants.unblock')
              : t('tenants.archive')
        }
        danger={confirm !== 'active'}
        loading={setStatus.isPending}
        message={
          <div className="stack">
            <p>
              {confirm === 'blocked'
                ? t('tenants.block_confirm')
                : confirm === 'active'
                  ? t('tenants.unblock_confirm')
                  : t('tenants.archive_confirm')}
            </p>
            <Textarea
              label={t('common.reason')}
              hint={t('common.reason_hint')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={5}
              required
            />
          </div>
        }
      />
      <SetPlanModal
        open={planModal}
        onClose={() => setPlanModal(false)}
        tenantId={id}
        plans={plans.data?.items ?? []}
        current={d.subscription?.plan_version_id}
        defaultStart={new Date(
          Math.max(
            d.trial_ends_at ? new Date(d.trial_ends_at).getTime() : 0,
            d.paid_until ? new Date(d.paid_until).getTime() : 0,
            Date.now(),
          ),
        )
          .toISOString()
          .slice(0, 10)}
        onDone={refresh}
      />
      <NewInvoiceModal
        open={invoiceModal}
        onClose={() => setInvoiceModal(false)}
        tenant={d}
        onDone={refresh}
      />
      <BillingEntryModal
        open={entryModal !== null}
        invoiceId={entryModal}
        onClose={() => setEntryModal(null)}
        onDone={refresh}
      />
    </div>
  );
}
function SetPlanModal({
  open,
  onClose,
  tenantId,
  plans,
  current,
  defaultStart,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  plans: Plan[];
  current?: string;
  defaultStart: string;
  onDone: () => Promise<unknown>;
}) {
  const { t, lang } = useT();
  const onError = useApiError();
  const toast = useToast();
  const [planId, setPlanId] = useState(current ?? '');
  const [start, setStart] = useState(defaultStart);
  const m = useMutation({
    mutationFn: () =>
      api('/v1/platform/subscriptions', {
        method: 'POST',
        body: {
          tenant_id: tenantId,
          plan_version_id: planId || current,
          next_period_start: new Date(start + 'T00:00:00Z').toISOString(),
        },
      }),
    onSuccess: async () => {
      await onDone();
      toast.success(t('common.saved'));
      onClose();
    },
    onError,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('tenants.set_plan')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => m.mutate()} loading={m.isPending} disabled={!(planId || current)}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <Select
          label={t('tenants.plan_version')}
          value={planId || current || ''}
          onChange={(e) => setPlanId(e.target.value)}
        >
          <option value="">—</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} v{p.version} — {formatMoney(p.monthly_price, lang)}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          label={t('tenants.next_period')}
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </div>
    </Modal>
  );
}
function NewInvoiceModal({
  open,
  onClose,
  tenant,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  tenant: TenantDetail;
  onDone: () => Promise<unknown>;
}) {
  const { t } = useT();
  const onError = useApiError();
  const toast = useToast();
  const startDefault =
    tenant.subscription?.next_period_start?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const plusMonth = (d: string) => {
    const x = new Date(d + 'T00:00:00Z');
    x.setUTCDate(x.getUTCDate() + 30);
    return x.toISOString().slice(0, 10);
  };
  const [start, setStart] = useState(startDefault);
  const [end, setEnd] = useState(plusMonth(startDefault));
  const [due, setDue] = useState(startDefault);
  const m = useMutation({
    mutationFn: () =>
      api('/v1/platform/billing/invoices', {
        method: 'POST',
        body: {
          tenant_id: tenant.id,
          plan_version_id: tenant.subscription!.plan_version_id,
          period_start: new Date(start + 'T00:00:00Z').toISOString(),
          period_end: new Date(end + 'T00:00:00Z').toISOString(),
          due_at: new Date(due + 'T00:00:00Z').toISOString(),
        },
      }),
    onSuccess: async () => {
      await onDone();
      toast.success(t('common.saved'));
      onClose();
    },
    onError,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('tenants.new_invoice')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => m.mutate()} loading={m.isPending}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Input
          type="date"
          label={t('tenants.period_start')}
          value={start}
          onChange={(e) => {
            setStart(e.target.value);
            setEnd(plusMonth(e.target.value));
            setDue(e.target.value);
          }}
        />
        <Input
          type="date"
          label={t('tenants.period_end')}
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
        <Input type="date" label={t('tenants.due_at')} value={due} onChange={(e) => setDue(e.target.value)} />
        <Input
          label={t('tenants.amount')}
          value={tenant.subscription ? formatMoney(tenant.subscription.monthly_price) : ''}
          readOnly
        />
      </div>
    </Modal>
  );
}
function BillingEntryModal({
  open,
  onClose,
  invoiceId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: string | null;
  onDone: () => Promise<unknown>;
}) {
  const { t } = useT();
  const onError = useApiError();
  const toast = useToast();
  const schema = z.object({
    kind: z.enum(['payment', 'credit', 'refund']),
    amount: z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,2})?$/, t('error.VALIDATION_ERROR')),
    external_ref: z.string().trim().min(1, t('common.required')).max(200),
    reason: z.string().trim().min(5, t('common.reason_hint')).max(2000),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: 'payment',
      amount: '',
      external_ref: '',
      reason: '',
    },
  });
  const m = useMutation({
    mutationFn: (v: z.infer<typeof schema>) =>
      api('/v1/platform/billing/entries', {
        method: 'POST',
        body: { invoice_id: invoiceId, ...v },
      }),
    onSuccess: async () => {
      await onDone();
      toast.success(t('common.saved'));
      form.reset();
      onClose();
    },
    onError,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('tenants.record_payment')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={form.handleSubmit((v) => m.mutate(v))} loading={m.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form className="stack" noValidate onSubmit={form.handleSubmit((v) => m.mutate(v))}>
        <Select label={t('tenants.entry_kind')} {...form.register('kind')}>
          {(['payment', 'credit', 'refund'] as const).map((k) => (
            <option key={k} value={k}>
              {t(`tenants.entry.${k}`)}
            </option>
          ))}
        </Select>
        <Input
          label={`${t('tenants.amount')} (UZS)`}
          inputMode="decimal"
          placeholder="450000.00"
          hint={t('tenants.overpay_hint')}
          error={form.formState.errors.amount?.message}
          {...form.register('amount')}
        />
        <Input
          label={t('tenants.external_ref')}
          error={form.formState.errors.external_ref?.message}
          {...form.register('external_ref')}
        />
        <Textarea
          label={t('common.reason')}
          hint={t('common.reason_hint')}
          error={form.formState.errors.reason?.message}
          {...form.register('reason')}
        />
      </form>
    </Modal>
  );
}

/* ---------------- Plans ---------------- */
export function PlansPage() {
  const { t, lang } = useT();
  const toast = useToast();
  const onError = useApiError();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['platform-plans'],
    queryFn: () => api<ListResponse<Plan>>('/v1/platform/plans'),
  });
  const [open, setOpen] = useState(false);
  const schema = z.object({
    code: z.string().trim().min(2).max(40),
    version: z.coerce.number().int().positive(),
    monthly_price: z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,2})?$/, t('error.VALIDATION_ERROR')),
    users: z.coerce.number().int().nonnegative(),
    projects: z.coerce.number().int().nonnegative(),
    storage_mb: z.coerce.number().int().nonnegative(),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      code: 'standard',
      version: 1,
      monthly_price: '',
      users: 20,
      projects: 10,
      storage_mb: 2048,
    },
  });
  const m = useMutation({
    mutationFn: (v: z.infer<typeof schema>) =>
      api('/v1/platform/plans', {
        method: 'POST',
        body: {
          code: v.code,
          version: v.version,
          monthly_price: v.monthly_price,
          limits: {
            users: v.users,
            projects: v.projects,
            storage_mb: v.storage_mb,
          },
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['platform-plans'] });
      toast.success(t('common.saved'));
      setOpen(false);
    },
    onError,
  });
  const columns: Column<Plan>[] = [
    {
      key: 'code',
      header: t('plans.code'),
      sortValue: (r) => r.code,
      render: (r) => <span className="cell-main">{r.code}</span>,
    },
    {
      key: 'version',
      header: t('plans.version'),
      align: 'right',
      sortValue: (r) => r.version,
      render: (r) => `v${r.version}`,
    },
    {
      key: 'price',
      header: t('plans.price'),
      align: 'right',
      sortValue: (r) => Number(r.monthly_price),
      render: (r) => formatMoney(r.monthly_price, lang),
    },
    {
      key: 'limits',
      header: t('plans.limits'),
      render: (r) =>
        Object.entries(r.limits)
          .map(
            ([k, v]) => `${t(`plans.limit_${k}`) === `plans.limit_${k}` ? k : t(`plans.limit_${k}`)}: ${v}`,
          )
          .join(' · ') || '—',
    },
    {
      key: 'created',
      header: t('common.created_at'),
      render: (r) => formatDate(r.created_at, lang),
    },
  ];
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader
        title={t('plans.title')}
        description={t('plans.sub')}
        actions={
          <Button icon={<Plus />} onClick={() => setOpen(true)}>
            {t('plans.new')}
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(r) => r.id}
        loading={query.isLoading}
        error={query.error ? errorMessage(t, (query.error as ApiError).code) : null}
        onRetry={query.refetch}
        empty={{
          title: t('common.empty'),
          action: (
            <Button icon={<Plus />} onClick={() => setOpen(true)}>
              {t('plans.new')}
            </Button>
          ),
        }}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('plans.new')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={form.handleSubmit((v) => m.mutate(v))} loading={m.isPending}>
              {t('common.create')}
            </Button>
          </>
        }
      >
        <form className="form-grid" noValidate onSubmit={form.handleSubmit((v) => m.mutate(v))}>
          <Input
            label={t('plans.code')}
            placeholder="standard / max"
            error={form.formState.errors.code?.message}
            {...form.register('code')}
          />
          <Input
            label={t('plans.version')}
            type="number"
            min={1}
            error={form.formState.errors.version?.message}
            {...form.register('version')}
          />
          <Input
            label={`${t('plans.price')} (UZS)`}
            inputMode="decimal"
            placeholder="450000.00"
            error={form.formState.errors.monthly_price?.message}
            {...form.register('monthly_price')}
          />
          <Input label={t('plans.limit_users')} type="number" min={0} {...form.register('users')} />
          <Input label={t('plans.limit_projects')} type="number" min={0} {...form.register('projects')} />
          <Input label={t('plans.limit_storage_mb')} type="number" min={0} {...form.register('storage_mb')} />
        </form>
      </Modal>
    </div>
  );
}

/* ---------------- Billing (all invoices) ---------------- */
type InvoiceRow = {
  id: string;
  tenant_id: string;
  legal_name: string;
  plan_code: string;
  period_start: string;
  period_end: string;
  due_at: string;
  amount: string;
  covered: string;
  outstanding: string;
};
export function BillingPage() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const list = useListState(50);
  const [unpaid, setUnpaid] = useState(false);
  const query = useQuery({
    queryKey: ['platform-invoices', list.offset, unpaid],
    queryFn: () =>
      api<ListResponse<InvoiceRow>>(
        `/v1/platform/billing/invoices${qs({ limit: list.limit, offset: list.offset, unpaid })}`,
      ),
  });
  const columns: Column<InvoiceRow>[] = [
    {
      key: 'tenant',
      header: t('tenants.legal_name'),
      sortValue: (r) => r.legal_name,
      render: (r) => <span className="cell-main">{r.legal_name}</span>,
    },
    { key: 'plan', header: t('tenants.plan'), render: (r) => r.plan_code },
    {
      key: 'period',
      header: t('tenants.period_start'),
      sortValue: (r) => r.period_start,
      render: (r) => `${formatDate(r.period_start, lang)} — ${formatDate(r.period_end, lang)}`,
    },
    {
      key: 'due',
      header: t('tenants.due_at'),
      sortValue: (r) => r.due_at,
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
      render: (r) => formatMoney(r.covered, lang, false),
    },
    {
      key: 'out',
      header: t('platform.debt'),
      align: 'right',
      render: (r) => (
        <Badge
          tone={
            Number(r.outstanding) > 0 ? (new Date(r.due_at) < new Date() ? 'danger' : 'warning') : 'success'
          }
        >
          {formatMoney(r.outstanding, lang, false)}
        </Badge>
      ),
    },
  ];
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader title={t('billing.title')} description={t('billing.sub')} />
      <div className="toolbar">
        <SearchInput value={list.search} onChange={list.setSearch} />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={unpaid}
            onChange={(e) => {
              setUnpaid(e.target.checked);
              list.setOffset(0);
            }}
          />{' '}
          {t('platform.debt')}
        </label>
      </div>
      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(r) => r.id}
        loading={query.isLoading}
        error={query.error ? errorMessage(t, (query.error as ApiError).code) : null}
        onRetry={query.refetch}
        onRowClick={(r) => navigate(`/admin/tenants/${r.tenant_id}`)}
        search={{
          query: list.search,
          fields: (r) => [r.legal_name, r.plan_code],
        }}
        pagination={{
          offset: list.offset,
          limit: list.limit,
          onChange: list.setOffset,
        }}
      />
    </div>
  );
}
export function DebtorsPage() {
  const { t } = useT();
  const query = useQuery({
    queryKey: ['platform-tenants'],
    queryFn: () => api<ListResponse<Tenant>>('/v1/platform/tenants?limit=100'),
  });
  const rows = query.data?.items.filter((r) => r.access_state === 'overdue' || r.access_state === 'blocked');
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader title={t('nav.debtors')} description={t('platform.tenants_overdue')} />
      <TenantsTable rows={rows} loading={query.isLoading} error={query.error} refetch={query.refetch} />
    </div>
  );
}

/* ---------------- Support ---------------- */
type SupportRow = {
  id: string;
  tenant_id: string;
  legal_name: string;
  display_name: string;
  kind: 'support' | 'plan_change';
  message: string;
  status: 'open' | 'closed';
  response: string | null;
  responded_at: string | null;
  created_at: string;
};
export function SupportPage() {
  const { t, lang } = useT();
  const onError = useApiError();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'open' | 'closed' | 'all'>('open');
  const query = useQuery({
    queryKey: ['platform-support'],
    queryFn: () => api<ListResponse<SupportRow>>('/v1/platform/support?limit=100'),
  });
  const [reply, setReply] = useState<SupportRow | null>(null);
  const [text, setText] = useState('');
  const update = useMutation({
    mutationFn: (v: { id: string; status: 'open' | 'closed'; response?: string }) =>
      api(`/v1/platform/support/${v.id}`, {
        method: 'PATCH',
        body: { status: v.status, ...(v.response ? { response: v.response } : {}) },
      }),
    onSuccess: () => {
      setReply(null);
      setText('');
      return queryClient.invalidateQueries({ queryKey: ['platform-support'] });
    },
    onError,
  });
  const rows = query.data?.items.filter((r) => tab === 'all' || r.status === tab);
  const columns: Column<SupportRow>[] = [
    {
      key: 'tenant',
      header: t('tenants.legal_name'),
      render: (r) => (
        <>
          <div className="cell-main">{r.legal_name}</div>
          <div className="cell-sub">{r.display_name}</div>
        </>
      ),
    },
    {
      key: 'kind',
      header: t('tenants.entry_kind'),
      render: (r) => (
        <Badge tone={r.kind === 'plan_change' ? 'brand' : 'info'}>{t(`support.kind.${r.kind}`)}</Badge>
      ),
    },
    {
      key: 'message',
      header: t('support.message'),
      render: (r) => (
        <>
          <div style={{ whiteSpace: 'pre-wrap' }}>{r.message}</div>
          {r.response && (
            <div className="cell-sub" style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>
              {t('support.response')}: {r.response}
            </div>
          )}
        </>
      ),
    },
    {
      key: 'created',
      header: t('common.date'),
      sortValue: (r) => r.created_at,
      render: (r) => formatDateTime(r.created_at, lang),
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (r) => (
        <Badge tone={r.status === 'open' ? 'warning' : 'success'}>{t(`support.${r.status}`)}</Badge>
      ),
    },
    {
      key: 'act',
      header: '',
      className: 'actions',
      render: (r) => (
        <span className="row">
          {r.status === 'open' && (
            <Button
              size="sm"
              onClick={() => {
                setReply(r);
                setText('');
              }}
            >
              {t('support.respond')}
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            loading={update.isPending && update.variables?.id === r.id && !update.variables?.response}
            onClick={() => update.mutate({ id: r.id, status: r.status === 'open' ? 'closed' : 'open' })}
          >
            {r.status === 'open' ? t('support.closed') : t('support.reopen')}
          </Button>
        </span>
      ),
    },
  ];
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader title={t('support.title')} description={t('support.sub')} />
      <div className="segmented">
        {(['open', 'closed', 'all'] as const).map((k) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
            {k === 'all' ? t('common.all') : t(`support.${k}`)}
          </button>
        ))}
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={query.isLoading}
        error={query.error ? errorMessage(t, (query.error as ApiError).code) : null}
        onRetry={query.refetch}
      />
      <Modal
        open={Boolean(reply)}
        onClose={() => setReply(null)}
        title={t('support.respond')}
        description={reply ? `${reply.legal_name} · ${reply.display_name}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReply(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={update.isPending}
              disabled={text.trim().length < 2}
              onClick={() =>
                reply && update.mutate({ id: reply.id, status: 'closed', response: text.trim() })
              }
            >
              {t('support.close_with_response')}
            </Button>
          </>
        }
      >
        <div className="stack">
          {reply && <Alert tone="info">{reply.message}</Alert>}
          <Textarea
            label={t('support.response')}
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="muted text-xs">{t('support.response_hint')}</p>
        </div>
      </Modal>
    </div>
  );
}

/* ---------------- Staff (super admin) ---------------- */
type Staff = {
  id: string;
  login: string;
  display_name: string;
  role: 'super_admin' | 'platform_owner' | 'support';
  active: boolean;
  must_change_password: boolean;
  created_at: string;
};
export function StaffPage() {
  const { t, lang } = useT();
  const toast = useToast();
  const onError = useApiError();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['platform-staff'],
    queryFn: () => api<ListResponse<Staff>>('/v1/platform/staff'),
  });
  const [open, setOpen] = useState(false);
  const schema = z.object({
    login: z.string().regex(/^[a-zA-Z0-9._-]{3,64}$/, t('auth.login_name')),
    display_name: z.string().trim().min(2).max(120),
    password: z.string().min(12, t('auth.password_rules')).max(128),
    role: z.enum(['super_admin', 'support']),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      role: 'support',
      login: '',
      display_name: '',
      password: '',
    },
  });
  const m = useMutation({
    mutationFn: (v: z.infer<typeof schema>) => api('/v1/platform/staff', { method: 'POST', body: v }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['platform-staff'] });
      toast.success(t('staff.created'));
      form.reset();
      setOpen(false);
    },
    onError,
  });
  const columns: Column<Staff>[] = [
    {
      key: 'name',
      header: t('auth.display_name'),
      render: (r) => (
        <>
          <div className="cell-main">{r.display_name}</div>
          <div className="cell-sub mono">{r.login}</div>
        </>
      ),
    },
    {
      key: 'role',
      header: t('common.role'),
      render: (r) => <Badge tone="brand">{t(`role.${r.role}`)}</Badge>,
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (r) => (
        <Badge tone={r.active ? 'success' : 'neutral'}>
          {r.active ? t('common.active') : t('common.inactive')}
          {r.must_change_password ? ' · ' + t('auth.change_title') : ''}
        </Badge>
      ),
    },
    {
      key: 'created',
      header: t('common.created_at'),
      render: (r) => formatDate(r.created_at, lang),
    },
  ];
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader
        title={t('staff.title')}
        description={t('staff.sub')}
        actions={
          <Button icon={<UserPlus />} onClick={() => setOpen(true)}>
            {t('staff.new')}
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(r) => r.id}
        loading={query.isLoading}
        error={query.error ? errorMessage(t, (query.error as ApiError).code) : null}
        onRetry={query.refetch}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('staff.new')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={form.handleSubmit((v) => m.mutate(v))} loading={m.isPending}>
              {t('common.create')}
            </Button>
          </>
        }
      >
        <form className="stack" noValidate onSubmit={form.handleSubmit((v) => m.mutate(v))}>
          <Input
            label={t('auth.display_name')}
            error={form.formState.errors.display_name?.message}
            {...form.register('display_name')}
          />
          <Input
            label={t('auth.login_name')}
            error={form.formState.errors.login?.message}
            {...form.register('login')}
          />
          <Input
            label={t('auth.password')}
            type="password"
            hint={t('auth.password_rules')}
            error={form.formState.errors.password?.message}
            {...form.register('password')}
          />
          <Select label={t('common.role')} {...form.register('role')}>
            <option value="support">{t('role.support')}</option>
            <option value="super_admin">{t('role.super_admin')}</option>
          </Select>
        </form>
      </Modal>
    </div>
  );
}
type Diagnostics = {
  database: { ok: boolean; latency_ms: number; server_time: string; last_migration: string | null };
  worker: {
    pending: number;
    dead: number;
    done_24h: number;
    oldest_pending_at: string | null;
    failed_jobs: {
      id: string;
      kind: string;
      status: string;
      attempts: number;
      error_code: string | null;
      created_at: string;
      tenant_name: string | null;
    }[];
  };
  errors: {
    last_24h: number;
    total: number;
    items: {
      id: string;
      request_id: string;
      method: string;
      path: string;
      status: number;
      code: string;
      message: string | null;
      created_at: string;
    }[];
  };
  sessions_active: number;
  telegram: { configured: boolean; linked_accounts: number };
  tenants: { active: number; pending: number; blocked: number; archived: number };
  break_glass_enabled: boolean;
  integrations_release_ready: boolean;
};
/** Texnik panel: baza, worker navbati, 5xx xatolar, Telegram va kompaniyalar — faqat bazadagi haqiqiy holat. */
export function DiagnosticsPage() {
  const { t, lang } = useT();
  const query = useQuery({
    queryKey: ['platform-diagnostics'],
    queryFn: () => api<Diagnostics>('/v1/platform/diagnostics'),
    retry: false,
    refetchInterval: 30000,
  });
  const d = query.data;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader
        title={t('diag.title')}
        description={t('diag.sub')}
        actions={
          <Button variant="secondary" loading={query.isFetching} onClick={() => query.refetch()}>
            {t('common.refresh')}
          </Button>
        }
      />
      {query.isError && (
        <Alert tone="danger">
          {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
        </Alert>
      )}
      {d && (
        <>
          <div className="grid-4">
            <Stat
              accent
              label={t('diag.database')}
              value={d.database.ok ? t('diag.ok') : '—'}
              sub={`${t('diag.latency')}: ${d.database.latency_ms} ms · ${t('diag.last_migration')}: ${d.database.last_migration ?? '—'}`}
            />
            <Stat
              label={t('diag.worker')}
              value={d.worker.pending}
              sub={`${t('diag.pending')} · ${t('diag.dead')}: ${d.worker.dead} · ${t('diag.done_24h')}: ${d.worker.done_24h}`}
            />
            <Stat
              label={t('diag.errors_24h')}
              value={d.errors.last_24h}
              sub={`${t('common.total')}: ${d.errors.total}`}
            />
            <Stat
              label={t('diag.sessions')}
              value={d.sessions_active}
              sub={
                d.telegram.configured
                  ? `${t('diag.telegram_linked')}: ${d.telegram.linked_accounts}`
                  : t('diag.telegram_off')
              }
            />
          </div>
          <div className="grid-4">
            <Stat label={`${t('diag.tenants')} · ${t('tenants.state.pending')}`} value={d.tenants.pending} />
            <Stat label={`${t('diag.tenants')} · ${t('common.active')}`} value={d.tenants.active} />
            <Stat label={`${t('diag.tenants')} · ${t('tenants.state.blocked')}`} value={d.tenants.blocked} />
            <Stat
              label={`${t('diag.tenants')} · ${t('tenants.state.archived')}`}
              value={d.tenants.archived}
            />
          </div>
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <section className="card">
              <div className="card-header">
                <h3>{t('diag.failed_jobs')}</h3>
                {d.worker.oldest_pending_at && (
                  <small className="muted">
                    {t('diag.oldest')}: {formatDateTime(d.worker.oldest_pending_at, lang)}
                  </small>
                )}
              </div>
              {d.worker.failed_jobs.length === 0 ? (
                <div className="card-pad muted text-sm">{t('diag.no_failed')}</div>
              ) : (
                <table className="summary-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>{t('diag.company')}</th>
                      <th style={{ textAlign: 'left' }}>{t('common.status')}</th>
                      <th className="num">{t('diag.attempts')}</th>
                      <th style={{ textAlign: 'left' }}>{t('integr.error_code')}</th>
                      <th style={{ textAlign: 'left' }}>{t('common.date')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.worker.failed_jobs.map((j) => (
                      <tr key={j.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td>{j.tenant_name ?? t('diag.platform')}</td>
                        <td>
                          <Badge tone={j.status === 'dead' ? 'danger' : 'warning'}>{j.status}</Badge>
                        </td>
                        <td className="num">{j.attempts}</td>
                        <td className="mono text-xs">{j.error_code ?? '—'}</td>
                        <td className="text-xs">{formatDateTime(j.created_at, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section className="card">
              <div className="card-header">
                <h3>{t('diag.errors')}</h3>
              </div>
              {d.errors.items.length === 0 ? (
                <div className="card-pad muted text-sm">{t('diag.no_errors')}</div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {d.errors.items.map((e) => (
                    <li key={e.id} style={{ padding: '8px 20px', borderBottom: '1px solid var(--border)' }}>
                      <div className="row-between text-sm">
                        <span className="mono">
                          {e.method} {e.path}
                        </span>
                        <Badge tone="danger">{e.code}</Badge>
                      </div>
                      <small className="muted">
                        {t('diag.request')}: {e.request_id} · {formatDateTime(e.created_at, lang)}
                      </small>
                      {e.message && (
                        <div className="text-xs muted" style={{ wordBreak: 'break-word' }}>
                          {e.message}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <p className="muted text-xs">{t('diag.note')}</p>
        </>
      )}
    </div>
  );
}
