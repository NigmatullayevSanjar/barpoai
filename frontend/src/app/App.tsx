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
const StockPage = lazy(() => import('@/features/stock/StockPage').then((m) => ({ default: m.StockPage })));
const Fin = {
  Hub: lazy(() => import('@/features/finance/pages').then((m) => ({ default: m.FinanceHubPage }))),
  Docs: lazy(() => import('@/features/finance/pages').then((m) => ({ default: m.DocumentsPage }))),
  Counterparties: lazy(() =>
    import('@/features/finance/pages').then((m) => ({ default: m.CounterpartiesPage })),
  ),
  Budgets: lazy(() => import('@/features/finance/pages').then((m) => ({ default: m.BudgetsPage }))),
  Reconciliation: lazy(() =>
    import('@/features/finance/pages').then((m) => ({ default: m.ReconciliationPage })),
  ),
  PaymentRequests: lazy(() =>
    import('@/features/finance/workflow').then((m) => ({ default: m.PaymentRequestsPage })),
  ),
  Calendar: lazy(() =>
    import('@/features/finance/workflow').then((m) => ({ default: m.PaymentCalendarPage })),
  ),
  Payroll: lazy(() => import('@/features/finance/workflow').then((m) => ({ default: m.PayrollPage }))),
  PlanActual: lazy(() => import('@/features/finance/workflow').then((m) => ({ default: m.PlanActualPage }))),
  Forecast: lazy(() => import('@/features/finance/workflow').then((m) => ({ default: m.ForecastPage }))),
  Reports: lazy(() =>
    import('@/features/finance/workflow').then((m) => ({ default: m.FinancialReportsPage })),
  ),
};
const TasksPage = lazy(() => import('@/features/work/TasksPage').then((m) => ({ default: m.TasksPage })));
const ReportsPage = lazy(() =>
  import('@/features/work/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const EmployeesPage = lazy(() =>
  import('@/features/employees/EmployeesPage').then((m) => ({ default: m.EmployeesPage })),
);
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const NotificationsPage = lazy(() =>
  import('@/features/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
);
const FilesPage = lazy(() => import('@/features/files/FilesPage').then((m) => ({ default: m.FilesPage })));
const IntegrationsPage = lazy(() =>
  import('@/features/integrations/IntegrationsPage').then((m) => ({ default: m.IntegrationsPage })),
);
const CameraPage = lazy(() =>
  import('@/features/integrations/IntegrationsPage').then((m) => ({ default: m.CameraPage })),
);
const AuditPage = lazy(() => import('@/features/audit/AuditPage').then((m) => ({ default: m.AuditPage })));
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

/** Sahifa kaliti → kompaniya sahifasi; ruxsat RequirePage orqali tekshiriladi. */
const tenantPages: Record<Page, React.ReactNode> = {
  dashboard: <TenantDashboard />,
  projects: <ProjectsPage />,
  employees: <EmployeesPage />,
  estimates: <EstimatesPage />,
  stock: <StockPage />,
  tasks: <TasksPage />,
  reports: <ReportsPage />,
  files: <FilesPage />,
  integrations: <IntegrationsPage />,
  camera: <CameraPage />,
  settings: <SettingsPage />,
  audit: <AuditPage />,
  finance: <Fin.Hub />,
  accounting_documents: <Fin.Docs page="accounting_documents" />,
  invoices: <Fin.Docs page="invoices" />,
  bank_cash: <Fin.Docs page="bank_cash" />,
  allocations: <Fin.Docs page="allocations" />,
  counterparties: <Fin.Counterparties />,
  budgets: <Fin.Budgets />,
  reconciliation: <Fin.Reconciliation />,
  payment_requests: <Fin.PaymentRequests />,
  payment_calendar: <Fin.Calendar />,
  payroll: <Fin.Payroll />,
  plan_actual: <Fin.PlanActual />,
  forecast: <Fin.Forecast />,
  financial_reports: <Fin.Reports />,
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
                      <Route path="/notifications" element={<NotificationsPage />} />
                    </Route>
                  </Route>
                  <Route element={<RequireAuth platform={false} />}>
                    <Route element={<AppShell />}>
                      {pages.map((page) => (
                        <Route key={page} element={<RequirePage page={page} />}>
                          <Route path={pageRoutes[page]} element={tenantPages[page]} />
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
