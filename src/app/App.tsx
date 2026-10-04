import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { I18nProvider } from '@/lib/i18n';
import { homeFor, pageRoutes, pages, type Page } from '@/lib/permissions';
import { ToastProvider } from '@/components/ui/Toast';
import { AppShell } from './layouts/AppShell';
import { AuthLayout } from './layouts/AuthLayout';
import { FullScreenLoading, NotFound, RedirectIfAuthed, RequireAuth, RequirePage } from './guards';
import {
  ChangePasswordPage,
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
} from '@/features/auth/pages';
import { ComingSoon } from '@/features/common/ComingSoon';

const ProfilePage = lazy(() =>
  import('@/features/profile/ProfilePage').then((m) => ({
    default: m.ProfilePage,
  })),
);
const RolePermissionsPage = lazy(() =>
  import('@/features/permissions/RolePermissionsPage').then((m) => ({
    default: m.RolePermissionsPage,
  })),
);
const TenantBillingPage = lazy(() =>
  import('@/features/billing/TenantBillingPage').then((m) => ({
    default: m.TenantBillingPage,
  })),
);
const TenantDashboard = lazy(() =>
  import('@/features/dashboard/TenantDashboard').then((m) => ({ default: m.TenantDashboard })),
);
const ProjectsPage = lazy(() =>
  import('@/features/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage })),
);
const ProjectDetailPage = lazy(() =>
  import('@/features/projects/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })),
);
const EstimatesPage = lazy(() =>
  import('@/features/estimates/EstimatesPage').then((m) => ({ default: m.EstimatesPage })),
);
const EstimateDetailPage = lazy(() =>
  import('@/features/estimates/EstimateDetailPage').then((m) => ({ default: m.EstimateDetailPage })),
);
const EstimateEditorPage = lazy(() =>
  import('@/features/estimates/EstimateEditor').then((m) => ({ default: m.EstimateEditorPage })),
);
const EmployeesPage = lazy(() =>
  import('@/features/employees/EmployeesPage').then((m) => ({ default: m.EmployeesPage })),
);
const Platform = {
  Dashboard: lazy(() =>
    import('@/features/platform/pages').then((m) => ({
      default: m.PlatformDashboard,
    })),
  ),
  Tenants: lazy(() =>
    import('@/features/platform/pages').then((m) => ({
      default: m.TenantsPage,
    })),
  ),
  TenantDetail: lazy(() =>
    import('@/features/platform/pages').then((m) => ({
      default: m.TenantDetailPage,
    })),
  ),
  Plans: lazy(() => import('@/features/platform/pages').then((m) => ({ default: m.PlansPage }))),
  Billing: lazy(() =>
    import('@/features/platform/pages').then((m) => ({
      default: m.BillingPage,
    })),
  ),
  Debtors: lazy(() =>
    import('@/features/platform/pages').then((m) => ({
      default: m.DebtorsPage,
    })),
  ),
  Support: lazy(() =>
    import('@/features/platform/pages').then((m) => ({
      default: m.SupportPage,
    })),
  ),
  Staff: lazy(() => import('@/features/platform/pages').then((m) => ({ default: m.StaffPage }))),
  Diagnostics: lazy(() =>
    import('@/features/platform/pages').then((m) => ({
      default: m.DiagnosticsPage,
    })),
  ),
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      staleTime: 15000,
      refetchOnWindowFocus: true,
    },
  },
});

/** Hali o'z sahifasi yozilmagan kompaniya bo'limlari: halol "keyingi bosqich" holati. */
const implementedTenantPages: Partial<Record<Page, React.ReactNode>> = {
  dashboard: <TenantDashboard />,
  projects: <ProjectsPage />,
  employees: <EmployeesPage />,
  estimates: <EstimatesPage />,
  permissions: <RolePermissionsPage />,
  billing: <TenantBillingPage />,
};
function HomeRedirect() {
  const { me } = useAuth();
  if (me === undefined) return <FullScreenLoading />;
  return <Navigate to={me ? homeFor(me.role, me.must_change_password) : '/login'} replace />;
}

export function App() {
  return (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <BrowserRouter>
              <Suspense fallback={<FullScreenLoading />}>
                <Routes>
                  <Route path="/" element={<HomeRedirect />} />
                  <Route element={<RedirectIfAuthed />}>
                    <Route element={<AuthLayout />}>
                      <Route path="/login" element={<LoginPage />} />
                      <Route path="/register" element={<RegisterPage />} />
                      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                      <Route path="/reset-password" element={<ResetPasswordPage />} />
                    </Route>
                  </Route>
                  <Route element={<RequireAuth />}>
                    <Route element={<AuthLayout />}>
                      <Route path="/change-password" element={<ChangePasswordPage />} />
                    </Route>
                    <Route element={<AppShell />}>
                      <Route path="/profile" element={<ProfilePage />} />
                    </Route>
                  </Route>
                  <Route element={<RequireAuth platform={false} />}>
                    <Route element={<AppShell />}>
                      {pages.map((page) => (
                        <Route key={page} element={<RequirePage page={page} />}>
                          <Route
                            path={pageRoutes[page]}
                            element={implementedTenantPages[page] ?? <ComingSoon titleKey={`page.${page}`} />}
                          />
                        </Route>
                      ))}
                      <Route element={<RequirePage page="projects" />}>
                        <Route path="/app/projects/:id" element={<ProjectDetailPage />} />
                      </Route>
                      <Route element={<RequirePage page="estimates" />}>
                        <Route path="/app/estimates/:id" element={<EstimateDetailPage />} />
                      </Route>
                      <Route element={<RequirePage page="estimates" action="create" />}>
                        <Route path="/app/estimates/new" element={<EstimateEditorPage />} />
                      </Route>
                      <Route element={<RequirePage page="estimates" action="update" />}>
                        <Route path="/app/estimates/:id/edit" element={<EstimateEditorPage />} />
                      </Route>
                    </Route>
                  </Route>
                  <Route element={<RequireAuth platform />}>
                    <Route element={<AppShell />}>
                      <Route path="/admin" element={<Platform.Dashboard />} />
                      <Route path="/admin/tenants" element={<Platform.Tenants />} />
                      <Route path="/admin/tenants/:id" element={<Platform.TenantDetail />} />
                      <Route path="/admin/plans" element={<Platform.Plans />} />
                      <Route path="/admin/billing" element={<Platform.Billing />} />
                      <Route path="/admin/debtors" element={<Platform.Debtors />} />
                      <Route path="/admin/support" element={<Platform.Support />} />
                      <Route path="/admin/staff" element={<Platform.Staff />} />
                      <Route path="/admin/diagnostics" element={<Platform.Diagnostics />} />
                    </Route>
                  </Route>
                  <Route element={<RequireAuth />}>
                    <Route element={<AppShell />}>
                      <Route path="*" element={<NotFound />} />
                    </Route>
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}
