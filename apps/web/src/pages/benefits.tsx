import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowLeft, Calculator, Download, Lock, Pencil, Plus, RefreshCw, Search, Trash2, Wallet } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import {
  BENEFIT_KIND_LABELS,
  BENEFIT_KINDS,
  BENEFIT_RUN_STATUS_LABELS,
  BENEFIT_VALUE_TYPE_LABELS,
  BENEFIT_VALUE_TYPES,
  type BenefitKind,
  type BenefitRunStatus,
  type BenefitValueType,
} from '@falcao-rh/contracts'

import { CountUp } from '../components/motion'
import { Button } from '../components/ui/button'
import { DataTable } from '../components/ui/data-table'
import { Drawer } from '../components/ui/drawer'
import { Field, Input, Select } from '../components/ui/field'
import { Badge, EmptyState, ErrorState, PageHeader, Panel, SkeletonPanel } from '../components/ui/layout'
import { api, ApiError, apiDownload } from '../lib/api'
import { cn } from '../lib/cn'
import { formatDate, formatMonth, todayIso } from '../lib/format'
import { useCan } from '../lib/session'

type Plan = {
  id: string
  kind: BenefitKind
  name: string
  provider: string
  valueType: BenefitValueType
  active: boolean
  currentValueCents: number | null
  scheduled: { valueCents: number; effectiveFrom: string }[]
  history: { valueCents: number; effectiveFrom: string; createdAt: string }[]
  employees: number
}
type EmployeeRow = {
  employeeId: string
  registration: string
  fullName: string
  departmentName: string | null
  planId: string | null
  planName: string | null
  kind: BenefitKind | null
  startDate: string | null
}
type RunSummary = {
  id: string
  competence: string
  workdays: number
  status: BenefitRunStatus
  closedAt: string | null
  people: number
  amountCents: number
  byKind: { kind: BenefitKind; people: number; amountCents: number }[]
}
type RunItem = {
  id: string
  employeeId: string
  registration: string
  fullName: string
  planName: string
  kind: BenefitKind
  valueType: BenefitValueType
  unitValueCents: number
  eligibleDays: number
  deductedDays: number
  days: number
  amountCents: number
  adjusted: boolean
  note: string
}
type RunDetail = Omit<RunSummary, 'people' | 'amountCents' | 'byKind'> & { items: RunItem[] }

type Tab = 'apuracao' | 'colaboradores' | 'planos'
const TABS: { key: Tab; label: string }[] = [
  { key: 'apuracao', label: 'Apuração mensal' },
  { key: 'colaboradores', label: 'Colaboradores' },
  { key: 'planos', label: 'Planos e valores' },
]

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const toCents = (text: string) => Math.round(Number(text.replace(/\./g, '').replace(',', '.')) * 100)
const fail = (fallback: string) => (error: unknown) => toast.error(error instanceof ApiError ? error.message : fallback)
const currentMonth = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA').slice(0, 7)
}

const plansQuery = { queryKey: ['benefit-plans'], queryFn: () => api<Plan[]>('/benefits/plans') }

