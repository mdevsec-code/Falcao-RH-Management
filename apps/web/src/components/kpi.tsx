import type { LucideIcon } from 'lucide-react'
import { useRef, type ReactNode } from 'react'

import { cn } from '../lib/cn'
import { SpotlightGlow, useSpotlight } from './motion'

/**
 * Cartões de indicador com luz que segue o mouse e painel de detalhes ao
 * passar o mouse ou focar (Mobilidade, Estrangeiros).
 */
export const TONES = {
  brand: 'bg-brand-soft text-brand-ink',
  ink: 'bg-sunken text-ink',
  info: 'bg-info-soft text-info',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-brand-ink',
  danger: 'bg-danger-soft text-danger',
} as const

/** Grade de cartões com a luz que segue o mouse. */
export function SpotlightGrid({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useSpotlight(ref)
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

/** Uma linha do painel de detalhes: rótulo, valor e, se houver, a fatia numa barrinha. */
export type Detail = { label: string; value: ReactNode; share?: number; color?: string; tone?: 'danger' | 'ok' }
export type Details = { title: string; rows: Detail[]; hint?: string }

/**
 * Painel que aparece ao passar o mouse (ou ao focar com o teclado) logo abaixo
 * do bloco, com o detalhamento do número.
 */
export function Hoverable({ details, className, children }: { details?: Details; className?: string; children: ReactNode }) {
  if (!details) return <div className={className}>{children}</div>
  return (
    <div className={cn('group/hv relative focus-within:z-40 hover:z-40', className)}>
      {children}
      <div
        role="tooltip"
        className="pointer-events-none invisible absolute inset-x-0 top-full z-40 mt-2 translate-y-1.5 opacity-0 transition-[opacity,transform,visibility] duration-200 ease-out group-focus-within/hv:visible group-focus-within/hv:translate-y-0 group-focus-within/hv:opacity-100 group-hover/hv:visible group-hover/hv:translate-y-0 group-hover/hv:opacity-100"
      >
        <div className="min-w-56 rounded-lg border border-line bg-paper p-3.5 text-[12.5px] shadow-pop">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-steel uppercase">{details.title}</p>
          {details.rows.length === 0 ? (
            <p className="text-steel">Nada para detalhar neste recorte.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {details.rows.map(d => (
                <li key={d.label}>
                  <span className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-1.5 text-ink-soft">
                      {d.color && <span className="size-2 shrink-0 rounded-sm" style={{ background: d.color }} aria-hidden />}
                      <span className="truncate">{d.label}</span>
                    </span>
                    <span className={cn('num shrink-0 font-semibold', d.tone === 'danger' ? 'text-danger' : d.tone === 'ok' ? 'text-ok' : 'text-ink')}>{d.value}</span>
                  </span>
                  {d.share !== undefined && (
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-sunken">
                      <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.min(100, d.share * 100)}%`, background: d.color ?? 'var(--color-ink)' }} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {details.hint && <p className="mt-2.5 border-t border-line pt-2 text-[11.5px] leading-snug text-steel">{details.hint}</p>}
        </div>
      </div>
    </div>
  )
}


export function KpiCard({
  icon: Icon,
  tone,
  label,
  value,
  note,
  aside,
  details,
}: {
  icon: LucideIcon
  tone: keyof typeof TONES
  label: string
  value: ReactNode
  note: ReactNode
  aside?: ReactNode
  details?: Details
}) {
  return (
    <Hoverable details={details} className="flex">
    <div
      data-reveal
      data-spotlight
      tabIndex={details ? 0 : undefined}
      className="surface group relative flex flex-1 flex-col justify-between gap-5 overflow-hidden p-5 outline-none transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-lift focus-visible:ring-2 focus-visible:ring-brand"
    >
      <SpotlightGlow />
      <div className="relative flex items-start justify-between gap-3">
        <span className="text-[13px] font-medium text-steel">{label}</span>
        <span className={cn('flex size-9 items-center justify-center rounded-sm transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110', TONES[tone])}>
          <Icon className="size-[17px]" aria-hidden />
        </span>
      </div>
      <div className="relative flex items-end justify-between gap-3">
        <div className="min-w-0">
          <span className="num block font-display text-[40px] leading-[0.9] font-semibold tracking-[-0.01em] text-ink">{value}</span>
          <span className="mt-2 block text-[12px] leading-snug text-steel">{note}</span>
        </div>
        {aside}
      </div>
    </div>
    </Hoverable>
  )
}

