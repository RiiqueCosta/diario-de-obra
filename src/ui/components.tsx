import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Icon, type IconName } from './Icon'
import type { AppError } from '@/lib/errors'

// ---------------------------------------------------------------- botões
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'lg' | 'sm'
  icon?: IconName
  loading?: boolean
  block?: boolean
}
export function Button({ variant = 'primary', size = 'md', icon, loading, block, children, className = '', disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant} btn-${size}${block ? ' btn-block' : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden /> : icon ? <Icon name={icon} size={18} /> : null}
      {children && <span>{children}</span>}
    </button>
  )
}

// ---------------------------------------------------------------- campos
type FieldProps = { label: string; error?: string; hint?: string; required?: boolean; children: (id: string, describedBy?: string) => ReactNode; className?: string }
export function Field({ label, error, hint, required, children, className = '' }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-err` : undefined
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined
  return (
    <div className={`field ${error ? 'field-invalid' : ''} ${className}`}>
      <label htmlFor={id}>{label}{required && <span className="req" aria-hidden> *</span>}</label>
      {children(id, describedBy)}
      {hint && !error && <p className="field-hint" id={hintId}>{hint}</p>}
      {error && <p className="field-error" id={errId} role="alert">{error}</p>}
    </div>
  )
}

type InputFieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }
export function TextField({ label, error, hint, required, className, ...rest }: InputFieldProps) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {(id, describedBy) => <input id={id} aria-invalid={!!error || undefined} aria-describedby={describedBy} required={required} {...rest} />}
    </Field>
  )
}

type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string }
export function TextAreaField({ label, error, hint, required, className, rows = 3, ...rest }: TextAreaFieldProps) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {(id, describedBy) => <textarea id={id} rows={rows} aria-invalid={!!error || undefined} aria-describedby={describedBy} required={required} {...rest} />}
    </Field>
  )
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: string; options: Array<{ value: string; label: string }>; placeholder?: string }
export function SelectField({ label, error, hint, required, options, placeholder, className, ...rest }: SelectFieldProps) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {(id, describedBy) => (
        <select id={id} aria-invalid={!!error || undefined} aria-describedby={describedBy} required={required} {...rest}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  )
}

export function Checkbox({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId()
  return (
    <div className="check">
      <input type="checkbox" id={id} {...rest} />
      <label htmlFor={id}>{label}{hint && <small>{hint}</small>}</label>
    </div>
  )
}

// ---------------------------------------------------------------- estrutura
export function PageHeader({ title, subtitle, back, actions }: { title: ReactNode; subtitle?: ReactNode; back?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      {back}
      <div className="page-header-row">
        <div className="page-header-text">
          <h1>{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </header>
  )
}

export function Panel({ title, actions, children, className = '', padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <div className="panel-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="panel-actions">{actions}</div>}
        </div>
      )}
      <div className={padded ? 'panel-body' : ''}>{children}</div>
    </section>
  )
}

export function EmptyState({ icon = 'info', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return <div className="loading" role="status"><span className="spinner" aria-hidden /> {label}</div>
}

export function ErrorBox({ error, onRetry }: { error: AppError | null | undefined; onRetry?: () => void }) {
  if (!error) return null
  return (
    <div className={`alert alert-${error.kind === 'conflito' ? 'warn' : 'danger'}`} role="alert">
      <Icon name="alerta" size={18} />
      <div>
        <p>{error.message}</p>
        {onRetry && <button type="button" className="link-btn" onClick={onRetry}>Tentar novamente</button>}
      </div>
    </div>
  )
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; children: ReactNode }) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'note'}>
      <Icon name={tone === 'ok' ? 'ok' : tone === 'info' ? 'info' : 'alerta'} size={18} />
      <div>{children}</div>
    </div>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'blue' | 'yellow' | 'green' | 'red' | 'grey'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <div className="progress" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'Avanço físico'}>
      <div className="progress-fill" style={{ width: `${v}%` }} />
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ id: T; label: string; count?: number }>; value: T; onChange: (id: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" type="button" aria-selected={value === t.id} className={value === t.id ? 'tab active' : 'tab'} onClick={() => onChange(t.id)}>
          {t.label}{t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Bloco de filtros: aberto no computador, recolhido no celular (mostra quantos estão ativos). */
export function FilterPanel({ active, children }: { active: number; children: ReactNode }) {
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 901px)').matches)
  return (
    <section className="panel filter-panel">
      <button type="button" className="filter-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="filtro" size={18} />
        <span>Filtros{active > 0 && <span className="tab-count">{active} {active === 1 ? 'ativo' : 'ativos'}</span>}</span>
        <Icon name={open ? 'voltar' : 'avancar'} size={16} className={open ? 'rot-up' : 'rot-down'} />
      </button>
      {open && <div className="panel-body filter-body">{children}</div>}
    </section>
  )
}

// ---------------------------------------------------------------- modal
export function Modal({ open, title, onClose, children, footer, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className={`modal${wide ? ' modal-wide' : ''}`} onCancel={(e) => { e.preventDefault(); onClose() }} aria-labelledby="modal-title">
      {open && (
        <>
          <div className="modal-head">
            <h2 id="modal-title">{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="fechar" /></button>
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-foot">{footer}</div>}
        </>
      )}
    </dialog>
  )
}

// ---------------------------------------------------------------- avisos (toast)
type Toast = { id: number; tone: 'ok' | 'danger' | 'info'; text: string }
const ToastContext = createContext<(tone: Toast['tone'], text: string) => void>(() => {})
export function useToast() { return useContext(ToastContext) }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((tone: Toast['tone'], text: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, tone, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'danger' ? 8000 : 4000)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <Icon name={t.tone === 'ok' ? 'ok' : t.tone === 'danger' ? 'alerta' : 'info'} size={18} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const ini = name.trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w)).map((w) => w[0])
  const text = ((ini[0] ?? '') + (ini.length > 1 ? ini[ini.length - 1] : '')).toUpperCase() || '?'
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden>{text}</span>
}
