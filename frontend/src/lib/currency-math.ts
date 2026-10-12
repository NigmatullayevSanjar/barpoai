import { Decimal as BaseDecimal } from 'decimal.js';

// React'siz toza modul (backend unit testi ham import qiladi).
/** Ko'rsatish valyutasi (D7). Saqlash va kiritish har doim UZS; USD faqat ko'rsatish uchun. */
export type Currency = 'UZS' | 'USD';
// Bo'lishda oraliq yaxlitlash bo'lmasin (standart 20 xona emas, 40).
const Decimal = BaseDecimal.clone({ precision: 40 });
type Decimal = InstanceType<typeof Decimal>;

// formatMoney sinxron va 100+ joyda chaqiriladi: provider joriy holatni shu yerga yozadi,
// useT() esa CurrencyCtx ga obuna — valyuta almashganda formatMoney chaqiruvchilar qayta chiziladi.
let active: { display: Currency; rate: Decimal | null } = { display: 'UZS', rate: null };
export function setActiveCurrency(display: Currency, rate: string | null) {
  active = display === 'USD' && rate ? { display, rate: new Decimal(rate) } : { display: 'UZS', rate: null };
}
/** Jadval sarlavhalari uchun: "(UZS)" yoki "(USD)". */
export const displayCurrency = () => active.display;

/**
 * UZS decimal satrni ko'rsatish valyutasiga aylantiradi: USD = UZS ÷ kurs, 2 xona, ROUND_HALF_UP.
 * Faqat ko'rsatish uchun; natija yig'ilmaydi. Noto'g'ri satr bo'lsa null.
 */
export function toDisplay(value: string, pin?: 'UZS' | 'USD'): { amount: string; currency: Currency } | null {
  let d: Decimal;
  try {
    d = new Decimal(value);
  } catch {
    return null;
  }
  if (!d.isFinite()) return null;
  if (pin === 'USD') return { amount: d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2), currency: 'USD' };
  if (pin === 'UZS' || active.display === 'UZS' || !active.rate)
    return { amount: d.toFixed(), currency: 'UZS' };
  return {
    amount: d.div(active.rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
    currency: 'USD',
  };
}
