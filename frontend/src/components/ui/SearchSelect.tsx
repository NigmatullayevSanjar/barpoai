import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown } from 'lucide-react';
import { api, qs, type ListResponse } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Field, useDebounced } from './index';

const LIMIT = 50;
type Props<T> = {
  /** Ro'yxat endpointi, masalan '/v1/materials'; `q`, `limit` serverga qo'shiladi */
  path: string;
  /** Qo'shimcha server filtrlari (masalan { archived: false }) */
  params?: Record<string, string | number | boolean | undefined>;
  /** Tanlangan yozuv id'si; '' — tanlanmagan */
  value: string;
  /** Tanlangan yozuvning nomi (id ro'yxatdan tashqarida bo'lsa ham ko'rinishi uchun) */
  valueLabel?: string;
  onChange: (id: string, item: T | null) => void;
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  getSub?: (item: T) => ReactNode;
  label?: ReactNode;
  'aria-label'?: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  wrapClassName?: string;
  className?: string;
  /** Kiritish maydoni yoniga qo'yiladigan tugma (masalan, "yangi") */
  action?: ReactNode;
};
/**
 * Server qidiruvli tanlov (combobox): ro'yxat to'liq yuklanmaydi, har yozilgan matn uchun
 * `path?q=…&limit=50` so'raladi. Natija 50 ta bo'lsa "aniqroq yozing" izohi chiqadi.
 * Ro'yxat body'ga portal bilan chiqariladi (modal va jadvalning overflow'i kesmasin).
 */
export function SearchSelect<T>({
  path,
  params,
  value,
  valueLabel,
  onChange,
  getId,
  getLabel,
  getSub,
  label,
  hint,
  error,
  required,
  disabled,
  placeholder,
  wrapClassName,
  className = '',
  action,
  ...rest
}: Props<T>) {
  const { t } = useT();
  const id = useId();
  const listId = `${id}-list`;
  const anchor = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // Oxirgi tanlangan yozuv nomi: ota komponent `valueLabel` bermasa ham matn saqlanadi.
  const picked = useRef<{ id: string; label: string } | null>(null);
  const [text, setText] = useState(valueLabel ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState({ top: 0, left: 0, width: 0 });
  const q = useDebounced(text.trim());
  const labelFor = (v: string) =>
    v ? (valueLabel ?? (picked.current?.id === v ? picked.current.label : '')) : '';
  const close = () => {
    setOpen(false);
    setText(labelFor(value));
  };
  // Tashqaridan kelgan tanlov (masalan URL yoki yuklangan yozuv) matnga tushadi.
  useEffect(() => {
    if (!open) setText(labelFor(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, valueLabel]);
  // Tashqi bosish: capture bosqichida, chunki Modal o'z ichidagi mousedown'ni to'xtatadi.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!anchor.current?.contains(target) && !list.current?.contains(target)) close();
    };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value, valueLabel]);
  // Ro'yxat joylashuvi: kiritish maydoni ostida, scroll va o'lcham o'zgarganda qayta hisoblanadi.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (r) setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);
  // Tanlangan nom bilan bir xil matn uchun qidiruv shart emas: ro'yxat ochilganda hammasi ko'rinadi.
  const query = open && text.trim() !== labelFor(value) ? q : '';
  const results = useQuery({
    queryKey: ['search-select', path, params ?? null, query],
    queryFn: () => api<ListResponse<T>>(`${path}${qs({ ...(params ?? {}), q: query, limit: LIMIT })}`),
    enabled: open,
    staleTime: 30000,
  });
  const items = results.data?.items ?? [];
  const select = (item: T) => {
    picked.current = { id: getId(item), label: getLabel(item) };
    onChange(getId(item), item);
    setText(getLabel(item));
    setOpen(false);
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((a) => Math.max(0, Math.min(a + 1, items.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && open && items[active]) {
      e.preventDefault();
      select(items[active]);
    } else if (e.key === 'Escape' && open) {
      // Modal'ning Escape tinglovchisi butun oynani yopmasin.
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  return (
    <Field label={label} error={error} hint={hint} required={required} id={id} className={wrapClassName}>
      <div className={`combobox ${className}`}>
        <div className="row" style={{ gap: 4 }}>
          <div ref={anchor} className="combobox-anchor grow" data-open={open || undefined}>
            <ChevronDown />
            <input
              id={id}
              type="text"
              className="input"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-invalid={error ? 'true' : undefined}
              aria-label={rest['aria-label']}
              autoComplete="off"
              disabled={disabled}
              required={required}
              placeholder={placeholder ?? t('common.search')}
              value={text}
              onFocus={() => setOpen(true)}
              onClick={() => setOpen(true)}
              onKeyDown={onKey}
              onBlur={(e) => {
                // Tab bilan chiqib ketilsa ro'yxat yopiladi; sichqoncha bilan variant bosilganda ochiq qoladi.
                if (!list.current?.contains(e.relatedTarget as Node)) close();
              }}
              onChange={(e) => {
                setText(e.target.value);
                setOpen(true);
                setActive(0);
                if (value) onChange('', null);
              }}
            />
          </div>
          {action}
        </div>
        {open &&
          createPortal(
            <div
              ref={list}
              className="dropdown combobox-list"
              id={listId}
              role="listbox"
              style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
              // Variant bosilganda input blur bo'lib ro'yxat yopilmasin.
              onMouseDown={(e) => e.preventDefault()}
            >
              {results.isLoading ? (
                <div className="item muted">{t('common.loading')}</div>
              ) : results.isError ? (
                <div className="item muted">{t('common.error_title')}</div>
              ) : items.length === 0 ? (
                <div className="item muted">{t('common.no_results')}</div>
              ) : (
                items.map((item, i) => (
                  <button
                    key={getId(item)}
                    type="button"
                    role="option"
                    aria-selected={getId(item) === value}
                    className={`item ${i === active ? 'active' : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => select(item)}
                  >
                    <span className="grow">
                      <span className="cell-main">{getLabel(item)}</span>
                      {getSub && <span className="cell-sub">{getSub(item)}</span>}
                    </span>
                    {getId(item) === value && <Check />}
                  </button>
                ))
              )}
              {items.length >= LIMIT && <div className="item muted">{t('common.search_more')}</div>}
            </div>,
            document.body,
          )}
      </div>
    </Field>
  );
}
