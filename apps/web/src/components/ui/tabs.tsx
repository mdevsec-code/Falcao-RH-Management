import * as Tabs from '@radix-ui/react-tabs'
import { useRef, type ReactNode } from 'react'

import { cn } from '../../lib/cn'
import { useIndicator } from '../motion'

export type TabItem = { value: string; label: ReactNode; count?: number; highlight?: boolean }

/**
 * Lista de abas com o sublinhado que desliza até a aba ativa (Flip.fit).
 * Usar dentro de um <Tabs.Root> controlado.
 */
export function TabList({ value, items, label, className }: { value: string; items: TabItem[]; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useIndicator(ref, value)
  return (
    <Tabs.List ref={ref} aria-label={label} className={cn('relative mb-6 flex gap-1 overflow-x-auto border-b border-line', className)}>
      {items.map(item => (
        <Tabs.Trigger
          key={item.value}
          value={item.value}
          data-active={value === item.value}
          className="group relative flex shrink-0 items-center gap-2 rounded-t-sm px-3 pt-1.5 pb-3 text-[14.5px] text-steel transition-colors hover:text-ink data-[state=active]:font-medium data-[state=active]:text-ink"
        >
          {item.label}
          {item.count !== undefined && item.count > 0 && (
            <span
              className={cn(
                'num rounded-full px-1.5 py-px text-[11.5px] font-semibold',
                item.highlight ? 'bg-brand text-night' : 'bg-sunken text-steel ring-1 ring-line group-data-[state=active]:text-ink',
              )}
            >
              {item.count}
            </span>
          )}
        </Tabs.Trigger>
      ))}
      <span data-indicator className="pointer-events-none absolute bottom-0 left-0 h-full" aria-hidden>
        <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-ink" />
      </span>
    </Tabs.List>
  )
}

export { Tabs }
