import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'
import { EmptyState, Skeleton } from './layout'

export type Column<T> = { label: string; render: (row: T) => ReactNode; className?: string }

/** Moldura das tabelas: superfície, rolagem horizontal no celular. */
export function TableFrame({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div data-reveal className={cn('surface overflow-hidden', className)}>
      {children}
    </div>
  )
}

export const thClass = 'px-5 py-3 text-[11.5px] font-medium tracking-[0.08em] text-steel uppercase'
export const trClass =
  'group/row relative transition-colors duration-150 hover:bg-sunken [&>td:first-child]:relative [&>td:first-child]:before:absolute [&>td:first-child]:before:inset-y-2 [&>td:first-child]:before:left-0 [&>td:first-child]:before:w-[3px] [&>td:first-child]:before:rounded-r-full [&>td:first-child]:before:bg-brand [&>td:first-child]:before:opacity-0 [&>td:first-child]:before:transition-opacity hover:[&>td:first-child]:before:opacity-100'

/** Linhas de carregamento com a forma da tabela. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5">
          <Skeleton className="size-9 rounded-sm" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-2.5 w-1/5" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}

/** Tabela simples: carregando, vazia ou com linhas; rolagem horizontal no celular. */
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  actions,
  loading,
  empty,
  emptyIcon = Inbox,
  emptyHint,
  onRowClick,
  minWidth = 640,
  bare,
}: {
  rows: T[]
  columns: Column<T>[]
  actions?: (row: T) => ReactNode
  loading?: boolean
  empty: string
  emptyIcon?: LucideIcon
  emptyHint?: ReactNode
  onRowClick?: (row: T) => void
  minWidth?: number
  /** Dentro de um painel: sem moldura própria. */
  bare?: boolean
}) {
  const Frame = bare ? 'div' : TableFrame
  if (loading)
    return (
      <Frame>
        <TableSkeleton rows={5} />
      </Frame>
    )
  if (rows.length === 0)
    return (
      <Frame>
        <EmptyState icon={emptyIcon} title={empty}>
          {emptyHint}
        </EmptyState>
      </Frame>
    )
  return (
    <Frame>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" style={{ minWidth }}>
          <thead className="border-b border-line bg-sunken/70">
            <tr>
              {columns.map(column => (
                <th key={column.label} scope="col" className={cn(thClass, column.className)}>
                  {column.label}
                </th>
              ))}
              {actions && (
                <th scope="col" className="w-24 px-5 py-3">
                  <span className="sr-only">Ações</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(row => (
              <tr
                key={row.id}
                data-reveal-row
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? event => event.key === 'Enter' && onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={cn(trClass, onRowClick && 'cursor-pointer focus-visible:bg-sunken')}
              >
                {columns.map(column => (
                  <td key={column.label} className={cn('px-5 py-3 text-ink-soft', column.className)}>
                    {column.render(row)}
                  </td>
                ))}
                {actions && (
                  <td className="px-3 py-1.5 text-right whitespace-nowrap" onClick={event => event.stopPropagation()}>
                    <div className="flex justify-end gap-0.5 opacity-70 transition-opacity group-hover/row:opacity-100">{actions(row)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  )
}
