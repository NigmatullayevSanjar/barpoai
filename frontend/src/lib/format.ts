import { toDisplay } from './currency-store';
import { uz } from '@/locales/uz';
import { ru } from '@/locales/ru';

/** UZS, miqdor va sana formatlari. Pul qiymatlari API'dan string keladi; hisob-kitob qilinmaydi. */
/**
 * Pul summasi tanlangan ko'rsatish valyutasida (D7). Konvertatsiya faqat shu yerda: decimal bilan, Number emas.
 * `pin='UZS'` — formalar ichida (kiritilgan summa UZS'da ko'rinsin).
 * `pin='USD'` — qiymat serverdan allaqachon USD: konvertatsiyasiz USD sifatida ko'rsatiladi.
 */
export function formatMoney(
  value: string | number | null | undefined,
  lang: 'uz' | 'ru' = 'uz',
  withCurrency = true,
  pin?: 'UZS' | 'USD',
) {
  if (value === null || value === undefined || value === '') return '—';
  const shown = toDisplay(String(value), pin);
  if (!shown) return String(value);
  // Intl decimal satrni aniq formatlaydi (Number ga o'tkazilmaydi).
  const formatted = new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
    // USD sentlari doim 2 xona (20 947,30 $); so'm odatdagidek.
    minimumFractionDigits: shown.currency === 'USD' ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(shown.amount as unknown as number);
  if (!withCurrency) return formatted;
  return shown.currency === 'USD' ? `${formatted} $` : `${formatted} ${lang === 'ru' ? 'сум' : 'so‘m'}`;
}
export function formatQuantity(value: string | number | null | undefined, unit?: string | null) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  const s = Number.isFinite(n)
    ? new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 6 }).format(n)
    : String(value);
  return unit ? `${s} ${unit}` : s;
}
export function formatDate(value: string | Date | null | undefined, lang: 'uz' | 'ru' = 'uz') {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Tashkent',
  });
}
export function formatDateTime(value: string | Date | null | undefined, lang: 'uz' | 'ru' = 'uz') {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tashkent',
  });
}
/** Nisbiy vaqt: "3 kun oldin" */
export function formatRelative(value: string | Date, lang: 'uz' | 'ru' = 'uz') {
  const d = typeof value === 'string' ? new Date(value) : value;
  const diff = (d.getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang === 'ru' ? 'ru' : 'uz', {
    numeric: 'auto',
  });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}
/**
 * Oy nomi lug'atdan (`ui.date.m1`…`m12`), brauzer Intl'iga bog'liq emas: ba'zi brauzerlar uz-UZ uchun
 * "M10" qaytaradi. `month` — 1–12.
 */
export const monthName = (month: number, lang: 'uz' | 'ru' = 'uz') =>
  (lang === 'ru' ? ru : uz)[`ui.date.m${month}`] ?? String(month);
/** "YYYY-MM" yoki "YYYY-MM-DD…" → "Oktyabr 2026" (ru: "Октябрь 2026"). */
export function formatMonth(value: string | null | undefined, lang: 'uz' | 'ru' = 'uz') {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})/.exec(value);
  return m ? `${monthName(Number(m[2]), lang)} ${m[1]}` : String(value);
}
export const todayIso = () => new Date().toISOString().slice(0, 10);
export const monthStart = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
