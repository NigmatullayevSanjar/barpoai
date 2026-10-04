import type pg from 'pg';
import { type Db, type Row, one, transaction, audit } from './db.js';
import { allowed } from './permissions.js';
import { invariant } from './errors.js';
import { notify, projectRecipients } from './notify.js';
import { quantity } from './money.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { tg as tgApi } from './telegram.js';

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
  | {
      flow: 'progress';
      step: 'project' | 'line' | 'quantity' | 'content' | 'photo';
      projects?: { id: string; name: string }[];
      project_id?: string;
      lines?: { id: string; description: string; unit_id: string }[];
      line_id?: string;
      quantity?: string;
      content?: string;
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
  choose_line: {
    uz: '📐 Qaysi ish bo‘yicha progress? (raqamini yuboring):',
    ru: '📐 По какой работе прогресс? (отправьте номер):',
  },
  enter_progress: {
    uz: '🔢 Bajarilgan miqdorni kiriting ({unit}); reja {plan}, hozirgacha {fact}:',
    ru: '🔢 Введите выполненный объём ({unit}); план {plan}, выполнено {fact}:',
  },
  enter_content: {
    uz: '📝 Bajarilgan ishlarni qisqacha yozing (kamida 5 belgi):',
    ru: '📝 Кратко опишите выполненные работы (минимум 5 символов):',
  },
  send_photo: {
    uz: '📷 Rasm yuboring yoki rasmsiz yuborish uchun «-» yozing:',
    ru: '📷 Отправьте фото или «-», чтобы отправить без фото:',
  },
  no_lines: {
    uz: 'Obyekt smetasida ish qatorlari yo‘q. Hisobot miqdorsiz yuboriladi.',
    ru: 'В смете объекта нет строк работ. Отчёт будет без объёма.',
  },
  photo_invalid: {
    uz: 'Rasm JPEG/PNG va 5 MB gacha bo‘lishi kerak. Qayta yuboring yoki «-».',
    ru: 'Фото должно быть JPEG/PNG до 5 МБ. Отправьте снова или «-».',
  },
  report_created: {
    uz: '✅ Kunlik hisobot yuborildi (tekshiruvga).\n{line}Obyekt: {project}{photo}',
    ru: '✅ Ежедневный отчёт отправлен на проверку.\n{line}Объект: {project}{photo}',
  },
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

// ---------------------------------------------------------------- Progress (kunlik hisobot) oqimi
export type IncomingPhoto = { file_id: string; file_size?: number; mime_type?: string };
export async function startProgressReport(pool: pg.Pool, user: Row, lang: Lang): Promise<string> {
  return transaction(pool, user.tenant_id, async (db) => {
    invariant(await allowed(db, user, 'reports.submit'), 'FORBIDDEN', 403);
    const projects = await userProjects(db, user);
    if (!projects.length) return t(lang, 'no_projects');
    if (projects.length === 1) return askLine(db, user, lang, projects[0]!.id);
    await saveState(db, user.id, { flow: 'progress', step: 'project', projects });
    return `${t(lang, 'choose_project')}\n\n${numbered(projects)}\n\n/cancel`;
  });
}
async function askLine(db: Db, user: Row, lang: Lang, projectId: string) {
  const lines = (
    await db.query(
      `SELECT l.id,l.description,l.unit_id FROM estimate_lines l JOIN estimates e ON e.id=l.estimate_id
       WHERE l.tenant_id=$1 AND l.project_id=$2 AND l.kind<>'material' AND l.archived_at IS NULL AND e.archived_at IS NULL ORDER BY l.position,l.id LIMIT 40`,
      [user.tenant_id, projectId],
    )
  ).rows as { id: string; description: string; unit_id: string }[];
  if (!lines.length) {
    await saveState(db, user.id, { flow: 'progress', step: 'content', project_id: projectId });
    return `${t(lang, 'no_lines')}\n${t(lang, 'enter_content')}`;
  }
  await saveState(db, user.id, { flow: 'progress', step: 'line', project_id: projectId, lines });
  return `${t(lang, 'choose_line')}\n\n${numbered(lines.map((l) => ({ name: l.description, unit_id: l.unit_id })))}\n\n/cancel`;
}
/** Telegramdan kelgan rasmni yuklab olib, hisobotga private fayl sifatida saqlaydi. */
async function storePhoto(
  db: Db,
  user: Row,
  projectId: string,
  reportId: string,
  photo: IncomingPhoto,
) {
  const info = await tgApi<{ file_path?: string; file_size?: number }>('getFile', {
    file_id: photo.file_id,
  });
  invariant(info.file_path && (info.file_size ?? 0) <= 5242880, 'FILE_SIZE_INVALID', 400);
  const response = await fetch(
    `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${info.file_path}`,
    { signal: AbortSignal.timeout(20000) },
  );
  invariant(response.ok, 'TELEGRAM_DELIVERY_FAILED', 503);
  const bytes = Buffer.from(await response.arrayBuffer());
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  invariant(
    bytes.length > 0 && bytes.length <= 5242880 && (png || jpeg),
    'FILE_SIGNATURE_INVALID',
    400,
  );
  const storage = resolve(process.env.STORAGE_DIR ?? './storage');
  await mkdir(storage, { recursive: true });
  const key = randomUUID();
  await writeFile(resolve(storage, key), bytes, { flag: 'wx' });
  await db.query(
    'INSERT INTO files(tenant_id,project_id,report_id,name,mime_type,size,sha256,storage_key,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      user.tenant_id,
      projectId,
      reportId,
      `telegram-${key.slice(0, 8)}.${png ? 'png' : 'jpg'}`,
      png ? 'image/png' : 'image/jpeg',
      bytes.length,
      createHash('sha256').update(bytes).digest('hex'),
      key,
      user.id,
    ],
  );
}
export async function continueProgressFlow(
  pool: pg.Pool,
  user: Row,
  state: State,
  text: string,
  lang: Lang,
  photo?: IncomingPhoto,
): Promise<string> {
  return transaction(pool, user.tenant_id, async (db) => {
    if (/^\/cancel|^bekor|^отмена/i.test(text.trim())) {
      await saveState(db, user.id, {});
      return t(lang, 'cancelled');
    }
    const s = state as Extract<State, { flow: 'progress' }>;
    if (s.step === 'project') {
      const project = s.projects?.[Number(text.trim()) - 1];
      if (!project) return t(lang, 'invalid_choice');
      return askLine(db, user, lang, project.id);
    }
    if (s.step === 'line') {
      const line = s.lines?.[Number(text.trim()) - 1];
      if (!line) return t(lang, 'invalid_choice');
      const facts = await one(
        db,
        `SELECT l.effective_quantity::text plan,(SELECT (coalesce(sum(p.quantity),0)+coalesce((SELECT sum(c.quantity_delta) FROM progress_corrections c JOIN progress_entries pe ON pe.tenant_id=c.tenant_id AND pe.id=c.progress_entry_id WHERE pe.tenant_id=l.tenant_id AND pe.estimate_line_id=l.id),0))::text FROM progress_entries p WHERE p.tenant_id=l.tenant_id AND p.estimate_line_id=l.id) fact FROM estimate_lines l WHERE l.tenant_id=$1 AND l.id=$2`,
        [user.tenant_id, line.id],
      );
      await saveState(db, user.id, { ...s, step: 'quantity', line_id: line.id, lines: [line] });
      return t(lang, 'enter_progress', {
        unit: line.unit_id,
        plan: quantity(facts.plan),
        fact: quantity(facts.fact),
      });
    }
    if (s.step === 'quantity') {
      const value = text.trim().replace(',', '.');
      if (!/^(0|[1-9]\d{0,17})(\.\d{1,6})?$/.test(value) || !/[1-9]/.test(value))
        return t(lang, 'invalid_quantity');
      await saveState(db, user.id, { ...s, step: 'content', quantity: value });
      return t(lang, 'enter_content');
    }
    if (s.step === 'content') {
      if (text.trim().length < 5) return t(lang, 'enter_content');
      await saveState(db, user.id, { ...s, step: 'photo', content: text.trim().slice(0, 2000) });
      return t(lang, 'send_photo');
    }
    // photo qadami: rasm yoki «-»
    if (!photo && text.trim() !== '-') return t(lang, 'send_photo');
    const project = await one(
      db,
      'SELECT id,name FROM projects WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL',
      [user.tenant_id, s.project_id],
    );
    const line = s.line_id
      ? await one(
          db,
          'SELECT id,description,unit_id FROM estimate_lines WHERE tenant_id=$1 AND id=$2',
          [user.tenant_id, s.line_id],
        )
      : null;
    const report = await one(
      db,
      'INSERT INTO reports(tenant_id,project_id,author_id,kind,report_date,content,progress_quantity,estimate_line_id) VALUES($1,$2,$3,$4,current_date,$5,$6,$7) RETURNING *',
      [
        user.tenant_id,
        project.id,
        user.id,
        'daily',
        s.content,
        line ? s.quantity : null,
        line?.id ?? null,
      ],
    );
    let photoNote = '';
    if (photo) {
      try {
        await storePhoto(db, user, project.id, report.id, photo);
        photoNote = lang === 'ru' ? '\n📷 Фото прикреплено' : '\n📷 Rasm biriktirildi';
      } catch {
        photoNote = '\n' + t(lang, 'photo_invalid');
      }
    }
    for (const recipient of await projectRecipients(
      db,
      user.tenant_id,
      project.id,
      ['foreman'],
      user.id,
    ))
      await notify(db, {
        tenant_id: user.tenant_id,
        user_id: recipient,
        project_id: project.id,
        kind: 'report.submitted',
        title: '📝 Yangi kunlik hisobot',
        body: `Obyekt: ${project.name}\nMuallif: ${user.display_name} (Telegram)${line ? `\n${line.description}: ${quantity(s.quantity!)} ${line.unit_id}` : ''}`,
        payload: { report_id: report.id },
        dedup_key: `report.submitted:${report.id}:${recipient}`,
      });
    await audit(db, user, 'report.create', report.id, { channel: 'telegram' });
    await saveState(db, user.id, {});
    return t(lang, 'report_created', {
      project: project.name,
      line: line ? `${line.description}: ${quantity(s.quantity!)} ${line.unit_id}\n` : '',
      photo: photoNote,
    });
  });
}
