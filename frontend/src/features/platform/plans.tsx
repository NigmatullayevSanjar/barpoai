import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus } from 'lucide-react';
import { api, ApiError, type ListResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isPlatformOwner } from '@/lib/permissions';
import { errorMessage, useT } from '@/lib/i18n';
import { formatMoney } from '@/lib/format';
import { Alert, Badge, Button, EmptyState, Input, Modal, PageHeader } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useApiError, type Plan } from './pages';

/**
 * Figma F6 (2026-10-17) "Tariflar": har tarif versiyasi karta — kod, oylik narx, limitlar (foydalanuvchilar bo'yicha
 * foydalanish chizig'i: shu tarifdagi kompaniyalarning faol foydalanuvchilari / limit × kompaniyalar), kompaniyalar soni,
 * tahrirlash. Versiyalar o'zgarmas — "O'chirish" yo'q (D17). Yaratish va tahrirlash faqat egasida.
 */
const limitKeys = ['users', 'projects', 'storage_mb'] as const;

export function PlansPage() {
  const { t, lang } = useT();
  const { me } = useAuth();
  const owner = isPlatformOwner(me?.role);
  const toast = useToast();
  const onError = useApiError();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['platform-plans'],
    queryFn: () => api<ListResponse<Plan>>('/v1/platform/plans'),
  });
  const [open, setOpen] = useState(false);
  // Tahrirlanayotgan tarif (null — yangi versiya yaratish); versiya raqami tahrirda o'zgarmaydi.
  const [editing, setEditing] = useState<Plan | null>(null);
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
    mutationFn: (v: z.infer<typeof schema>) => {
      const limits = { users: v.users, projects: v.projects, storage_mb: v.storage_mb };
      return editing
        ? api(`/v1/platform/plans/${editing.id}`, {
            method: 'PATCH',
            body: { code: v.code, monthly_price: v.monthly_price, limits: { ...editing.limits, ...limits } },
          })
        : api('/v1/platform/plans', {
            method: 'POST',
            body: { code: v.code, version: v.version, monthly_price: v.monthly_price, limits },
          });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['platform-plans'] });
      toast.success(t('common.saved'));
      setOpen(false);
    },
    onError,
  });
  const openNew = () => {
    setEditing(null);
    form.reset({
      code: 'standard',
      version: 1,
      monthly_price: '',
      users: 20,
      projects: 10,
      storage_mb: 2048,
    });
    setOpen(true);
  };
  const openEdit = (plan: Plan) => {
    setEditing(plan);
    form.reset({
      code: plan.code,
      version: plan.version,
      monthly_price: plan.monthly_price,
      users: plan.limits.users ?? 0,
      projects: plan.limits.projects ?? 0,
      storage_mb: plan.limits.storage_mb ?? 0,
    });
    setOpen(true);
  };
  const limitLabel = (k: string) =>
    t(`plans.limit_${k}`) === `plans.limit_${k}` ? k : t(`plans.limit_${k}`);
  const items = query.data?.items ?? [];
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader
        title={t('plans.title')}
        description={t('plans.sub')}
        actions={
          owner && (
            <Button icon={<Plus />} onClick={openNew}>
              {t('plans.new')}
            </Button>
          )
        }
      />
      {query.isError && (
        <Alert tone="danger">
          {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
        </Alert>
      )}
      {query.data && items.length === 0 ? (
        <EmptyState
          title={t('common.empty')}
          action={
            owner && (
              <Button icon={<Plus />} onClick={openNew}>
                {t('plans.new')}
              </Button>
            )
          }
        />
      ) : (
        <div className="plan-grid">
          {items.map((p) => {
            const tenants = p.tenants ?? 0;
            const users = p.users ?? 0;
            const userCap = (p.limits.users ?? 0) * tenants;
            const usersPct = userCap > 0 ? Math.min(100, Math.round((users / userCap) * 100)) : 0;
            return (
              <section key={p.id} className="card plan-card">
                <div className="row-between">
                  <div>
                    <h3>{p.code}</h3>
                    <div className="plan-sub">{t('plans.card_sub')}</div>
                  </div>
                  <Badge tone="brand">v{p.version}</Badge>
                </div>
                <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
                  <b className="mono" style={{ fontSize: 'var(--fs-xl)' }}>
                    {formatMoney(p.monthly_price, lang)}
                  </b>
                  <span className="muted text-sm">{t('plans.per_month')}</span>
                </div>
                <div className="plan-limit">
                  <div className="row-between">
                    <span>{limitLabel('users')}</span>
                    <b className="mono">
                      {tenants > 0 ? `${users} / ${userCap}` : `— / ${p.limits.users ?? 0}`}
                    </b>
                  </div>
                  <span className={`progress ${usersPct > 90 ? 'warn' : 'ok'}`}>
                    <span style={{ width: `${usersPct}%` }} />
                  </span>
                </div>
                {limitKeys
                  .filter((k) => k !== 'users')
                  .map((k) => (
                    <div key={k} className="plan-limit">
                      <div className="row-between">
                        <span>{limitLabel(k)}</span>
                        <b className="mono">{p.limits[k] ?? 0}</b>
                      </div>
                      <span className="progress ok">
                        <span style={{ width: '100%' }} />
                      </span>
                    </div>
                  ))}
                {Object.keys(p.limits)
                  .filter((k) => !(limitKeys as readonly string[]).includes(k))
                  .map((k) => (
                    <div key={k} className="row-between text-sm">
                      <span>{limitLabel(k)}</span>
                      <b className="mono">{p.limits[k]}</b>
                    </div>
                  ))}
                <div className="row-between text-sm muted">
                  <span>{t('plans.tenants_n', { n: tenants })}</span>
                  <span>
                    {t('common.created_at')}: {p.created_at.slice(0, 10)}
                  </span>
                </div>
                {owner && (
                  <div className="plan-actions">
                    <Button variant="secondary" icon={<Pencil />} onClick={() => openEdit(p)}>
                      {t('plans.edit')}
                    </Button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('plans.edit') : t('plans.new')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={form.handleSubmit((v) => m.mutate(v))} loading={m.isPending}>
              {editing ? t('common.save') : t('common.create')}
            </Button>
          </>
        }
      >
        <form className="form-grid" noValidate onSubmit={form.handleSubmit((v) => m.mutate(v))}>
          {editing && <Alert tone="info">{t('plans.edit_note')}</Alert>}
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
            disabled={Boolean(editing)}
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
