import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown } from 'lucide-react'
import { forwardRef, useCallback, useId, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

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

type SelectOption = { value: string; label: string; disabled: boolean }

const nativeValue = Object.getOwnPropertyDescriptor(typeof HTMLSelectElement === 'undefined' ? {} : HTMLSelectElement.prototype, 'value')

/**
 * Lista suspensa da marca, com a mesma interface do `<select>`: quem usa segue
 * passando `<option>`, `value`, `onChange` ou o `register` do formulário. Um
 * select oculto guarda o valor e os formulários falam com ele; o que aparece é
 * o botão e o menu, montados a partir das opções desse select.
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, id, disabled, 'aria-label': ariaLabel, 'aria-labelledby': labelledBy, 'aria-describedby': describedBy, 'aria-invalid': invalid, ...rest },
  ref,
) {
  const native = useRef<HTMLSelectElement | null>(null)
  /** Último valor pedido pelo formulário: as opções podem chegar depois dele. */
  const wanted = useRef<string | null>(null)
  const [current, setCurrent] = useState({ value: '', label: '' })
  const [options, setOptions] = useState<SelectOption[]>([])

  const sync = useCallback(() => {
    const option = native.current?.selectedOptions[0]
    const next = { value: option?.value ?? '', label: option?.text ?? '' }
    setCurrent(previous => (previous.value === next.value && previous.label === next.label ? previous : next))
  }, [])

  // Valor controlado e opções que chegam depois: o select já está atualizado ao final de cada render.
  useLayoutEffect(() => {
    const element = native.current
    const value = wanted.current
    if (element && nativeValue && value && element.value !== value && [...element.options].some(o => o.value === value)) nativeValue.set!.call(element, value)
    sync()
  })

  const attach = useCallback(
    (element: HTMLSelectElement | null) => {
      native.current = element
      if (element && nativeValue) {
        // O formulário escreve direto em `element.value`, sem evento: é preciso acompanhar.
        Object.defineProperty(element, 'value', {
          configurable: true,
          get: () => nativeValue.get!.call(element),
          set: (value: string) => {
            wanted.current = value
            nativeValue.set!.call(element, value)
            sync()
          },
        })
      }
      if (typeof ref === 'function') ref(element)
      else if (ref) ref.current = element
    },
    [ref, sync],
  )

  const choose = (value: string) => {
    const element = native.current
    if (!element || element.value === value) return
    element.value = value
    element.dispatchEvent(new Event('change', { bubbles: true }))
    sync()
  }

  return (
    <span className={cn('relative inline-flex h-10 w-full', className)}>
      <select ref={attach} {...rest} disabled={disabled} tabIndex={-1} aria-hidden className="sr-only">
        {children}
      </select>
      <DropdownMenu.Root
        onOpenChange={open => {
          if (open) setOptions([...(native.current?.options ?? [])].map(o => ({ value: o.value, label: o.text, disabled: o.disabled })))
        }}
      >
        <DropdownMenu.Trigger asChild disabled={disabled}>
          <button
            type="button"
            id={id}
            aria-label={ariaLabel}
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            className={cn(
              control,
              'group flex h-full cursor-pointer items-center justify-between gap-2 pr-2.5 text-left font-medium disabled:cursor-not-allowed',
              'data-[state=open]:border-ink data-[state=open]:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-brand)_35%,transparent)]',
            )}
          >
            <span className="min-w-0 truncate">{current.label || ' '}</span>
            <ChevronDown className="size-4 shrink-0 text-steel transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            collisionPadding={12}
            className="pop z-[60] max-h-72 min-w-[max(var(--radix-dropdown-menu-trigger-width),10rem)] overflow-y-auto rounded-lg border border-line bg-paper p-1.5 text-[14px] shadow-pop"
          >
            <DropdownMenu.RadioGroup value={current.value} onValueChange={choose}>
              {options.map(option => (
                <DropdownMenu.RadioItem
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-2 text-ink-soft outline-none transition-colors',
                    'data-[highlighted]:bg-sunken data-[highlighted]:text-ink data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
                    'data-[state=checked]:bg-brand-soft data-[state=checked]:font-semibold data-[state=checked]:text-ink',
                  )}
                >
                  <span className="min-w-0 break-words">{option.label}</span>
                  <DropdownMenu.ItemIndicator>
                    <Check className="size-4 shrink-0 text-brand-ink" aria-hidden />
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
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
