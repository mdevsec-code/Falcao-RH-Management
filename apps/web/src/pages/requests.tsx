import * as Tabs from '@radix-ui/react-tabs'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { CalendarPlus, Inbox, ListChecks } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'

import { REQUEST_STATUS_LABELS, REQUEST_STATUSES, type RequestStatus } from '@falcao-rh/contracts'

import { Button } from '../components/ui/button'
import { DataTable, type Column } from '../components/ui/data-table'
import { Select } from '../components/ui/field'
import { ErrorState, PageHeader } from '../components/ui/layout'
import { NewRequestDrawer, periodLabel, RequestDrawer, requestLabel, RequestStatusBadge, TimelineCalendar } from '../features/requests'
import { api } from '../lib/api'
import { useCan, useMe } from '../lib/session'
import type { RequestItem } from '../lib/types'

type Tab = 'fila' | 'todas' | 'calendario'

const TABS: [Tab, string][] = [
  ['fila', 'Aguardando você'],
  ['todas', 'Todas'],
  ['calendario', 'Calendário'],
]

export function RequestsPage() {
  const me = useMe()
  const search = useSearch({ strict: false }) as { id?: string; tab?: Tab }
  const navigate = useNavigate()
  const canManage = useCan('requests.manage')
  const [registering, setRegistering] = useState(false)
  const [status, setStatus] = useState<RequestStatus | ''>('')
  const tab: Tab = search.tab ?? 'fila'
  const go = (patch: { id?: string; tab?: Tab }) =>
    void navigate({ to: '/solicitacoes', search: { ...search, ...patch }, replace: true })

  const queue = useQuery({
    queryKey: ['requests', 'queue'],
    queryFn: () => api<RequestItem[]>('/requests', { query: { awaitingMe: 'true' } }),
  })
  const all = useQuery({
    queryKey: ['requests', 'all', status],
    queryFn: () => api<RequestItem[]>('/requests', { query: { status } }),
    enabled: tab === 'todas',
  })

  const columns: Column<RequestItem>[] = [
    {
      label: 'Pessoa',
      render: r => (
        <div>
          <div className="font-medium text-ink">{r.employeeName}</div>
          <div className="text-[13px] text-steel">{r.departmentName ?? 'Sem departamento'}</div>
        </div>
      ),
    },
    { label: 'Tipo', render: r => requestLabel(r) },
    { label: 'Período', render: r => <span className="num">{periodLabel(r)}</span> },
    { label: 'Situação', render: r => <RequestStatusBadge status={r.status} /> },
  ]
  const pending = queue.data?.length ?? 0

  return (
    <>
      <PageHeader
        title="Solicitações"
        description={me.scope === 'team' ? 'Férias e ausências da sua equipe.' : 'Férias e ausências de toda a organização.'}
        actions={
          canManage && (
            <Button variant="primary" onClick={() => setRegistering(true)}>
              <CalendarPlus className="size-4" aria-hidden /> Registrar férias ou ausência
            </Button>
          )
        }
      />

      <Tabs.Root value={tab} onValueChange={value => go({ tab: value as Tab })}>
        <Tabs.List aria-label="Visões" className="mb-5 flex gap-6 border-b border-line">
          {TABS.map(([value, label]) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className="relative pb-2.5 text-[15px] text-steel hover:text-ink data-[state=active]:font-medium data-[state=active]:text-ink"
            >
              {label}
              {value === 'fila' && pending > 0 && (
                <span className="num ml-2 rounded-full bg-brand px-1.5 py-px text-[12px] font-semibold text-ink">{pending}</span>
              )}
              {tab === value && <motion.span layoutId="requests-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-ink" />}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="fila">
          {queue.isError && <ErrorState error={queue.error} onRetry={() => queue.refetch()} />}
          <DataTable
            loading={queue.isPending}
            rows={queue.data ?? []}
            columns={columns}
            onRowClick={r => go({ id: r.id })}
            empty="Nada aguardando sua decisão"
            emptyIcon={ListChecks}
            emptyHint="Quando alguém da equipe pedir férias ou ausência, o pedido aparece aqui e você recebe um aviso."
          />
        </Tabs.Content>

        <Tabs.Content value="todas">
          <div className="mb-4">
            <Select aria-label="Situação" value={status} onChange={e => setStatus(e.target.value as RequestStatus | '')} className="w-auto">
              <option value="">Todas as situações</option>
              {REQUEST_STATUSES.map(s => (
                <option key={s} value={s}>
                  {REQUEST_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          {all.isError && <ErrorState error={all.error} onRetry={() => all.refetch()} />}
          <DataTable loading={all.isPending} rows={all.data ?? []} columns={columns} onRowClick={r => go({ id: r.id })} empty="Nenhuma solicitação" emptyIcon={Inbox} />
        </Tabs.Content>

        <Tabs.Content value="calendario">
          <TimelineCalendar onOpen={id => go({ id })} />
        </Tabs.Content>
      </Tabs.Root>

      <RequestDrawer id={search.id ?? null} onClose={() => go({ id: undefined })} />
      {canManage && <NewRequestDrawer open={registering} onOpenChange={setRegistering} onBehalf />}
    </>
  )
}
