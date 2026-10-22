import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Copy, KeyRound, Link2, Pencil, Plus, ShieldBan, ShieldCheck, Archive, UserPlus } from 'lucide-react';
import { api, apiAll, ApiError, qs, type ListResponse } from '@/lib/api';
import { DetailError } from '@/app/guards';
import { useAuth } from '@/lib/auth';
import { canManageStaff, isPlatformOwner } from '@/lib/permissions';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { displayCurrency } from '@/lib/currency-store';
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
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

export type AccessState = 'pending' | 'trial' | 'paid' | 'overdue' | 'blocked' | 'archived';
export type LegalForm = 'mchj' | 'aj' | 'yatt' | 'qk' | 'other';
export type Tenant = {
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
  /** Figma F6 kompaniya profili (migratsiya 012 va 023) */
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  legal_form: LegalForm | null;
};
export type Plan = {
  id: string;
  code: string;
  version: number;
  monthly_price: string;
  limits: Record<string, number>;
  created_at: string;
  /** Shu versiyadagi kompaniyalar va ularning faol foydalanuvchilari (serverdan) */
  tenants?: number;
  users?: number;
};
export const legalForms: LegalForm[] = ['mchj', 'aj', 'yatt', 'qk', 'other'];
export const stateTone: Record<AccessState, Tone> = {
  pending: 'neutral',
  trial: 'info',
  paid: 'success',
  overdue: 'warning',
  blocked: 'danger',
  archived: 'neutral',
};

