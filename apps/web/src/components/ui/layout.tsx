import { CircleAlert, RotateCw, type LucideIcon } from 'lucide-react'
import { useRef, type ReactNode } from 'react'

import { SplitTitle } from '../motion'

import { ApiError } from '../../lib/api'
import { cn } from '../../lib/cn'
import { initials } from '../../lib/format'
import { gsap, MOTION, useGSAP } from '../../lib/gsap'

/**
 * Cabeçalho de tela: rótulo da seção, título montado por caractere,
 * descrição e ações. O resto da tela entra pelo motor de revelação.
 */
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
}: {
  title: string
  eyebrow?: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION.ok, () => {
        gsap.from('[data-header-fade]', { y: 14, autoAlpha: 0, duration: 0.9, stagger: 0.08, delay: 0.25 })
      })
    },
    { scope: ref },
  )
  return (
    <header ref={ref} className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
      <div className="min-w-0">
        {eyebrow && (
          <p data-header-fade className="eyebrow mb-3 flex items-center gap-2">
            <span className="h-px w-5 bg-brand" aria-hidden />
            {eyebrow}
          </p>
        )}
        <SplitTitle className="font-display text-[clamp(38px,4.4vw,62px)] leading-[0.92] font-semibold tracking-[-0.015em] text-ink">
          {title}
        </SplitTitle>
        {description && (
          <p data-header-fade className="mt-3 max-w-2xl text-[15px] leading-relaxed text-steel">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div data-header-fade className="flex w-full flex-wrap gap-2 sm:w-auto">
          {actions}
        </div>
      )}
    </header>
  )
}

/** Painel: superfície clara, borda fina e sombra curta. */
export function Panel({
  title,
  icon: Icon,
  aside,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode
  icon?: LucideIcon
  aside?: ReactNode
  className?: string
  bodyClassName?: string
  children: ReactNode
}) {
  return (
    <section data-reveal className={cn('surface overflow-hidden', className)}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-5 py-3.5">
          <h2 className="flex items-center gap-2.5 text-[14.5px] font-semibold text-ink">
            {Icon && (
              <span className="flex size-7 items-center justify-center rounded-[7px] bg-sunken text-steel ring-1 ring-line">
                <Icon className="size-[15px]" aria-hidden />
              </span>
            )}
            {title}
          </h2>
          {aside}
        </div>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

const TONES = {
  neutral: 'bg-sunken text-steel ring-line-strong/70 [--dot:var(--color-steel-soft)]',
  ok: 'bg-ok-soft text-ok ring-ok/20 [--dot:var(--color-ok)]',
  warn: 'bg-warn-soft text-brand-ink ring-brand-strong/35 [--dot:var(--color-brand-strong)]',
  danger: 'bg-danger-soft text-danger ring-danger/20 [--dot:var(--color-danger)]',
  info: 'bg-info-soft text-info ring-info/20 [--dot:var(--color-info)]',
} as const

export function Badge({ tone = 'neutral', dot = true, children }: { tone?: keyof typeof TONES; dot?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] leading-5 font-medium whitespace-nowrap ring-1 ring-inset',
        TONES[tone],
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-[var(--dot)]" aria-hidden />}
      {children}
    </span>
  )
}

/** Iniciais da pessoa num bloco escuro da marca. */
export function Avatar({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const sizes = {
    sm: 'size-7 text-[11px] rounded-[7px]',
    md: 'size-9 text-[13px] rounded-sm',
    lg: 'size-12 text-[17px] rounded-[10px]',
    xl: 'size-20 text-[30px] rounded-md',
  }
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-night font-display font-semibold tracking-wide text-brand ring-1 ring-black/5 dark:ring-white/10',
        sizes[size],
        className,
      )}
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgb(254_190_2/0.22),transparent_60%)]" />
      <span className="relative">{initials(name)}</span>
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
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="relative mb-4 flex size-14 items-center justify-center rounded-[14px] border border-line bg-sunken shadow-xs">
        <span className="absolute -inset-2 rounded-[18px] border border-dashed border-line" aria-hidden />
        <Icon className="size-6 text-steel" aria-hidden strokeWidth={1.6} />
      </span>
      <p className="font-medium text-ink">{title}</p>
      {children && <p className="mt-1 max-w-md text-sm text-steel">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : 'Algo deu errado ao carregar estes dados.'
  return (
    <div role="alert" className="mb-4 flex items-start gap-3 rounded-md border border-danger/25 bg-danger-soft px-4 py-3.5 text-sm text-danger">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex-1">{message}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 font-medium hover:underline">
          <RotateCw className="size-3.5" aria-hidden /> Tentar de novo
        </button>
      )}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-md', className)} aria-hidden />
}

/** Par rótulo/valor das fichas. */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-medium tracking-wide text-steel uppercase">{label}</dt>
      <dd className="mt-1 truncate text-[14.5px] text-ink">{children ?? <span className="text-steel-soft">Não informado</span>}</dd>
    </div>
  )
}

/** Abas de segmento (pílula) para alternar visões dentro de um painel. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (value: T) => void
  options: Record<T, string>
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="flex rounded-[9px] border border-line bg-sunken p-0.5 text-[13px]">
      {(Object.entries(options) as [T, string][]).map(([key, text]) => (
        <button
          key={key}
          role="tab"
          type="button"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={cn(
            'rounded-[7px] px-2.5 py-1 font-medium transition-all duration-200',
            value === key ? 'bg-paper text-ink shadow-xs ring-1 ring-line' : 'text-steel hover:text-ink',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
