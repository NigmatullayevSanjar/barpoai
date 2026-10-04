import type pg from 'pg';
import { type Db, type Row, one, audit, transaction } from './db.js';
import { digest, token as randomToken } from './security.js';
import { invariant, DomainError } from './errors.js';
import { tenantAccess, accessState } from './auth.js';
import { allowed } from './permissions.js';
import {
  continueFlow,
  continueProgressFlow,
  hasFlow,
  listMaterialRequests,
  loadState,
  startMaterialRequest,
  startProgressReport,
} from './telegram-flows.js';
export type TelegramUser = {
  id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
};
const botToken = () => process.env.TELEGRAM_BOT_TOKEN ?? '';
export const botUsername = () => process.env.TELEGRAM_BOT_USERNAME ?? 'barpoai_bot';
const linkTtlSeconds = () => Number(process.env.TELEGRAM_LINK_TOKEN_TTL_SECONDS ?? 300);
export const telegramConfigured = () => Boolean(botToken());
/** Telegram Bot API chaqiruvi; token loglarga tushmaydi. */
export async function tg<T = any>(
  method: string,
  body: Record<string, unknown>,
  timeoutMs = 10000,
) {
  invariant(botToken(), 'PROVIDER_NOT_CONFIGURED', 503);
  const response = await fetch(`https://api.telegram.org/bot${botToken()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const result = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: T;
    description?: string;
  };
  if (!response.ok || !result.ok)
    throw new DomainError('TELEGRAM_DELIVERY_FAILED', 503, result.description);
  return result.result as T;
}
export async function sendMessage(
  chatId: string,
  text: string,
  extra: Record<string, unknown> = {},
) {
  return tg('sendMessage', { chat_id: chatId, text, ...extra });
}
// ---------------------------------------------------------------- Linking
export async function createLinkToken(db: Db, actor: Row) {
  invariant(telegramConfigured(), 'PROVIDER_NOT_CONFIGURED', 503);
  // Avvalgi ishlatilmagan tokenlar bekor qilinadi: bir vaqtda bitta faol havola.
  await db.query(
    'UPDATE telegram_link_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',
    [actor.id],
  );
  const raw = randomToken();
  const row = await one(
    db,
    'INSERT INTO telegram_link_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+make_interval(secs=>$3)) RETURNING expires_at',
    [actor.id, digest(raw), linkTtlSeconds()],
  );
  await audit(db, actor, 'telegram.link_token', actor.id);
  return {
    url: `https://t.me/${botUsername()}?start=${raw}`,
    expires_at: row.expires_at,
    expires_in: linkTtlSeconds(),
  };
}
/**
 * Atomik: bir xil token bilan kelgan ikki so'rovdan faqat bittasi muvaffaqiyatli.
 * Rol va kompaniya tokendan emas, bazadagi foydalanuvchidan olinadi.
 */
