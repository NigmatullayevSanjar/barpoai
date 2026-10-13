import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { mergeRefs, setNativeValue, usePopover, watchValue } from './popover';

export type SelectControlProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  size?: 'md' | 'sm';
};
type Item = { value: string; label: string; disabled: boolean; group: string | null };
type Shown = { text: string; empty: boolean; value: string };

/** Shundan ko'p variant bo'lsa ro'yxat tepasida qidiruv maydoni chiqadi. */
const SEARCH_FROM = 8;

/** Variantlar haqiqiy <select>'dan o'qiladi: <optgroup>, fragment va shartli render'lar ham ishlaydi. */
function readOptions(sel: HTMLSelectElement): Item[] {
  return Array.from(sel.options)
    .filter((o) => !o.hidden)
    .map((o) => {
      const group = o.parentElement instanceof HTMLOptGroupElement ? o.parentElement : null;
      return {
        value: o.value,
        label: o.label,
        disabled: o.disabled || Boolean(group?.disabled),
        group: group?.label ?? null,
      };
    });
}
const filterItems = (items: Item[], query: string) => {
  const q = query.trim().toLocaleLowerCase();
  return q ? items.filter((i) => i.label.toLocaleLowerCase().includes(q)) : items;
};
const firstEnabled = (items: Item[]) => items.findIndex((i) => !i.disabled);
const sameItems = (a: Item[], b: Item[]) =>
  a.length === b.length &&
  a.every(
    (x, i) =>
      x.value === b[i].value &&
      x.label === b[i].label &&
      x.disabled === b[i].disabled &&
      x.group === b[i].group,
  );

/**
 * Figma ko'rinishidagi tanlov. Haqiqiy, label'langan va fokus oladigan element — shaffof <select>
 * (klaviatura, Tab, `register`, Playwright `selectOption` shu bilan ishlaydi); ko'rinadigan qism —
 * unga ustma-ust qo'yilgan tugma, ro'yxat esa portal orqali chiqadi.
 */