export function useApiError() {
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

/* Figma F6 (2026-10-17): bosh sahifa — dashboard.tsx, kompaniyalar ro'yxati va uch qadamli yaratish — tenants.tsx. */

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
  const { me } = useAuth();
  const owner = isPlatformOwner(me?.role);
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
  const [profileModal, setProfileModal] = useState(false);
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
      <DetailError
        error={query.error}
        onRetry={query.refetch}
        backTo={{ to: '/admin/tenants', label: t('common.back_to_list') }}
      />
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
          owner && (
          <>
            <Button variant="secondary" icon={<Pencil />} onClick={() => setProfileModal(true)}>
              {t('tenants.edit_profile')}
            </Button>
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
          )
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
                {d.admin && (
                  <div style={{ marginTop: 6 }}>
                    <ResetLinkButton userId={d.admin.id} />
                  </div>
                )}
              </dd>
              <dt>{t('tenants.users')}</dt>
              <dd>
                {d.users.active} / {d.users.total}
              </dd>
              <dt>{t('tenants.contact_name')}</dt>
              <dd>{d.contact_name ?? '—'}</dd>
              <dt>{t('tenants.email')}</dt>
              <dd>{d.email ?? '—'}</dd>
              <dt>{t('tenants.phone')}</dt>
              <dd className="mono">{d.phone ?? '—'}</dd>
              <dt>{t('tenants.address')}</dt>
              <dd>{d.address ?? '—'}</dd>
              <dt>{t('tenants.legal_form')}</dt>
              <dd>{d.legal_form ? t(`tenants.legal_form.${d.legal_form}`) : '—'}</dd>
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
            {owner && (
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
            )}
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
                {owner && (
                  <div>
                    <Button
                      icon={<Link2 />}
                      loading={issueInvite.isPending}
                      onClick={() => issueInvite.mutate()}
                    >
                      {t('tenants.invite_new')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
        <section className="card">
          <div className="card-header">
            <h3>{t('tenants.plan')}</h3>
            {owner && (
              <Button size="sm" variant="secondary" onClick={() => setPlanModal(true)}>
                {t('tenants.set_plan')}
              </Button>
            )}
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
          {owner && (
            <Button
              icon={<Plus />}
              variant="secondary"
              disabled={!d.subscription}
              onClick={() => setInvoiceModal(true)}
            >
              {t('tenants.new_invoice')}
            </Button>
          )}
        </div>
        <DataTable
          columns={owner ? invoiceCols : invoiceCols.filter((c) => c.key !== 'act')}
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
      {profileModal && (
        <TenantProfileModal tenant={d} onClose={() => setProfileModal(false)} onDone={refresh} />
      )}
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
/** Figma F6 "Kompaniyani tahrirlash": nom, mas'ul shaxs, e-mail, telefon, manzil, shakl, alias — PATCH /profile. */
function TenantProfileModal({
  tenant,
  onClose,
  onDone,
}: {
  tenant: TenantDetail;
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  const { t } = useT();
  const toast = useToast();
  const onError = useApiError();
  const [form, setForm] = useState({
    legal_name: tenant.legal_name,
    contact_name: tenant.contact_name ?? '',
    email: tenant.email ?? '',
    phone: tenant.phone ?? '',
    address: tenant.address ?? '',
    legal_form: tenant.legal_form ?? '',
    alias: tenant.alias ?? '',
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: () =>
      api(`/v1/platform/tenants/${tenant.id}/profile`, {
        method: 'PATCH',
        body: {
          version: tenant.version,
          legal_name: form.legal_name.trim(),
          ...(form.contact_name.trim() ? { contact_name: form.contact_name.trim() } : {}),
          ...(form.email.trim() ? { email: form.email.trim() } : {}),
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          ...(form.address.trim() ? { address: form.address.trim() } : {}),
          ...(form.legal_form ? { legal_form: form.legal_form } : {}),
          alias: form.alias.trim(),
        },
      }),
    onSuccess: async () => {
      await onDone();
      toast.success(t('common.saved'));
      onClose();
    },
    onError: (e: ApiError) => (e.code === 'VERSION_CONFLICT' ? toast.error(t('common.version_conflict')) : onError(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={t('tenants.edit_title', { name: tenant.legal_name })}
      description={t('tenants.edit_sub')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={form.legal_name.trim().length < 2}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Input label={t('tenants.legal_name')} required value={form.legal_name} onChange={(e) => set('legal_name', e.target.value)} />
        <Input label={t('tenants.email')} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        <Input label={t('tenants.contact_name')} value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
        <Input label={t('tenants.phone')} placeholder="+998901234567" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        <Input wrapClassName="span-2" label={t('tenants.address')} value={form.address} onChange={(e) => set('address', e.target.value)} />
        <Select label={t('tenants.legal_form')} value={form.legal_form} onChange={(e) => set('legal_form', e.target.value)}>
          <option value="">—</option>
          {legalForms.map((f) => (
            <option key={f} value={f}>
              {t(`tenants.legal_form.${f}`)}
            </option>
          ))}
        </Select>
        <Input label={t('tenants.alias')} value={form.alias} onChange={(e) => set('alias', e.target.value)} />
      </div>
    </Modal>
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
              {p.code} v{p.version} — {formatMoney(p.monthly_price, lang, true, 'UZS')}
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
  const { t, lang } = useT();
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
          value={tenant.subscription ? formatMoney(tenant.subscription.monthly_price, lang, true, 'UZS') : ''}
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

/* Figma F6: tariflar — plans.tsx, daromad va qarzdorlik, qarzdorlar — billing.tsx, murojaatlar chati — support.tsx. */

/* ---------------- Parolni tiklash havolasi (egasi va super admin) ---------------- */
/** Foydalanuvchiga 30 daqiqalik bir martalik havola; parol ko'rsatilmaydi, sessiyalar bekor qilinadi. */
function ResetLinkButton({ userId }: { userId: string }) {
  const { t } = useT();
  const onError = useApiError();
  const { me } = useAuth();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const m = useMutation({
    mutationFn: () => api<{ token: string }>(`/v1/platform/users/${userId}/reset`, { method: 'POST' }),
    onSuccess: (r) => {
      setCopied(false);
      setLink(`${location.origin}/reset-password#token=${r.token}`);
    },
    onError,
  });
  if (!(isPlatformOwner(me?.role) || canManageStaff(me?.role))) return null;
  return (
    <>
      <Button size="sm" variant="secondary" icon={<KeyRound />} loading={m.isPending} onClick={() => m.mutate()}>
        {t('employees.reset_create')}
      </Button>
      <Modal
        open={Boolean(link)}
        onClose={() => setLink(null)}
        title={t('employees.reset')}
        footer={
          <Button variant="secondary" onClick={() => setLink(null)}>
            {t('common.close')}
          </Button>
        }
      >
        <div className="stack">
          <p className="muted text-sm">{t('employees.reset_hint')}</p>
          {link && (
            <div className="row">
              <code className="text-xs grow" style={{ wordBreak: 'break-all' }}>
                {link}
              </code>
              <Button
                size="sm"
                variant="secondary"
                icon={copied ? <Check /> : <Copy />}
                onClick={async () => {
                  await navigator.clipboard.writeText(link).catch(() => undefined);
                  setCopied(true);
                }}
              >
                {copied ? t('common.copied') : t('common.copy')}
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </>
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
  telegram_linked: boolean;
};
export function StaffPage() {
  const { t, lang } = useT();
  const { me } = useAuth();
  const toast = useToast();
  const onError = useApiError();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['platform-staff'],
    queryFn: () => api<ListResponse<Staff>>('/v1/platform/staff'),
  });
  const [open, setOpen] = useState(false);
  const [toggle, setToggle] = useState<Staff | null>(null);
  const schema = z.object({
    login: z.string().regex(/^[a-zA-Z0-9._-]{3,64}$/, t('auth.login_name')),
    display_name: z.string().trim().min(2).max(120),
    password: z.string().min(6, t('auth.password_rules')).max(128),
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
  const update = useMutation({
    mutationFn: (v: { id: string; active: boolean; role: Staff['role'] }) =>
      api(`/v1/platform/staff/${v.id}`, { method: 'PATCH', body: { active: v.active, role: v.role } }),
    onSuccess: async (_, v) => {
      await queryClient.invalidateQueries({ queryKey: ['platform-staff'] });
      toast.success(toggle ? t('common.saved') : t('staff.role_changed'));
      if (toggle?.id === v.id) setToggle(null);
    },
    onError: (e: ApiError) => {
      setToggle(null);
      onError(e);
    },
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
      key: 'tg',
      header: t('staff.col_2fa'),
      render: (r) =>
        r.telegram_linked ? (
          <Badge tone="success">{t('staff.tg_2fa_on')}</Badge>
        ) : r.role === 'support' ? (
          <Badge tone="neutral">{t('staff.tg_off')}</Badge>
        ) : (
          <Badge tone="warning">{t('staff.tg_2fa_off')}</Badge>
        ),
    },
    {
      key: 'created',
      header: t('common.created_at'),
      render: (r) => formatDate(r.created_at, lang),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      // O'z parolini profilda almashtiradi; platforma egasining parolini faqat egasi tiklaydi (server ham tekshiradi).
      render: (r) =>
        r.id !== me?.id && r.role !== 'platform_owner' ? (
          <span className="row wrap" style={{ justifyContent: 'flex-end' }}>
            <Select
              aria-label={t('common.role')}
              style={{ minWidth: 140 }}
              value={r.role}
              disabled={update.isPending}
              onChange={(e) => update.mutate({ id: r.id, active: r.active, role: e.target.value as Staff['role'] })}
            >
              <option value="super_admin">{t('role.super_admin')}</option>
              <option value="support">{t('role.support')}</option>
            </Select>
            <Button size="sm" variant="secondary" onClick={() => setToggle(r)}>
              {r.active ? t('employees.deactivate') : t('employees.activate')}
            </Button>
            {r.active && <ResetLinkButton userId={r.id} />}
          </span>
        ) : null,
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
      <ConfirmDialog
        open={toggle !== null}
        onClose={() => setToggle(null)}
        onConfirm={() => toggle && update.mutate({ id: toggle.id, active: !toggle.active, role: toggle.role })}
        title={toggle?.active ? t('employees.deactivate') : t('employees.activate')}
        danger={Boolean(toggle?.active)}
        loading={update.isPending}
        message={toggle?.active ? t('staff.confirm_deactivate') : t('staff.confirm_activate')}
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
/* Figma F6: diagnostika — diagnostics.tsx. */
