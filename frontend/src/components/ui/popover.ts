import { useEffect, useLayoutEffect, useState, type Ref, type RefObject } from 'react';

/** forwardRef va ichki ref'ni birlashtiradi. */
export function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as { current: T | null }).current = node;
    }
  };
}

/**
 * Qiymatni React'dan tashqarida o'rnatish: `value` setter'i orqali (React kuzatuvchisini chetlab o'tadi),
 * so'ng `input`/`change` hodisasi chiqariladi. Shunda `register()` va boshqariladigan `onChange` ishlaydi.
 */
export function setNativeValue(el: HTMLInputElement | HTMLSelectElement, value: string, events: string[]) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  for (const type of events) el.dispatchEvent(new Event(type, { bubbles: true }));
}

/**
 * `el.value = x` ko'rinishidagi dasturiy o'zgarishni (react-hook-form `reset`/`setValue`) kuzatadi:
 * bunda hech qanday hodisa chiqmaydi va komponent qayta chizilmasligi mumkin.
 * Qaytgan funksiya kuzatuvni olib tashlaydi.
 */
export function watchValue(el: HTMLInputElement | HTMLSelectElement, onSet: () => void) {
  const own = Object.getOwnPropertyDescriptor(el, 'value');
  const desc = own ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
  if (!desc?.get || !desc.set) return () => {};
  const { get, set } = desc;
  Object.defineProperty(el, 'value', {
    configurable: true,
    enumerable: desc.enumerable,
    get() {
      return get.call(this);
    },
    set(v: string) {
      set.call(this, v);
      onSet();
    },
  });
  return () => {
    if (own) Object.defineProperty(el, 'value', own);
    else Reflect.deleteProperty(el, 'value');
  };
}

export type PopPos = { left: number; width: number; top?: number; bottom?: number; maxHeight: number };

/**
 * Portal orqali chiqadigan ro'yxat/kalendar: maydon ostida (joy yetmasa ustida) joylashadi,
 * tashqariga bosish va Escape bilan yopiladi. `pos` null bo'lsa hali o'lchanmagan.
 * `minSpace` — pastda shuncha piksel joy bo'lmasa va tepada ko'proq bo'lsa, ustiga o'tadi.
 */
export function usePopover(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  pop: RefObject<HTMLElement | null>,
  onDismiss: (reason: 'outside' | 'escape') => void,
  minSpace: number,
) {
  const [pos, setPos] = useState<PopPos | null>(null);
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      if (!a) return;
      const below = window.innerHeight - a.bottom - 12;
      const above = a.top - 12;
      const flip = below < minSpace && above > below;
      const width = pop.current?.offsetWidth ?? a.width;
      const left = Math.max(8, Math.min(a.left, window.innerWidth - width - 8));
      const next: PopPos = flip
        ? {
            left,
            width: a.width,
            bottom: window.innerHeight - a.top + 4,
            maxHeight: Math.min(above - 4, 360),
          }
        : { left, width: a.width, top: a.bottom + 4, maxHeight: Math.min(below - 4, 360) };
      setPos((prev) =>
        prev &&
        prev.left === next.left &&
        prev.width === next.width &&
        prev.top === next.top &&
        prev.bottom === next.bottom &&
        prev.maxHeight === next.maxHeight
          ? prev
          : next,
      );
    };
    // Ro'yxatning o'zi scroll bo'lganda qayta joylashtirilmaydi.
    const onScroll = (e: Event) => {
      if (!pop.current?.contains(e.target as Node)) place();
    };
    place();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, anchor, pop, minSpace]);
  useEffect(() => {
    if (!open) return;
    // Capture bosqichida: Modal o'z ichidagi mousedown'ni to'xtatadi, Escape esa butun oynani yopadi.
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!anchor.current?.contains(target) && !pop.current?.contains(target)) onDismiss('outside');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onDismiss('escape');
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, anchor, pop, onDismiss]);
  return pos;
}
