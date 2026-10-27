/**
 * Shrift o'lchami (egasi, O.docx): Profil → "Shrift o'lchami". Tanlov shu qurilmada (localStorage) saqlanadi va
 * `html[data-font-size]` orqali `tokens.css` dagi `--font-scale` ni o'zgartiradi (matn va tugma balandligi birga).
 */
export const fontSizes = ['small', 'normal', 'large'] as const;
export type FontSize = (typeof fontSizes)[number];
const STORAGE_KEY = 'barpo.fontSize';

export function getFontSize(): FontSize {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as FontSize | null;
    return saved && fontSizes.includes(saved) ? saved : 'normal';
  } catch {
    return 'normal';
  }
}
export function applyFontSize(size: FontSize = getFontSize()) {
  if (size === 'normal') delete document.documentElement.dataset.fontSize;
  else document.documentElement.dataset.fontSize = size;
}
export function setFontSize(size: FontSize) {
  try {
    localStorage.setItem(STORAGE_KEY, size);
  } catch {
    /* private mode */
  }
  applyFontSize(size);
}
