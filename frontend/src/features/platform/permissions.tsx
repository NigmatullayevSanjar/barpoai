import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import type { PlatformPermission } from '@/lib/permissions';
import { Alert, Button, PageHeader } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useApiError } from './pages';

type StaffRole = 'super_admin' | 'support';
type Row = Record<PlatformPermission, boolean>;
type Matrix = {
  permissions: PlatformPermission[];
  roles: Record<StaffRole, Row>;
  defaults: Record<StaffRole, PlatformPermission[]>;
};
const staffRoles: StaffRole[] = ['super_admin', 'support'];
/**
 * D21: platforma rollari ruxsatlari. Egasi ustuni o'zgarmaydi (hammasi bor); super admin qatorini faqat egasi
 * yoki super admin o'zgartiradi. Saqlash har rol uchun to'liq ro'yxat bilan; ruxsat keyingi so'rovdan amal qiladi.
 */
export function PlatformPermissionsPage() {
  const { t } = useT();
  const toast = useToast();
  const onError = useApiError();
  const { me, refresh } = useAuth();
  const senior = me?.role === 'platform_owner' || me?.role === 'super_admin';
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['platform-permissions'],
    queryFn: () => api<Matrix>('/v1/platform/permissions'),
  });
  const [draft, setDraft] = useState<Record<StaffRole, Row> | null>(null);
  useEffect(() => {
    if (query.data) setDraft(query.data.roles);
  }, [query.data]);
  const save = useMutation({
    mutationFn: async () => {
      for (const role of staffRoles) {
        if (role === 'super_admin' && !senior) continue;
        await api('/v1/platform/permissions', {
          method: 'PATCH',
          body: { role, permissions: draft![role] },
        });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['platform-permissions'] });
      await refresh();
      toast.success(t('platform_perm.saved'));
    },
    onError,
  });
  const d = query.data;
  const editable = (role: StaffRole) => role === 'support' || senior;
  const toggle = (role: StaffRole, p: PlatformPermission) =>
    setDraft((x) => (x ? { ...x, [role]: { ...x[role], [p]: !x[role][p] } } : x));
  const toDefaults = () =>
    d &&
    setDraft((x) =>
      x
        ? (Object.fromEntries(
            staffRoles.map((role) => [
              role,
              editable(role)
                ? (Object.fromEntries(d.permissions.map((p) => [p, d.defaults[role].includes(p)])) as Row)
                : x[role],
            ]),
          ) as Record<StaffRole, Row>)
        : x,
    );
  return (
    <div className="stack" style={{ gap: 14 }}>
      <PageHeader
        title={t('platform_perm.title')}
        description={t('platform_perm.sub')}
        actions={
          <>
            <Button variant="secondary" icon={<RotateCcw />} onClick={toDefaults} disabled={!d}>
              {t('platform_perm.defaults')}
            </Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!draft}>
              {t('common.save')}
            </Button>
          </>
        }
      />
      {query.isError && (
        <Alert tone="danger">
          {errorMessage(t, (query.error as ApiError).code, (query.error as ApiError).status)}
        </Alert>
      )}
      {!senior && <Alert tone="info">{t('platform_perm.senior_only')}</Alert>}
      {me?.role === 'super_admin' && <Alert tone="warning">{t('platform_perm.self_hint')}</Alert>}
      {d && draft && (
        <section className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('platform_perm.col')}</th>
                  <th style={{ textAlign: 'center' }}>{t('role.platform_owner')}</th>
                  {staffRoles.map((r) => (
                    <th key={r} style={{ textAlign: 'center' }}>
                      {t(`role.${r}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.permissions.map((p) => (
                  <tr key={p}>
                    <td>
                      <div className="cell-main">{t(`platform_perm.p.${p}`)}</div>
                      <div className="cell-sub">{t(`platform_perm.d.${p}`)}</div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked disabled aria-label={`${t('role.platform_owner')}: ${p}`} />
                    </td>
                    {staffRoles.map((r) => (
                      <td key={r} style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={draft[r][p]}
                          disabled={!editable(r)}
                          aria-label={`${t(`role.${r}`)}: ${t(`platform_perm.p.${p}`)}`}
                          onChange={() => toggle(r, p)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
