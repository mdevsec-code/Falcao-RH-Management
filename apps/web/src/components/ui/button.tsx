import { LoaderCircle } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { cn } from '../../lib/cn'

const VARIANTS = {
  // Ação principal: o amarelo da marca com texto preto (contraste 11:1) e um relevo leve.
  primary:
    'bg-brand text-night border-brand-strong/70 font-semibold shadow-brand hover:bg-[color-mix(in_oklab,var(--color-brand)_88%,white)] dark:hover:bg-brand-strong',
  secondary: 'bg-paper text-ink-soft border-line-strong shadow-xs hover:border-steel-soft hover:text-ink hover:bg-sunken',
  ghost: 'border-transparent text-steel hover:bg-ink/5 hover:text-ink',
  danger: 'bg-paper text-danger border-danger/35 shadow-xs hover:bg-danger-soft hover:border-danger/60',
  dark: 'bg-night text-snow border-night font-medium hover:bg-night-3 dark:border-night-line',
  // Sobre blocos escuros da marca.
  glass: 'bg-white/[0.06] text-snow border-white/15 backdrop-blur-sm hover:bg-white/[0.12] hover:border-white/25',
} as const

const SIZES = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-[7px]',
  md: 'h-10 px-4 text-[14.5px] gap-2 rounded-sm',
  lg: 'h-12 px-5 text-[15.5px] gap-2.5 rounded-[10px]',
  icon: 'size-9 rounded-sm',
} as const

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS
  size?: keyof typeof SIZES
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center border whitespace-nowrap select-none',
        'transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out active:scale-[0.97]',
        'disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
})
