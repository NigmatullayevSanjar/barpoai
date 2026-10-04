import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { uz } from '@/locales/uz';
import { ru } from '@/locales/ru';
import { erpUz } from '@/locales/erp.uz';
import { erpRu } from '@/locales/erp.ru';
import { estimatesUz } from '@/locales/estimates.uz';
import { estimatesRu } from '@/locales/estimates.ru';
import { stockUz } from '@/locales/stock.uz';
import { stockRu } from '@/locales/stock.ru';
import { financeUz } from '@/locales/finance.uz';
import { financeRu } from '@/locales/finance.ru';

export type Lang = 'uz' | 'ru';
export type Dict = Record<string, string>;
const dictionaries: Record<Lang, Dict> = {
  uz: { ...uz, ...erpUz, ...estimatesUz, ...stockUz, ...financeUz },
  ru: { ...ru, ...erpRu, ...estimatesRu, ...stockRu, ...financeRu },
};
const STORAGE_KEY = 'barpo.lang';

type I18n = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** t('key', {name:'Ali'}) — kalit topilmasa o'zbekcha, u ham bo'lmasa kalitning o'zi qaytadi. */
  t: (key: string, vars?: Record<string, string | number | null | undefined>) => string;
};
const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'ru' ? 'ru' : 'uz';
    } catch {
      return 'uz';
    }
  });
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode */
    }
    document.documentElement.lang = next;
  }, []);
  const t = useCallback<I18n['t']>(
    (key, vars) => {
      const template = dictionaries[lang][key] ?? dictionaries.uz[key] ?? key;
      if (!vars) return template;
      return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
    },
    [lang],
  );
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useT() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('I18nProvider missing');
  return ctx;
}
/** Server xato kodini foydalanuvchiga tushunarli matnga aylantiradi. */
export function errorMessage(t: I18n['t'], code: string, status?: number) {
  const key = `error.${code}`;
  const text = t(key);
  if (text !== key) return text;
  if (status === 403) return t('error.FORBIDDEN');
  if (status === 404) return t('error.NOT_FOUND');
  if (status === 409) return t('error.CONFLICT');
  if (status === 422 || status === 400) return t('error.VALIDATION_ERROR');
  if (status && status >= 500) return t('error.INTERNAL_ERROR');
  return t('error.UNKNOWN', { code });
}
