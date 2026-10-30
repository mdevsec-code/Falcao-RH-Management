import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Building, GitBranch, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import {
  APPROVER_KINDS,
  APPROVER_LABELS,
  REQUEST_TYPE_LABELS,
  REQUEST_TYPES,
  ROLE_LABELS,
  ROLES,
  type ApproverKind,
  type RequestType,
  type Role,
} from '@falcao-rh/contracts'

import { Button } from '../components/ui/button'
import { CheckCard, Field, Input, Select } from '../components/ui/field'
import { Badge, PageHeader, Panel, Skeleton } from '../components/ui/layout'
import { api, ApiError } from '../lib/api'
import { orgQueries } from '../lib/queries'
import type { ApprovalFlow, OrgSettings } from '../lib/types'

/** Fluxos usados quando a organização não configurou nada (iguais aos da API). */
const DEFAULTS: Record<RequestType, ApproverKind[]> = { vacation: ['manager', 'hr'], absence: ['manager'] }

export function SettingsPage() {
  return (
    <>
      <PageHeader eyebrow="Administração" title="Configurações" description="Dados da organização, regras de segurança e quem aprova cada tipo de solicitação." />
      <div className="grid gap-6 xl:grid-cols-2">
        <OrganizationPanel />
        <FlowsPanel />
      </div>
    </>
  )
}

function OrganizationPanel() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['settings'], queryFn: () => api<OrgSettings>('/settings') })
  const [form, setForm] = useState<OrgSettings | null>(null)
  useEffect(() => {
    if (query.data) setForm(query.data)
  }, [query.data])

  const save = useMutation({
    mutationFn: () => api<OrgSettings>('/settings', { method: 'PUT', body: form }),
    onSuccess: async () => {
      toast.success('Configurações salvas.')
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['settings'] }), queryClient.invalidateQueries({ queryKey: ['me'] })])
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar.'),
  })
  if (!form) return <Skeleton className="h-96" />
  const toggleRole = (role: Role) =>
    setForm({ ...form, requireMfaFor: form.requireMfaFor.includes(role) ? form.requireMfaFor.filter(r => r !== role) : [...form.requireMfaFor, role] })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate()
  }

  return (
    <Panel title="Organização e segurança" icon={Building}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Nome exibido" required>{p => <Input {...p} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Razão social">{p => <Input {...p} value={form.legalName ?? ''} onChange={e => setForm({ ...form, legalName: e.target.value })} />}</Field>
          <Field label="CNPJ">{p => <Input {...p} inputMode="numeric" value={form.cnpj ?? ''} onChange={e => setForm({ ...form, cnpj: e.target.value })} />}</Field>
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink-soft">Verificação em duas etapas obrigatória</legend>
          <p className="mb-3 text-[13px] text-steel">Quem tem estes perfis só usa o sistema depois de ativar o aplicativo autenticador. Recomendado para Administrador e RH.</p>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map(role => (
              <CheckCard key={role} checked={form.requireMfaFor.includes(role)} onChange={() => toggleRole(role)} label={ROLE_LABELS[role]} />
            ))}
          </div>
        </fieldset>
        <Button type="submit" variant="primary" className="self-start" loading={save.isPending}>
          Salvar configurações
        </Button>
      </form>
    </Panel>
  )
}

