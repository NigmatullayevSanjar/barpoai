import { createContext } from 'react';
import { Decimal } from 'decimal.js';

/** Ko'rsatish valyutasi (D7). Saqlash va kiritish har doim UZS; USD faqat ko'rsatish uchun. */
export type Currency = 'UZS' | 'USD';
export type RateInfo = { rate: string; rate_date: string; source: string };
export type CurrencyState = {
  /** Foydalanuvchi tanlovi (localStorage). */
  currency: Currency;
  setCurrency: (c: Currency) => void;
  /** Server bergan so'nggi kurs; yo'q bo'lsa null va USD o'chiq. */
  rate: RateInfo | null;
  /** Haqiqatda ko'rsatilayotgan valyuta: kurs yo'q bo'lsa tanlov USD bo'lsa ham UZS. */
  display: Currency;
};
export const CurrencyCtx = createContext<CurrencyState | null>(null);

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
export function toDisplay(value: string, pin?: 'UZS'): { amount: string; currency: Currency } | null {
  let d: Decimal;
  try {
    d = new Decimal(value);
  } catch {
    return null;
  }
  if (!d.isFinite()) return null;
  if (pin === 'UZS' || active.display === 'UZS' || !active.rate)
    return { amount: d.toFixed(), currency: 'UZS' };
  return {
    amount: d.div(active.rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
    currency: 'USD',
  };
}
