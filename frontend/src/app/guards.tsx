import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { SearchX, ShieldOff } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { homeFor, type CrudAction, type Page } from '@/lib/permissions';
import { Button, EmptyState, ErrorState } from '@/components/ui';

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

type BackTo = { to: string; label: string };
/**
 * Yagona 404 sahifasi (AppShell ichida). Noma'lum manzil uchun ham, API 404 qaytargan
 * tafsilot sahifasi uchun ham (`record`): mavjud emas va biriktirilmagan yozuv bir xil ko'rinadi.
 */
export function NotFound({ record, backTo }: { record?: boolean; backTo?: BackTo }) {
  const { t } = useT();
  const { me } = useAuth();
  const navigate = useNavigate();
  // Havola to'g'ridan-to'g'ri ochilgan bo'lsa "Orqaga" ilovadan chiqarib yuboradi; o'shanda ko'rsatilmaydi.
  const canGoBack = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
  return (
    <div className="card">
      <EmptyState
        icon={<SearchX />}
        title={record ? t('common.not_found_record') : t('common.not_found')}
        description={record ? t('common.not_found_record_desc') : t('common.not_found_desc')}
        action={
          <span className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {backTo && (
              <Button variant="secondary" onClick={() => navigate(backTo.to)}>
                {backTo.label}
              </Button>
            )}
            {canGoBack && (
              <Button variant="secondary" onClick={() => navigate(-1)}>
                {t('common.back')}
              </Button>
            )}
            <Button
              onClick={() => navigate(me ? homeFor(me.role, me.must_change_password) : '/login')}
            >
              {t('common.go_home')}
            </Button>
          </span>
        }
      />
    </div>
  );
}

/**
 * Tafsilot sahifasi so'rovi xatosi: 404 → NotFound (yo'q va biriktirilmagan yozuv farqlanmaydi),
 * 403 → Forbidden, 5xx va tarmoq xatosi → ErrorState "Qayta urinish" bilan.
 */
export function DetailError({
  error,
  onRetry,
  backTo,
}: {
  error: unknown;
  onRetry?: () => void;
  backTo?: BackTo;
}) {
  const { t } = useT();
  const e = error instanceof ApiError ? error : null;
  // UUID bo'lmagan id (`/app/projects/abc`) serverda 400 bo'ladi; foydalanuvchi uchun bu ham "topilmadi"
  const badId =
    e?.status === 400 && e.code === 'VALIDATION_ERROR' && e.fields.some((f) => f.path[0] === 'id');
  if (e?.status === 404 || badId) return <NotFound record backTo={backTo} />;
  if (e?.status === 403) return <Forbidden />;
  return (
    <div className="card">
      <ErrorState
        message={e ? errorMessage(t, e.code, e.status) : t('error.INTERNAL_ERROR')}
        onRetry={onRetry}
      />
    </div>
  );
}
