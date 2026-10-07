import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { homeFor, type CrudAction, type Page } from '@/lib/permissions';
import { Button, EmptyState } from '@/components/ui';

export function FullScreenLoading() {
  const { t } = useT();
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--text-3)',
      }}
    >
      <span className="row">
        <span className="spinner" /> {t('common.loading')}
      </span>
    </div>
  );
}

/** Kirilmagan bo'lsa loginga; boshlang'ich parol almashtirilmagan bo'lsa shu sahifaga. */
export function RequireAuth({ platform }: { platform?: boolean }) {
  const { me, isPlatform } = useAuth();
  const location = useLocation();
  if (me === undefined) return <FullScreenLoading />;
  if (me === null) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (me.must_change_password && location.pathname !== '/change-password')
    return <Navigate to="/change-password" replace />;
  if (platform !== undefined && platform !== isPlatform)
    return <Navigate to={homeFor(me.role, me.must_change_password)} replace />;
  return <Outlet />;
}

/** Kirilgan foydalanuvchini auth sahifalaridan uyiga yo'naltiradi. */
export function RedirectIfAuthed() {
  const { me } = useAuth();
  if (me === undefined) return <FullScreenLoading />;
  if (me) return <Navigate to={homeFor(me.role, me.must_change_password)} replace />;
  return <Outlet />;
}

export function Forbidden() {
  const { t } = useT();
  const { me } = useAuth();
  return (
    <div className="card">
      <EmptyState
        icon={<ShieldOff />}
        title={t('common.forbidden')}
        description={t('common.forbidden_desc')}
        action={
          me && (
            <Button
              variant="secondary"
              onClick={() => (location.href = homeFor(me.role, me.must_change_password))}
            >
              {t('common.go_home')}
            </Button>
          )
        }
      />
    </div>
  );
}

/** Sahifa ruxsati bo'lmasa UI darajasida yopadi (xavfsizlik serverda). */
export function RequirePage({ page, action = 'read' }: { page: Page; action?: CrudAction }) {
  const { can, issue } = useAuth();
  if (issue && page !== 'billing') return <Forbidden />;
  return can(page, action) ? <Outlet /> : <Forbidden />;
}

export function NotFound() {
  const { t } = useT();
  return (
    <div className="card">
      <EmptyState
        title={t('common.not_found')}
        description={t('common.not_found_desc')}
        action={
          <Button variant="secondary" onClick={() => (location.href = '/')}>
            {t('common.go_home')}
          </Button>
        }
      />
    </div>
  );
}
