import { Outlet } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Logo } from '@/components/ui/Logo';
import { LanguageSwitch } from './AppShell';

export function AuthLayout() {
  const { t } = useT();
  return (
    <div className="auth">
      <aside className="auth-side">
        <Logo height={64} />
        <div>
          <h1>{t('app.tagline')}</h1>
          <p>{t('auth.side_text')}</p>
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
            <Logo variant="brand" height={44} />
            <LanguageSwitch />
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