function FlowsPanel() {
  const queryClient = useQueryClient()
  const flows = useQuery({ queryKey: ['approval-flows'], queryFn: () => api<ApprovalFlow[]>('/approval-flows') })
  const departments = useQuery(orgQueries.departments)
  const [type, setType] = useState<RequestType>('vacation')
  const [departmentId, setDepartmentId] = useState('')
  const [steps, setSteps] = useState<ApproverKind[]>(['manager', 'hr'])

  const save = useMutation({
    mutationFn: () => api('/approval-flows', { method: 'PUT', body: { requestType: type, departmentId: departmentId || null, steps } }),
    onSuccess: async () => {
      toast.success('Fluxo salvo. Vale para os próximos pedidos.')
      await queryClient.invalidateQueries({ queryKey: ['approval-flows'] })
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar.'),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/approval-flows/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approval-flows'] }),
  })

  const chain = (list: ApproverKind[]) => (
    <span className="flex flex-wrap items-center gap-1.5">
      {list.map((kind, i) => (
        <span key={kind} className="flex items-center gap-1.5">
          {i > 0 && <ArrowRight className="size-3.5 text-steel" aria-hidden />}
          <Badge>{APPROVER_LABELS[kind]}</Badge>
        </span>
      ))}
    </span>
  )

  return (
    <Panel title="Fluxos de aprovação" icon={GitBranch}>
      <div className="flex flex-col gap-6">
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-md border border-line">
          {REQUEST_TYPES.map(t => {
            const configured = flows.data?.filter(f => f.requestType === t) ?? []
            const general = configured.find(f => !f.departmentId)
            return (
              <li key={t} className="px-4 py-3.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-ink">{REQUEST_TYPE_LABELS[t]}</span>
                  {chain(general?.steps ?? DEFAULTS[t])}
                </div>
                {!general && <p className="mt-1 text-[13px] text-steel">Padrão do sistema.</p>}
                {configured
                  .filter(f => f.departmentId)
                  .map(f => (
                    <div key={f.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-sm bg-sunken px-3 py-2 ring-1 ring-line">
                      <span className="text-ink-soft">{f.departmentName}</span>
                      <span className="flex items-center gap-2">
                        {chain(f.steps)}
                        <Button size="sm" variant="ghost" onClick={() => remove.mutate(f.id)} aria-label={`Remover regra de ${f.departmentName}`}>
                          <Trash2 className="size-4" />
                        </Button>
                      </span>
                    </div>
                  ))}
              </li>
            )
          })}
        </ul>

        <form
          onSubmit={event => {
            event.preventDefault()
            save.mutate()
          }}
          className="flex flex-col gap-4 rounded-md border-[1.5px] border-dashed border-line-strong bg-sunken/50 p-5"
        >
          <p className="eyebrow">Definir fluxo</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo">
              {p => (
                <Select {...p} value={type} onChange={e => setType(e.target.value as RequestType)}>
                  {REQUEST_TYPES.map(t => (
                    <option key={t} value={t}>
                      {REQUEST_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Vale para">
              {p => (
                <Select {...p} value={departmentId} onChange={e => setDepartmentId(e.target.value)}>
                  <option value="">Toda a organização</option>
                  {departments.data?.map(d => (
                    <option key={d.id} value={d.id}>
                      Só {d.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm text-ink-soft">Etapas, na ordem</legend>
            <div className="flex flex-wrap items-center gap-2">
              {steps.map((kind, i) => (
                <span key={kind} className="flex items-center gap-2">
                  {i > 0 && <ArrowRight className="size-4 text-steel" aria-hidden />}
                  <button type="button" onClick={() => setSteps(steps.filter(s => s !== kind))} className="group inline-flex items-center gap-1.5 rounded-full bg-night py-1.5 pr-2 pl-3 text-[13px] font-medium text-snow transition-colors hover:bg-danger" title="Remover etapa">
                    {APPROVER_LABELS[kind]}
                    <X className="size-3.5 text-fog group-hover:text-snow" aria-hidden />
                  </button>
                </span>
              ))}
              {APPROVER_KINDS.filter(k => !steps.includes(k)).map(kind => (
                <Button key={kind} size="sm" onClick={() => setSteps([...steps, kind])}>
                  <Plus className="size-3.5" aria-hidden /> {APPROVER_LABELS[kind]}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-[13px] text-steel">Sem gestor definido, a etapa do gestor é pulada. Nenhum pedido é aprovado automaticamente.</p>
          </fieldset>
          <Button type="submit" variant="primary" className="self-start" disabled={steps.length === 0} loading={save.isPending}>
            Salvar fluxo
          </Button>
        </form>
      </div>
    </Panel>
  )
}
