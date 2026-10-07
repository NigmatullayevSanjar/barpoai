import { useState, useEffect, type ReactNode, type FormEvent } from "react";
import {
  api,
  liveBackend,
  setAccessToken,
  setPermissions,
  refreshPermissions,
  frontendRole,
} from "./client";
import "./backend.css";
export function BackendGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null),
    [ready, setReady] = useState(!liveBackend),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [login, setLogin] = useState(""),
    [password, setPassword] = useState(""),
    [newPassword, setNewPassword] = useState(""),
    [recovery, setRecovery] = useState<any>(null),
    [support, setSupport] = useState("");
  const reload = async () => {
    try {
      if (user?.tenant_id) await refreshPermissions();
      setRecovery(null);
      setReady(true);
    } catch (e) {
      setPermissions(null);
      setReady(false);
      setError((e as Error).message);
      if (
        user?.role === "tenant_admin" &&
        ["TENANT_BLOCKED", "SUBSCRIPTION_REQUIRED"].includes(
          (e as Error).message,
        )
      ) {
        try {
          setRecovery(await api("/v1/billing"));
        } catch {
          setRecovery(null);
        }
      }
    }
  };
  useEffect(() => {
    const expire = () => {
      setAccessToken("");
      setPermissions(null);
      setUser(null);
      setReady(false);
    };
    window.addEventListener("barpo-session-expired", expire);
    return () => window.removeEventListener("barpo-session-expired", expire);
  }, []);
  useEffect(() => {
    if (!liveBackend || !user || user.must_change_password) return;
    void reload();
    const timer = setInterval(() => void reload(), 15000);
    const focus = () => void reload();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [user]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (user?.must_change_password) {
        await api("/v1/auth/password", {
          method: "POST",
          body: { current_password: password, new_password: newPassword },
        });
        setUser(null);
        setAccessToken("");
        setPassword("");
        setNewPassword("");
        setError("Parol yangilandi. Qayta kiring.");
        return;
      }
      const data = await api("/v1/auth/login", {
        method: "POST",
        body: { login, password },
      });
      setAccessToken(data.access_token);
      setUser(data.user);
      window.sessionStorage.setItem(
        "barpo-live-role",
        frontendRole(data.user.role),
      );
      if (!data.user.must_change_password) setPassword("");
      if (
        !location.hash ||
        ["#/screen/27", "#/screen/28"].includes(location.hash)
      ) {
        const home: Record<string, number> = {
          super_admin: 41,
          platform_owner: 61,
          support: 54,
          accountant: 76,
          financier: 87,
        };
        location.hash = "/screen/" + (home[data.user.role] ?? 13);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!liveBackend) return <>{children}</>;
  if (recovery && user)
    return (
      <main className="backend-auth">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api("/v1/support-requests", {
                method: "POST",
                body: { kind: "support", message: support },
              });
              setSupport("");
              setError("Murojaat saqlandi.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h1>Obuna va yordam</h1>
          <p>
            {recovery.tenant.legal_name}: {recovery.tenant.status}
          </p>
          <p>
            Operatsion sahifalarga kirish cheklangan. To‘lov provayderi hali
            ulanmagan.
          </p>
          <ul>
            {recovery.invoices.map((invoice: any) => (
              <li key={invoice.id}>
                {invoice.amount} UZS —{" "}
                {new Date(invoice.due_at).toLocaleDateString("uz-UZ")}
              </li>
            ))}
          </ul>
          <label>
            Yordam so‘rovi
            <textarea
              minLength={5}
              maxLength={2000}
              required
              value={support}
              onChange={(e) => setSupport(e.target.value)}
            />
          </label>
          <p role="status">{error}</p>
          <button disabled={busy}>Yuborish</button>
          <button type="button" onClick={() => void reload()}>
            Holatni yangilash
          </button>
          <button
            type="button"
            onClick={async () => {
              await api("/v1/auth/logout", { method: "POST" });
              setAccessToken("");
              setPermissions(null);
              setUser(null);
              setReady(false);
              setRecovery(null);
            }}
          >
            Chiqish
          </button>
        </form>
      </main>
    );
  if (ready && user)
    return (
      <>
        <div className="backend-status">
          Serverga ulangan: {user.display_name}. Ruxsatlar jonli; qolgan dizayn
          ekranlaridagi raqamlar namuna.{" "}
          <button
            onClick={async () => {
              await api("/v1/auth/logout", { method: "POST" });
              setAccessToken("");
              setPermissions(null);
              setUser(null);
              setReady(false);
            }}
          >
            Chiqish
          </button>
        </div>
        {children}
      </>
    );
  return (
    <main className="backend-auth">
      <form onSubmit={submit}>
        <h1>BARPO AI</h1>
        <p>
          {user?.must_change_password
            ? "Boshlang‘ich parolni almashtiring"
            : "Kompaniya hisobingizga kiring"}
        </p>
        {!user?.must_change_password && (
          <label>
            Login
            <input
              autoComplete="username"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              required
            />
          </label>
        )}
        <label>
          {user?.must_change_password ? "Boshlang‘ich parol" : "Parol"}
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {user?.must_change_password && (
          <label>
            Yangi parol
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </label>
        )}
        {error && <p role="alert">{error}</p>}
        <button disabled={busy}>
          {busy
            ? "Kutilmoqda…"
            : user?.must_change_password
              ? "Parolni almashtirish"
              : "Kirish"}
        </button>
      </form>
    </main>
  );
}
