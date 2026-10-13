import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { mergeRefs, setNativeValue, usePopover, watchValue } from './popover';

/* ---------- Sana yordamchilari: qiymat har doim ISO "YYYY-MM-DD" (yoki ''), ko'rinishi "DD.MM.YYYY" ---------- */
const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = (iso: string) => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
function validIso(y: number, m: number, d: number) {
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1) return null;
  return d > new Date(y, m, 0).getDate() ? null : `${y}-${pad(m)}-${pad(d)}`;
}
/** "DD.MM.YYYY" (nuqta, chiziq yoki "/" bilan) va "YYYY-MM-DD" qabul qilinadi; boshqasi — null. */
function parseDate(text: string) {
  const s = text.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return validIso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  return m ? validIso(+m[3], +m[2], +m[1]) : null;
}
/** Tashqaridan kelgan qiymatdan to'g'ri ISO sanani ajratadi (vaqt qismi bo'lsa tashlanadi), aks holda ''. */
function normIso(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return (m && validIso(+m[1], +m[2], +m[3])) || '';
}
const toDisplay = (iso: string) => (iso ? `${iso.slice(8)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
const clamp = (iso: string, min?: string, max?: string) =>
  min && iso < min ? min : max && iso > max ? max : iso;

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'min' | 'max'> & {
  min?: string;
  max?: string;
};

/**
 * Sana maydoni (Figma ko'rinishi). Formaga ketadigan qiymat o'zgarmagan: ISO "YYYY-MM-DD" yoki ''.
 * `ref`, `name`, `value`, `defaultValue`, `onChange`, `onBlur` ko'rinmas matn <input>'iga beriladi
 * (react-hook-form `register`, `reset`, `setValue` va boshqariladigan ishlatish shu orqali ishlaydi);
 * ko'rinadigan <input> `id` oladi (label unga bog'lanadi). Tanlangan sana ko'rinmas inputga
 * `input` hodisasi bilan yoziladi.
 */
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  {
    id,
    name,
    value,
    defaultValue,
    onChange,
    onBlur,
    onKeyDown,
    min,
    max,
    required,
    disabled,
    readOnly,
    placeholder,
    className = '',
    style,
    ...rest
  },
  ref,
) {
  const { t } = useT();
  const hidden = useRef<HTMLInputElement>(null);
  const visible = useRef<HTMLInputElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  /** Ko'rinmas inputdagi oxirgi qiymat: matn faqat u tashqaridan o'zgarganda yangilanadi. */
  const lastIso = useRef<string | null>(null);
  const [text, setText] = useState('');
  /** Ko'rinmas inputdagi to'g'ri ISO qiymat (kalendarda belgilanadi). */
  const [committed, setCommitted] = useState('');
  const [open, setOpen] = useState(false);

  const sync = useCallback(() => {
    const raw = hidden.current?.value ?? '';
    if (raw === lastIso.current) return;
    lastIso.current = raw;
    const iso = normIso(raw);
    setCommitted(iso);
    setText(toDisplay(iso));
  }, []);
  // Har chizishdan keyin va `reset()`/`setValue()` kabi dasturiy o'zgarishlarda matn qayta o'qiladi.
  useLayoutEffect(() => {
    sync();
  });
  useLayoutEffect(() => {
    const el = hidden.current;
    if (!el) return;
    el.addEventListener('input', sync);
    const unwatch = watchValue(el, sync);
    // register() xatoda birinchi maydonni `ref.focus()` bilan ochadi: fokus ko'rinadigan inputga o'tadi.
    el.focus = () => visible.current?.focus();
    return () => {
      el.removeEventListener('input', sync);
      unwatch();
      Reflect.deleteProperty(el, 'focus');
    };
  }, [sync]);

  const inRange = (iso: string) => (!min || iso >= min) && (!max || iso <= max);
  const commit = (iso: string) => {
    const el = hidden.current;
    if (!el) return;
    lastIso.current = iso;
    if (el.value !== iso) setNativeValue(el, iso, ['input']);
    setCommitted(iso);
    setText(toDisplay(iso));
  };
  const finish = (iso: string) => {
    commit(iso);
    setOpen(false);
    visible.current?.focus();
  };

  const onType = (e: ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value;
    // "12" → "12.", "12.05" → "12.05." (faqat yozishda, o'chirishda emas)
    if (v.length > text.length && /^\d{2}(\.\d{2})?$/.test(v)) v += '.';
    setText(v);
    const iso = parseDate(v);
    if (iso && inRange(iso)) commit(iso);
    else if (v.trim() === '' && !required) commit('');
  };
  const onBlurText = (e: FocusEvent<HTMLInputElement>) => {
    const to = e.relatedTarget as Node | null;
    if (to && (anchor.current?.contains(to) || pop.current?.contains(to))) return;
    const iso = parseDate(text);
    if (iso && inRange(iso)) commit(iso);
    else if (text.trim() === '' && !required) commit('');
    else setText(toDisplay(committed));
    // register()'ning onBlur'i (touched/validatsiya) ko'rinmas input nomidan chaqiriladi.
    hidden.current?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  };
  const onKeys = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || disabled || readOnly || open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const dismiss = useCallback((why: 'outside' | 'escape') => {
    setOpen(false);
    if (why === 'escape') visible.current?.focus();
  }, []);
  const pos = usePopover(open, anchor, pop, dismiss, 340);

  return (
    <div ref={anchor} className="date-wrap" style={style}>
      <input
        {...rest}
        ref={visible}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        className={`input date-input ${className}`}
        value={text}
        placeholder={placeholder ?? t('ui.date.placeholder')}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        onChange={onType}
        onBlur={onBlurText}
        onKeyDown={onKeys}
      />
      <button
        type="button"
        className="date-btn"
        aria-label={t('ui.date.open')}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled || readOnly}
        onClick={() => setOpen((o) => !o)}
      >
        <CalendarDays />
      </button>
      <input
        ref={mergeRefs(ref, hidden)}
        type="text"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange ?? (() => {})}
        onBlur={onBlur}
        disabled={disabled}
        readOnly={readOnly}
      />
      {open &&
        createPortal(
          <div
            ref={pop}
            className="date-pop"
            role="dialog"
            aria-label={t('ui.date.open')}
            style={
              pos
                ? { left: pos.left, top: pos.top, bottom: pos.bottom }
                : { left: 0, top: 0, visibility: 'hidden' }
            }
            // Fokus kiritish maydonida qolsin; portaldagi hodisalar React daraxti bo'ylab yuqoriga chiqmasin.
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Calendar
              value={committed}
              min={min}
              max={max}
              ready={pos !== null}
              canClear={!required}
              onPick={finish}
            />
          </div>,
          document.body,
        )}
    </div>
  );
});

/* ---------- Kalendar ---------- */
function Calendar({
  value,
  min,
  max,
  ready,
  canClear,
  onPick,
}: {
  value: string;
  min?: string;
  max?: string;
  /** Ro'yxat joylashib ko'ringach fokus kunga o'tadi. */
  ready: boolean;
  canClear: boolean;
  onPick: (iso: string) => void;
}) {
  const { t } = useT();
  const today = isoOf(new Date());
  const start = value || clamp(today, min, max);
  const [view, setView] = useState(() => ({ y: +start.slice(0, 4), m: +start.slice(5, 7) - 1 }));
  const [cursor, setCursor] = useState(start);
  const grid = useRef<HTMLDivElement>(null);
  const focusDay = useRef(true);

  const first = new Date(view.y, view.m, 1);
  const lead = (first.getDay() + 6) % 7; // hafta dushanbadan boshlanadi
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(view.y, view.m, 1 - lead + i);
    return { iso: isoOf(d), day: d.getDate(), out: d.getMonth() !== view.m };
  });
  const tabIso = cells.some((c) => c.iso === cursor) ? cursor : isoOf(first);
  const off = (iso: string) => Boolean((min && iso < min) || (max && iso > max));

  useEffect(() => {
    if (!ready || !focusDay.current) return;
    focusDay.current = false;
    grid.current?.querySelector<HTMLElement>(`[data-iso="${tabIso}"]`)?.focus();
  });
  const shiftView = (months: number) =>
    setView((v) => {
      const d = new Date(v.y, v.m + months, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const goTo = (d: Date) => {
    focusDay.current = true;
    setCursor(isoOf(d));
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };
  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = dateOf(tabIso);
    const days = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<
      string,
      number | undefined
    >;
    if (days[e.key] !== undefined) {
      e.preventDefault();
      goTo(new Date(d.getFullYear(), d.getMonth(), d.getDate() + (days[e.key] ?? 0)));
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const months = (e.key === 'PageUp' ? -1 : 1) * (e.shiftKey ? 12 : 1);
      const last = new Date(d.getFullYear(), d.getMonth() + months + 1, 0).getDate();
      goTo(new Date(d.getFullYear(), d.getMonth() + months, Math.min(d.getDate(), last)));
    }
  };

  return (
    <>
      <div className="cal-head">
        <button type="button" aria-label={t('ui.date.prev_year')} onClick={() => shiftView(-12)}>
          <ChevronsLeft />
        </button>
        <button type="button" aria-label={t('ui.date.prev_month')} onClick={() => shiftView(-1)}>
          <ChevronLeft />
        </button>
        <span className="cal-title" aria-live="polite">
          {t(`ui.date.m${view.m + 1}`)} {view.y}
        </span>
        <button type="button" aria-label={t('ui.date.next_month')} onClick={() => shiftView(1)}>
          <ChevronRight />
        </button>
        <button type="button" aria-label={t('ui.date.next_year')} onClick={() => shiftView(12)}>
          <ChevronsRight />
        </button>
      </div>
      <div className="cal-grid cal-week" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i}>{t(`ui.date.d${i + 1}`)}</span>
        ))}
      </div>
      <div ref={grid} className="cal-grid" onKeyDown={onGridKey}>
        {cells.map((c) => (
          <button
            key={c.iso}
            type="button"
            data-iso={c.iso}
            tabIndex={c.iso === tabIso ? 0 : -1}
            aria-label={toDisplay(c.iso)}
            aria-pressed={c.iso === value}
            aria-disabled={off(c.iso) || undefined}
            aria-current={c.iso === today ? 'date' : undefined}
            className={`cal-day ${c.out ? 'out' : ''} ${c.iso === today ? 'today' : ''} ${c.iso === value ? 'sel' : ''}`}
            onClick={() => !off(c.iso) && onPick(c.iso)}
          >
            {c.day}
          </button>
        ))}
      </div>
      <div className="cal-foot">
        <button
          type="button"
          aria-disabled={off(today) || undefined}
          onClick={() => !off(today) && onPick(today)}
        >
          {t('ui.date.today')}
        </button>
        {canClear && (
          <button type="button" className="muted" onClick={() => onPick('')}>
            {t('ui.date.clear')}
          </button>
        )}
      </div>
    </>
  );
}
