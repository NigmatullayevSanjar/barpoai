import { createContext } from 'react';
import type { Currency } from './currency-math';

export * from './currency-math';
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
