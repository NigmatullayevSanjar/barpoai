import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RotateCcw } from 'lucide-react';
import { api, ApiError, qs, type ListResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatMoney } from '@/lib/format';
import { Alert, Button, Input, Modal, PageHeader, SearchInput, Select, useListState } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { legalForms, useApiError, type AccessState, type Plan, type Tenant } from './pages';

/**
 * Figma F6 (2026-10-17) "Kompaniyalar": qidiruv, holat va tarif filtri, jadval (kompaniya, domen, tarif, xodimlar,
 * holat, sana) va uch qadamli "Kompaniya ochish" oynasi (ma'lumotlar → yuridik va domen → tarif va holat).
 * "Eksport" tugmasi uchun endpoint yo'q (D17). Yaratish faqat platforma egasida (D15).
 */
const states: AccessState[] = ['pending', 'trial', 'paid', 'overdue', 'blocked', 'archived'];
const stateClass: Record<AccessState, string> = {
  pending: 'muted',
  trial: 'active',
  paid: 'active',
  overdue: 'danger',
  blocked: 'danger',
  archived: 'muted',
};

export function TenantsTable({
  rows,
  loading,
  error,
  refetch,
  pagination,
  emptyTitle,
  action,
}: {
  rows?: Tenant[];
  loading: boolean;
  error: unknown;
  refetch: () => void;
  pagination?: React.ComponentProps<typeof DataTable<Tenant>>['pagination'];
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
          <div className="cell-main">{r.legal_name}</div>
          <div className="cell-sub mono">{r.registration_key}</div>
        </>
      ),
    },
    {
      key: 'alias',
      header: t('tenants.domain'),
      sortValue: (r) => r.alias ?? '',
      render: (r) =>
        r.alias ? (
          <span style={{ color: 'var(--brand-600)' }}>{r.alias}</span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'plan',
      header: t('tenants.plan'),
      sortValue: (r) => r.plan_code ?? '',
      render: (r) => r.plan_code ?? <span className="muted">—</span>,
    },
    {
      key: 'users',
      header: t('tenants.users'),
      align: 'right',
      sortValue: (r) => r.active_users,
      render: (r) => <span className="mono">{r.active_users}</span>,
    },
    {
      key: 'access',
      header: t('common.status'),
      sortValue: (r) => r.access_state,
      render: (r) => (
        <>
          <span className={`status-text-${stateClass[r.access_state]}`}>
            {t(`tenants.state.${r.access_state}`)}
          </span>
          {(r.access_state === 'trial' || r.access_state === 'paid') && r.days_left > 0 && (
            <div className="cell-sub">{t('tenants.days_left', { n: r.days_left })}</div>
          )}
          {r.access_state === 'overdue' && r.days_overdue > 0 && (
            <div className="cell-sub">{t('tenants.days_overdue', { n: r.days_overdue })}</div>
          )}
        </>
      ),
    },
    {
      key: 'created',
      header: t('common.date'),
      sortValue: (r) => r.created_at,
      render: (r) => <span className="mono">{formatDate(r.created_at, lang)}</span>,
    },
  ];
  // "Domen" — platforma egasining shaxsiy belgisi (alias, egaga bog'liq): texnik xodim va super adminda doim bo'sh,
  // shuning uchun hech bir qatorda alias bo'lmasa ustun ko'rsatilmaydi.
  const hasAlias = (rows ?? []).some((r) => r.alias);
  return (
    <DataTable
      columns={hasAlias ? columns : columns.filter((c) => c.key !== 'alias')}
      rows={rows}
      rowKey={(r) => r.id}
      loading={loading}
      error={error ? errorMessage(t, (error as ApiError).code, (error as ApiError).status) : null}
      onRetry={refetch}
      onRowClick={(r) => navigate(`/admin/tenants/${r.id}`)}
      pagination={pagination}
      empty={{ title: emptyTitle ?? t('common.empty'), action }}
    />
  );
}

