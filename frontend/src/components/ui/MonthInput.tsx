import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { mergeRefs, setNativeValue, usePopover, watchValue } from './popover';

/* ---------- Oy yordamchilari: qiymat har doim "YYYY-MM" (yoki ''), ko'rinishi "Oktyabr 2026" ---------- */
const pad = (n: number) => String(n).padStart(2, '0');
const ymOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
/** Tashqaridan kelgan qiymatdan "YYYY-MM" ni ajratadi ("YYYY-MM-DD" ham qabul qilinadi), aks holda ''. */
function normYm(v: string) {
  const m = /^(\d{4})-(\d{2})/.exec(v);
  return m && +m[2] >= 1 && +m[2] <= 12 ? `${m[1]}-${m[2]}` : '';
}
const clamp = (ym: string, min?: string, max?: string) =>
  min && ym < min ? min : max && ym > max ? max : ym;

type MonthInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'min' | 'max'> & {
  /** "YYYY-MM" (yoki "YYYY-MM-DD") */
  min?: string;
  max?: string;
};

/**
 * Oy maydoni (brauzerning o'z type="month" oynasi o'rniga — sayt dizaynidagi tanlagich). Formaga ketadigan
 * qiymat o'zgarmagan: "YYYY-MM" yoki ''. DateInput kabi: `ref`, `name`, `value`, `defaultValue`, `onChange`,
 * `onBlur` ko'rinmas matn <input>'iga beriladi (react-hook-form va boshqariladigan ishlatish shu orqali ishlaydi);
 * ko'rinadigan <input> faqat o'qish uchun — bosilganda yoki ArrowDown/Space bilan tanlagich ochiladi.
 */
export const MonthInput = forwardRef<HTMLInputElement, MonthInputProps>(function MonthInput(
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
  /** Ko'rinmas inputdagi oxirgi qiymat: holat faqat u tashqaridan o'zgarganda yangilanadi. */
  const lastYm = useRef<string | null>(null);
  const [committed, setCommitted] = useState('');
  const [open, setOpen] = useState(false);
  const minYm = min ? normYm(min) || undefined : undefined;
  const maxYm = max ? normYm(max) || undefined : undefined;

  const sync = useCallback(() => {
    const raw = hidden.current?.value ?? '';
    if (raw === lastYm.current) return;
    lastYm.current = raw;
    setCommitted(normYm(raw));
  }, []);
  // Har chizishdan keyin va `reset()`/`setValue()` kabi dasturiy o'zgarishlarda qiymat qayta o'qiladi.
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

  const commit = (ym: string) => {
    const el = hidden.current;
    if (!el) return;
    lastYm.current = ym;
    if (el.value !== ym) setNativeValue(el, ym, ['input']);
    setCommitted(ym);
  };
  const finish = (ym: string) => {
    commit(ym);
    setOpen(false);
    visible.current?.focus();
  };
  const toggle = () => {
    if (!disabled && !readOnly) setOpen((o) => !o);
  };
  const onKeys = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || disabled || readOnly) return;
    if (e.key === 'ArrowDown' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && !required) {
      e.preventDefault();
      commit('');
    }
  };
  const onBlurText = (e: FocusEvent<HTMLInputElement>) => {
    const to = e.relatedTarget as Node | null;
    if (to && (anchor.current?.contains(to) || pop.current?.contains(to))) return;
    // register()'ning onBlur'i (touched/validatsiya) ko'rinmas input nomidan chaqiriladi.
    hidden.current?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  };

  const dismiss = useCallback((why: 'outside' | 'escape') => {
    setOpen(false);
    if (why === 'escape') visible.current?.focus();
  }, []);
  const pos = usePopover(open, anchor, pop, dismiss, 260);
  const text = committed ? `${t(`ui.date.m${Number(committed.slice(5, 7))}`)} ${committed.slice(0, 4)}` : '';

  return (
    <div ref={anchor} className="date-wrap" style={style}>
      <input
        {...rest}
        ref={visible}
        id={id}
        type="text"
        readOnly
        autoComplete="off"
        className={`input date-input month-input ${className}`}
        value={text}
        placeholder={placeholder ?? t('ui.month.placeholder')}
        required={required}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
        onBlur={onBlurText}
        onKeyDown={onKeys}
      />
      <button
        type="button"
        className="date-btn"
        tabIndex={-1}
        aria-label={t('ui.month.open')}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled || readOnly}
        onClick={toggle}
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
            aria-label={t('ui.month.open')}
            style={
              pos
                ? { left: pos.left, top: pos.top, bottom: pos.bottom }
                : { left: 0, top: 0, visibility: 'hidden' }
            }
            // Fokus maydonda qolsin; portaldagi hodisalar React daraxti bo'ylab yuqoriga chiqmasin.
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <MonthGrid
              value={committed}
              min={minYm}
              max={maxYm}
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

