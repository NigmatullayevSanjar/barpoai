import { useQuery } from '@tanstack/react-query';
import { api, qs, type ListResponse } from '@/lib/api';
import type { Tone } from '@/components/ui';

export type StockAccount = {
  id: string;
  warehouse_id: string | null;
  custodian_id: string | null;
  name: string;
  kind: 'warehouse' | 'custody';
  custodian_role: string | null;
};
export type Balance = {
  account_id: string;
  material_id: string;
  material_name: string;
  unit_id: string;
  quantity: string;
  reserved: string;
  available: string;
  value?: string;
  minimum_quantity: string;
  low: boolean;
};
export type Overview = {
  accounts: StockAccount[];
  balances: Balance[];
  pending: { transfers: number; consumptions: number; returns: number; requests: number };
};
export type CommandKind =
  'opening' | 'receipt' | 'transfer' | 'consumption' | 'return' | 'adjustment' | 'reversal';
export type CommandStatus = 'pending' | 'partial' | 'posted' | 'cancelled' | 'disputed';
export type StockCommand = {
  id: string;
  project_id: string;
  kind: CommandKind;
  status: CommandStatus;
  material_id: string;
  material_name: string;
  unit_id: string;
  from_account_id: string | null;
  to_account_id: string | null;
  from_name: string | null;
  to_name: string | null;
  quantity: string;
  accepted_quantity: string;
  remaining_quantity: string;
  unit_cost?: string | null;
  estimate_line_id: string | null;
  estimate_line_name: string | null;
  zone_id: string | null;
  zone_name: string | null;
  reason: string;
  created_by: string;
  created_by_name: string;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reverses_id: string | null;
  version: number;
  created_at: string;
};
export type LedgerRow = {
  id: string;
  command_id: string;
  material_id: string;
  material_name: string;
  unit_id: string;
  quantity_delta: string;
  value_delta?: string;
  created_at: string;
  kind: CommandKind;
  reason: string;
  actor_name: string | null;
  running_quantity: string;
};
export type MaterialRequest = {
  id: string;
  project_id: string;
  material_id: string;
  material_name: string;
  unit_id: string;
  zone_id: string | null;
  zone_name: string | null;
  requested_by: string;
  requested_by_name: string;
  quantity: string;
  needed_by: string | null;
  note: string | null;
  status: 'pending' | 'fulfilled' | 'rejected' | 'cancelled';
  reviewed_by_name: string | null;
  review_note: string | null;
  fulfilled_command_id: string | null;
  version: number;
  created_at: string;
};
export const statusTone: Record<CommandStatus, Tone> = {
  pending: 'warning',
  partial: 'info',
  posted: 'success',
  cancelled: 'neutral',
  disputed: 'danger',
};
export const kindTone: Record<CommandKind, Tone> = {
  opening: 'neutral',
  receipt: 'success',
  transfer: 'info',
  consumption: 'brand',
  return: 'warning',
  adjustment: 'neutral',
  reversal: 'danger',
};
export const useOverview = (projectId: string) =>
  useQuery({
    queryKey: ['stock-overview', projectId],
    queryFn: () => api<Overview>(`/v1/stock/overview?project_id=${projectId}`),
    enabled: Boolean(projectId),
  });
export const useCommands = (
  projectId: string,
  filters: { status?: string; kind?: string; account_id?: string },
) =>
  useQuery({
    queryKey: ['stock-commands', projectId, filters],
    queryFn: () =>
      api<ListResponse<StockCommand>>(
        `/v1/stock/commands${qs({ project_id: projectId, limit: 100, ...filters })}`,
      ),
    enabled: Boolean(projectId),
  });
export const useRequests = (projectId: string) =>
  useQuery({
    queryKey: ['stock-requests', projectId],
    queryFn: () => api<ListResponse<MaterialRequest>>(`/v1/stock/requests?project_id=${projectId}&limit=100`),
    enabled: Boolean(projectId),
  });
export const stockKeys = [
  'stock-overview',
  'stock-commands',
  'stock-requests',
  'stock-ledger',
  'notifications',
  'estimate',
];
