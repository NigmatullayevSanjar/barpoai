import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import { Alert, Badge, Button, Input, PageHeader, Switch } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

const categories = ['tasks', 'reports', 'stock', 'finance'] as const;
type Category = (typeof categories)[number];
type Company = {
  id: string;
  legal_name: string;
  address: string | null;
  phone: string | null;
  created_at: string;
  version: number;
  status: string;
  access: { access_state: string; covered_until: string | null; days_left: number; days_overdue: number };
  settings: { telegram: Record<Category, boolean> };
};

/** Kompaniya sozlamalari: rekvizitlar va Telegram bildirishnoma toifalari. Logotip yo'q (egasi qarori). */
export function SettingsPage() {
  const { t, lang } = useT();
  const { can, refresh } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['company'], queryFn: () => api<Company>('/v1/company') });
  const c = query.data;
  const canEdit = can('settings', 'update');
  const schema = z.object({
    legal_name: z.string().trim().min(2, t('common.required')).max(200),
    address: z.string().trim().max(500),
    phone: z.string().trim(),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    values: { legal_name: c?.legal_name ?? '', address: c?.address ?? '', phone: c?.phone ?? '' },
  });
  const [telegram, setTelegram] = useState<Record<Category, boolean> | null>(null);
  useEffect(() => {
    if (c) setTelegram(c.settings.telegram);
  }, [c]);
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<Company>('/v1/company', { method: 'PATCH', body: { ...body, version: c!.version } }),
    onSuccess: async (data) => {
      queryClient.setQueryData(['company'], data);
      await refresh();
      toast.success(t('settings.saved'));
    },
    onError: (e: ApiError) => {
      if (e.fields?.some((f) => f.path[0] === 'phone'))
        form.setError('phone', { message: t('error.VALIDATION_ERROR') });
      else
        toast.error(
          e.code === 'VERSION_CONFLICT' ? t('common.version_conflict') : errorMessage(t, e.code, e.status),
        );
    },
  });
  const submit = form.handleSubmit((v) =>
    save.mutate({ legal_name: v.legal_name, address: v.address || null, phone: v.phone || null }),
  );
  const toggle = (key: Category, value: boolean) => {
    const next = { ...telegram!, [key]: value };
    setTelegram(next);
    save.mutate({ settings: { telegram: { [key]: value } } });
  };
  if (query.isError)
    return (
      <Alert tone="danger">
        {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
      </Alert>
    );
  // Forma faqat ma'lumot kelgach chiziladi: aks holda serverdan kelgan qiymat kiritilgan matnni qayta tiklaydi.
  if (!c || !telegram)
    return (
      <div className="content-narrow stack" style={{ gap: 16 }}>
        <PageHeader title={t('settings.title')} description={t('settings.sub')} />
        <div className="skeleton" style={{ height: 240 }} />
      </div>
    );
  return (
    <div className="content-narrow stack" style={{ gap: 16 }}>
      <PageHeader title={t('settings.title')} description={t('settings.sub')} />
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card">
          <div className="card-header">
            <h3>{t('settings.company')}</h3>
            {c && (
              <Badge
                tone={
                  c.access.access_state === 'paid'
                    ? 'success'
                    : c.access.access_state === 'trial'
                      ? 'info'
                      : 'warning'
                }
              >
                {t(`tenants.state.${c.access.access_state}`)}
              </Badge>
            )}
          </div>
          <form className="card-pad stack" onSubmit={submit} noValidate>
            <Input
              label={t('settings.legal_name')}
              required
              disabled={!canEdit}
              error={form.formState.errors.legal_name?.message}
              {...form.register('legal_name')}
            />
            <Input
              label={t('settings.address')}
              disabled={!canEdit}
              error={form.formState.errors.address?.message}
              {...form.register('address')}
            />
            <Input
              label={t('settings.phone')}
              placeholder="+998 71 200 00 00"
              disabled={!canEdit}
              error={form.formState.errors.phone?.message}
              {...form.register('phone')}
            />
            {c && (
              <dl className="kv">
                <dt>{t('settings.created_at')}</dt>
                <dd>{formatDate(c.created_at, lang)}</dd>
                <dt>{t('settings.subscription')}</dt>
                <dd>
                  <Link to="/app/billing">{t('page.billing')}</Link>
                </dd>
              </dl>
            )}
            {canEdit && (
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <Button type="submit" loading={save.isPending && !save.variables?.settings}>
                  {t('common.save')}
                </Button>
              </div>
            )}
          </form>
        </section>
        <section className="card">
          <div className="card-header">
            <h3>{t('settings.notifications')}</h3>
          </div>
          <div className="card-pad stack" style={{ gap: 12 }}>
            <p className="muted text-sm">{t('settings.notifications_hint')}</p>
            {telegram &&
              categories.map((key) => (
                <Switch
                  key={key}
                  label={t(`settings.cat.${key}`)}
                  checked={telegram[key]}
                  disabled={!canEdit || save.isPending}
                  onChange={(v) => toggle(key, v)}
                />
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
