/** UZS, miqdor va sana formatlari. Pul qiymatlari API'dan string keladi; hisob-kitob qilinmaydi. */
export function formatMoney(
  value: string | number | null | undefined,
  lang: 'uz' | 'ru' = 'uz',
  withCurrency = true,
) {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  const formatted = new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
  return withCurrency ? `${formatted} ${lang === 'ru' ? 'сум' : 'so‘m'}` : formatted;
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
export const todayIso = () => new Date().toISOString().slice(0, 10);
export const monthStart = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
