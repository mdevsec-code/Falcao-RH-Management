import { useQuery } from '@tanstack/react-query'
import { CalendarPlus, ClipboardList, Palmtree } from 'lucide-react'
import { useState } from 'react'

import { Button } from '../components/ui/button'
import { DataTable } from '../components/ui/data-table'
import { ErrorState, PageHeader, Panel } from '../components/ui/layout'
import { NewRequestDrawer, periodLabel, RequestDrawer, requestLabel, RequestStatusBadge, VacationBalanceCard } from '../features/requests'
import { api } from '../lib/api'
import type { RequestItem, VacationBalance } from '../lib/types'

export function MyRequestsPage() {
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const balance = useQuery({ queryKey: ['vacation-balance', 'me'], queryFn: () => api<VacationBalance>('/me/vacation-balance') })
  const list = useQuery({ queryKey: ['me-requests'], queryFn: () => api<RequestItem[]>('/me/requests') })

  return (
    <>
      <PageHeader
        eyebrow="Pessoal"
        title="Férias e ausências"
        description="Peça férias, avise uma ausência e acompanhe cada aprovação."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <CalendarPlus className="size-4" aria-hidden /> Nova solicitação
          </Button>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <VacationBalanceCard balance={balance.data} />
        <Panel title="Minhas solicitações" icon={ClipboardList} bodyClassName="p-0">
          {list.isError && <ErrorState error={list.error} onRetry={() => list.refetch()} />}
          <DataTable
            bare
            loading={list.isPending}
            rows={list.data ?? []}
            onRowClick={r => setOpenId(r.id)}
            minWidth={480}
            empty="Você ainda não fez nenhuma solicitação"
            emptyIcon={Palmtree}
            emptyHint="Use Nova solicitação para pedir férias ou avisar uma ausência."
            columns={[
              { label: 'Tipo', render: r => <span className="font-medium text-ink">{requestLabel(r)}</span> },
              { label: 'Período', render: r => <span className="num">{periodLabel(r)}</span> },
              { label: 'Situação', render: r => <RequestStatusBadge status={r.status} /> },
            ]}
          />
        </Panel>
      </div>
      <NewRequestDrawer open={creating} onOpenChange={setCreating} />
      <RequestDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  )
}
