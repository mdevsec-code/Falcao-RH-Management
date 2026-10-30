import { LoaderCircle } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { cn } from '../../lib/cn'

const VARIANTS = {
  // Ação principal: o amarelo da marca com texto preto (contraste 11:1).
  primary: 'bg-brand text-ink hover:bg-brand-strong border-brand-strong font-semibold',
  secondary: 'bg-paper text-ink-soft border-line-strong hover:border-ink hover:text-ink',
  ghost: 'border-transparent text-steel hover:bg-concrete hover:text-ink',
  danger: 'bg-paper text-danger border-danger/40 hover:bg-danger-soft',
} as const

const SIZES = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-[15px] gap-2',
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
        'inline-flex shrink-0 items-center justify-center rounded-sm border transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.97]',
        'disabled:cursor-not-allowed disabled:opacity-55',
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
