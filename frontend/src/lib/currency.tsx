import { useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  CurrencyCtx,
  setActiveCurrency,
  type Currency,
  type CurrencyState,
  type RateInfo,
} from './currency-store';

const STORAGE_KEY = 'barpo.currency';
type LatestRate = { currency: string; rate: string | null; rate_date: string | null; source: string | null };

/** UZS/USD tanlovi (I18nProvider naqshi). Kurs serverdan; kurs bo'lmasa USD ko'rsatilmaydi. */
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const [currency, setState] = useState<Currency>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'USD' ? 'USD' : 'UZS';
    } catch {
      return 'UZS';
    }
  });
  const setCurrency = useCallback((next: Currency) => {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode */
    }
  }, []);
  const latest = useQuery({
    queryKey: ['exchange-rate', 'latest'],
    queryFn: () => api<LatestRate>('/v1/exchange-rates/latest'),
    enabled: Boolean(me),
    staleTime: 60 * 60 * 1000,
  });
  const data = latest.data;
  const rate: RateInfo | null =
    data?.rate && data.rate_date
      ? { rate: data.rate, rate_date: data.rate_date, source: data.source ?? 'CBU' }
      : null;
  const display: Currency = currency === 'USD' && rate ? 'USD' : 'UZS';
  // Bolalar chizilishidan oldin: formatMoney shu render'da yangi valyutani ko'rsin.
  setActiveCurrency(display, rate?.rate ?? null);
  const value = useMemo<CurrencyState>(
    () => ({ currency, setCurrency, rate, display }),
    // rate obyekti har render'da yangi; qiymatlari bo'yicha solishtiriladi.
    [currency, setCurrency, rate?.rate, rate?.rate_date, rate?.source, display],
  );
  return <CurrencyCtx.Provider value={value}>{children}</CurrencyCtx.Provider>;
}
export function useCurrency() {
  const ctx = useContext(CurrencyCtx);
  if (!ctx) throw new Error('CurrencyProvider missing');
  return ctx;
}
