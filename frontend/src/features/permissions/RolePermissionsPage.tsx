import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { employeeRoles, pages, type CrudAction, type PageRules } from '@/lib/permissions';
import { Alert, Button, ErrorState, Loading, PageHeader, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

type Matrix = {
  version: number;
  roles: Record<string, PageRules>;
  locked_pages: string[];
};
const actions: CrudAction[] = ['read', 'create', 'update', 'delete'];

export function RolePermissionsPage() {
  const { t } = useT();
  const { refresh } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['role-permissions'],
    queryFn: () => api<Matrix>('/v1/company/role-permissions'),
  });
  const [data, setData] = useState<Matrix | null>(null);
  const [role, setRole] = useState<string>('foreman');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (query.data && !dirty) setData(query.data);
  }, [query.data, dirty]);

  const toggle = (page: string, action: CrudAction) => {
    if (!data) return;
    const current = data.roles[role]?.[page] ?? {
      read: false,
      create: false,
      update: false,
      delete: false,
    };
    const next = { ...current, [action]: !current[action] };
    if (action === 'read' && !next.read) next.create = next.update = next.delete = false;
    if (action !== 'read' && next[action]) next.read = true;
    setData({
      ...data,
      roles: { ...data.roles, [role]: { ...data.roles[role], [page]: next } },
    });
    setDirty(true);
  };
  const save = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const result = await api<{ version: number; pages: PageRules }>('/v1/company/role-permissions', {
        method: 'POST',
        body: {
          version: data.version,
          role,
          rules: pages
            .filter((p) => !data.locked_pages.includes(p))
            .map((p) => ({
              page: p,
              ...(data.roles[role]?.[p] ?? {
                read: false,
                create: false,
                update: false,
                delete: false,
              }),
            })),
        },
      });
      const next = {
        ...data,
        version: result.version,
        roles: { ...data.roles, [role]: result.pages },
      };
      queryClient.setQueryData(['role-permissions'], next);
      setData(next);
      setDirty(false);
      await refresh();
      toast.success(t('perm.saved'));
    } catch (e) {
      const err = e as ApiError;
      toast.error(
        err.code === 'VERSION_CONFLICT'
          ? t('common.version_conflict')
          : errorMessage(t, err.code, err.status),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader
        title={t('perm.title')}
        description={t('perm.sub')}
        actions={
          <Button onClick={save} disabled={!dirty} loading={busy}>
            {t('perm.save')}
          </Button>
        }
      />
      <div className="toolbar">
        <Select
          aria-label={t('perm.role')}
          value={role}
          disabled={dirty || busy}
          onChange={(e) => setRole(e.target.value)}
        >
          {employeeRoles.map((r) => (
            <option key={r} value={r}>
              {t(`role.${r}`)}
            </option>
          ))}
        </Select>
        {dirty && <Alert tone="warning">{t('perm.dirty')}</Alert>}
      </div>
      <div className="table-wrap">
        {query.isError ? (
          <ErrorState
            message={errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
            onRetry={() => query.refetch()}
          />
        ) : !data ? (
          <Loading rows={8} />
        ) : (
          <table className="table table-dense">
            <thead>
              <tr>
                <th>{t('perm.page')}</th>
                {actions.map((a) => (
                  <th key={a} style={{ width: 110, textAlign: 'center' }}>
                    {t(`perm.${a}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => {
                const locked = data.locked_pages.includes(page);
                const rule = data.roles[role]?.[page];
                return (
                  <tr key={page}>
                    <th
                      scope="row"
                      style={{
                        position: 'static',
                        textTransform: 'none',
                        letterSpacing: 0,
                        fontSize: 'var(--fs-sm)',
                        color: 'var(--text)',
                        background: 'transparent',
                      }}
                    >
                      {t(`page.${page}`)}
                      {locked && <small className="muted"> · {t('perm.admin_only')}</small>}
                    </th>
                    {actions.map((a) => (
                      <td key={a} style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          aria-label={`${t(`role.${role}`)}: ${t(`page.${page}`)} — ${t(`perm.${a}`)}`}
                          checked={rule?.[a] ?? false}
                          disabled={busy || locked}
                          onChange={() => toggle(page, a)}
                          style={{
                            width: 16,
                            height: 16,
                            accentColor: 'var(--brand-700)',
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
