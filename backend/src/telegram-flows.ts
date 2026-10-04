import type pg from 'pg';
import { type Db, type Row, one, transaction, audit } from './db.js';
import { allowed } from './permissions.js';
import { invariant } from './errors.js';
import { notify, projectRecipients } from './notify.js';
import { quantity } from './money.js';

/**
 * Telegramdagi ko'p qadamli oqimlar (chat_state jsonb). Hozircha: material so'rovi.
 * Har qadamda identity/ruxsat/tenant qayta tekshiriladi; so'rov qoldiqni o'zgartirmaydi.
 */
type Lang = 'uz' | 'ru';
type State =
  | {
      flow: 'material_request';
      step: 'project' | 'material' | 'quantity' | 'note';
      projects?: { id: string; name: string }[];
      project_id?: string;
      materials?: { id: string; name: string; unit_id: string }[];
      material_id?: string;
      quantity?: string;
    }
  | Record<string, never>;
const T: Record<string, Record<Lang, string>> = {
  choose_project: {
    uz: '🏗 Obyektni tanlang (raqamini yuboring):',
    ru: '🏗 Выберите объект (отправьте номер):',
  },
  choose_material: {
    uz: '📦 Materialni tanlang (raqamini yuboring):',
    ru: '📦 Выберите материал (отправьте номер):',
  },
  enter_quantity: { uz: '🔢 Miqdorni kiriting ({unit}):', ru: '🔢 Введите количество ({unit}):' },
  enter_note: {
    uz: '📝 Izoh yozing yoki «-» yuboring:',
    ru: '📝 Напишите комментарий или отправьте «-»:',
  },
  invalid_choice: {
    uz: 'Ro‘yxatdagi raqamni yuboring yoki /cancel.',
    ru: 'Отправьте номер из списка или /cancel.',
  },
  invalid_quantity: {
    uz: 'Miqdor musbat son bo‘lishi kerak, masalan 25 yoki 12.5.',
    ru: 'Количество должно быть положительным числом, например 25 или 12.5.',
  },
  no_projects: { uz: 'Sizga biriktirilgan obyekt yo‘q.', ru: 'Вам не назначен ни один объект.' },
  no_materials: {
    uz: 'Materiallar katalogi bo‘sh. Avval ombor mudiri material yaratsin.',
    ru: 'Справочник материалов пуст. Сначала завсклад должен создать материал.',
  },
  created: {
    uz: '✅ Material so‘rovi yuborildi:\n{material} — {qty} {unit}\nObyekt: {project}\nOmbor mudiri xabardor qilindi.',
    ru: '✅ Заявка на материал отправлена:\n{material} — {qty} {unit}\nОбъект: {project}\nЗаведующий складом уведомлён.',
  },
  cancelled: { uz: 'Bekor qilindi.', ru: 'Отменено.' },
  requests_header: { uz: '📋 Ochiq material so‘rovlari:', ru: '📋 Открытые заявки на материалы:' },
  requests_none: { uz: 'Ochiq so‘rovlar yo‘q.', ru: 'Открытых заявок нет.' },
  requests_hint: {
    uz: 'Bajarish yoki rad etish web ilovada: Ombor → So‘rovlar.',
    ru: 'Выполнить или отклонить можно в веб-приложении: Склад → Заявки.',
  },
};
const t = (
  lang: Lang,
  key: string,
  vars: Record<string, string | number | null | undefined> = {},
) => (T[key]?.[lang] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '—'));

export async function loadState(pool: pg.Pool, telegramUserId: string): Promise<State> {
  const row = (
    await pool.query('SELECT chat_state FROM telegram_accounts WHERE telegram_user_id=$1', [
      telegramUserId,
    ])
  ).rows[0];
  return (row?.chat_state ?? {}) as State;
}
async function saveState(db: Db, userId: string, state: State) {
  await db.query('UPDATE telegram_accounts SET chat_state=$2 WHERE user_id=$1', [
    userId,
    JSON.stringify(state),
  ]);
}
export const hasFlow = (state: State) => Boolean((state as { flow?: string }).flow);

async function userProjects(db: Db, user: Row) {
  return (
    await db.query(
      `SELECT p.id,p.name FROM projects p WHERE p.tenant_id=$1 AND p.archived_at IS NULL
       AND ($2='tenant_admin' OR EXISTS(SELECT 1 FROM project_assignments a WHERE a.tenant_id=p.tenant_id AND a.project_id=p.id AND a.user_id=$3)) ORDER BY p.name LIMIT 30`,
      [user.tenant_id, user.role, user.id],
    )
  ).rows as { id: string; name: string }[];
}
const numbered = (items: { name: string; unit_id?: string }[]) =>
  items.map((it, i) => `${i + 1}. ${it.name}${it.unit_id ? ` (${it.unit_id})` : ''}`).join('\n');

