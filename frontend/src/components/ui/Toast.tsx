import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

type Kind = 'info' | 'success' | 'error';
type Toast = { id: number; kind: Kind; text: string };
type Api = {
  toast: (text: string, kind?: Kind) => void;
  success: (text: string) => void;
  error: (text: string) => void;
};
const Ctx = createContext<Api | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const toast = useCallback((text: string, kind: Kind = 'info') => {
    const id = ++seq.current;
    setItems((list) => [...list, { id, kind, text }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);
  const api = useMemo<Api>(
    () => ({
      toast,
      success: (t) => toast(t, 'success'),
      error: (t) => toast(t, 'error'),
    }),
    [toast],
  );
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} role="status">
            <span>{t.text}</span>
            <button aria-label="Yopish" onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('ToastProvider missing');
  return ctx;
}
