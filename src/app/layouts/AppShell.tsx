import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Lock, LogOut, Menu, UserRound } from 'lucide-react';
import { NavIcon as Icon } from '@/components/ui/icons';
import { useAuth } from '@/lib/auth';
import { useT, type Lang } from '@/lib/i18n';
import { api } from '@/lib/api';
import { pageRoutes, platformNav, tenantNav, type Page } from '@/lib/permissions';
import { formatRelative } from '@/lib/format';
import { Avatar, Button } from '@/components/ui';

export function LanguageSwitch() {
  const { lang, setLang } = useT();
  return (
    <div className="lang-switch" role="group" aria-label="Language">
      {(['uz', 'ru'] as Lang[]).map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};
function NotificationsBell() {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ items: Notification[]; unread: number }>('/v1/me/notifications?limit=20'),
    refetchInterval: 30000,
  });
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const markAll = async () => {
    await api('/v1/me/notifications/read', {
      method: 'POST',
      body: { ids: [] },
    });
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };
  const markOne = async (id: string) => {
    await api('/v1/me/notifications/read', {
      method: 'POST',
      body: { ids: [id] },
    });
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };
  const unread = query.data?.unread ?? 0;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="icon-btn"
        aria-label={t('notif.title')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell />
        {unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="dropdown notif-panel">
          <header>
            <span>{t('notif.title')}</span>
            {unread > 0 && (
              <Button size="sm" variant="ghost" onClick={markAll}>
                {t('notif.mark_all')}
              </Button>
            )}
          </header>
          <div className="notif-list">
            {query.data?.items.length ? (
              query.data.items.map((n) => (
                <button
                  key={n.id}
                  className={`notif-item ${n.read_at ? '' : 'unread'}`}
                  onClick={() => !n.read_at && markOne(n.id)}
                >
                  <b>{n.title}</b>
                  <p>{n.body}</p>
                  <time>{formatRelative(n.created_at, lang)}</time>
                </button>
              ))
            ) : (
              <p className="muted" style={{ padding: 20, textAlign: 'center' }}>
                {t('notif.empty')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { me, logout } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  if (!me) return null;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="sidebar-user" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Avatar name={me.display_name} />
        <span className="grow truncate">
          <span className="truncate" style={{ display: 'block', fontWeight: 600 }}>
            {me.display_name}
          </span>
          <small>{t(`role.${me.role}`)}</small>
        </span>
      </button>
      {open && (
        <div className="dropdown" style={{ bottom: 'calc(100% + 6px)', top: 'auto', left: 0, right: 0 }}>
          <button
            className="item"
            onClick={() => {
              setOpen(false);
              navigate('/profile');
            }}
          >
            <UserRound /> {t('page.profile')}
          </button>
          <button className="item" onClick={() => void logout()}>
            <LogOut /> {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ title }: { title?: ReactNode }) {
  const { me, can, isPlatform, issue } = useAuth();
  const { t } = useT();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => setNavOpen(false), [location.pathname]);
  if (!me) return null;

  const tenantGroups = tenantNav
    .map((g) => ({ ...g, items: g.items.filter((it) => can(it.page)) }))
    .filter((g) => g.items.length > 0);
  const platformItems = platformNav.filter((it) => it.roles.includes(me.role));
  const currentTitle =
    title ??
    (isPlatform
      ? t(
          `nav.${platformItems.find((it) => (it.to === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(it.to)))?.key ?? 'dashboard'}`,
        )
      : t(
          `page.${(Object.entries(pageRoutes).find(([, r]) => (r === '/app' ? location.pathname === '/app' : location.pathname.startsWith(r)))?.[0] as Page) ?? 'dashboard'}`,
        ));

  return (
    <div className={`shell ${navOpen ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <Link className="sidebar-brand" to={isPlatform ? '/admin' : '/app'}>
          <span className="logo">B</span>
          {t('app.name')}
        </Link>
        <div className="sidebar-tenant">{isPlatform ? t('nav.group.platform') : me.tenant_name}</div>
        <nav aria-label="Main">
          {isPlatform
            ? platformItems.map((it) => (
                <NavLink
                  key={it.key}
                  to={it.to}
                  end={it.to === '/admin'}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  <Icon name={it.icon} />
                  {t(`nav.${it.key}`)}
                </NavLink>
              ))
            : tenantGroups.map((g) => (
                <div key={g.group}>
                  <div className="nav-group">{t(g.group)}</div>
                  {g.items.map((it) => (
                    <NavLink
                      key={it.page}
                      to={pageRoutes[it.page]}
                      end={it.page === 'dashboard' || it.page === 'finance'}
                      className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                    >
                      <Icon name={it.icon} />
                      {t(`page.${it.page}`)}
                    </NavLink>
                  ))}
                </div>
              ))}
          {!isPlatform && issue && (
            <NavLink to="/app/billing" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Icon name="CreditCard" />
              {t('page.billing')}
            </NavLink>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="row-between" style={{ padding: '0 10px 8px' }}>
            <LanguageSwitch />
          </div>
          <UserMenu />
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="row">
            <button className="icon-btn menu-btn" aria-label="Menu" onClick={() => setNavOpen((v) => !v)}>
              <Menu />
            </button>
            <span className="title">{currentTitle}</span>
          </div>
          <div className="topbar-tools">
            <NotificationsBell />
          </div>
        </header>
        {issue === 'TENANT_BLOCKED' && (
          <div className="banner banner-danger">
            <Lock size={16} /> {t('auth.blocked_title')}. {t('auth.blocked_desc')}
          </div>
        )}
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
