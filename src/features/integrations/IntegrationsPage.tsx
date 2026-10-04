import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Cctv } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDateTime } from '@/lib/format';
import { Alert, Badge, EmptyState, PageHeader, type Tone } from '@/components/ui';

type Provider = 'telegram' | 'uysot' | 'bank' | 'didox' | 'ihamkor' | 'camera' | 'saas_payment';
type Integration = {
  provider: Provider;
  status: 'not_configured' | 'healthy' | 'stale' | 'error';
  last_success_at: string | null;
  last_error_code: string | null;
};
const tone: Record<Integration['status'], Tone> = {
  not_configured: 'neutral',
  healthy: 'success',
  stale: 'warning',
  error: 'danger',
};
const useIntegrations = () =>
  useQuery({
    queryKey: ['integrations'],
    queryFn: () => api<{ release_ready: boolean; items: Integration[] }>('/v1/integrations'),
  });

/** Integratsiyalar holati: serverdagi haqiqiy status; ulanmagan provayder «Ulanmagan» deb ko'rsatiladi. */
export function IntegrationsPage() {
  const { t, lang } = useT();
  const query = useIntegrations();
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader title={t('integr.title')} description={t('integr.sub')} />
      {query.isError && (
        <Alert tone="danger">
          {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
        </Alert>
      )}
      <Alert tone="info">{t('integr.release_note')}</Alert>
      <div className="grid-3">
        {query.data?.items.map((it) => (
          <section key={it.provider} className="card">
            <div className="card-header">
              <h3>{t(`integr.provider.${it.provider}`)}</h3>
              <Badge tone={tone[it.status]}>{t(`integr.status.${it.status}`)}</Badge>
            </div>
            <div className="card-pad stack" style={{ gap: 6 }}>
              {it.provider === 'telegram' ? (
                <p className="text-sm muted">
                  {t('integr.telegram_hint')} <Link to="/profile">{t('page.profile')}</Link> ·{' '}
                  <Link to="/app/settings">{t('page.settings')}</Link>
                </p>
              ) : (
                <dl className="kv">
                  <dt>{t('integr.last_success')}</dt>
                  <dd>{it.last_success_at ? formatDateTime(it.last_success_at, lang) : '—'}</dd>
                  <dt>{t('integr.error_code')}</dt>
                  <dd>
                    {it.last_error_code
                      ? it.last_error_code === 'PROVIDER_ACCESS_REQUIRED'
                        ? t('integr.PROVIDER_ACCESS_REQUIRED')
                        : it.last_error_code
                      : '—'}
                  </dd>
                </dl>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Kamera: provayder ulanmaguncha hodisa yo'q; statik raqam yoki soxta oqim ko'rsatilmaydi. */
export function CameraPage() {
  const { t, lang } = useT();
  const query = useIntegrations();
  const camera = query.data?.items.find((i) => i.provider === 'camera');
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader
        title={t('camera.title')}
        description={t('camera.sub')}
        actions={camera && <Badge tone={tone[camera.status]}>{t(`integr.status.${camera.status}`)}</Badge>}
      />
      {query.isError && (
        <Alert tone="danger">
          {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
        </Alert>
      )}
      <div className="card">
        <EmptyState
          icon={<Cctv />}
          title={camera?.status === 'healthy' ? t('integr.status.healthy') : t('camera.not_connected')}
          description={
            <>
              {t('camera.desc')}
              {camera?.last_success_at &&
                ` · ${t('integr.last_success')}: ${formatDateTime(camera.last_success_at, lang)}`}
            </>
          }
          action={<Link to="/app/integrations">{t('integr.title')}</Link>}
        />
      </div>
    </div>
  );
}