export function BenefitsPage() {
  const search = useSearch({ strict: false }) as { tab?: Tab; apuracao?: string }
  const navigate = useNavigate()
  const tab = search.tab ?? 'apuracao'
  const go = (next: Partial<typeof search>) => void navigate({ to: '/beneficios', search: { ...search, ...next } })

  return (
    <>
      <PageHeader
        title="Benefícios"
        description="Vale-alimentação e vale-refeição: o benefício de cada pessoa, o histórico de valores e a apuração do mês."
      />
      <nav className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0" aria-label="Seções de benefícios">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => go({ tab: t.key, apuracao: undefined })}
            aria-current={tab === t.key ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 text-[15px] whitespace-nowrap transition-colors',
              tab === t.key ? 'border-ink font-semibold text-ink' : 'border-transparent text-steel hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'apuracao' && (search.apuracao ? <RunView id={search.apuracao} onBack={() => go({ apuracao: undefined })} /> : <Runs onOpen={id => go({ apuracao: id })} />)}
      {tab === 'colaboradores' && <People />}
      {tab === 'planos' && <Plans />}
    </>
  )
}

// ---------- apuração ----------

function Runs({ onOpen }: { onOpen: (id: string) => void }) {
  const manage = useCan('benefits.manage')
  const queryClient = useQueryClient()
  const [competence, setCompetence] = useState(currentMonth())
  const runs = useQuery({ queryKey: ['benefit-runs'], queryFn: () => api<RunSummary[]>('/benefits/runs') })
  const create = useMutation({
    mutationFn: () => api<{ id: string }>('/benefits/runs', { method: 'POST', body: { competence } }),
    onSuccess: ({ id }) => {
      void queryClient.invalidateQueries({ queryKey: ['benefit-runs'] })
      onOpen(id)
    },
    onError: fail('Não foi possível apurar.'),
  })
  const last = runs.data?.[0]

  return (
    <div className="flex flex-col gap-6">
      {manage && (
        <Panel title="Nova apuração">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Competência">{props => <Input {...props} type="month" value={competence} onChange={e => setCompetence(e.target.value)} className="w-48" />}</Field>
            <Button variant="primary" loading={create.isPending} disabled={!competence} onClick={() => create.mutate()}>
              <Calculator className="size-4" aria-hidden /> Apurar {competence ? formatMonth(competence) : ''}
            </Button>
          </div>
          <p className="mt-3 max-w-2xl text-[13px] text-steel">
            Regra padrão: dias úteis (segunda a sexta) no período de vínculo e de benefício, menos férias e ausências aprovadas. Plano diário paga valor × dias;
            plano mensal paga proporcional aos dias. Você ajusta os dias de cada pessoa antes de fechar.
          </p>
        </Panel>
      )}

      {last && (
        <section aria-label="Última apuração" className="grid overflow-hidden rounded-md border border-ink bg-paper md:grid-cols-[auto_1fr]">
          <div className="blueprint flex items-end gap-6 bg-ink px-7 py-7">
            <div>
              <p className="text-sm text-steel-soft">Total de {formatMonth(last.competence)}</p>
              <p className="num font-display text-[56px] leading-[0.9] font-semibold text-brand">
                <CountUp value={last.amountCents} format={n => money(Math.round(n))} />
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 divide-line max-md:divide-y lg:grid-cols-3 lg:divide-x">
            {BENEFIT_KINDS.map(kind => {
              const k = last.byKind.find(b => b.kind === kind)
              return (
                <div key={kind} className="px-6 py-5">
                  <dt className="text-sm text-steel">{BENEFIT_KIND_LABELS[kind]}</dt>
                  <dd className="num mt-1.5 font-display text-[32px] leading-none font-semibold text-ink">{money(k?.amountCents ?? 0)}</dd>
                  <dd className="mt-1 text-[13px] text-steel">{k?.people ?? 0} pessoas</dd>
                </div>
              )
            })}
            <div className="px-6 py-5">
              <dt className="text-sm text-steel">Dias úteis no mês</dt>
              <dd className="num mt-1.5 font-display text-[32px] leading-none font-semibold text-ink">{last.workdays}</dd>
              <dd className="mt-1 text-[13px] text-steel">{BENEFIT_RUN_STATUS_LABELS[last.status]}</dd>
            </div>
          </dl>
        </section>
      )}

      {runs.isError && <ErrorState error={runs.error} onRetry={() => runs.refetch()} />}
      <DataTable
        rows={runs.data ?? []}
        loading={runs.isPending}
        empty="Nenhuma apuração ainda"
        emptyIcon={Wallet}
        emptyHint="Cadastre os planos, defina o benefício de cada pessoa e apure o mês."
        onRowClick={r => onOpen(r.id)}
        columns={[
          { label: 'Competência', render: r => <span className="font-medium text-ink">{formatMonth(r.competence)}</span> },
          { label: 'Situação', render: r => <Badge tone={r.status === 'closed' ? 'ok' : 'warn'}>{BENEFIT_RUN_STATUS_LABELS[r.status]}</Badge> },
          { label: 'Pessoas', render: r => <span className="num">{r.people}</span> },
          { label: 'Dias úteis', render: r => <span className="num">{r.workdays}</span> },
          { label: 'Total', className: 'text-right', render: r => <span className="num font-medium text-ink">{money(r.amountCents)}</span> },
        ]}
      />
    </div>
  )
}

function RunView({ id, onBack }: { id: string; onBack: () => void }) {
  const manage = useCan('benefits.manage')
  const queryClient = useQueryClient()
  const run = useQuery({ queryKey: ['benefit-run', id], queryFn: () => api<RunDetail>(`/benefits/runs/${id}`) })
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<RunItem | null>(null)
  const refresh = () => Promise.all(['benefit-run', 'benefit-runs'].map(key => queryClient.invalidateQueries({ queryKey: [key] })))
  const action = useMutation({
    mutationFn: (kind: 'recalculate' | 'close' | 'delete') =>
      kind === 'delete' ? api(`/benefits/runs/${id}`, { method: 'DELETE' }) : api(`/benefits/runs/${id}/${kind}`, { method: 'POST' }),
    onSuccess: async (_, kind) => {
      await refresh()
      if (kind === 'delete') onBack()
      toast.success(kind === 'close' ? 'Apuração fechada.' : kind === 'delete' ? 'Apuração excluída.' : 'Apuração recalculada.')
    },
    onError: fail('Não foi possível concluir.'),
  })
  const download = async () => {
    try {
      await apiDownload(`/benefits/runs/${id}/export`, 'beneficios.xlsx')
    } catch (error) {
      fail('Não foi possível exportar.')(error)
    }
  }

  if (run.isError) return <ErrorState error={run.error} onRetry={() => run.refetch()} />
  if (!run.data) return <SkeletonPanel rows={7} />
  const r = run.data
  const draft = r.status === 'draft'
  const items = r.items.filter(i => !q.trim() || `${i.fullName} ${i.registration}`.toLowerCase().includes(q.trim().toLowerCase()))
  const total = r.items.reduce((s, i) => s + i.amountCents, 0)

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 self-start text-[13.5px] text-steel hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Apurações
      </button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl font-semibold text-ink">{formatMonth(r.competence)}</h2>
          <p className="text-sm text-steel">
            {r.workdays} dias úteis · {r.items.length} pessoas · <span className="num font-medium text-ink">{money(total)}</span> ·{' '}
            {draft ? 'em conferência' : `fechada em ${formatDate(r.closedAt)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={download}>
            <Download className="size-4" aria-hidden /> Planilha
          </Button>
          {manage && draft && (
            <>
              <Button
                onClick={() => window.confirm('Recalcular descarta os ajustes manuais desta apuração. Continuar?') && action.mutate('recalculate')}
                loading={action.isPending && action.variables === 'recalculate'}
              >
                <RefreshCw className="size-4" aria-hidden /> Recalcular
              </Button>
              <Button variant="ghost" onClick={() => window.confirm('Excluir esta apuração?') && action.mutate('delete')} aria-label="Excluir apuração">
                <Trash2 className="size-4" aria-hidden />
              </Button>
              <Button
                variant="primary"
                onClick={() => window.confirm('Depois de fechada, a apuração não muda mais. Fechar?') && action.mutate('close')}
                loading={action.isPending && action.variables === 'close'}
              >
                <Lock className="size-4" aria-hidden /> Fechar apuração
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="relative sm:w-72">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel" aria-hidden />
        <Input aria-label="Buscar" placeholder="Nome ou matrícula" value={q} onChange={e => setQ(e.target.value)} className="h-10 pl-9" />
      </div>
      <DataTable
        rows={items}
        empty="Ninguém com benefício nesta competência"
        minWidth={900}
        onRowClick={manage && draft ? setEditing : undefined}
        columns={[
          {
            label: 'Colaborador',
            render: i => (
              <span>
                <span className="block font-medium text-ink">{i.fullName}</span>
                <span className="text-[13px] text-steel">{i.registration}</span>
              </span>
            ),
          },
          { label: 'Benefício', render: i => <Badge tone={i.kind === 'va' ? 'info' : 'warn'}>{BENEFIT_KIND_LABELS[i.kind]}</Badge> },
          { label: 'Plano', render: i => i.planName },
          { label: 'Valor', render: i => <span className="num">{money(i.unitValueCents)}{i.valueType === 'daily' ? '/dia' : '/mês'}</span> },
          {
            label: 'Dias',
            render: i => (
              <span className="num" title={`${i.eligibleDays} dias úteis − ${i.deductedDays} descontados`}>
                {i.days}
                {i.deductedDays > 0 && <span className="ml-1 text-[12px] text-steel">(−{i.deductedDays})</span>}
                {i.adjusted && <Badge tone="warn">ajustado</Badge>}
              </span>
            ),
          },
          { label: 'Total', className: 'text-right', render: i => <span className="num font-medium text-ink">{money(i.amountCents)}</span> },
        ]}
        actions={
          manage && draft
            ? i => (
                <Button size="sm" variant="ghost" onClick={() => setEditing(i)} aria-label={`Ajustar ${i.fullName}`}>
                  <Pencil className="size-4" aria-hidden />
                </Button>
              )
            : undefined
        }
      />
      {editing && <ItemDrawer runId={id} item={editing} workdays={r.workdays} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  )
}

function ItemDrawer({ runId, item, workdays, onClose, onSaved }: { runId: string; item: RunItem; workdays: number; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [days, setDays] = useState(String(item.days))
  const [note, setNote] = useState(item.note)
  const n = Number(days)
  const preview = item.valueType === 'daily' ? item.unitValueCents * n : Math.round((item.unitValueCents * n) / (workdays || 1))
  const save = useMutation({
    mutationFn: () => api(`/benefits/runs/${runId}/items/${item.id}`, { method: 'PATCH', body: { days: n, note } }),
    onSuccess: async () => {
      await onSaved()
      toast.success('Dias ajustados.')
      onClose()
    },
    onError: fail('Não foi possível ajustar.'),
  })
  return (
    <Drawer
      open
      onOpenChange={open => !open && onClose()}
      title={item.fullName}
      description={`${item.planName}: ${item.eligibleDays} dias úteis elegíveis, ${item.deductedDays} descontados por férias ou ausências.`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="item-form" loading={save.isPending}>
            Salvar ajuste
          </Button>
        </>
      }
    >
      <form
        id="item-form"
        className="grid gap-4"
        onSubmit={e => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Field label="Dias pagos" required hint={`Novo total: ${Number.isFinite(preview) ? money(preview) : '—'}`}>
          {props => <Input {...props} type="number" min={0} max={31} required value={days} onChange={e => setDays(e.target.value)} className="w-32" />}
        </Field>
        <Field label="Motivo do ajuste" hint="Fica na planilha e no histórico.">
          {props => <Input {...props} maxLength={300} value={note} onChange={e => setNote(e.target.value)} />}
        </Field>
      </form>
    </Drawer>
  )
}

// ---------- colaboradores ----------

function People() {
  const manage = useCan('benefits.manage')
  const rows = useQuery({ queryKey: ['benefit-employees'], queryFn: () => api<EmployeeRow[]>('/benefits/employees') })
  const plans = useQuery(plansQuery)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<BenefitKind | 'none' | ''>('')
  const [editing, setEditing] = useState<EmployeeRow | null>(null)
  const list = (rows.data ?? [])
    .filter(r => !q.trim() || `${r.fullName} ${r.registration}`.toLowerCase().includes(q.trim().toLowerCase()))
    .filter(r => !kind || (kind === 'none' ? !r.planId : r.kind === kind))
    .map(r => ({ ...r, id: r.employeeId }))
  const without = (rows.data ?? []).filter(r => !r.planId).length

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel" aria-hidden />
          <Input aria-label="Buscar" placeholder="Nome ou matrícula" value={q} onChange={e => setQ(e.target.value)} className="h-10 pl-9" />
        </div>
        <Select aria-label="Benefício" value={kind} onChange={e => setKind(e.target.value as typeof kind)} className="sm:w-56">
          <option value="">Todos</option>
          {BENEFIT_KINDS.map(k => (
            <option key={k} value={k}>
              {BENEFIT_KIND_LABELS[k]}
            </option>
          ))}
          <option value="none">Sem benefício</option>
        </Select>
        {without > 0 && <span className="text-sm text-steel">{without} pessoas sem benefício definido</span>}
      </div>
      {rows.isError && <ErrorState error={rows.error} onRetry={() => rows.refetch()} />}
      <DataTable
        rows={list}
        loading={rows.isPending}
        empty="Ninguém com esses filtros"
        onRowClick={manage ? setEditing : undefined}
        columns={[
          {
            label: 'Colaborador',
            render: r => (
              <span>
                <span className="block font-medium text-ink">{r.fullName}</span>
                <span className="text-[13px] text-steel">
                  {r.registration}
                  {r.departmentName ? ` · ${r.departmentName}` : ''}
                </span>
              </span>
            ),
          },
          { label: 'Benefício', render: r => (r.kind ? <Badge tone={r.kind === 'va' ? 'info' : 'warn'}>{BENEFIT_KIND_LABELS[r.kind]}</Badge> : <Badge tone="danger">Sem benefício</Badge>) },
          { label: 'Plano', render: r => r.planName ?? '—' },
          { label: 'Desde', render: r => formatDate(r.startDate) ?? '—' },
        ]}
      />
      {editing && <ChoiceDrawer row={editing} plans={(plans.data ?? []).filter(p => p.active)} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ChoiceDrawer({ row, plans, onClose }: { row: EmployeeRow; plans: Plan[]; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [planId, setPlanId] = useState(row.planId ?? plans[0]?.id ?? '')
  const [startDate, setStartDate] = useState(todayIso())
  const history = useQuery({
    queryKey: ['benefit-history', row.employeeId],
    queryFn: () => api<{ id: string; planName: string; kind: BenefitKind; startDate: string; endDate: string | null }[]>(`/benefits/employees/${row.employeeId}`),
  })
  const refresh = () => Promise.all(['benefit-employees', 'benefit-plans', 'benefit-history'].map(key => queryClient.invalidateQueries({ queryKey: [key] })))
  const save = useMutation({
    mutationFn: () => api(`/benefits/employees/${row.employeeId}`, { method: 'PUT', body: { planId, startDate } }),
    onSuccess: async () => {
      await refresh()
      toast.success('Benefício definido.')
      onClose()
    },
    onError: fail('Não foi possível salvar.'),
  })
  const end = useMutation({
    mutationFn: () => api(`/benefits/employees/${row.employeeId}/end`, { method: 'POST', body: { endDate: startDate } }),
    onSuccess: async () => {
      await refresh()
      toast.success('Benefício encerrado.')
      onClose()
    },
    onError: fail('Não foi possível encerrar.'),
  })
  return (
    <Drawer
      open
      onOpenChange={open => !open && onClose()}
      title={row.fullName}
      description="Um benefício por vez. Trocar encerra o atual na véspera da nova data; o histórico fica guardado."
      footer={
        <>
          {row.planId && (
            <Button variant="danger" className="mr-auto" loading={end.isPending} onClick={() => end.mutate()}>
              Encerrar em {formatDate(startDate)}
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="choice-form" loading={save.isPending} disabled={!planId}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        id="choice-form"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={e => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Field label="Plano" required>
          {props => (
            <Select {...props} value={planId} onChange={e => setPlanId(e.target.value)}>
              {plans.length === 0 && <option value="">Cadastre um plano primeiro</option>}
              {plans.map(p => (
                <option key={p.id} value={p.id}>
                  {BENEFIT_KIND_LABELS[p.kind]}: {p.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="A partir de" required>
          {props => <Input {...props} type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} />}
        </Field>
      </form>
      {(history.data?.length ?? 0) > 0 && (
        <section className="mt-6">
          <h3 className="mb-2 text-sm font-medium text-ink">Histórico</h3>
          <ul className="divide-y divide-line rounded-sm border border-line text-sm">
            {history.data!.map(h => (
              <li key={h.id} className="flex justify-between gap-3 px-3 py-2">
                <span className="text-ink-soft">
                  {BENEFIT_KIND_LABELS[h.kind]}: {h.planName}
                </span>
                <span className="num text-steel">
                  {formatDate(h.startDate)} a {h.endDate ? formatDate(h.endDate) : 'hoje'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Drawer>
  )
}

// ---------- planos ----------

function Plans() {
  const manage = useCan('benefits.manage')
  const plans = useQuery(plansQuery)
  const [editing, setEditing] = useState<Plan | null | undefined>(undefined)
  const [valuing, setValuing] = useState<Plan | null>(null)

  if (plans.isError) return <ErrorState error={plans.error} onRetry={() => plans.refetch()} />
  if (plans.isPending) return <SkeletonPanel rows={4} />
  return (
    <div className="flex flex-col gap-4">
      {manage && (
        <Button variant="primary" className="self-start" onClick={() => setEditing(null)}>
          <Plus className="size-4" aria-hidden /> Novo plano
        </Button>
      )}
      {plans.data.length === 0 ? (
        <EmptyState icon={Wallet} title="Nenhum plano cadastrado">
          Cadastre o VA e o VR com o valor vigente; reajustes entram no histórico com a data em que passam a valer.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.data.map(p => (
            <Panel
              key={p.id}
              title={
                <span className="flex items-center gap-2">
                  {p.name}
                  {!p.active && <Badge>inativo</Badge>}
                </span>
              }
              aside={
                manage && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(p)} aria-label={`Editar ${p.name}`}>
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                )
              }
            >
              <p className="text-[13px] text-steel">
                {BENEFIT_KIND_LABELS[p.kind]} · {BENEFIT_VALUE_TYPE_LABELS[p.valueType]}
                {p.provider ? ` · ${p.provider}` : ''}
              </p>
              <p className="num mt-2 font-display text-4xl font-semibold text-ink">
                {p.currentValueCents === null ? '—' : money(p.currentValueCents)}
                <span className="text-lg text-steel">{p.valueType === 'daily' ? '/dia' : '/mês'}</span>
              </p>
              <p className="mt-1 text-[13px] text-steel">{p.employees} pessoas</p>
              {p.scheduled.map(s => (
                <p key={s.effectiveFrom} className="mt-2">
                  <Badge tone="info">
                    {money(s.valueCents)} a partir de {formatDate(s.effectiveFrom)}
                  </Badge>
                </p>
              ))}
              <h3 className="mt-4 mb-1.5 text-[13px] font-medium text-steel uppercase">Histórico de valores</h3>
              <ul className="divide-y divide-line text-sm">
                {p.history.map(h => (
                  <li key={h.effectiveFrom} className="flex justify-between py-1.5">
                    <span className="text-steel">desde {formatDate(h.effectiveFrom)}</span>
                    <span className="num text-ink">{money(h.valueCents)}</span>
                  </li>
                ))}
              </ul>
              {manage && (
                <Button size="sm" className="mt-3" onClick={() => setValuing(p)}>
                  Programar novo valor
                </Button>
              )}
            </Panel>
          ))}
        </div>
      )}
      {editing !== undefined && <PlanDrawer plan={editing} onClose={() => setEditing(undefined)} />}
      {valuing && <ValueDrawer plan={valuing} onClose={() => setValuing(null)} />}
    </div>
  )
}

function PlanDrawer({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    kind: plan?.kind ?? 'vr',
    name: plan?.name ?? '',
    // A Falcão usa o Caju para alimentação, refeição e mobilidade.
    provider: plan?.provider ?? 'Caju',
    valueType: plan?.valueType ?? 'daily',
    active: plan?.active ?? true,
    value: '',
    effectiveFrom: todayIso(),
  })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [key]: e.target.value }))
  const save = useMutation({
    mutationFn: () => {
      const { value, effectiveFrom, ...body } = form
      return plan
        ? api(`/benefits/plans/${plan.id}`, { method: 'PUT', body })
        : api('/benefits/plans', { method: 'POST', body: { ...body, valueCents: toCents(value), effectiveFrom } })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['benefit-plans'] })
      toast.success('Plano salvo.')
      onClose()
    },
    onError: fail('Não foi possível salvar.'),
  })
  return (
    <Drawer
      open
      onOpenChange={open => !open && onClose()}
      title={plan ? 'Editar plano' : 'Novo plano'}
      description={plan ? 'Para mudar o valor, use "Programar novo valor": o histórico fica guardado.' : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="plan-form" loading={save.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        id="plan-form"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={e => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Field label="Benefício" required>
          {props => (
            <Select {...props} value={form.kind} onChange={set('kind')}>
              {BENEFIT_KINDS.map(k => (
                <option key={k} value={k}>
                  {BENEFIT_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Cálculo" required>
          {props => (
            <Select {...props} value={form.valueType} onChange={set('valueType')}>
              {BENEFIT_VALUE_TYPES.map(v => (
                <option key={v} value={v}>
                  {BENEFIT_VALUE_TYPE_LABELS[v]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Nome do plano" required className="sm:col-span-2">
          {props => <Input {...props} required minLength={2} placeholder="Ex.: VR obra" value={form.name} onChange={set('name')} />}
        </Field>
        <Field label="Fornecedor" className="sm:col-span-2">
          {props => <Input {...props} placeholder="Caju" value={form.provider} onChange={set('provider')} />}
        </Field>
        {!plan && (
          <>
            <Field label={form.valueType === 'daily' ? 'Valor por dia (R$)' : 'Valor mensal (R$)'} required>
              {props => <Input {...props} required inputMode="decimal" placeholder="0,00" value={form.value} onChange={set('value')} />}
            </Field>
            <Field label="Vale a partir de" required>
              {props => <Input {...props} type="date" required value={form.effectiveFrom} onChange={set('effectiveFrom')} />}
            </Field>
          </>
        )}
        {plan && (
          <label className="flex items-center gap-2 text-sm text-ink-soft sm:col-span-2">
            <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="size-4 accent-ink" />
            Plano ativo (inativo não aceita novas escolhas)
          </label>
        )}
      </form>
    </Drawer>
  )
}

function ValueDrawer({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso())
  const save = useMutation({
    mutationFn: () => api(`/benefits/plans/${plan.id}/values`, { method: 'POST', body: { valueCents: toCents(value), effectiveFrom } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['benefit-plans'] })
      toast.success('Novo valor programado.')
      onClose()
    },
    onError: fail('Não foi possível programar.'),
  })
  return (
    <Drawer
      open
      onOpenChange={open => !open && onClose()}
      title={`Novo valor: ${plan.name}`}
      description="O valor atual continua no histórico. A apuração usa o valor vigente no primeiro dia do mês."
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="value-form" loading={save.isPending}>
            Programar
          </Button>
        </>
      }
    >
      <form
        id="value-form"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={e => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Field label={plan.valueType === 'daily' ? 'Valor por dia (R$)' : 'Valor mensal (R$)'} required>
          {props => <Input {...props} required inputMode="decimal" placeholder="0,00" value={value} onChange={e => setValue(e.target.value)} />}
        </Field>
        <Field label="Vale a partir de" required>
          {props => <Input {...props} type="date" required value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} />}
        </Field>
      </form>
    </Drawer>
  )
}