/* ---------- Yil sarlavhasi va 12 oy katakchasi ---------- */
function MonthGrid({
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
  /** Oyna joylashib ko'ringach fokus oyga o'tadi. */
  ready: boolean;
  canClear: boolean;
  onPick: (ym: string) => void;
}) {
  const { t } = useT();
  const thisMonth = ymOf(new Date());
  const start = value || clamp(thisMonth, min, max);
  const [year, setYear] = useState(() => +start.slice(0, 4));
  const [cursor, setCursor] = useState(start);
  const grid = useRef<HTMLDivElement>(null);
  const focusCell = useRef(true);

  const cells = Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);
  const tabYm = cursor.startsWith(`${year}-`) ? cursor : cells[0]!;
  const off = (ym: string) => Boolean((min && ym < min) || (max && ym > max));

  useEffect(() => {
    if (!ready || !focusCell.current) return;
    focusCell.current = false;
    grid.current?.querySelector<HTMLElement>(`[data-ym="${tabYm}"]`)?.focus();
  });
  const goTo = (y: number, m: number) => {
    const d = new Date(y, m, 1);
    focusCell.current = true;
    setCursor(ymOf(d));
    setYear(d.getFullYear());
  };
  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const y = +tabYm.slice(0, 4);
    const m = +tabYm.slice(5, 7) - 1;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 } as Record<
      string,
      number | undefined
    >;
    if (step[e.key] !== undefined) {
      e.preventDefault();
      goTo(y, m + (step[e.key] ?? 0));
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      goTo(y + (e.key === 'PageUp' ? -1 : 1), m);
    }
  };

  return (
    <>
      <div className="cal-head">
        <button type="button" aria-label={t('ui.date.prev_year')} onClick={() => setYear((y) => y - 1)}>
          <ChevronLeft />
        </button>
        <span className="cal-title" aria-live="polite">
          {year}
        </span>
        <button type="button" aria-label={t('ui.date.next_year')} onClick={() => setYear((y) => y + 1)}>
          <ChevronRight />
        </button>
      </div>
      <div ref={grid} className="cal-months" onKeyDown={onGridKey}>
        {cells.map((ym, i) => (
          <button
            key={ym}
            type="button"
            data-ym={ym}
            tabIndex={ym === tabYm ? 0 : -1}
            aria-label={`${t(`ui.date.m${i + 1}`)} ${year}`}
            aria-pressed={ym === value}
            aria-disabled={off(ym) || undefined}
            aria-current={ym === thisMonth ? 'date' : undefined}
            className={`cal-month${ym === thisMonth ? ' today' : ''}${ym === value ? ' sel' : ''}`}
            onClick={() => !off(ym) && onPick(ym)}
          >
            {t(`ui.date.m${i + 1}`)}
          </button>
        ))}
      </div>
      <div className="cal-foot">
        <button
          type="button"
          aria-disabled={off(thisMonth) || undefined}
          onClick={() => !off(thisMonth) && onPick(thisMonth)}
        >
          {t('ui.month.this')}
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
