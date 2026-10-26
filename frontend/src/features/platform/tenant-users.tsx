import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type ListResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { employeeRoles, type Role } from '@/lib/permissions';
import { Badge, Button, Modal, Select, Textarea } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { ResetLinkButton, useApiError } from './pages';

type TenantUser = {
  id: string;
  login: string;
  display_name: string;
  role: Role;
  active: boolean;
  phone: string | null;
  telegram_linked: boolean;
  sessions_active: number;
};
type Action = 'deactivate' | 'activate' | 'revoke' | 'unlink' | 'admin';
const hintKey: Record<Action, string | null> = {
  deactivate: 'tenant_users.deactivate_hint',
  activate: null,
  revoke: 'tenant_users.revoke_hint',
  unlink: 'tenant_users.unlink_hint',
  admin: 'tenant_users.make_admin_hint',
};
/**
 * D21: kompaniya kartasidagi foydalanuvchilar — parol tiklash (users.reset) va tuzatishlar (tenants.correct):
 * faolsizlantirish, sessiyalar, Telegram, adminlikni o'tkazish. Har amal sabab bilan; server tekshiradi.
 */
export function TenantUsersSection({ tenantId }: { tenantId: string }) {
  const { t } = useT();
  const toast = useToast();
  const onError = useApiError();
  const { canPlatform } = useAuth();
  const canCorrect = canPlatform('tenants.correct');
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<{ action: Action; user: TenantUser } | null>(null);
  const [reason, setReason] = useState('');
  const [previousRole, setPreviousRole] = useState<Role>('manager');
  const query = useQuery({
    queryKey: ['platform-tenant-users', tenantId],
    queryFn: () => api<ListResponse<TenantUser>>(`/v1/platform/tenants/${tenantId}/users`),
  });
  const hasAdmin = (query.data?.items ?? []).some((u) => u.role === 'tenant_admin' && u.active);
  const run = useMutation({
    mutationFn: ({ action, user }: { action: Action; user: TenantUser }) => {
      const base = `/v1/platform/tenants/${tenantId}`;
      const body = { reason: reason.trim() };
      if (action === 'deactivate' || action === 'activate')
        return api(`${base}/users/${user.id}`, {
          method: 'PATCH',
          body: { ...body, active: action === 'activate' },
        });
      if (action === 'revoke') return api(`${base}/users/${user.id}/sessions/revoke`, { method: 'POST', body });
      if (action === 'unlink') return api(`${base}/users/${user.id}/telegram/unlink`, { method: 'POST', body });
      return api(`${base}/ownership`, {
        method: 'POST',
        body: { ...body, new_admin_id: user.id, ...(hasAdmin ? { previous_admin_role: previousRole } : {}) },
      });
    },
    onSuccess: async () => {
      setPending(null);
      setReason('');
      toast.success(t('tenant_users.done'));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['platform-tenant-users', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['platform-tenant', tenantId] }),
      ]);
    },
    onError,
  });
  const label: Record<Action, string> = {
    deactivate: t('employees.deactivate'),
    activate: t('employees.activate'),
    revoke: t('tenant_users.revoke'),
    unlink: t('tenant_users.unlink'),
    admin: t('tenant_users.make_admin'),
  };
  const open = (action: Action, user: TenantUser) => {
    setReason('');
    setPending({ action, user });
  };
  const columns: Column<TenantUser>[] = [
    {
      key: 'name',
      header: t('auth.display_name'),
      render: (r) => (
        <>
          <div className="cell-main">{r.display_name}</div>
          <div className="cell-sub mono">{r.login}</div>
        </>
      ),
    },
    {
      key: 'role',
      header: t('common.role'),
      render: (r) => <Badge tone={r.role === 'tenant_admin' ? 'brand' : 'neutral'}>{t(`role.${r.role}`)}</Badge>,
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (r) => (
        <Badge tone={r.active ? 'success' : 'neutral'}>{r.active ? t('common.active') : t('common.inactive')}</Badge>
      ),
    },
    {
      key: 'tg',
      header: 'Telegram',
      render: (r) =>
        r.telegram_linked ? <Badge tone="success">{t('telegram.linked')}</Badge> : <span className="muted">—</span>,
    },
    {
      key: 'sessions',
      header: t('tenant_users.sessions'),
      align: 'right',
      render: (r) => <span className="mono">{r.sessions_active}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <span className="row wrap" style={{ justifyContent: 'flex-end' }}>
          {r.active && <ResetLinkButton userId={r.id} permission="users.reset" />}
          {canCorrect && r.role !== 'tenant_admin' && (
            <Button size="sm" variant="secondary" onClick={() => open(r.active ? 'deactivate' : 'activate', r)}>
              {r.active ? label.deactivate : label.activate}
            </Button>
          )}
          {canCorrect && r.sessions_active > 0 && (
            <Button size="sm" variant="ghost" onClick={() => open('revoke', r)}>
              {label.revoke}
            </Button>
          )}
          {canCorrect && r.telegram_linked && (
            <Button size="sm" variant="ghost" onClick={() => open('unlink', r)}>
              {label.unlink}
            </Button>
          )}
          {canCorrect && r.active && r.role !== 'tenant_admin' && (
            <Button size="sm" variant="ghost" onClick={() => open('admin', r)}>
              {label.admin}
            </Button>
          )}
        </span>
      ),
    },
  ];
  const hint = pending ? hintKey[pending.action] : null;
  return (
    <section>
      <div className="row-between" style={{ marginBottom: 10 }}>
        <span>
          <h2>{t('tenant_users.title')}</h2>
          <small className="muted">{t('tenant_users.sub')}</small>
        </span>
      </div>
      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(r) => r.id}
        loading={query.isLoading}
        error={query.error ? errorMessage(t, (query.error as ApiError).code) : null}
        onRetry={query.refetch}
        empty={{ title: t('common.empty') }}
      />
      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title={
          pending?.action === 'admin'
            ? t('tenant_users.make_admin_title', { name: pending.user.display_name })
            : t('tenant_users.action_title', {
                action: pending ? label[pending.action] : '',
                name: pending?.user.display_name,
              })
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant={pending?.action === 'activate' || pending?.action === 'admin' ? 'primary' : 'danger'}
              loading={run.isPending}
              disabled={reason.trim().length < 5}
              onClick={() => pending && run.mutate(pending)}
            >
              {pending ? label[pending.action] : ''}
            </Button>
          </>
        }
      >
        <div className="stack">
          {hint && <p className="muted text-sm">{t(hint)}</p>}
          {pending?.action === 'admin' && hasAdmin && (
            <Select
              label={t('tenant_users.previous_role')}
              value={previousRole}
              onChange={(e) => setPreviousRole(e.target.value as Role)}
            >
              {employeeRoles.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}`)}
                </option>
              ))}
            </Select>
          )}
          <Textarea
            label={t('common.reason')}
            hint={t('common.reason_hint')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={5}
            required
          />
        </div>
      </Modal>
    </section>
  );
}