/** «📦 Material so‘rash» bosilganda: obyekt (bitta bo'lsa o'tkazib yuboriladi) → material → miqdor → izoh. */
export async function startMaterialRequest(pool: pg.Pool, user: Row, lang: Lang): Promise<string> {
  return transaction(pool, user.tenant_id, async (db) => {
    invariant(await allowed(db, user, 'stock.read'), 'FORBIDDEN', 403);
    const projects = await userProjects(db, user);
    if (!projects.length) return t(lang, 'no_projects');
    if (projects.length === 1) return askMaterial(db, user, lang, projects[0]!.id);
    await saveState(db, user.id, { flow: 'material_request', step: 'project', projects });
    return `${t(lang, 'choose_project')}\n\n${numbered(projects)}\n\n/cancel`;
  });
}
async function askMaterial(db: Db, user: Row, lang: Lang, projectId: string) {
  const materials = (
    await db.query(
      'SELECT id,name,unit_id FROM materials WHERE tenant_id=$1 AND archived_at IS NULL ORDER BY name LIMIT 60',
      [user.tenant_id],
    )
  ).rows as { id: string; name: string; unit_id: string }[];
  if (!materials.length) {
    await saveState(db, user.id, {});
    return t(lang, 'no_materials');
  }
  await saveState(db, user.id, {
    flow: 'material_request',
    step: 'material',
    project_id: projectId,
    materials,
  });
  return `${t(lang, 'choose_material')}\n\n${numbered(materials)}\n\n/cancel`;
}
export async function continueFlow(
  pool: pg.Pool,
  user: Row,
  state: State,
  text: string,
  lang: Lang,
): Promise<string> {
  return transaction(pool, user.tenant_id, async (db) => {
    if (/^\/cancel|^bekor|^отмена/i.test(text.trim())) {
      await saveState(db, user.id, {});
      return t(lang, 'cancelled');
    }
    const s = state as Extract<State, { flow: 'material_request' }>;
    if (s.step === 'project') {
      const idx = Number(text.trim()) - 1;
      const project = s.projects?.[idx];
      if (!project) return t(lang, 'invalid_choice');
      return askMaterial(db, user, lang, project.id);
    }
    if (s.step === 'material') {
      const idx = Number(text.trim()) - 1;
      const material = s.materials?.[idx];
      if (!material) return t(lang, 'invalid_choice');
      await saveState(db, user.id, {
        ...s,
        step: 'quantity',
        material_id: material.id,
        materials: [material],
      });
      return t(lang, 'enter_quantity', { unit: material.unit_id });
    }
    if (s.step === 'quantity') {
      const value = text.trim().replace(',', '.');
      if (!/^(0|[1-9]\d{0,17})(\.\d{1,6})?$/.test(value) || !/[1-9]/.test(value))
        return t(lang, 'invalid_quantity');
      await saveState(db, user.id, { ...s, step: 'note', quantity: value });
      return t(lang, 'enter_note');
    }
    // note → yaratish
    const note = text.trim() === '-' ? null : text.trim().slice(0, 1000);
    const material = await one(
      db,
      'SELECT id,name,unit_id FROM materials WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL',
      [user.tenant_id, s.material_id],
    );
    const project = await one(
      db,
      'SELECT id,name FROM projects WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL',
      [user.tenant_id, s.project_id],
    );
    const row = await one(
      db,
      'INSERT INTO material_requests(tenant_id,project_id,material_id,requested_by,quantity,note) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
      [user.tenant_id, project.id, material.id, user.id, s.quantity, note],
    );
    for (const recipient of await projectRecipients(
      db,
      user.tenant_id,
      project.id,
      ['warehouse_manager'],
      user.id,
    ))
      await notify(db, {
        tenant_id: user.tenant_id,
        user_id: recipient,
        project_id: project.id,
        kind: 'stock.request',
        title: '📦 Material so‘rovi',
        body: `Obyekt: ${project.name}\nMaterial: ${material.name}\nMiqdor: ${quantity(s.quantity!)} ${material.unit_id}\nSo‘ragan: ${user.display_name} (Telegram)${note ? `\nIzoh: ${note}` : ''}`,
        payload: { request_id: row.id },
        dedup_key: `stock.request:${row.id}:${recipient}`,
      });
    await audit(db, user, 'stock.request', row.id, { channel: 'telegram' });
    await saveState(db, user.id, {});
    return t(lang, 'created', {
      material: material.name,
      qty: quantity(s.quantity!),
      unit: material.unit_id,
      project: project.name,
    });
  });
}
/** Ombor mudiri / admin uchun ochiq so'rovlar ro'yxati. */
export async function listMaterialRequests(db: Db, user: Row, lang: Lang) {
  invariant(
    (await allowed(db, user, 'stock.send')) || user.role === 'tenant_admin',
    'FORBIDDEN',
    403,
  );
  const rows = (
    await db.query(
      `SELECT r.quantity,r.needed_by,r.note,m.name material,m.unit_id,p.name project,u.display_name requester
       FROM material_requests r JOIN materials m ON m.id=r.material_id JOIN projects p ON p.id=r.project_id JOIN users u ON u.id=r.requested_by
       WHERE r.tenant_id=$1 AND r.status='pending' AND ($2='tenant_admin' OR EXISTS(SELECT 1 FROM project_assignments a WHERE a.tenant_id=r.tenant_id AND a.project_id=r.project_id AND a.user_id=$3))
       ORDER BY r.created_at LIMIT 20`,
      [user.tenant_id, user.role, user.id],
    )
  ).rows;
  if (!rows.length) return t(lang, 'requests_none');
  return `${t(lang, 'requests_header')}\n\n${rows.map((r) => `• ${r.material}: ${quantity(r.quantity)} ${r.unit_id}\n  ${r.project} · ${r.requester}${r.needed_by ? ` · ⏰ ${r.needed_by}` : ''}${r.note ? `\n  ${r.note}` : ''}`).join('\n')}\n\n${t(lang, 'requests_hint')}`;
}
