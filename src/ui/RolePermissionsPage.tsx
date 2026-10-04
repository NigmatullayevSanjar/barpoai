import { useEffect, useState } from "react";
import { Sidebar, useApp } from "./App";
import {
  api,
  liveBackend,
  pageLabels,
  refreshPermissions,
  type PageRules,
  type CrudAction,
} from "../api/client";
const roleLabels: Record<string, string> = {
  foreman: "Prorab",
  brigadier: "Brigadir",
  warehouse_manager: "Ombor mudiri",
  financier: "Finansist",
  accountant: "Buxgalter",
  manager: "Menejer",
};
const actions: CrudAction[] = ["read", "create", "update", "delete"];
const labels = {
  read: "Ko‘rish",
  create: "Yaratish",
  update: "Tahrirlash",
  delete: "O‘chirish",
};
export default function RolePermissionsPage() {
  const a = useApp();
  const [data, setData] = useState<{
      version: number;
      roles: Record<string, PageRules>;
      locked_pages: string[];
    } | null>(null),
    [role, setRole] = useState("foreman"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!liveBackend) {
      setMessage(
        "Ruxsatlarni serverda boshqarish uchun VITE_API_URL ni sozlang va mijoz admini hisobida kiring.",
      );
      return;
    }
    api("/v1/company/role-permissions")
      .then(setData)
      .catch((e) => setMessage(e.message));
  }, []);
  function toggle(page: string, action: CrudAction) {
    if (!data) return;
    const current = data.roles[role][page];
    const changed = { ...current, [action]: !current[action] };
    if (action === "read" && !changed.read) {
      changed.create = false;
      changed.update = false;
      changed.delete = false;
    }
    if (action !== "read" && changed[action]) changed.read = true;
    setData({
      ...data,
      roles: {
        ...data.roles,
        [role]: { ...data.roles[role], [page]: changed },
      },
    });
    setDirty(true);
  }
  async function save() {
    if (!data) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api("/v1/company/role-permissions", {
        method: "POST",
        body: {
          version: data.version,
          role,
          rules: Object.entries(data.roles[role])
            .filter(([page]) => !data.locked_pages.includes(page))
            .map(([page, rule]) => ({ page, ...rule })),
        },
      });
      setData({
        ...data,
        version: result.version,
        roles: { ...data.roles, [role]: result.pages },
      });
      setDirty(false);
      await refreshPermissions();
      setMessage(
        "Ruxsatlar saqlandi. Xodimning keyingi so‘rovida darhol tekshiriladi.",
      );
    } catch (e) {
      setMessage(
        (e as Error).message === "VERSION_CONFLICT"
          ? "Boshqa oynada ruxsatlar o‘zgargan. Sahifani yangilang."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="role-layout">
      <Sidebar />
      <main className="permission-page">
        <h1>Rollar va sahifa ruxsatlari</h1>
        <p>
          Har bir kompaniya roli uchun CRUD huquqlarini alohida belgilang.
          Ko‘rish yopilsa, sahifa menyuda ko‘rinmaydi va API ham kirishni rad
          etadi.
        </p>
        {message && (
          <p className="message" role="status">
            {message}
          </p>
        )}
        <div className="permission-live-toolbar">
          <label>
            Rol{" "}
            <select
              aria-label="Rol"
              value={role}
              disabled={busy || dirty}
              onChange={(e) => setRole(e.target.value)}
            >
              {Object.entries(roleLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={!data || !dirty || busy || a.role !== "admin"}
            onClick={() => void save()}
          >
            {busy ? "Saqlanmoqda…" : "O‘zgarishlarni saqlash"}
          </button>
        </div>
        {data && (
          <div className="permission-live-wrap">
            <table className="permission-live-table">
              <thead>
                <tr>
                  <th>Sahifa</th>
                  {actions.map((action) => (
                    <th key={action}>{labels[action]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(pageLabels).map(([page, label]) => (
                  <tr key={page}>
                    <th scope="row">
                      {label}
                      {data.locked_pages.includes(page) && (
                        <small> · faqat admin</small>
                      )}
                    </th>
                    {actions.map((action) => (
                      <td key={action}>
                        <input
                          type="checkbox"
                          aria-label={`${roleLabels[role]}: ${label} — ${labels[action]}`}
                          checked={data.roles[role]?.[page]?.[action] ?? false}
                          disabled={busy || data.locked_pages.includes(page)}
                          onChange={() => toggle(page, action)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