export async function consumeLinkToken(db: Db, raw: string, from: TelegramUser) {
  invariant(/^[A-Za-z0-9_-]{32,100}$/.test(raw), 'TELEGRAM_LINK_INVALID', 400);
  const consumed = (
    await db.query(
      'UPDATE telegram_link_tokens SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING user_id',
      [digest(raw)],
    )
  ).rows[0];
  if (!consumed) {
    const known = (
      await db.query('SELECT used_at,expires_at FROM telegram_link_tokens WHERE token_hash=$1', [
        digest(raw),
      ])
    ).rows[0];
    invariant(known, 'TELEGRAM_LINK_INVALID', 400);
    invariant(!known.used_at, 'TELEGRAM_LINK_USED', 410);
    invariant(false, 'TELEGRAM_LINK_EXPIRED', 410);
  }
  const user = await one(db, 'SELECT * FROM users WHERE id=$1 FOR UPDATE', [consumed.user_id]);
  invariant(user.active, 'USER_BLOCKED', 403);
  if (user.tenant_id) {
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [user.tenant_id]);
    await tenantAccess(db, user);
  }
  const other = (
    await db.query('SELECT user_id FROM telegram_accounts WHERE telegram_user_id=$1', [from.id])
  ).rows[0];
  invariant(!other || other.user_id === user.id, 'TELEGRAM_ACCOUNT_IN_USE', 409);
  // Bir foydalanuvchi = bitta faol Telegram akkaunt: eski akkaunt uziladi, yangisi ulanadi.
  const previous = (
    await db.query('SELECT telegram_user_id FROM telegram_accounts WHERE user_id=$1', [user.id])
  ).rows[0];
  await db.query(
    `INSERT INTO telegram_accounts(user_id,telegram_user_id,telegram_username,telegram_first_name,telegram_last_name,linked_at,last_seen_at)
     VALUES($1,$2,$3,$4,$5,now(),now())
     ON CONFLICT(user_id) DO UPDATE SET telegram_user_id=excluded.telegram_user_id,telegram_username=excluded.telegram_username,
       telegram_first_name=excluded.telegram_first_name,telegram_last_name=excluded.telegram_last_name,linked_at=now(),last_seen_at=now(),chat_state='{}'`,
    [user.id, from.id, from.username ?? null, from.first_name ?? null, from.last_name ?? null],
  );
  await audit(db, user, 'telegram.linked', user.id, {
    telegram_user_id: from.id,
    replaced: previous?.telegram_user_id ?? null,
  });
  return user;
}
export async function telegramStatus(db: Db, actor: Row) {
  const row = (
    await db.query(
      'SELECT telegram_username,telegram_first_name,linked_at,last_seen_at FROM telegram_accounts WHERE user_id=$1',
      [actor.id],
    )
  ).rows[0];
  return {
    configured: telegramConfigured(),
    bot_username: botUsername(),
    linked: Boolean(row),
    username: row?.telegram_username ?? null,
    first_name: row?.telegram_first_name ?? null,
    linked_at: row?.linked_at ?? null,
    last_seen_at: row?.last_seen_at ?? null,
  };
}
export async function unlinkTelegram(db: Db, actor: Row) {
  const removed = (
    await db.query('DELETE FROM telegram_accounts WHERE user_id=$1 RETURNING telegram_user_id', [
      actor.id,
    ])
  ).rows[0];
  await db.query(
    'UPDATE telegram_link_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',
    [actor.id],
  );
  await audit(db, actor, 'telegram.unlinked', actor.id, {
    telegram_user_id: removed?.telegram_user_id ?? null,
  });
  return { ok: true, linked: false };
}
// ---------------------------------------------------------------- Bot texts (UZ/RU)
type Lang = 'uz' | 'ru';
const T = {
  start_no_token: {
    uz: 'Telegramni BARPO AI hisobingizga ulash uchun BARPO AI profilidagi «Telegramni ulash» tugmasini bosing.',
    ru: 'Чтобы привязать Telegram к аккаунту BARPO AI, нажмите «Подключить Telegram» в профиле BARPO AI.',
  },
  linked: {
    uz: '✅ Telegram ulandi.\n\n👤 {name}\n🏢 {company}\n🎭 Rol: {role}',
    ru: '✅ Telegram подключён.\n\n👤 {name}\n🏢 {company}\n🎭 Роль: {role}',
  },
  not_linked: {
    uz: 'Bu Telegram akkaunt BARPO AI hisobiga ulanmagan. Profil → «Telegramni ulash» orqali havola yarating.',
    ru: 'Этот Telegram не привязан к аккаунту BARPO AI. Создайте ссылку в профиле → «Подключить Telegram».',
  },
  TELEGRAM_LINK_EXPIRED: {
    uz: '❌ Bu Telegram ulash havolasi muddati tugagan.\n\nBARPO AI profilidan yangi havola yarating.',
    ru: '❌ Срок действия ссылки истёк.\n\nСоздайте новую ссылку в профиле BARPO AI.',
  },
  TELEGRAM_LINK_USED: {
    uz: '❌ Bu havola allaqachon ishlatilgan.\n\nYangi Telegram ulash havolasini yarating.',
    ru: '❌ Эта ссылка уже использована.\n\nСоздайте новую ссылку для подключения Telegram.',
  },
  TELEGRAM_LINK_INVALID: {
    uz: '❌ Telegram ulash havolasi noto‘g‘ri.',
    ru: '❌ Неверная ссылка для подключения Telegram.',
  },
  TELEGRAM_ACCOUNT_IN_USE: {
    uz: '⚠️ Bu Telegram akkaunt boshqa BARPO AI hisobiga ulangan.',
    ru: '⚠️ Этот Telegram уже привязан к другому аккаунту BARPO AI.',
  },
  USER_BLOCKED: {
    uz: '❌ Sizning BARPO AI hisobingiz bloklangan.\nAdministrator bilan bog‘laning.',
    ru: '❌ Ваш аккаунт BARPO AI заблокирован.\nСвяжитесь с администратором.',
  },
  TENANT_BLOCKED: {
    uz: '❌ Kompaniya hisobingiz vaqtincha to‘xtatilgan.\nPlatforma administratori bilan bog‘laning.',
    ru: '❌ Аккаунт компании временно приостановлен.\nСвяжитесь с администратором платформы.',
  },
  TENANT_ARCHIVED: {
    uz: '❌ Kompaniya hisobi arxivlangan.',
    ru: '❌ Аккаунт компании архивирован.',
  },
  FORBIDDEN: {
    uz: '⛔ Bu amal uchun ruxsatingiz yo‘q.',
    ru: '⛔ У вас нет прав для этого действия.',
  },
  help: {
    uz: 'Buyruqlar:\n/menu — rolga mos menyu\n/profile — profil\n/tasks — vazifalarim\n/notifications — bildirishnomalar\n/help — yordam',
    ru: 'Команды:\n/menu — меню по роли\n/profile — профиль\n/tasks — мои задачи\n/notifications — уведомления\n/help — помощь',
  },
  menu: { uz: 'Menyu:', ru: 'Меню:' },
  unknown: {
    uz: 'Tushunarsiz buyruq. /menu yoki /help ni bosing.',
    ru: 'Неизвестная команда. Нажмите /menu или /help.',
  },
  profile: {
    uz: '👤 {name}\n🏢 {company}\n🎭 Rol: {role}\n📞 {phone}\n🔗 Telegram: @{username}',
    ru: '👤 {name}\n🏢 {company}\n🎭 Роль: {role}\n📞 {phone}\n🔗 Telegram: @{username}',
  },
  no_tasks: { uz: 'Ochiq vazifalar yo‘q.', ru: 'Открытых задач нет.' },
  tasks_header: { uz: '📋 Ochiq vazifalar:', ru: '📋 Открытые задачи:' },
  no_notifications: { uz: 'Yangi bildirishnomalar yo‘q.', ru: 'Новых уведомлений нет.' },
  no_projects: { uz: 'Biriktirilgan obyektlar yo‘q.', ru: 'Назначенных объектов нет.' },
  projects_header: { uz: '🏗 Obyektlar:', ru: '🏗 Объекты:' },
  low_stock_header: {
    uz: '⚠️ Minimal chegaradan past materiallar:',
    ru: '⚠️ Материалы ниже минимума:',
  },
  low_stock_none: {
    uz: 'Minimal chegaradan past material yo‘q.',
    ru: 'Материалов ниже минимума нет.',
  },
  tenants_header: { uz: '🏢 Kompaniyalar holati:', ru: '🏢 Состояние компаний:' },
  debtors_header: {
    uz: '⚠️ Trial/to‘lov muddati o‘tgan kompaniyalar:',
    ru: '⚠️ Компании с истёкшим trial/оплатой:',
  },
  debtors_none: { uz: 'Muddati o‘tgan kompaniyalar yo‘q.', ru: 'Просроченных компаний нет.' },
  later: {
    uz: 'Bu bo‘lim platformaning keyingi bosqichida Telegramga ulanadi. Hozircha web ilovadan foydalaning.',
    ru: 'Этот раздел будет подключён к Telegram на следующем этапе. Пока используйте веб-приложение.',
  },
  platform_no_company: { uz: 'Platforma', ru: 'Платформа' },
} as const;
type Key = keyof typeof T;
const t = (lang: Lang, key: Key, vars: Record<string, string | null | undefined> = {}) =>
  (T[key][lang] as string).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '—'));
