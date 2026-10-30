import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'
import { EmptyState, Skeleton } from './layout'

export type Column<T> = { label: string; render: (row: T) => ReactNode; className?: string }

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
}) {
  if (loading) return <Skeleton className="h-48" />
  if (rows.length === 0)
    return (
      <div className="rounded-md border border-line bg-paper">
        <EmptyState icon={emptyIcon} title={empty}>
          {emptyHint}
        </EmptyState>
      </div>
    )
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-paper">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        <thead className="border-b border-line bg-concrete/60 text-[13px] text-steel">
          <tr>
            {columns.map(column => (
              <th key={column.label} scope="col" className={cn('px-5 py-2.5 font-medium', column.className)}>
                {column.label}
              </th>
            ))}
            {actions && (
              <th scope="col" className="w-24 px-5 py-2.5">
                <span className="sr-only">Ações</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(row => (
            <tr
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn('hover:bg-concrete/50', onRowClick && 'cursor-pointer')}
            >
              {columns.map(column => (
                <td key={column.label} className={cn('px-5 py-2.5 text-ink-soft', column.className)}>
                  {column.render(row)}
                </td>
              ))}
              {actions && (
                <td className="px-3 py-1.5 text-right whitespace-nowrap" onClick={event => event.stopPropagation()}>
                  {actions(row)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
