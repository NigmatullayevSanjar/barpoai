import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { errorMessage, useT } from '@/lib/i18n';
import { formatDate, formatDateTime } from '@/lib/format';
import { Alert, Badge, Button, PageHeader, Stat } from '@/components/ui';

/**
 * Figma F6 (2026-10-17) "Xatoliklar" / "Integratsiyalar" / "Diagnostika": KPI (bugungi xatolar, worker navbati,
 * sessiyalar, baza), haftalik xatolar dinamikasi, diagnostika jurnali (xato kodi bo'yicha), integratsiya holati
 * (Telegram bot, CBU kursi), worker xatolari va so'nggi 5xx. CPU/RAM, uptime, zaxira nusxalar — ma'lumot yo'q (D17).
 */
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
    daily: { day: string; count: number }[];
    by_code: { code: string; count: number; last_at: string; path: string | null; message: string | null }[];
  };
  sessions_active: number;
  telegram: {
    configured: boolean;
    linked_accounts: number;
    bot: {
      polling_ok: boolean;
      conflict: boolean;
      last_ok_at: string | null;
      last_error: string | null;
      last_error_at: string | null;
    } | null;
  };
  integrations: {
    key: 'telegram' | 'cbu';
    configured: boolean;
    ok: boolean;
    last_at: string | null;
    detail: string | null;
  }[];
  tenants: { active: number; pending: number; blocked: number; archived: number };
  break_glass_enabled: boolean;
  integrations_release_ready: boolean;
};

export function DiagnosticsPage() {
  const { t, lang } = useT();
  const query = useQuery({
    queryKey: ['platform-diagnostics'],
    queryFn: () => api<Diagnostics>('/v1/platform/diagnostics'),
    retry: false,
    refetchInterval: 30000,
  });
  const d = query.data;
  const maxDaily = Math.max(1, ...(d?.errors.daily ?? []).map((x) => x.count));
  // Haftalik ustunlar: kun indeksi dushanbadan (0) yakshanbagacha (6) — fin.cal.weekday.* kalitlari.
  const weekday = (day: string) => t(`fin.cal.weekday.${(new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7}`);
  const integrState = (i: Diagnostics['integrations'][number]) =>
    !i.configured ? 'off' : i.ok ? 'ok' : 'error';
  return (
    <div className="stack" style={{ gap: 16 }}>
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
              label={t('diag.errors_today')}
              value={d.errors.last_24h}
              sub={`${t('common.total')}: ${d.errors.total}`}
              tone={d.errors.last_24h > 0 ? 'danger' : 'success'}
            />
            <Stat
              label={t('diag.worker')}
              value={d.worker.pending}
              sub={`${t('diag.pending')} · ${t('diag.dead')}: ${d.worker.dead} · ${t('diag.done_24h')}: ${d.worker.done_24h}`}
              tone={d.worker.dead > 0 ? 'warning' : undefined}
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
            <Stat
              label={t('diag.database')}
              value={d.database.ok ? t('diag.ok') : '—'}
              sub={`${t('diag.latency')}: ${d.database.latency_ms} ms · ${t('diag.last_migration')}: ${d.database.last_migration ?? '—'}`}
              tone={d.database.ok ? 'success' : 'danger'}
            />
          </div>
          {/* Qizil — bot umuman xabar olmayapti; sariq — ishlayapti, lekin navbatma-navbat konflikt (ikkinchi nusxa tirik). */}
          {d.telegram.bot?.conflict && (
            <Alert tone={d.telegram.bot.polling_ok ? 'warning' : 'danger'}>
              {t(d.telegram.bot.polling_ok ? 'diag.telegram_conflict_partial' : 'diag.telegram_conflict')}
              {d.telegram.bot.last_error_at && ` · ${formatDateTime(d.telegram.bot.last_error_at, lang)}`}
            </Alert>
          )}
          {d.telegram.bot && !d.telegram.bot.conflict && !d.telegram.bot.polling_ok && (
            <Alert tone="warning">
              {t('diag.telegram_down')}
              {d.telegram.bot.last_error && `: ${d.telegram.bot.last_error}`}
            </Alert>
          )}
          <div className="grid-main">
            <section className="card">
              <div className="card-header">
                <h3>
                  {t('diag.weekly_title')}
                  <span className="card-sub">{t('diag.weekly_sub')}</span>
                </h3>
              </div>
              <div className="bars-7" role="img" aria-label={t('diag.weekly_title')}>
                {d.errors.daily.map((x) => (
                  <div key={x.day} className="bar-col" title={`${formatDate(x.day, lang)}: ${x.count}`}>
                    <span className="bar-value">{x.count}</span>
                    <span className="bar" style={{ height: `${Math.round((x.count / maxDaily) * 100)}%` }} />
                    <span>{weekday(x.day)}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="card">
              <div className="card-header">
                <h3>{t('diag.integr_title')}</h3>
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {d.integrations.map((i) => {
                  const s = integrState(i);
                  return (
                    <li
                      key={i.key}
                      className="row-between"
                      style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', gap: 12 }}
                    >
                      <span>
                        <b style={{ display: 'block' }}>{t(`diag.integr.${i.key}`)}</b>
                        <small className="muted">{t(`diag.integr.${i.key}_desc`)}</small>
                        <small className="muted" style={{ display: 'block' }}>
                          {t('diag.sync')}: {i.last_at ? formatDateTime(i.last_at, lang) : '—'}
                          {i.detail ? ` · ${i.detail}` : ''}
                        </small>
                      </span>
                      <Badge tone={s === 'ok' ? 'success' : s === 'error' ? 'danger' : 'neutral'}>
                        {t(`diag.state.${s}`)}
                      </Badge>
                    </li>
                  );
                })}
                <li className="row-between" style={{ padding: '12px 20px', gap: 12 }}>
                  <span className="muted text-sm">{t('diag.tenants')}</span>
                  <span className="text-sm">
                    {t('common.active')}: <b>{d.tenants.active}</b> · {t('tenants.state.pending')}:{' '}
                    <b>{d.tenants.pending}</b> · {t('tenants.state.blocked')}: <b>{d.tenants.blocked}</b> ·{' '}
                    {t('tenants.state.archived')}: <b>{d.tenants.archived}</b>
                  </span>
                </li>
              </ul>
            </section>
          </div>
          <section className="card">
            <div className="card-header">
              <h3>
                {t('diag.journal')}
                <span className="card-sub">{t('diag.journal_sub')}</span>
              </h3>
            </div>
            {d.errors.by_code.length === 0 ? (
              <div className="card-pad muted text-sm">{t('diag.no_errors')}</div>
            ) : (
              <table className="summary-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>{t('integr.error_code')}</th>
                    <th style={{ textAlign: 'left' }}>{t('diag.message')}</th>
                    <th style={{ textAlign: 'left' }}>{t('diag.module')}</th>
                    <th style={{ textAlign: 'left' }}>{t('diag.last_time')}</th>
                    <th className="num">{t('diag.repeat')}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.errors.by_code.map((e) => (
                    <tr key={e.code} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="mono">{e.code}</td>
                      <td>{e.message ?? '—'}</td>
                      <td className="mono text-xs">{e.path ?? '—'}</td>
                      <td className="mono text-xs">{formatDateTime(e.last_at, lang)}</td>
                      <td className="num">{t('diag.times_n', { n: e.count })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
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
