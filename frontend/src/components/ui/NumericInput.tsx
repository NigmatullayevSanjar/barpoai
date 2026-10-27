import {
  forwardRef,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type FocusEvent,
  type InputHTMLAttributes,
} from 'react';
import { mergeRefs } from './popover';

/**
 * Raqam maydoni (egasi, 2026-10-26): ko'rinishda minglar bo'sh joy bilan ajraladi — "3 000 000", "65.40".
 * Forma va API ga qiymat bo'sh joysiz boradi (`onChange` da `e.target.value` = "3000000"), kasr belgisi
 * (nuqta yoki vergul) yozilganicha qoladi. Boshqariladigan (`value`) va `register()` (react-hook-form) bilan ishlaydi.
 */
const SEP = ' ';
const NUMBER = /^(-?)(\d+)([.,]\d*)?$/;
export const ungroupDigits = (v: string) => v.replace(/\s/g, '');
export function groupDigits(v: string) {
  const m = NUMBER.exec(v);
  if (!m) return v;
  return m[1]! + m[2]!.replace(/\B(?=(\d{3})+(?!\d))/g, SEP) + (m[3] ?? '');
}
/** Bo'sh joysiz `count` ta belgidan keyingi kursor o'rni. */
function caretAt(shown: string, count: number) {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < shown.length; i++) if (!/\s/.test(shown[i]!) && ++seen === count) return i + 1;
  return shown.length;
}
const countSolid = (v: string) => ungroupDigits(v).length;

type Props = InputHTMLAttributes<HTMLInputElement>;
export const NumericInput = forwardRef<HTMLInputElement, Props>(function NumericInput(
  { value, onChange, onBlur, placeholder, ...rest },
  ref,
) {
  const el = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);
  // register() rejimida oldingi qiymat (bo'sh joysiz) — ajratuvchini o'chirishni aniqlash uchun.
  const lastRaw = useRef('');
  const controlled = value !== undefined;
  // register() qiymatni DOM ga bo'sh joysiz yozadi (reset, defaultValues) — ko'rinish har renderda guruhlanadi.
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    if (!controlled) {
      lastRaw.current = ungroupDigits(node.value);
      const shown = groupDigits(node.value);
      if (shown !== node.value) node.value = shown;
    }
    if (caret.current !== null && document.activeElement === node) {
      const at = caretAt(node.value, caret.current);
      node.setSelectionRange(at, at);
    }
    caret.current = null;
  });
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const node = e.currentTarget;
    const typed = node.value;
    let before = countSolid(typed.slice(0, node.selectionStart ?? typed.length));
    let raw = ungroupDigits(typed);
    // Faqat ajratuvchi bo'sh joy o'chirilgan bo'lsa (Backspace/Delete) — yonidagi raqam o'chadi.
    const previous = controlled ? ungroupDigits(String(value)) : lastRaw.current;
    const inputType = (e.nativeEvent as InputEvent).inputType;
    if (raw === previous && typed.length < groupDigits(previous).length) {
      if (inputType === 'deleteContentBackward' && before > 0) {
        raw = raw.slice(0, before - 1) + raw.slice(before);
        before -= 1;
      } else if (inputType === 'deleteContentForward') raw = raw.slice(0, before) + raw.slice(before + 1);
    }
    node.value = raw;
    onChange?.(e);
    caret.current = before;
    if (!controlled) {
      lastRaw.current = raw;
      node.value = groupDigits(raw);
      const at = caretAt(node.value, before);
      node.setSelectionRange(at, at);
      caret.current = null;
    }
  };
  // register() blur'da qiymatni DOM dan o'qiydi — o'qish paytida bo'sh joysiz qiymat beriladi.
  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    if (controlled || !onBlur) return onBlur?.(e);
    const node = e.currentTarget;
    const shown = node.value;
    node.value = ungroupDigits(shown);
    onBlur(e);
    node.value = shown;
  };
  return (
    <input
      ref={mergeRefs(ref, el)}
      inputMode="decimal"
      {...rest}
      value={controlled ? groupDigits(String(value)) : undefined}
      placeholder={typeof placeholder === 'string' ? groupDigits(placeholder) : placeholder}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
});