const roleLabel: Record<string, Record<Lang, string>> = {
  super_admin: { uz: 'Super admin', ru: 'Супер админ' },
  platform_owner: { uz: 'Platforma egasi', ru: 'Владелец платформы' },
  support: { uz: 'Texnik yordam', ru: 'Техподдержка' },
  tenant_admin: { uz: 'Mijoz admini', ru: 'Админ компании' },
  foreman: { uz: 'Prorab', ru: 'Прораб' },
  brigadier: { uz: 'Brigadir', ru: 'Бригадир' },
  warehouse_manager: { uz: 'Ombor mudiri', ru: 'Завсклад' },
  financier: { uz: 'Finansist', ru: 'Финансист' },
  accountant: { uz: 'Buxgalter', ru: 'Бухгалтер' },
  manager: { uz: 'Menejer', ru: 'Менеджер' },
};
/** Menyu tugmalari: matn → ichki amal. Xavfsizlik menyuda emas, har amalda qayta tekshiriladi. */
const MENU: Record<string, [Record<Lang, string>, string][]> = {
  brigadier: [
    [{ uz: '📋 Mening vazifalarim', ru: '📋 Мои задачи' }, 'tasks'],
    [{ uz: '📊 Progress yuborish', ru: '📊 Отправить прогресс' }, 'progress'],
    [{ uz: '📦 Material so‘rash', ru: '📦 Запросить материал' }, 'material_request'],
    [{ uz: '🔔 Bildirishnomalar', ru: '🔔 Уведомления' }, 'notifications'],
    [{ uz: '👤 Profil', ru: '👤 Профиль' }, 'profile'],
  ],
  foreman: [
    [{ uz: '🏗 Obyektlar', ru: '🏗 Объекты' }, 'projects'],
    [{ uz: '📋 Vazifalar', ru: '📋 Задачи' }, 'tasks'],
    [{ uz: '📊 Progress', ru: '📊 Прогресс' }, 'progress'],
    [{ uz: '📦 Materiallar', ru: '📦 Материалы' }, 'low_stock'],
    [{ uz: '📈 Hisobotlar', ru: '📈 Отчёты' }, 'reports'],
    [{ uz: '🔔 Bildirishnomalar', ru: '🔔 Уведомления' }, 'notifications'],
    [{ uz: '👤 Profil', ru: '👤 Профиль' }, 'profile'],
  ],
  warehouse_manager: [
    [{ uz: '📦 Ombor', ru: '📦 Склад' }, 'projects'],
    [{ uz: '📊 Qoldiq', ru: '📊 Остатки' }, 'balances'],
    [{ uz: '⚠️ Kam qolgan materiallar', ru: '⚠️ Мало на складе' }, 'low_stock'],
    [{ uz: '📋 Material so‘rovlari', ru: '📋 Запросы материалов' }, 'material_requests'],
    [{ uz: '🔔 Bildirishnomalar', ru: '🔔 Уведомления' }, 'notifications'],
    [{ uz: '👤 Profil', ru: '👤 Профиль' }, 'profile'],
  ],
  manager: [
    [{ uz: '🏗 Obyektlar', ru: '🏗 Объекты' }, 'projects'],
    [{ uz: '📋 Vazifalar', ru: '📋 Задачи' }, 'tasks'],
    [{ uz: '📈 Hisobotlar', ru: '📈 Отчёты' }, 'reports'],
    [{ uz: '🔔 Bildirishnomalar', ru: '🔔 Уведомления' }, 'notifications'],
    [{ uz: '👤 Profil', ru: '👤 Профиль' }, 'profile'],
  ],
  financier: [
    [{ uz: '🏗 Obyektlar', ru: '🏗 Объекты' }, 'projects'],
    [{ uz: '💰 Moliya', ru: '💰 Финансы' }, 'finance'],
    [{ uz: '🔔 Bildirishnomalar', ru: '🔔 Уведомления' }, 'notifications'],
    [{ uz: '👤 Profil', ru: '👤 Профиль' }, 'profile'],
  ],
  accountant: [
    [{ uz: '🏗 Obyektlar', ru: '🏗 Объекты' }, 'projects'],
    [{ uz: '💰 Moliya', ru: '💰 Финансы' }, 'finance'],
    [{ uz: '🔔 Bildirishnomalar', ru: '🔔 Уведомления' }, 'notifications'],
    [{ uz: '👤 Profil', ru: '👤 Профиль' }, 'profile'],
  ],
  tenant_admin: [
    [{ uz: '🏗 Obyektlar', ru: '🏗 Объекты' }, 'projects'],
    [{ uz: '📋 Vazifalar', ru: '📋 Задачи' }, 'tasks'],
    [{ uz: '📦 Ombor', ru: '📦 Склад' }, 'low_stock'],
    [{ uz: '💰 Moliya', ru: '💰 Финансы' }, 'finance'],
    [{ uz: '🔔 Bildirishnomalar', ru: '🔔 Уведомления' }, 'notifications'],
    [{ uz: '👤 Profil', ru: '👤 Профиль' }, 'profile'],
  ],
  platform_owner: [
    [{ uz: '🏢 Mijozlar', ru: '🏢 Клиенты' }, 'tenants'],
    [{ uz: '⚠️ Qarzdorlar', ru: '⚠️ Должники' }, 'debtors'],
    [{ uz: '🔔 Bildirishnomalar', ru: '🔔 Уведомления' }, 'notifications'],
    [{ uz: '👤 Profil', ru: '👤 Профиль' }, 'profile'],
  ],
  support: [
    [{ uz: '🛠 Murojaatlar', ru: '🛠 Обращения' }, 'support'],
    [{ uz: '🔔 Bildirishnomalar', ru: '🔔 Уведомления' }, 'notifications'],
    [{ uz: '👤 Profil', ru: '👤 Профиль' }, 'profile'],
  ],
  super_admin: [
    [{ uz: '🛠 Murojaatlar', ru: '🛠 Обращения' }, 'support'],
    [{ uz: '🔔 Bildirishnomalar', ru: '🔔 Уведомления' }, 'notifications'],
    [{ uz: '👤 Profil', ru: '👤 Профиль' }, 'profile'],
  ],
};
const COMMANDS: Record<string, string> = {
  '/menu': 'menu',
  '/profile': 'profile',
  '/tasks': 'tasks',
  '/notifications': 'notifications',
  '/help': 'help',
};
function keyboard(role: string, lang: Lang) {
  const items = MENU[role] ?? [];
  const rows: { text: string }[][] = [];
  for (let i = 0; i < items.length; i += 2)
    rows.push(items.slice(i, i + 2).map(([label]) => ({ text: label[lang] })));
  return { keyboard: rows, resize_keyboard: true, is_persistent: true };
}
function actionFor(role: string, text: string): string | null {
  const command = COMMANDS[text.split(' ')[0]!.split('@')[0]!];
  if (command) return command;
  for (const [label, action] of MENU[role] ?? [])
    if (label.uz === text || label.ru === text) return action;
  return null;
}
const langOf = (from: TelegramUser): Lang => (from.language_code?.startsWith('ru') ? 'ru' : 'uz');
const fmtDate = (v: string | Date | null, lang: Lang) =>
  v
    ? new Date(v).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
        timeZone: 'Asia/Tashkent',
      })
    : '—';
