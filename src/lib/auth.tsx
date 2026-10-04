import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, onUnauthorized } from './api';
import { platformRoles, type CrudAction, type Page, type PermissionSnapshot, type Role } from './permissions';

export type Me = {
  id: string;
  tenant_id: string | null;
  tenant_name: string | null;
  role: Role;
  display_name: string;
  phone: string | null;
  must_change_password: boolean;
};
export type SessionIssue = 'TENANT_BLOCKED' | 'TENANT_ARCHIVED' | null;

type AuthState = {
  /** undefined — hali tekshirilmagan; null — kirilmagan */
  me: Me | null | undefined;
  permissions: PermissionSnapshot | null;
  issue: SessionIssue;
  login: (login: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (page: Page, action?: CrudAction) => boolean;
  isPlatform: boolean;
};
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [permissions, setPermissions] = useState<PermissionSnapshot | null>(null);
  const [issue, setIssue] = useState<SessionIssue>(null);
  const queryClient = useQueryClient();

  const loadPermissions = useCallback(async (user: Me) => {
    if (!user.tenant_id || user.must_change_password) {
      setPermissions(null);
      setIssue(null);
      return;
    }
    try {
      setPermissions(await api<PermissionSnapshot>('/v1/me/permissions'));
      setIssue(null);
    } catch (error) {
      setPermissions(null);
      const code = (error as ApiError).code;
      setIssue(code === 'TENANT_BLOCKED' || code === 'TENANT_ARCHIVED' ? code : null);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const user = await api<Me>('/v1/auth/me');
      setMe(user);
      await loadPermissions(user);
    } catch {
      setMe(null);
      setPermissions(null);
    }
  }, [loadPermissions]);

  useEffect(() => {
    void refresh();
    return onUnauthorized(() => {
      setMe(null);
      setPermissions(null);
      queryClient.clear();
    });
  }, [refresh, queryClient]);

  // Ruxsatlar o'zgarsa darhol aks etishi uchun fokusda va 60 soniyada yangilanadi.
  useEffect(() => {
    if (!me?.tenant_id || me.must_change_password) return;
    const tick = () => void loadPermissions(me);
    const timer = setInterval(tick, 60000);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', tick);
    };
  }, [me, loadPermissions]);

  const login = useCallback(
    async (loginValue: string, password: string) => {
      const data = await api<{ user: Me }>('/v1/auth/login', {
        method: 'POST',
        body: { login: loginValue, password },
      });
      const user = await api<Me>('/v1/auth/me');
      setMe(user);
      await loadPermissions(user);
      queryClient.clear();
      return user ?? data.user;
    },
    [loadPermissions, queryClient],
  );
  const logout = useCallback(async () => {
    try {
      await api('/v1/auth/logout', { method: 'POST' });
    } catch {
      // Sessiya allaqachon bekor qilingan bo'lishi mumkin (masalan, parol almashtirilgandan keyin).
    } finally {
      setMe(null);
      setPermissions(null);
      setIssue(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const can = useCallback(
    (page: Page, action: CrudAction = 'read') => {
      if (!me) return false;
      if (me.role === 'tenant_admin') return true;
      const rule = permissions?.pages[page];
      return Boolean(rule?.read && rule[action]);
    },
    [me, permissions],
  );

  const value = useMemo<AuthState>(
    () => ({
      me,
      permissions,
      issue,
      login,
      logout,
      refresh,
      can,
      isPlatform: Boolean(me && platformRoles.includes(me.role)),
    }),
    [me, permissions, issue, login, logout, refresh, can],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('AuthProvider missing');
  return ctx;
}
