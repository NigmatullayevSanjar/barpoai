import {
  forwardRef,
  useEffect,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Inbox, Search, X } from 'lucide-react';
import { useT } from '@/lib/i18n';

/* ---------------- Button ---------------- */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
};
export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  block,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''} ${block ? 'btn-block' : ''} ${!children ? 'btn-icon' : ''} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/* ---------------- Inputs ---------------- */
type FieldProps = {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
  id?: string;
};
export function Field({ label, error, hint, required, className = '', children, id }: FieldProps) {
  return (
    <div className={`field ${className}`}>
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
          {required && (
            <span className="req" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </div>
  );
}
type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  icon?: ReactNode;
  suffix?: ReactNode;
  wrapClassName?: string;
};
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, icon, suffix, required, wrapClassName, className = '', id, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const control = (
    <input
      ref={ref}
      id={inputId}
      className={`input ${className}`}
      aria-invalid={error ? 'true' : undefined}
      required={required}
      {...rest}
    />
  );
  return (
    <Field label={label} error={error} hint={hint} required={required} id={inputId} className={wrapClassName}>
      {icon || suffix ? (
        <div className="input-wrap">
          {icon}
          {control}
          {suffix && <span className="input-suffix">{suffix}</span>}
        </div>
      ) : (
        control
      )}
    </Field>
  );
});
type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  wrapClassName?: string;
};
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, required, wrapClassName, className = '', id, children, ...rest },
  ref,
) {
  const auto = useId();
  const selectId = id ?? auto;
  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      required={required}
      id={selectId}
      className={wrapClassName}
    >
      <select
        ref={ref}
        id={selectId}
        className={`select ${className}`}
        aria-invalid={error ? 'true' : undefined}
        required={required}
        {...rest}
      >
        {children}
      </select>
    </Field>
  );
});
type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  wrapClassName?: string;
};
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, required, wrapClassName, className = '', id, ...rest },
  ref,
) {
  const auto = useId();
  const areaId = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} required={required} id={areaId} className={wrapClassName}>
      <textarea
        ref={ref}
        id={areaId}
        className={`textarea ${className}`}
        aria-invalid={error ? 'true' : undefined}
        required={required}
        {...rest}
      />
    </Field>
  );
});
export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const { t } = useT();
  return (
    <div className="input-wrap">
      <Search />
      <input
        type="search"
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t('common.search')}
        aria-label={placeholder ?? t('common.search')}
      />
    </div>
  );
}
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <span className="row">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className="switch"
        disabled={disabled}
        onClick={() => onChange(!checked)}
      />
      {label && <span className="text-sm">{label}</span>}
    </span>
  );
}

/* ---------------- Badge ---------------- */
export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${tone === 'neutral' ? '' : `badge-${tone}`}`}>{children}</span>;
}

/* ---------------- Alert ---------------- */
export function Alert({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  children: ReactNode;
}) {
  const Icon =
    tone === 'danger'
      ? AlertCircle
      : tone === 'warning'
        ? AlertTriangle
        : tone === 'success'
          ? CheckCircle2
          : Info;
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon />
      <div>{children}</div>
    </div>
  );
}

/* ---------------- States ---------------- */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="state">
      {icon ?? <Inbox />}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useT();
  return (
    <div className="state">
      <AlertCircle style={{ color: 'var(--danger)' }} />
      <h3>{t('common.error_title')}</h3>
      <p>{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}
export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack" aria-busy="true" style={{ padding: 16 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ width: `${90 - (i % 3) * 15}%` }} />
      ))}
    </div>
  );
}
export function Spinner() {
  return <span className="spinner" aria-label="loading" />;
}

/* ---------------- Modal / Drawer ---------------- */
type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
  drawer?: boolean;
};
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  drawer,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className={`overlay ${drawer ? 'drawer-overlay' : ''}`} onMouseDown={onClose}>
      <div
        className={`modal ${drawer ? 'drawer' : size === 'lg' ? 'modal-lg' : size === 'xl' ? 'modal-xl' : ''}`}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <Button variant="ghost" size="sm" aria-label="close" onClick={onClose} icon={<X />} />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  danger,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  const { t } = useT();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      {message && <p>{message}</p>}
    </Modal>
  );
}

/* ---------------- Page header ---------------- */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
}) {
  return (
    <>
      {breadcrumbs && <div className="breadcrumbs">{breadcrumbs}</div>}
      <div className="page-header">
        <div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
    </>
  );
}
export function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`card stat ${accent ? 'accent' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { key: T; label: ReactNode; count?: number }[];
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button key={it.key} role="tab" aria-selected={value === it.key} onClick={() => onChange(it.key)}>
          {it.label}
          {it.count !== undefined && <span className="muted"> · {it.count}</span>}
        </button>
      ))}
    </div>
  );
}
export function Segmented<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { key: T; label: ReactNode }[];
}) {
  return (
    <div className="segmented">
      {items.map((it) => (
        <button key={it.key} type="button" aria-pressed={value === it.key} onClick={() => onChange(it.key)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}
export function Avatar({ name, size }: { name: string; size?: 'sm' }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return <span className={`avatar ${size ?? ''}`}>{initials || '?'}</span>;
}
export function Pagination({
  offset,
  limit,
  count,
  onChange,
}: {
  offset: number;
  limit: number;
  count: number;
  onChange: (offset: number) => void;
}) {
  const { t } = useT();
  const page = Math.floor(offset / limit) + 1;
  const hasNext = count >= limit;
  return (
    <div className="table-footer">
      <span>{t('common.page', { page })}</span>
      <span className="row">
        <Button
          size="sm"
          variant="secondary"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          {t('common.prev')}
        </Button>
        <Button size="sm" variant="secondary" disabled={!hasNext} onClick={() => onChange(offset + limit)}>
          {t('common.next')}
        </Button>
      </span>
    </div>
  );
}
/** Oddiy boshqariladigan ro'yxat holati: qidiruv + sahifalash */
export function useListState(limit = 30) {
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  return {
    search,
    setSearch: (v: string) => {
      setSearch(v);
      setOffset(0);
    },
    offset,
    setOffset,
    limit,
  };
}
