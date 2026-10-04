import type { ButtonHTMLAttributes } from "react";
import {
  liveBackend,
  pageLabels,
  screenPage,
  type CrudAction,
} from "../api/client";
import { useApp } from "./App";

export function CrudButton({
  action,
  screen,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  action: CrudAction;
  screen?: number;
}) {
  const app = useApp();
  return (
    <button
      {...props}
      disabled={
        disabled || (liveBackend && !app.canCrud(screen ?? app.screen, action))
      }
    />
  );
}

const pageScreens: Record<string, number> = {
  dashboard: 13,
  projects: 26,
  employees: 37,
  estimates: 12,
  stock: 7,
  tasks: 8,
  reports: 29,
  camera: 40,
  billing: 39,
  settings: 0,
  permissions: 38,
  accounting_documents: 77,
  invoices: 78,
  bank_cash: 79,
  counterparties: 80,
  payroll: 81,
  reconciliation: 82,
  financial_reports: 83,
  allocations: 84,
  budgets: 88,
  plan_actual: 89,
  forecast: 90,
  payment_requests: 91,
  payment_calendar: 92,
};

// A grant must also make a page discoverable outside its original role's design menu.
export function GrantedPageLinks({ existing }: { existing: number[] }) {
  const app = useApp();
  if (
    !liveBackend ||
    ["super_admin", "platform_owner", "technician"].includes(app.role)
  )
    return null;
  const represented = new Set(existing.map(screenPage));
  return (
    <>
      {Object.entries(pageScreens)
        .filter(
          ([page, screen]) => !represented.has(page) && app.canAccess(screen),
        )
        .map(([page, screen]) => (
          <a
            key={page}
            href={`#/screen/${screen}`}
            aria-current={app.screen === screen ? "page" : undefined}
          >
            {pageLabels[page]}
          </a>
        ))}
    </>
  );
}
