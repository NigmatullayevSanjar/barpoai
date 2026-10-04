import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Copy, ExternalLink, Send, Unlink } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT, type Lang } from '@/lib/i18n';
import { formatDateTime } from '@/lib/format';
import { Alert, Badge, Button, ConfirmDialog, Input, PageHeader, Segmented } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

type TelegramStatus = {
  configured: boolean;
  bot_username: string;
  linked: boolean;
  username: string | null;
  first_name: string | null;
  linked_at: string | null;
  last_seen_at: string | null;
};
type LinkResponse = { url: string; expires_at: string; expires_in: number };

function TelegramCard() {
  const { t, lang } = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ['telegram-status'],
    queryFn: () => api<TelegramStatus>('/v1/integrations/telegram'),
    refetchInterval: (q) => (q.state.data && !q.state.data.linked ? 4000 : false),
  });
  const [link, setLink] = useState<LinkResponse | null>(null);
  const [left, setLeft] = useState(0);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const wasLinked = status.data?.linked;
  useEffect(() => {
    if (!link) return;
    const tick = () =>
      setLeft(Math.max(0, Math.round((new Date(link.expires_at).getTime() - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [link]);
  useEffect(() => {
    if (wasLinked && link) {
      setLink(null);
      toast.success(t('telegram.connected_toast'));
    }
  }, [wasLinked, link, toast, t]);
  const create = useMutation({
    mutationFn: () => api<LinkResponse>('/v1/integrations/telegram/link', { method: 'POST' }),
    onSuccess: (data) => {
      setLink(data);
      setCopied(false);
    },
    onError: (e: ApiError) => toast.error(errorMessage(t, e.code, e.status)),
  });
  const unlink = useMutation({
    mutationFn: () => api('/v1/integrations/telegram', { method: 'DELETE' }),
    onSuccess: async () => {
      setConfirm(false);
      await queryClient.invalidateQueries({ queryKey: ['telegram-status'] });
      toast.success(t('telegram.disconnected_toast'));
    },
    onError: (e: ApiError) => toast.error(errorMessage(t, e.code, e.status)),
  });
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      /* clipboard blocked */
    }
  };
  const s = status.data;
  return (
    <section className="card">
      <div className="card-header">
        <h3 className="row">
          <Send size={16} /> {t('telegram.title')}
        </h3>
        {s && (
          <Badge tone={s.linked ? 'success' : 'neutral'}>
            {s.linked ? t('telegram.linked') : t('telegram.not_linked')}
          </Badge>
        )}
      </div>
      <div className="card-pad stack">
        <p className="muted text-sm">{t('telegram.desc')}</p>
        {status.isError && (
          <Alert tone="danger">
            {errorMessage(t, (status.error as ApiError).code, (status.error as ApiError).status)}{' '}
            <Button size="sm" variant="ghost" onClick={() => status.refetch()}>
              {t('common.retry')}
            </Button>
          </Alert>
        )}
        {s && !s.configured && <Alert tone="warning">{t('telegram.not_configured')}</Alert>}
        {s?.linked && (
          <>
            <dl className="kv">
              <dt>Telegram</dt>
              <dd>{s.username ? `@${s.username}` : (s.first_name ?? '—')}</dd>
              <dt>{t('telegram.linked_at')}</dt>
              <dd>{formatDateTime(s.linked_at, lang)}</dd>
            </dl>
            <div>
              <Button variant="secondary" icon={<Unlink />} onClick={() => setConfirm(true)}>
                {t('telegram.disconnect')}
              </Button>
            </div>
          </>
        )}
        {s && !s.linked && s.configured && !link && (
          <div>
            <Button icon={<Send />} loading={create.isPending} onClick={() => create.mutate()}>
              {t('telegram.connect')}
            </Button>
          </div>
        )}
        {s && !s.linked && link && (
          <div className="stack">
            <p className="text-sm">
              {t('telegram.link_hint', {
                minutes: Math.round(link.expires_in / 60),
              })}
            </p>
            <div className="row wrap">
              <a className="btn btn-primary" href={link.url} target="_blank" rel="noreferrer">
                <ExternalLink /> {t('telegram.open')}
              </a>
              <Button variant="secondary" icon={copied ? <Check /> : <Copy />} onClick={copy}>
                {copied ? t('common.copied') : t('common.copy')}
              </Button>
              <Button variant="ghost" onClick={() => create.mutate()} loading={create.isPending}>
                {t('telegram.regenerate')}
              </Button>
            </div>
            <code className="text-xs muted" style={{ wordBreak: 'break-all' }}>
              {link.url}
            </code>
            {left > 0 ? (
              <p className="muted text-sm row">
                <span className="spinner" /> {t('telegram.waiting')} ·{' '}
                {t('telegram.expires_in', { seconds: left })}
              </p>
            ) : (
              <Alert tone="warning">{t('telegram.expired')}</Alert>
            )}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => unlink.mutate()}
        title={t('telegram.disconnect')}
        message={t('telegram.disconnect_confirm')}
        danger
        loading={unlink.isPending}
      />
    </section>
  );
}

export function ProfilePage() {
  const { t, lang, setLang } = useT();
  const { me, refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const schema = z.object({
    display_name: z.string().trim().min(2, t('common.required')).max(120),
    phone: z.string().trim(),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    values: { display_name: me?.display_name ?? '', phone: me?.phone ?? '' },
  });
  const save = form.handleSubmit(async (v) => {
    try {
      await api('/v1/auth/profile', {
        method: 'PATCH',
        body: { display_name: v.display_name, phone: v.phone ? v.phone : null },
      });
      await refresh();
      toast.success(t('common.saved'));
    } catch (e) {
      const err = e as ApiError;
      if (err.fields?.some((f) => f.path[0] === 'phone'))
        form.setError('phone', { message: t('error.VALIDATION_ERROR') });
      else toast.error(errorMessage(t, err.code, err.status));
    }
  });
  if (!me) return null;
  return (
    <div className="content-narrow stack" style={{ gap: 16 }}>
      <PageHeader title={t('profile.title')} description={t('profile.sub')} />
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card">
          <div className="card-header">
            <h3>{t('profile.personal')}</h3>
            <Badge tone="brand">{t(`role.${me.role}`)}</Badge>
          </div>
          <form className="card-pad stack" onSubmit={save} noValidate>
            {me.tenant_name && (
              <dl className="kv">
                <dt>{t('profile.company')}</dt>
                <dd>{me.tenant_name}</dd>
              </dl>
            )}
            <Input
              label={t('auth.display_name')}
              error={form.formState.errors.display_name?.message}
              {...form.register('display_name')}
            />
            <Input
              label={t('common.phone')}
              placeholder="+998 90 123 45 67"
              error={form.formState.errors.phone?.message}
              {...form.register('phone')}
            />
            <div className="field">
              <span className="field-label">{t('profile.language')}</span>
              <Segmented<Lang>
                value={lang}
                onChange={setLang}
                items={[
                  { key: 'uz', label: 'O‘zbekcha' },
                  { key: 'ru', label: 'Русский' },
                ]}
              />
            </div>
            <div className="row-between">
              <Button variant="secondary" onClick={() => navigate('/change-password')}>
                {t('profile.change_password')}
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting}>
                {t('common.save')}
              </Button>
            </div>
          </form>
        </section>
        <TelegramCard />
      </div>
    </div>
  );
}
