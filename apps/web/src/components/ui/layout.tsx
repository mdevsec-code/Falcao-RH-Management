import { CircleAlert, RotateCw, type LucideIcon } from 'lucide-react'
import { useRef, type CSSProperties, type ReactNode } from 'react'

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

// ---------- esqueletos com a forma do conteúdo ----------
// Cada um imita o que vai aparecer (cartão de indicador, painel, lista,
// formulário), para a tela não "pular" quando os dados chegam.

/** Larguras fixas e variadas: parecem texto de verdade e não mudam a cada render. */
const LINE_WIDTHS = ['w-11/12', 'w-4/5', 'w-2/3', 'w-5/6', 'w-3/5', 'w-3/4']

/** Container que anuncia o carregamento e faz os blocos entrarem em cascata. */
export function SkeletonGroup({ className, label = 'Carregando', children }: { className?: string; label?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      {children}
    </div>
  )
}

const step = (i: number) => ({ '--i': i }) as CSSProperties

/** Linhas de texto. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2.5', className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3 rounded-full', i === lines - 1 ? 'w-2/5' : LINE_WIDTHS[i % LINE_WIDTHS.length])} />
      ))}
    </div>
  )
}

/** Cartão de indicador: rótulo, ícone, número grande e nota. */
export function SkeletonKpi({ index = 0 }: { index?: number }) {
  return (
    <div className="surface skeleton-in flex flex-col justify-between gap-6 p-5" style={step(index)} aria-hidden>
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="size-9 rounded-sm" />
      </div>
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-2.5 w-40 rounded-full" />
      </div>
    </div>
  )
}

/** Faixa de indicadores. */
export function SkeletonKpis({ count = 4, className = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4' }: { count?: number; className?: string }) {
  return (
    <div className={className} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonKpi key={i} index={i} />
      ))}
    </div>
  )
}

const BAR_HEIGHTS = ['h-[38%]', 'h-[62%]', 'h-[48%]', 'h-[80%]', 'h-[55%]', 'h-[92%]', 'h-[70%]', 'h-[44%]', 'h-[66%]', 'h-[86%]']

/** Painel: cabeçalho e, por dentro, gráfico de barras ou linhas de lista. */
export function SkeletonPanel({ rows = 5, chart = false, index = 0, className }: { rows?: number; chart?: boolean; index?: number; className?: string }) {
  return (
    <div className={cn('surface skeleton-in overflow-hidden', className)} style={step(index)} aria-hidden>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <Skeleton className="h-3.5 w-36 rounded-full" />
        <Skeleton className="h-2.5 w-24 rounded-full" />
      </div>
      {chart ? (
        <div className="flex h-56 items-end gap-2.5 px-5 pt-6 pb-5">
          {BAR_HEIGHTS.map((h, i) => (
            <Skeleton key={i} className={cn('flex-1 rounded-b-none', h)} />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {Array.from({ length: rows }, (_, i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-3.5">
              <Skeleton className="h-3 flex-1 rounded-full" />
              <Skeleton className={cn('h-3 rounded-full', i % 2 ? 'w-16' : 'w-24')} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Lista de pessoas/itens: avatar, duas linhas e um selo. */
export function SkeletonList({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <ul className={cn('flex flex-col gap-3', className)} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="surface skeleton-in flex items-center gap-4 p-4" style={step(i)}>
          <Skeleton className="size-10 shrink-0 rounded-sm" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className={cn('h-3 rounded-full', i % 2 ? 'w-40' : 'w-52')} />
            <Skeleton className="h-2.5 w-28 rounded-full" />
          </div>
          <Skeleton className="hidden h-2 w-40 rounded-full sm:block" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </li>
      ))}
    </ul>
  )
}

/** Formulário ou ficha: pares de rótulo e campo. */
export function SkeletonForm({ fields = 6, className }: { fields?: number; className?: string }) {
  return (
    <div className={cn('grid gap-5 sm:grid-cols-2', className)} aria-hidden>
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="skeleton-in flex flex-col gap-2" style={step(i)}>
          <Skeleton className="h-2.5 w-24 rounded-full" />
          <Skeleton className="h-10" />
        </div>
      ))}
    </div>
  )
}

/** Destaque escuro (bloco principal das telas): o esqueleto segue o tom escuro. */
export function SkeletonHero({ className }: { className?: string }) {
  return (
    <div className={cn('night-glow skeleton-in flex min-h-[280px] flex-col justify-between rounded-xl border border-night-line p-7', className)} aria-hidden>
      <div className="flex flex-col gap-4">
        <div className="h-2.5 w-32 rounded-full bg-white/10" />
        <div className="h-20 w-48 rounded-md bg-white/10" />
        <div className="h-3 w-64 rounded-full bg-white/10" />
      </div>
      <div className="h-2.5 w-full rounded-full bg-white/10" />
    </div>
  )
}

/** Par rótulo/valor das fichas. */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-medium tracking-wide text-steel uppercase">{label}</dt>
      <dd className="mt-1 break-words text-[14.5px] text-ink">{children ?? <span className="text-steel-soft">Não informado</span>}</dd>
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
