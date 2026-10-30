import { CircleAlert, type LucideIcon } from 'lucide-react'
import { useRef, type ReactNode } from 'react'

import { SplitTitle, usePageReveal } from '../motion'

import { ApiError } from '../../lib/api'
import { cn } from '../../lib/cn'

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  usePageReveal(ref)
  return (
    <header ref={ref} className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div className="min-w-0">
        <SplitTitle className="font-display text-[clamp(38px,4.2vw,60px)] leading-[0.95] font-semibold tracking-[-0.01em] text-ink">
          {title}
        </SplitTitle>
        {description && <p className="mt-3 max-w-2xl text-[15px] text-steel">{description}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div>}
    </header>
  )
}

/** Painel: superfície branca com borda fina. Hierarquia por borda, não por sombra. */
export function Panel({
  title,
  aside,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode
  aside?: ReactNode
  className?: string
  bodyClassName?: string
  children: ReactNode
}) {
  return (
    <section className={cn('rounded-md border border-line bg-paper', className)}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-5 py-3">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {aside}
        </div>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

const TONES = {
  neutral: 'bg-concrete text-ink-soft border-line',
  ok: 'bg-ok-soft text-ok border-ok/25',
  warn: 'bg-warn-soft text-ink-soft border-brand-strong/40',
  danger: 'bg-danger-soft text-danger border-danger/25',
  info: 'bg-info-soft text-info border-info/25',
} as const

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-sm border px-1.5 py-px text-[12.5px] font-medium whitespace-nowrap', TONES[tone])}>
      {children}
    </span>
  )
}

/** Vazio é convite para agir: diz o que falta e o próximo passo. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <Icon className="mb-3 size-8 text-steel-soft" aria-hidden strokeWidth={1.5} />
      <p className="font-medium text-ink">{title}</p>
      {children && <p className="mt-1 max-w-md text-sm text-steel">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : 'Algo deu errado ao carregar estes dados.'
  return (
    <div role="alert" className="flex items-start gap-3 rounded-md border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex-1">{message}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2">
          Tentar de novo
        </button>
      )}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-sm', className)} aria-hidden />
}

/** Par rótulo/valor das fichas. */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] text-steel">{label}</dt>
      <dd className="mt-0.5 truncate text-ink">{children ?? <span className="text-steel-soft">Não informado</span>}</dd>
    </div>
  )
}
