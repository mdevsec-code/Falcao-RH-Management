import { ChevronDown } from 'lucide-react'
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

import { cn } from '../../lib/cn'

const control =
  'w-full rounded-sm border border-line-strong bg-paper px-3 text-[14.5px] text-ink shadow-xs placeholder:text-steel-soft ' +
  'transition-[border-color,box-shadow,background-color] duration-200 hover:border-steel-soft ' +
  'focus:border-ink focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-brand)_35%,transparent)] focus:outline-none focus-visible:outline-none ' +
  'aria-invalid:border-danger aria-invalid:focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-danger)_20%,transparent)] ' +
  'disabled:bg-sunken disabled:text-steel disabled:shadow-none'

/** Rótulo, ajuda e erro ligados ao controle por id (leitores de tela anunciam os três). */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  className?: string
  children: (props: { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string }) => ReactNode
}) {
  const id = useId()
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13.5px] font-medium text-ink-soft">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[12.5px] text-steel">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-[12.5px] font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(control, 'h-10', className)} {...rest} />
})

/** Select nativo (acessível e ótimo no celular) com a seta da marca. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <span className={cn('relative inline-flex h-10 w-full', className)}>
      <select ref={ref} className={cn(control, 'h-full cursor-pointer appearance-none pr-9')} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-steel" aria-hidden />
    </span>
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(control, 'min-h-24 py-2.5', className)} {...rest} />
  },
)

/** Caixa de seleção estilizada, com rótulo e descrição opcionais. */
export function CheckCard({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  description?: ReactNode
}) {
  return (
    <label
      className={cn(
        'group flex cursor-pointer items-start gap-3 rounded-sm border px-3.5 py-3 text-sm transition-all duration-200',
        checked ? 'border-ink/70 bg-sunken shadow-xs' : 'border-line hover:border-line-strong hover:bg-sunken',
      )}
    >
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-200',
          'peer-focus-visible:ring-4 peer-focus-visible:ring-brand/45',
          checked ? 'border-ink bg-ink text-paper' : 'border-line-strong bg-paper',
        )}
      >
        <svg viewBox="0 0 12 12" className={cn('size-3 transition-transform duration-200', checked ? 'scale-100' : 'scale-0')}>
          <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block font-medium text-ink">{label}</span>
        {description && <span className="block text-[12.5px] text-steel">{description}</span>}
      </span>
    </label>
  )
}
