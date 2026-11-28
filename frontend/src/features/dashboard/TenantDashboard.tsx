import { useAuth } from '@/lib/auth';
import {
  AccountantDashboard,
  FinancierDashboard,
  ForemanDashboard,
  ManagerDashboard,
  PtoDashboard,
  WarehouseDashboard,
} from './RoleDashboards';

/**
 * Kompaniya bosh sahifasi: rolga qarab Figma'dagi panel (D17). Mijoz admini bosh muhandis panelini ko'radi.
 * Bildirishnomalar kartasi bosh sahifada yo'q (egasi, 2026-10-16) — ular faqat qo'ng'iroq va /notifications da.
 */
export function TenantDashboard() {
  const { me } = useAuth();
  switch (me?.role) {
    case 'foreman':
      return <ForemanDashboard />;
    case 'warehouse_manager':
      return <WarehouseDashboard />;
    case 'accountant':
      return <AccountantDashboard />;
    case 'financier':
      return <FinancierDashboard />;
    case 'pto_engineer':
      return <PtoDashboard />;
    default:
      return <ManagerDashboard />;
  }
}
