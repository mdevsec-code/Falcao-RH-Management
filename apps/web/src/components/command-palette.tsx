import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CornerDownLeft, Search, User, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { can } from '@falcao-rh/contracts'

import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { useMe } from '../lib/session'
import type { EmployeeListItem, Page } from '../lib/types'
import { NAV, type NavItem } from './navigation'

type Command = { id: string; label: string; hint?: string; icon: LucideIcon; run: () => void; group: string }

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Abre com Ctrl+K (ou ⌘K): vai para qualquer tela e encontra pessoas pelo nome. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const me = useMe()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  const list = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(query.trim()), 180)
    return () => clearTimeout(handle)
  }, [query])
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const canSearchPeople = can(me.role, 'employees.read')
  const people = useQuery({
    queryKey: ['palette-people', debounced],
    queryFn: () => api<Page<EmployeeListItem>>('/employees', { query: { q: debounced, pageSize: 6 } }),
    enabled: open && canSearchPeople && debounced.length >= 2,
  })

  const go = (to: string) => () => {
    onOpenChange(false)
    void navigate({ to })
  }

  const commands = useMemo<Command[]>(() => {
    const visible = (item: NavItem) => can(me.role, item.permission) && (!item.needsEmployee || me.employeeId)
    const pages = NAV.filter(visible).map(item => ({
      id: `nav:${item.to}`,
      label: item.label,
      hint: item.description,
      icon: item.icon,
      run: go(item.to),
      group: 'Ir para',
    }))
    const found = (people.data?.items ?? []).map(person => ({
      id: `person:${person.id}`,
      label: person.socialName ?? person.fullName,
      hint: [person.positionTitle, person.departmentName].filter(Boolean).join(' em ') || `Matrícula ${person.registration}`,
      icon: User,
      run: go(`/colaboradores/${person.id}`),
      group: 'Pessoas',
    }))
    const q = normalize(query)
    const matches = (c: Command) => !q || normalize(`${c.label} ${c.hint ?? ''}`).includes(q)
    return [...found, ...pages.filter(matches)]
  }, [people.data, query, me.role, me.employeeId])

  useEffect(() => setActive(0), [commands.length, query])
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive(i => Math.min(commands.length - 1, i + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(i => Math.max(0, i - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      commands[active]?.run()
    }
  }

  let lastGroup = ''
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay fixed inset-0 z-50 bg-ink/50 backdrop-blur-[3px]" />
        <Dialog.Content
          className="dialog fixed inset-x-0 top-[12vh] z-50 mx-auto w-[min(640px,calc(100vw-24px))] overflow-hidden rounded-md border border-ink/20 bg-paper shadow-2xl focus:outline-none"
          onKeyDown={onKeyDown}
        >
          <Dialog.Title className="sr-only">Ir para ou buscar</Dialog.Title>
          <Dialog.Description className="sr-only">Digite para filtrar telas ou buscar colaboradores. Use as setas e Enter.</Dialog.Description>
          <div className="flex items-center gap-3 border-b border-line px-5">
            <Search className="size-5 text-steel" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={canSearchPeople ? 'Ir para uma tela ou buscar uma pessoa' : 'Ir para uma tela'}
              role="combobox"
              aria-expanded
              aria-controls="palette-list"
              aria-activedescendant={commands[active] ? `palette-${commands[active].id}` : undefined}
              className="h-14 flex-1 bg-transparent text-[17px] text-ink placeholder:text-steel-soft focus:outline-none focus-visible:shadow-none focus-visible:outline-none"
            />
            <kbd className="rounded-sm border border-line px-1.5 py-0.5 text-[11px] text-steel">Esc</kbd>
          </div>
          <ul ref={list} id="palette-list" role="listbox" className="max-h-[55vh] overflow-y-auto p-2">
            {commands.length === 0 && (
              <li className="px-3 py-10 text-center text-sm text-steel">
                {people.isFetching ? 'Buscando…' : 'Nada encontrado. Tente outro nome ou tela.'}
              </li>
            )}
            {commands.map((command, index) => {
              const header = command.group !== lastGroup ? command.group : null
              lastGroup = command.group
              return (
                <li key={command.id} role="presentation">
                  {header && <p className="px-3 pt-3 pb-1.5 text-[12px] font-medium text-steel">{header}</p>}
                  <button
                    type="button"
                    id={`palette-${command.id}`}
                    role="option"
                    aria-selected={index === active}
                    data-index={index}
                    onMouseMove={() => setActive(index)}
                    onClick={command.run}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left transition-colors',
                      index === active ? 'bg-ink text-paper' : 'text-ink-soft',
                    )}
                  >
                    <command.icon className={cn('size-[18px] shrink-0', index === active ? 'text-brand' : 'text-steel')} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]">{command.label}</span>
                      {command.hint && (
                        <span className={cn('block truncate text-[13px]', index === active ? 'text-paper/65' : 'text-steel')}>{command.hint}</span>
                      )}
                    </span>
                    {index === active && <CornerDownLeft className="size-4 text-brand" aria-hidden />}
                  </button>
                </li>
              )
            })}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