export const SelectControl = forwardRef<HTMLSelectElement, SelectControlProps>(function SelectControl(
  { size = 'md', className = '', children, onKeyDown, ...rest },
  ref,
) {
  const { t } = useT();
  const native = useRef<HTMLSelectElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  /** Faol qator klaviatura/ochilish tufayli o'zgargan: ro'yxat uni ko'rsatish uchun suriladi. */
  const reveal = useRef(false);
  const [shown, setShown] = useState<Shown>({ text: '', empty: true, value: '' });
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const sm = size === 'sm';

  const sync = useCallback(() => {
    const el = native.current;
    if (!el) return;
    const o = el.options[el.selectedIndex];
    const next: Shown = { text: o?.label ?? '', empty: !o || o.value === '', value: el.value };
    setShown((p) => (p.text === next.text && p.empty === next.empty && p.value === next.value ? p : next));
  }, []);
  // Har chizishdan keyin: sarlavha va (ochiq bo'lsa) variantlar haqiqiy <select> bilan tenglashtiriladi.
  useLayoutEffect(() => {
    sync();
    const el = native.current;
    if (open && el) {
      const next = readOptions(el);
      setItems((p) => (sameItems(p, next) ? p : next));
    }
  });
  // Hodisalar va `el.value = …` (react-hook-form reset/setValue) orqali kelgan o'zgarishlar ham sarlavhaga tushadi.
  useLayoutEffect(() => {
    const el = native.current;
    if (!el) return;
    // `change` document'da (React'ning o'z ishlovchisidan keyin) tinglanadi: <select>'ning o'zida darhol
    // setState qilinsa React boshqariladigan qiymatni hodisa tugamasidan eskisiga qaytarib qo'yadi
    // (strelka yoki harf bilan tanlashda brauzer `input` va `change`ni ketma-ket chiqaradi).
    const onChange = (e: Event) => e.target === el && sync();
    document.addEventListener('change', onChange);
    const unwatch = watchValue(el, sync);
    return () => {
      document.removeEventListener('change', onChange);
      unwatch();
    };
  }, [sync]);

  const hasSearch = items.length > SEARCH_FROM;
  const visible = useMemo(() => filterItems(items, query), [items, query]);

  const dismiss = useCallback((why: 'outside' | 'escape') => {
    setOpen(false);
    if (why === 'escape') native.current?.focus();
  }, []);
  const pos = usePopover(open, anchor, pop, dismiss, 240);

  const toggle = () => {
    const el = native.current;
    if (!el || rest.disabled) return;
    if (open) {
      setOpen(false);
      return;
    }
    el.focus();
    const next = readOptions(el);
    setItems(next);
    setQuery('');
    reveal.current = true;
    setActive(
      Math.max(
        next.findIndex((i) => i.value === el.value && !i.disabled),
        firstEnabled(next),
      ),
    );
    setOpen(true);
  };
  const pick = (item: Item) => {
    const el = native.current;
    if (!el || item.disabled) return;
    if (el.value !== item.value) setNativeValue(el, item.value, ['input', 'change']);
    setOpen(false);
    el.focus();
  };
  const move = (delta: number, to?: 'first' | 'last') => {
    const enabled = visible.map((_, i) => i).filter((i) => !visible[i].disabled);
    if (!enabled.length) return;
    reveal.current = true;
    if (to) {
      setActive(to === 'first' ? enabled[0] : enabled[enabled.length - 1]);
      return;
    }
    const at = enabled.indexOf(active);
    setActive(enabled[Math.max(0, Math.min(at === -1 ? 0 : at + delta, enabled.length - 1))]);
  };
  const onKeys = (e: KeyboardEvent<HTMLElement>, inSearch: boolean) => {
    if (!open) {
      if (
        e.key === ' ' ||
        e.key === 'Enter' ||
        (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp'))
      ) {
        e.preventDefault();
        toggle();
      }
      return;
    }
    if (e.key === 'Tab') {
      // Qidiruv maydonidan Tab bosilsa tartib asl <select>'dan davom etadi.
      if (inSearch) native.current?.focus();
      setOpen(false);
      return;
    }
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (step) {
      e.preventDefault();
      move(step);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      move(0, e.key === 'Home' ? 'first' : 'last');
    } else if (e.key === 'Enter' || (e.key === ' ' && !inSearch)) {
      e.preventDefault();
      if (visible[active]) pick(visible[active]);
    }
  };

  // Ochilganda (joylashgach): qidiruv maydoni bo'lsa unga fokus beriladi.
  const placed = pos !== null;
  useEffect(() => {
    if (open && placed && hasSearch) searchBox.current?.focus();
  }, [open, placed, hasSearch]);
  // Faol (ochilganda — tanlangan) qator ko'rinadigan joyga suriladi.
  useLayoutEffect(() => {
    const box = list.current;
    if (!reveal.current || !placed || !box) return;
    reveal.current = false;
    const row = box.querySelector<HTMLElement>(`[data-i="${active}"]`);
    if (!row) return;
    if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight)
      box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight;
  }, [active, placed, visible]);

  let lastGroup: string | null = null;
  return (
    <div ref={anchor} className={`select-wrap ${sm ? 'select-wrap-sm' : ''}`}>
      <select
        ref={mergeRefs(ref, native)}
        className={`select ${sm ? 'select-sm' : ''} ${className}`}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (!e.defaultPrevented) onKeys(e, false);
        }}
        {...rest}
      >
        {children}
      </select>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="select-trigger"
        data-open={open || undefined}
        disabled={rest.disabled}
        // Fokus tugmaga emas, haqiqiy <select>'ga o'tadi.
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
      >
        <span className={`select-value ${shown.empty ? 'placeholder' : ''}`}>{shown.text}</span>
        <ChevronDown />
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            className="select-pop"
            style={
              pos
                ? {
                    left: pos.left,
                    top: pos.top,
                    bottom: pos.bottom,
                    minWidth: pos.width,
                    maxHeight: pos.maxHeight,
                  }
                : { left: 0, top: 0, visibility: 'hidden' }
            }
            // Fokus (qidiruv maydonidan tashqari) ketmasin; portaldagi hodisalar React daraxti bo'ylab
            // yuqoriga (qator, label) chiqib ketmasin.
            onMouseDown={(e) => {
              if (e.target !== searchBox.current) e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {hasSearch && (
              <div className="select-pop-search">
                <Search />
                <input
                  ref={searchBox}
                  type="text"
                  className="input"
                  autoComplete="off"
                  placeholder={t('common.search')}
                  aria-label={t('common.search')}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    // Qidiruv matni o'zgarsa birinchi mos variant faol bo'ladi.
                    setActive(firstEnabled(filterItems(items, e.target.value)));
                  }}
                  onKeyDown={(e) => onKeys(e, true)}
                />
              </div>
            )}
            <div ref={list} className="select-list" role="listbox">
              {visible.length === 0 && <div className="select-empty">{t('common.no_results')}</div>}
              {visible.map((it, i) => {
                const header = it.group !== null && it.group !== lastGroup;
                lastGroup = it.group;
                return (
                  <Fragment key={`${it.group}:${it.value}:${i}`}>
                    {header && <div className="select-group">{it.group}</div>}
                    <div
                      role="option"
                      data-i={i}
                      aria-selected={it.value === shown.value}
                      aria-disabled={it.disabled || undefined}
                      className={`select-opt ${i === active ? 'active' : ''} ${it.value === '' ? 'empty' : ''}`}
                      title={it.label}
                      onMouseEnter={() => !it.disabled && setActive(i)}
                      onClick={() => pick(it)}
                    >
                      <span className="select-opt-label">{it.label}</span>
                      {it.value === shown.value && <Check />}
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
});
