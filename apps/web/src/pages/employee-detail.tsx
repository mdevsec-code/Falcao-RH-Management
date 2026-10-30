import * as Tabs from '@radix-ui/react-tabs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Upload, UserCog } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { EMPLOYEE_STATUSES } from '@falcao-rh/contracts'

import { Button } from '../components/ui/button'
import { Drawer } from '../components/ui/drawer'
import { Field, Input, Select, Textarea } from '../components/ui/field'
import { ErrorState, Panel, Skeleton } from '../components/ui/layout'
import { EmployeeForm } from '../features/employee-form'
import { DataTable } from '../components/ui/data-table'
import { DocumentDrawer, DocumentTable, UploadDocumentDrawer } from '../features/documents'
import { ProfileDetails, ProfileHeader, ProfileHistory } from '../features/employee-profile'
import { periodLabel, RequestDrawer, requestLabel, RequestStatusBadge, VacationBalanceCard } from '../features/requests'
import { api, ApiError } from '../lib/api'
import { statusLabel, todayIso } from '../lib/format'
import { useCan } from '../lib/session'
import type { DocumentItem, EmployeeDetail, EmployeeStatus, RequestItem, VacationBalance } from '../lib/types'

export function EmployeeDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string }
  const canEdit = useCan('employees.update')
  const canChangeStatus = useCan('employees.terminate')
  const canDocuments = useCan('documents.read')
  const canUpload = useCan('documents.manage')
  const canRequests = useCan('requests.read')
  const [tab, setTab] = useState('dados')
  const [docId, setDocId] = useState<string | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const documents = useQuery({
    queryKey: ['documents', 'employee', id],
    queryFn: () => api<DocumentItem[]>('/documents', { query: { employeeId: id } }),
    enabled: canDocuments && tab === 'documentos',
  })
  const balance = useQuery({
    queryKey: ['vacation-balance', id],
    queryFn: () => api<VacationBalance>('/employees/' + id + '/vacation-balance'),
    enabled: canRequests && tab === 'ferias',
  })
  const requests = useQuery({
    queryKey: ['requests', 'employee', id],
    queryFn: () => api<RequestItem[]>('/requests', { query: { employeeId: id } }),
    enabled: canRequests && tab === 'ferias',
  })
  const tabs = [
    { value: 'dados', label: 'Dados', allowed: true },
    { value: 'historico', label: 'Histórico', allowed: true },
    { value: 'ferias', label: 'Férias e ausências', allowed: canRequests },
    { value: 'documentos', label: 'Documentos', allowed: canDocuments },
  ].filter(t => t.allowed)
  const [editing, setEditing] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)

  const query = useQuery({ queryKey: ['employee', id], queryFn: () => api<EmployeeDetail>(`/employees/${id}`) })
  const employee = query.data

  return (
    <>
      <Link to="/colaboradores" className="mb-4 inline-flex items-center gap-1.5 text-sm text-steel hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Colaboradores
      </Link>

      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.isPending && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-72" />
        </div>
      )}

      {employee && (
        <>
          <ProfileHeader
            employee={employee}
            actions={
              <>
                {canChangeStatus && (
                  <Button onClick={() => setChangingStatus(true)}>
                    <UserCog className="size-4" aria-hidden /> Alterar situação
                  </Button>
                )}
                {canEdit && (
                  <Button variant="primary" onClick={() => setEditing(true)}>
                    <Pencil className="size-4" aria-hidden /> Editar cadastro
                  </Button>
                )}
              </>
            }
          />

          <Tabs.Root value={tab} onValueChange={setTab}>
            <Tabs.List aria-label="Seções da ficha" className="mb-5 flex gap-6 overflow-x-auto border-b border-line">
              {tabs.map(t => (
                <Tabs.Trigger
                  key={t.value}
                  value={t.value}
                  className="relative shrink-0 pb-2.5 text-[15px] text-steel hover:text-ink data-[state=active]:font-medium data-[state=active]:text-ink"
                >
                  {t.label}
                  {t.value === 'historico' && <span className="num ml-1.5 text-steel">{employee.history.length}</span>}
                  {tab === t.value && <motion.span layoutId="profile-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-ink" />}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <Tabs.Content value="dados">
              <ProfileDetails employee={employee} />
            </Tabs.Content>
            <Tabs.Content value="historico">
              <Panel title="Histórico funcional">
                <ProfileHistory history={employee.history} />
              </Panel>
            </Tabs.Content>
            {canRequests && (
              <Tabs.Content value="ferias">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                  <VacationBalanceCard balance={balance.data} />
                  <Panel title="Solicitações" bodyClassName="p-0">
                    <DataTable
                      loading={requests.isPending}
                      rows={requests.data ?? []}
                      onRowClick={r => setRequestId(r.id)}
                      minWidth={480}
                      empty="Nenhuma solicitação registrada"
                      columns={[
                        { label: 'Tipo', render: r => <span className="font-medium text-ink">{requestLabel(r)}</span> },
                        { label: 'Período', render: r => <span className="num">{periodLabel(r)}</span> },
                        { label: 'Situação', render: r => <RequestStatusBadge status={r.status} /> },
                      ]}
                    />
                  </Panel>
                </div>
              </Tabs.Content>
            )}
            {canDocuments && (
              <Tabs.Content value="documentos">
                {canUpload && (
                  <div className="mb-4 flex justify-end">
                    <Button variant="primary" onClick={() => setUploading(true)}>
                      <Upload className="size-4" aria-hidden /> Enviar documento
                    </Button>
                  </div>
                )}
                <DocumentTable rows={documents.data ?? []} loading={documents.isPending} onOpen={setDocId} showEmployee={false} empty="Nenhum documento no cadastro" />
              </Tabs.Content>
            )}
          </Tabs.Root>
          <DocumentDrawer id={docId} onClose={() => setDocId(null)} />
          <RequestDrawer id={requestId} onClose={() => setRequestId(null)} />
          {canUpload && <UploadDocumentDrawer open={uploading} onOpenChange={setUploading} mode="hr" employeeId={employee.id} />}

          <EmployeeForm open={editing} onOpenChange={setEditing} employee={employee} />
          <StatusDrawer open={changingStatus} onOpenChange={setChangingStatus} employee={employee} />
        </>
      )}
    </>
  )
}

const ACTION_LABELS: Record<EmployeeStatus, string> = {
  active: 'Reativar',
  on_leave: 'Registrar afastamento',
  terminated: 'Registrar desligamento',
}

function StatusDrawer({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: EmployeeDetail
}) {
  const queryClient = useQueryClient()
  const options = EMPLOYEE_STATUSES.filter(s => s !== employee.status)
  const [status, setStatus] = useState<EmployeeStatus>(options[0]!)
  const [effectiveDate, setEffectiveDate] = useState(todayIso())
  const [reason, setReason] = useState('')

  const save = useMutation({
    mutationFn: () =>
      api<EmployeeDetail>(`/employees/${employee.id}/status`, { method: 'POST', body: { status, effectiveDate, reason } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employee', employee.id] })
      void queryClient.invalidateQueries({ queryKey: ['employees'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(`Situação alterada para ${statusLabel(status).toLowerCase()}.`)
      setReason('')
      onOpenChange(false)
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível alterar a situação.'),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate()
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Alterar situação"
      description={`Hoje: ${statusLabel(employee.status)}. A mudança entra no histórico funcional.`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant={status === 'terminated' ? 'danger' : 'primary'} onClick={submit} loading={save.isPending} disabled={reason.trim().length < 3}>
            {ACTION_LABELS[status]}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nova situação" required>
          {p => (
            <Select {...p} value={status} onChange={e => setStatus(e.target.value as EmployeeStatus)}>
              {options.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Data de vigência" required>
          {p => <Input {...p} type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} />}
        </Field>
        <Field label="Motivo" required hint="Fica registrado no histórico e na auditoria.">
          {p => <Textarea {...p} value={reason} onChange={e => setReason(e.target.value)} maxLength={500} />}
        </Field>
        {status === 'terminated' && (
          <p className="rounded-sm border border-line bg-concrete p-3 text-sm text-ink-soft">
            O desligamento aqui é o registro administrativo. Rescisão, verbas e eSocial seguem no sistema de folha.
          </p>
        )}
      </form>
    </Drawer>
  )
}