export function TenantsPage() {
  const { t } = useT();
  const list = useListState();
  const { canPlatform } = useAuth();
  const owner = canPlatform('tenants.manage');
  const [filter, setFilter] = useState<'all' | AccessState>('all');
  const [plan, setPlan] = useState('');
  const [open, setOpen] = useState(false);
  const plans = useQuery({
    queryKey: ['platform-plans'],
    queryFn: () => api<ListResponse<Plan>>('/v1/platform/plans'),
  });
  const planCodes = [...new Set((plans.data?.items ?? []).map((p) => p.code))];
  const query = useQuery({
    queryKey: ['platform-tenants', 'list', list.q, filter, plan, list.offset, list.limit],
    queryFn: () =>
      api<ListResponse<Tenant>>(
        `/v1/platform/tenants${qs({
          q: list.q,
          state: filter === 'all' ? undefined : filter,
          plan: plan || undefined,
          limit: list.limit,
          offset: list.offset,
        })}`,
      ),
  });
  const newButton = owner && (
    <Button icon={<Plus />} onClick={() => setOpen(true)}>
      {t('tenants.new')}
    </Button>
  );
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader title={t('tenants.title')} description={t('tenants.sub')} actions={newButton} />
      <div className="toolbar blocks-toolbar">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder={t('tenants.search_ph')} />
        <Select
          aria-label={t('tenants.access')}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as typeof filter);
            list.setOffset(0);
          }}
        >
          <option value="all">{t('tenants.filter_state')}</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {t(`tenants.state.${s}`)}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t('tenants.plan')}
          value={plan}
          onChange={(e) => {
            setPlan(e.target.value);
            list.setOffset(0);
          }}
        >
          <option value="">{t('tenants.filter_plan')}</option>
          {planCodes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>
      <TenantsTable
        rows={query.data?.items}
        loading={query.isLoading}
        error={query.error}
        refetch={query.refetch}
        pagination={list.pagination}
        action={newButton}
      />
      {open && <CreateTenantWizard plans={plans.data?.items ?? []} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Figma "Kompaniya ochish" — uch qadam; bitta POST /v1/platform/tenants (profil, alias, tarif). */
function CreateTenantWizard({ plans, onClose }: { plans: Plan[]; onClose: () => void }) {
  const { t, lang } = useT();
  const toast = useToast();
  const onError = useApiError();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const empty = {
    legal_name: '',
    email: '',
    contact_name: '',
    phone: '',
    address: '',
    registration_key: '',
    legal_form: '',
    alias: '',
    plan_version_id: '',
    start: new Date().toISOString().slice(0, 10),
  };
  const [form, setForm] = useState(empty);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const create = useMutation({
    mutationFn: () =>
      api<Tenant>('/v1/platform/tenants', {
        method: 'POST',
        body: {
          legal_name: form.legal_name.trim(),
          registration_key: form.registration_key.trim(),
          ...(form.contact_name.trim() ? { contact_name: form.contact_name.trim() } : {}),
          ...(form.email.trim() ? { email: form.email.trim() } : {}),
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          ...(form.address.trim() ? { address: form.address.trim() } : {}),
          ...(form.legal_form ? { legal_form: form.legal_form } : {}),
          ...(form.alias.trim() ? { alias: form.alias.trim() } : {}),
          ...(form.plan_version_id
            ? {
                plan_version_id: form.plan_version_id,
                next_period_start: new Date(form.start + 'T00:00:00Z').toISOString(),
              }
            : {}),
        },
      }),
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: ['platform-tenants'] });
      toast.success(t('tenants.created'));
      onClose();
      navigate(`/admin/tenants/${row.id}`);
    },
    onError,
  });
  const valid =
    step === 1
      ? form.legal_name.trim().length >= 2
      : step === 2
        ? form.registration_key.trim().length >= 2
        : true;
  const titles = {
    1: ['tenants.step1', 'tenants.step1_sub'],
    2: ['tenants.step2', 'tenants.step2_sub'],
    3: ['tenants.step3', 'tenants.step3_sub'],
  } as const;
  return (
    <Modal
      open
      onClose={onClose}
      title={t('tenants.new')}
      size="lg"
      footer={
        <>
          {step > 1 && (
            <Button variant="secondary" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}>
              {t('tenants.back')}
            </Button>
          )}
          <Button variant="secondary" icon={<RotateCcw />} onClick={() => setForm(empty)}>
            {t('tenants.clear')}
          </Button>
          <span className="spacer" />
          {step < 3 ? (
            <Button disabled={!valid} onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}>
              {t('tenants.next')}
            </Button>
          ) : (
            <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!valid}>
              {t('common.create')}
            </Button>
          )}
        </>
      }
    >
      <div className="wizard-steps" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span key={n} className={n <= step ? 'done' : ''} />
        ))}
      </div>
      <h3 className="wizard-title">
        {step}/3 · {t(titles[step][0])}
      </h3>
      <p className="wizard-sub">{t(titles[step][1])}</p>
      {step === 1 && (
        <div className="form-grid">
          <Input
            label={t('tenants.legal_name')}
            required
            value={form.legal_name}
            onChange={(e) => set('legal_name', e.target.value)}
          />
          <Input
            label={t('tenants.email')}
            type="email"
            placeholder="company@example.uz"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
          <Input
            label={t('tenants.contact_name')}
            value={form.contact_name}
            onChange={(e) => set('contact_name', e.target.value)}
          />
          <Input
            label={t('tenants.phone')}
            placeholder="+998901234567"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
          />
          <Input
            wrapClassName="span-2"
            label={t('tenants.address')}
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
          />
        </div>
      )}
      {step === 2 && (
        <div className="form-grid">
          <Input
            label={t('tenants.registration_key')}
            required
            value={form.registration_key}
            onChange={(e) => set('registration_key', e.target.value)}
          />
          <Select
            label={t('tenants.legal_form')}
            value={form.legal_form}
            onChange={(e) => set('legal_form', e.target.value)}
          >
            <option value="">—</option>
            {legalForms.map((f) => (
              <option key={f} value={f}>
                {t(`tenants.legal_form.${f}`)}
              </option>
            ))}
          </Select>
          <Input
            wrapClassName="span-2"
            label={t('tenants.alias')}
            placeholder="kompaniya.nova.uz"
            value={form.alias}
            onChange={(e) => set('alias', e.target.value)}
          />
        </div>
      )}
      {step === 3 && (
        <div className="form-grid">
          <Select
            wrapClassName="span-2"
            label={t('tenants.plan_version')}
            value={form.plan_version_id}
            onChange={(e) => set('plan_version_id', e.target.value)}
          >
            <option value="">—</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} v{p.version} — {formatMoney(p.monthly_price, lang, true, 'UZS')}
              </option>
            ))}
          </Select>
          <Input label={t('common.status')} value={t('tenants.state.pending')} disabled readOnly />
          <Input
            type="date"
            label={t('tenants.start_date')}
            value={form.start}
            disabled={!form.plan_version_id}
            onChange={(e) => set('start', e.target.value)}
          />
          <div className="span-2">
            <Alert tone="info">{t('tenants.status_pending_hint')}</Alert>
          </div>
        </div>
      )}
    </Modal>
  );
}
