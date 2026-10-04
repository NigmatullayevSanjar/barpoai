import { Outlet } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { LanguageSwitch } from './AppShell';

export function AuthLayout() {
  const { t } = useT();
  return (
    <div className="auth">
      <aside className="auth-side">
        <div className="row" style={{ gap: 10, fontWeight: 700, fontSize: 18 }}>
          <span
            className="logo"
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: '#fff',
              color: 'var(--brand-700)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            B
          </span>
          {t('app.name')}
        </div>
        <div>
          <h1>{t('app.tagline')}</h1>
          <p>Obyektlar, smeta, ombor, moliya, vazifalar va hisobotlar — rahbar uchun bitta ekranda.</p>
          <ul>
            {[1, 2, 3, 4].map((i) => (
              <li key={i}>
                <CheckCircle2 /> {t(`auth.feature_${i}`)}
              </li>
            ))}
          </ul>
        </div>
        <small style={{ color: 'rgba(255,255,255,0.55)' }}>© {new Date().getFullYear()} BARPO AI</small>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <div className="row-between" style={{ marginBottom: 20 }}>
            <span style={{ fontWeight: 700, color: 'var(--brand-700)' }}>{t('app.name')}</span>
            <LanguageSwitch />
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