// ---------------------------------------------------------------- Update handling
type Update = {
  update_id: number;
  message?: {
    chat: { id: number };
    from?: TelegramUser & { id: number };
    text?: string;
    caption?: string;
    photo?: { file_id: string; file_size?: number }[];
  };
};
export async function handleUpdate(pool: pg.Pool, update: Update) {
  const message = update.message;
  if (!message?.from || (!message.text && !message.photo?.length) || message.from.id === undefined)
    return;
  const from: TelegramUser = { ...message.from, id: String(message.from.id) };
  const chat = String(message.chat.id);
  const lang = langOf(from);
  const text = (message.text ?? message.caption ?? '').trim();
  const photo = message.photo?.length ? message.photo[message.photo.length - 1] : undefined;
  // 1) /start TOKEN — ulash. Alohida tranzaksiya; tenant konteksti token egasidan olinadi.
  if (text.startsWith('/start')) {
    const raw = text.split(/\s+/)[1];
    if (!raw) {
      const identity = await resolveIdentity(pool, from);
      if (identity) return reply(chat, t(lang, 'menu'), keyboard(identity.user.role, lang));
      return reply(chat, t(lang, 'start_no_token'));
    }
    try {
      const user = await transaction(pool, null, (db) => consumeLinkToken(db, raw, from));
      const company = user.tenant_id
        ? (await pool.query('SELECT legal_name FROM tenants WHERE id=$1', [user.tenant_id])).rows[0]
            ?.legal_name
        : t(lang, 'platform_no_company');
      return reply(
        chat,
        t(lang, 'linked', { name: user.display_name, company, role: roleLabel[user.role]?.[lang] }),
        keyboard(user.role, lang),
      );
    } catch (error: any) {
      const key = (error?.code ?? 'TELEGRAM_LINK_INVALID') as Key;
      return reply(chat, t(lang, (T as any)[key] ? key : 'TELEGRAM_LINK_INVALID'));
    }
  }
  // 2) Qolgan buyruqlar: identity → tenant → rol → ruxsat, har safar bazadan.
  const identity = await resolveIdentity(pool, from);
  if (!identity) return reply(chat, t(lang, 'not_linked'));
  if (identity.error) return reply(chat, t(lang, identity.error as Key), { remove_keyboard: true });
  const { user } = identity;
  // 2a) Ko'p qadamli oqim davom etayotgan bo'lsa (material so'rovi), javob shu oqimga ketadi.
  const state = await loadState(pool, from.id);
  const action = actionFor(user.role, text);
  if (
    hasFlow(state) &&
    !(
      action &&
      action !== 'material_request' &&
      action !== 'progress' &&
      COMMANDS[text.split(' ')[0]!]
    )
  ) {
    try {
      const answer =
        (state as { flow?: string }).flow === 'progress'
          ? await continueProgressFlow(pool, user, state, text, lang, photo)
          : await continueFlow(pool, user, state, text, lang);
      return reply(chat, answer, keyboard(user.role, lang));
    } catch (error: any) {
      const key = error?.code as Key;
      return reply(
        chat,
        (T as any)[key] ? t(lang, key) : t(lang, 'FORBIDDEN'),
        keyboard(user.role, lang),
      );
    }
  }
  if (!action) return reply(chat, t(lang, 'unknown'), keyboard(user.role, lang));
  if (action === 'material_request' || action === 'progress') {
    try {
      const start = action === 'progress' ? startProgressReport : startMaterialRequest;
      return reply(chat, await start(pool, user, lang), keyboard(user.role, lang));
    } catch (error: any) {
      const key = error?.code as Key;
      return reply(
        chat,
        (T as any)[key] ? t(lang, key) : t(lang, 'FORBIDDEN'),
        keyboard(user.role, lang),
      );
    }
  }
  try {
    const answer = await transaction(pool, user.tenant_id ?? null, (db) =>
      action === 'material_requests'
        ? listMaterialRequests(db, user, lang)
        : runAction(db, user, action, lang),
    );
    return reply(chat, answer, keyboard(user.role, lang));
  } catch (error: any) {
    const key = error?.code as Key;
    return reply(
      chat,
      (T as any)[key] ? t(lang, key) : t(lang, 'FORBIDDEN'),
      keyboard(user.role, lang),
    );
  }
}
async function reply(chat: string, text: string, reply_markup?: Record<string, unknown>) {
  await sendMessage(chat, text, reply_markup ? { reply_markup } : {});
}
async function resolveIdentity(pool: pg.Pool, from: TelegramUser) {
  const row = (
    await pool.query(
      'SELECT u.* FROM telegram_accounts a JOIN users u ON u.id=a.user_id WHERE a.telegram_user_id=$1',
      [from.id],
    )
  ).rows[0];
  if (!row) return null;
  await pool.query(
    'UPDATE telegram_accounts SET last_seen_at=now(),telegram_username=$2 WHERE telegram_user_id=$1',
    [from.id, from.username ?? null],
  );
  if (!row.active) return { user: row, error: 'USER_BLOCKED' };
  if (row.tenant_id) {
    try {
      await transaction(pool, row.tenant_id, (db) => tenantAccess(db, row));
    } catch (error: any) {
      return { user: row, error: error.code ?? 'TENANT_BLOCKED' };
    }
  }
  return { user: row, error: null as string | null };
}
async function runAction(db: Db, user: Row, action: string, lang: Lang): Promise<string> {
  const company = user.tenant_id
    ? (await one(db, 'SELECT legal_name FROM tenants WHERE id=$1', [user.tenant_id])).legal_name
    : t(lang, 'platform_no_company');
  switch (action) {
    case 'menu':
      return t(lang, 'menu');
    case 'help':
      return t(lang, 'help');
    case 'profile': {
      const account = await one(db, 'SELECT * FROM telegram_accounts WHERE user_id=$1', [user.id]);
      return t(lang, 'profile', {
        name: user.display_name,
        company,
        role: roleLabel[user.role]?.[lang],
        phone: user.phone,
        username: account.telegram_username,
      });
    }
    case 'notifications': {
      const rows = (
        await db.query(
          'SELECT id,title,body,created_at FROM notifications WHERE user_id=$1 AND read_at IS NULL ORDER BY created_at DESC LIMIT 10',
          [user.id],
        )
      ).rows;
      if (!rows.length) return t(lang, 'no_notifications');
      await db.query('UPDATE notifications SET read_at=now() WHERE id=ANY($1::uuid[])', [
        rows.map((r) => r.id),
      ]);
      return rows
        .map((r) => `🔔 ${r.title}\n${r.body}\n${fmtDate(r.created_at, lang)}`)
        .join('\n\n');
    }
    case 'tasks': {
      invariant(user.tenant_id && (await allowed(db, user, 'tasks.read')), 'FORBIDDEN', 403);
      const manage = await allowed(db, user, 'tasks.manage');
      const rows = (
        await db.query(
          `SELECT t.title,t.status,t.priority,t.deadline,p.name project FROM tasks t JOIN projects p ON p.id=t.project_id
           WHERE t.tenant_id=$1 AND t.archived_at IS NULL AND t.status<>'accepted'
             AND ($2 OR t.assignee_id=$3 OR t.reviewer_id=$3)
             AND ($4='tenant_admin' OR EXISTS(SELECT 1 FROM project_assignments a WHERE a.tenant_id=t.tenant_id AND a.project_id=t.project_id AND a.user_id=$3))
           ORDER BY t.deadline NULLS LAST,t.created_at LIMIT 15`,
          [user.tenant_id, manage, user.id, user.role],
        )
      ).rows;
      if (!rows.length) return t(lang, 'no_tasks');
      return (
        t(lang, 'tasks_header') +
        '\n\n' +
        rows
          .map(
            (r) =>
              `• ${r.title}\n  ${r.project} · ${r.status} · ${r.priority} · ⏰ ${fmtDate(r.deadline, lang)}`,
          )
          .join('\n')
      );
    }
    case 'projects': {
      invariant(user.tenant_id && (await allowed(db, user, 'projects.read')), 'FORBIDDEN', 403);
      const rows = (
        await db.query(
          `SELECT p.name,p.planned_end,p.forecast_end FROM projects p WHERE p.tenant_id=$1 AND p.archived_at IS NULL
           AND ($2='tenant_admin' OR EXISTS(SELECT 1 FROM project_assignments a WHERE a.tenant_id=p.tenant_id AND a.project_id=p.id AND a.user_id=$3)) ORDER BY p.name LIMIT 20`,
          [user.tenant_id, user.role, user.id],
        )
      ).rows;
      if (!rows.length) return t(lang, 'no_projects');
      return (
        t(lang, 'projects_header') +
        '\n\n' +
        rows
          .map((r) => `• ${r.name} · ⏰ ${fmtDate(r.forecast_end ?? r.planned_end, lang)}`)
          .join('\n')
      );
    }
    case 'low_stock':
    case 'balances': {
      invariant(user.tenant_id && (await allowed(db, user, 'stock.read')), 'FORBIDDEN', 403);
      const rows = (
        await db.query(
          `SELECT m.name,m.unit_id,(b.quantity-b.reserved)::text available,b.minimum_quantity::text minimum,coalesce(w.name,u.display_name) account,p.name project
           FROM stock_balances b JOIN stock_accounts a ON a.tenant_id=b.tenant_id AND a.id=b.account_id
           JOIN materials m ON m.id=b.material_id JOIN projects p ON p.id=a.project_id
           LEFT JOIN warehouses w ON w.id=a.warehouse_id LEFT JOIN users u ON u.id=a.custodian_id
           WHERE b.tenant_id=$1 AND ($2 OR b.quantity-b.reserved<b.minimum_quantity)
             AND ($3='tenant_admin' OR EXISTS(SELECT 1 FROM project_assignments pa WHERE pa.tenant_id=a.tenant_id AND pa.project_id=a.project_id AND pa.user_id=$4))
             AND ($3<>'brigadier' OR a.custodian_id=$4)
             AND ($3<>'warehouse_manager' OR a.warehouse_id IS NULL OR EXISTS(SELECT 1 FROM warehouse_assignments wa WHERE wa.tenant_id=a.tenant_id AND wa.warehouse_id=a.warehouse_id AND wa.user_id=$4))
           ORDER BY p.name,m.name LIMIT 25`,
          [user.tenant_id, action === 'balances', user.role, user.id],
        )
      ).rows;
      if (!rows.length)
        return action === 'balances' ? t(lang, 'no_projects') : t(lang, 'low_stock_none');
      return (
        (action === 'balances' ? '📊' : t(lang, 'low_stock_header')) +
        '\n\n' +
        rows
          .map(
            (r) =>
              `• ${r.name}: ${r.available} ${r.unit_id} (min ${r.minimum})\n  ${r.project} · ${r.account}`,
          )
          .join('\n')
      );
    }
    case 'tenants':
    case 'debtors': {
      invariant(user.role === 'platform_owner', 'FORBIDDEN', 403);
      const rows = (await db.query('SELECT * FROM tenants ORDER BY legal_name')).rows.map((r) => ({
        ...r,
        ...accessState(r),
      }));
      if (action === 'tenants') {
        const count = (state: string) => rows.filter((r) => r.access_state === state).length;
        return `${t(lang, 'tenants_header')}\n\n• trial: ${count('trial')}\n• paid: ${count('paid')}\n• overdue: ${count('overdue')}\n• pending: ${count('pending')}\n• blocked: ${count('blocked')}\n• archived: ${count('archived')}`;
      }
      const debtors = rows.filter((r) => r.access_state === 'overdue');
      if (!debtors.length) return t(lang, 'debtors_none');
      return (
        t(lang, 'debtors_header') +
        '\n\n' +
        debtors.map((r) => `• ${r.legal_name} — ${r.days_overdue} kun`).join('\n')
      );
    }
    case 'support': {
      invariant(['support', 'platform_owner', 'super_admin'].includes(user.role), 'FORBIDDEN', 403);
      const rows = (
        await db.query(
          "SELECT s.kind,s.message,s.created_at,t.legal_name FROM support_requests s JOIN tenants t ON t.id=s.tenant_id WHERE s.status='open' ORDER BY s.created_at DESC LIMIT 10",
        )
      ).rows;
      if (!rows.length) return t(lang, 'no_notifications');
      return rows
        .map((r) => `🛠 ${r.legal_name} · ${r.kind}\n${r.message}\n${fmtDate(r.created_at, lang)}`)
        .join('\n\n');
    }
    case 'finance': {
      invariant(user.tenant_id && (await allowed(db, user, 'finance.read')), 'FORBIDDEN', 403);
      const rows = (
        await db.query(
          `SELECT p.name,coalesce(sum(j.amount) FILTER(WHERE j.account='expense'),0)::text cost,(-coalesce(sum(j.amount) FILTER(WHERE j.account='payable'),0))::text debt
           FROM projects p LEFT JOIN journal_entries j ON j.tenant_id=p.tenant_id AND j.project_id=p.id
           WHERE p.tenant_id=$1 AND p.archived_at IS NULL AND ($2='tenant_admin' OR EXISTS(SELECT 1 FROM project_assignments a WHERE a.tenant_id=p.tenant_id AND a.project_id=p.id AND a.user_id=$3))
           GROUP BY p.id ORDER BY p.name LIMIT 20`,
          [user.tenant_id, user.role, user.id],
        )
      ).rows;
      if (!rows.length) return t(lang, 'no_projects');
      return (
        '💰\n\n' +
        rows
          .map(
            (r) =>
              `• ${r.name}\n  ${lang === 'ru' ? 'Затраты' : 'Xarajat'}: ${r.cost} UZS · ${lang === 'ru' ? 'Долг' : 'Qarz'}: ${r.debt} UZS`,
          )
          .join('\n')
      );
    }
    default:
      return t(lang, 'later');
  }
}
// ---------------------------------------------------------------- Long polling
export async function pollOnce(pool: pg.Pool) {
  if (!telegramConfigured()) return 0;
  const state = (await pool.query('SELECT update_offset FROM telegram_bot_state WHERE id')).rows[0];
  const updates = await tg<Update[]>(
    'getUpdates',
    { offset: Number(state?.update_offset ?? 0), timeout: 20, allowed_updates: ['message'] },
    30000,
  );
  for (const update of updates) {
    try {
      await handleUpdate(pool, update);
    } catch (error: any) {
      console.error('Telegram update failed', error?.code ?? error?.message);
    }
    await pool.query('UPDATE telegram_bot_state SET update_offset=$1,updated_at=now() WHERE id', [
      update.update_id + 1,
    ]);
  }
  return updates.length;
}
