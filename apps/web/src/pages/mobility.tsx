import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { AlertTriangle, Bus, CheckCircle2, Download, FileSpreadsheet, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'

import { TRANSPORT_MODE_LABELS, TRANSPORT_MODES, type TransportMode } from '@falcao-rh/contracts'

import { CountUp } from '../components/motion'
import { Button } from '../components/ui/button'
import { DataTable } from '../components/ui/data-table'
import { Drawer } from '../components/ui/drawer'
import { Field, Input, Select, Textarea } from '../components/ui/field'
import { FileInput } from '../components/ui/file-input'
import { Badge, EmptyState, ErrorState, PageHeader, Panel, Skeleton } from '../components/ui/layout'
import { api, ApiError, apiDownload, apiUpload } from '../lib/api'
import { cn } from '../lib/cn'
import { formatNumber, statusLabel, statusTone } from '../lib/format'
import { useCan } from '../lib/session'
import type { EmployeeStatus } from '../lib/types'

type BoardRow = {
  employeeId: string
  registration: string
  fullName: string
  status: EmployeeStatus
  departmentName: string | null
  homeCity: string | null
  homeDistrict: string | null
  mode: TransportMode | null
  provider: string | null
  routeId: string | null
  routeName: string | null
  pickupPoint: string | null
  pickupDistrict: string | null
  pickupCity: string | null
  monthlyCostCents: number | null
  notes: string | null
}
type Row = BoardRow & { id: string }

type Route = {
  id: string
  name: string
  vehicle: string | null
  capacity: number | null
  driver: string | null
  shift: string | null
  riders: number
}

type Tab = 'visao' | 'colaboradores' | 'fretado' | 'qualidade' | 'atualizar'
const TABS: { key: Tab; label: string }[] = [
  { key: 'visao', label: 'Visão geral' },
  { key: 'colaboradores', label: 'Colaboradores' },
  { key: 'fretado', label: 'Fretado' },
  { key: 'qualidade', label: 'Qualidade dos dados' },
  { key: 'atualizar', label: 'Atualizar dados' },
]

const MODE_COLORS: Record<TransportMode | 'unset', string> = {
  mobility: 'var(--color-brand)',
  chartered: 'var(--color-ink)',
  own: 'var(--color-info)',
  none: 'var(--color-steel-soft)',
  unset: 'var(--color-danger)',
}
const UNSET = 'Não cadastrado'

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const cityOf = (r: BoardRow) => r.pickupCity ?? r.homeCity
const modeLabel = (mode: TransportMode | null) => (mode ? TRANSPORT_MODE_LABELS[mode] : UNSET)

const boardQuery = { queryKey: ['transport-board'], queryFn: () => api<BoardRow[]>('/transport/board') }
const routesQuery = { queryKey: ['transport-routes'], queryFn: () => api<Route[]>('/transport/routes') }

const fail = (fallback: string) => (error: unknown) => toast.error(error instanceof ApiError ? error.message : fallback)

export function MobilityPage() {
  const search = useSearch({ strict: false }) as { tab?: Tab }
  const navigate = useNavigate()
  const tab = search.tab ?? 'visao'
  const manage = useCan('transport.manage')
  const board = useQuery(boardQuery)
  const routes = useQuery(routesQuery)
  const [editing, setEditing] = useState<BoardRow | null>(null)
  const rows = useMemo<Row[]>(() => (board.data ?? []).map(r => ({ ...r, id: r.employeeId })), [board.data])

  const download = async () => {
    try {
      await apiDownload('/transport/export', 'transporte.xlsx')
    } catch (error) {
      fail('Não foi possível exportar.')(error)
    }
  }

  return (
    <>
      <PageHeader
        title="Mobilidade"
        description="Como cada pessoa chega à obra: mobilidade, fretado, condução própria. Ocupação das rotas e dados para corrigir."
        actions={
          <Button onClick={download}>
            <Download className="size-4" aria-hidden /> Exportar planilha
          </Button>
        }
      />

      <nav className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0" aria-label="Seções de mobilidade">
        {TABS.filter(t => t.key !== 'atualizar' || manage).map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => void navigate({ to: '/mobilidade', search: { tab: t.key } })}
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

      {(board.isError || routes.isError) && <ErrorState error={board.error ?? routes.error} onRetry={() => void board.refetch()} />}
      {board.isPending || routes.isPending ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-40" />
          <Skeleton className="h-80" />
        </div>
      ) : (
        <>
          {tab === 'visao' && <Overview rows={rows} routes={routes.data ?? []} />}
          {tab === 'colaboradores' && <People rows={rows} routes={routes.data ?? []} onEdit={manage ? setEditing : undefined} />}
          {tab === 'fretado' && <Routes routes={routes.data ?? []} rows={rows} />}
          {tab === 'qualidade' && <Quality rows={rows} routes={routes.data ?? []} onEdit={manage ? setEditing : undefined} />}
          {tab === 'atualizar' && manage && <ImportPanel />}
        </>
      )}

      {editing && <TransportDrawer row={editing} routes={routes.data ?? []} onClose={() => setEditing(null)} />}
    </>
  )
}

// ---------- visão geral ----------

function Overview({ rows, routes }: { rows: Row[]; routes: Route[] }) {
  const count = (mode: TransportMode | null) => rows.filter(r => r.mode === mode).length
  const cost = rows.reduce((sum, r) => sum + (r.mode === 'mobility' || r.mode === 'chartered' ? (r.monthlyCostCents ?? 0) : 0), 0)
  const capacity = routes.reduce((sum, r) => sum + (r.capacity ?? 0), 0)
  const riders = routes.reduce((sum, r) => sum + r.riders, 0)
  const onLeave = rows.filter(r => r.status === 'on_leave').length
  const pie = [...TRANSPORT_MODES.map(mode => ({ key: mode, name: TRANSPORT_MODE_LABELS[mode], value: count(mode) })), { key: 'unset' as const, name: UNSET, value: count(null) }].filter(
    d => d.value > 0,
  )

  if (rows.length === 0)
    return (
      <EmptyState icon={Bus} title="Nenhum colaborador ativo">
        Cadastre colaboradores para acompanhar a mobilidade.
      </EmptyState>
    )

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Indicadores de mobilidade" className="grid overflow-hidden rounded-md border border-ink bg-paper md:grid-cols-[auto_1fr]">
        <div className="blueprint flex items-end gap-6 bg-ink px-7 py-7">
          <div>
            <p className="text-sm text-steel-soft">Colaboradores</p>
            <p className="num font-display text-[96px] leading-[0.82] font-semibold text-brand">
              <CountUp value={rows.length} />
            </p>
          </div>
          <div className="mb-1 text-sm leading-6 text-paper/85">
            <p>
              <span className="num font-semibold text-paper">{onLeave}</span> afastados
            </p>
            <p>
              <span className="num font-semibold text-paper">{count(null)}</span> sem cadastro
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 divide-line max-md:divide-y lg:grid-cols-4 lg:divide-x">
          <Stat label="Mobilidade">
            <CountUp value={count('mobility')} />
          </Stat>
          <Stat label="Fretado">
            <CountUp value={count('chartered')} />
          </Stat>
          <Stat label="Ocupação do fretado" hint={`${riders} passageiros em ${capacity} lugares`}>
            {capacity ? <CountUp value={riders / capacity} format={n => `${Math.round(n * 100)}%`} /> : '—'}
          </Stat>
          <Stat label="Custo mensal" hint="Soma dos custos informados de mobilidade e fretado">
            <span className="text-[32px]">{money(cost)}</span>
          </Stat>
        </dl>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Modalidade de transporte">
          <div className="grid items-center gap-4 sm:grid-cols-[220px_1fr]">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius={58} outerRadius={96} paddingAngle={2} stroke="var(--color-paper)">
                    {pie.map(d => (
                      <Cell key={d.key} fill={MODE_COLORS[d.key]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 5, borderColor: 'var(--color-ink)', fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex flex-col gap-2 text-sm">
              {pie.map(d => (
                <li key={d.key} className="flex items-center gap-3">
                  <span className="size-3 rounded-sm" style={{ background: MODE_COLORS[d.key] }} aria-hidden />
                  <span className="flex-1 text-ink-soft">{d.name}</span>
                  <span className="num font-medium text-ink">{d.value}</span>
                  <span className="num w-12 text-right text-steel">{Math.round((d.value / rows.length) * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
        <Panel title="Ocupação das rotas">
          <Occupancy routes={routes} />
        </Panel>
      </div>
      <Panel title="Cidades com mais colaboradores" aside={<span className="text-[13px] text-steel">Cidade de embarque ou, sem ela, de residência</span>}>
        <CityChart rows={rows} limit={10} />
      </Panel>
      <Cities rows={rows} />
    </div>
  )
}

function Stat({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="px-6 py-5" title={hint}>
      <dt className="text-sm text-steel">{label}</dt>
      <dd className="num mt-1.5 font-display text-[44px] leading-none font-semibold text-ink">{children}</dd>
    </div>
  )
}

function Occupancy({ routes }: { routes: Route[] }) {
  if (routes.length === 0) return <p className="text-sm text-steel">Nenhuma rota de fretado cadastrada.</p>
  return (
    <ul className="flex flex-col gap-3">
      {routes.map((r, i) => {
        const ratio = r.capacity ? r.riders / r.capacity : 0
        return (
          <li key={r.id} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate text-ink-soft" title={r.name}>
              {r.name}
            </span>
            <span className="relative h-3 overflow-hidden rounded-full bg-concrete">
              <span
                className={cn('funnel-bar absolute inset-y-0 left-0 rounded-full', ratio > 1 ? 'bg-danger' : ratio > 0.85 ? 'bg-brand' : 'bg-ink')}
                style={{ width: `${Math.min(100, ratio * 100)}%`, animationDelay: `${i * 60}ms` }}
              />
            </span>
            <span className={cn('num w-20 text-right', ratio > 1 ? 'font-semibold text-danger' : 'text-ink')}>
              {r.riders}/{r.capacity ?? '—'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function CityChart({ rows, limit }: { rows: Row[]; limit?: number }) {
  const data = useMemo(() => {
    const map = new Map<string, Record<string, number>>()
    for (const r of rows) {
      const city = cityOf(r) ?? 'Sem cidade'
      const entry = map.get(city) ?? { total: 0 }
      entry.total = (entry.total ?? 0) + 1
      const key = r.mode ?? 'unset'
      entry[key] = (entry[key] ?? 0) + 1
      map.set(city, entry)
    }
    return [...map.entries()]
      .sort(([, a], [, b]) => (b.total ?? 0) - (a.total ?? 0))
      .map(([city, v]) => ({ city, ...v }))
      .slice(0, limit)
  }, [rows, limit])
  return (
    <div style={{ height: Math.max(200, data.length * 34 + 60) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid stroke="var(--color-line)" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--color-steel)' }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="city" width={120} tick={{ fontSize: 12, fill: 'var(--color-steel)' }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ borderRadius: 5, borderColor: 'var(--color-ink)', fontSize: 13 }} cursor={{ fill: 'var(--color-concrete)' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {[...TRANSPORT_MODES, 'unset' as const].map(mode => (
            <Bar key={mode} dataKey={mode} name={mode === 'unset' ? UNSET : TRANSPORT_MODE_LABELS[mode]} stackId="m" fill={MODE_COLORS[mode]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------- colaboradores ----------

function People({ rows, routes, onEdit }: { rows: Row[]; routes: Route[]; onEdit?: (row: BoardRow) => void }) {
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<TransportMode | 'unset' | ''>('')
  const [routeId, setRouteId] = useState('')
  const filtered = rows.filter(r => {
    const term = q.trim().toLowerCase()
    if (term && ![r.fullName, r.registration, cityOf(r), r.pickupDistrict].some(v => v?.toLowerCase().includes(term))) return false
    if (mode && (mode === 'unset' ? r.mode !== null : r.mode !== mode)) return false
    if (routeId && r.routeId !== routeId) return false
    return true
  })
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:flex sm:flex-wrap">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel" aria-hidden />
          <Input aria-label="Buscar" placeholder="Nome, matrícula, cidade ou bairro" value={q} onChange={e => setQ(e.target.value)} className="h-10 pl-9" />
        </div>
        <Select aria-label="Modalidade" value={mode} onChange={e => setMode(e.target.value as typeof mode)} className="sm:w-56">
          <option value="">Todas as modalidades</option>
          {TRANSPORT_MODES.map(m => (
            <option key={m} value={m}>
              {TRANSPORT_MODE_LABELS[m]}
            </option>
          ))}
          <option value="unset">{UNSET}</option>
        </Select>
        <Select aria-label="Rota" value={routeId} onChange={e => setRouteId(e.target.value)} className="sm:w-48">
          <option value="">Todas as rotas</option>
          {routes.map(r => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
        <span className="self-center text-sm text-steel">{formatNumber(filtered.length)} pessoas</span>
      </div>
      <DataTable
        rows={filtered}
        empty="Ninguém com esses filtros"
        minWidth={900}
        onRowClick={onEdit}
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
          { label: 'Situação', render: r => <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge> },
          { label: 'Modalidade', render: r => (r.mode ? modeLabel(r.mode) : <Badge tone="danger">{UNSET}</Badge>) },
          { label: 'Rota / fornecedor', render: r => r.routeName ?? r.provider ?? '—' },
          {
            label: 'Embarque',
            render: r => (
              <span className="block max-w-56 truncate" title={r.pickupPoint ?? undefined}>
                {[r.pickupPoint, r.pickupDistrict].filter(Boolean).join(' · ') || '—'}
              </span>
            ),
          },
          { label: 'Cidade', render: r => cityOf(r) ?? '—' },
          { label: 'Custo/mês', className: 'text-right', render: r => (r.monthlyCostCents === null ? '—' : <span className="num">{money(r.monthlyCostCents)}</span>) },
        ]}
      />
    </div>
  )
}

// ---------- fretado ----------

function Routes({ routes, rows }: { routes: Route[]; rows: Row[] }) {
  const manage = useCan('transport.manage')
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Route | null | undefined>(undefined)
  const remove = useMutation({
    mutationFn: (id: string) => api(`/transport/routes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Rota excluída. Os passageiros ficaram sem rota.')
      void queryClient.invalidateQueries({ queryKey: ['transport-routes'] })
      void queryClient.invalidateQueries({ queryKey: ['transport-board'] })
    },
    onError: fail('Não foi possível excluir.'),
  })
  return (
    <div className="flex flex-col gap-4">
      {manage && (
        <Button variant="primary" className="self-start" onClick={() => setEditing(null)}>
          <Plus className="size-4" aria-hidden /> Nova rota
        </Button>
      )}
      {routes.length === 0 ? (
        <EmptyState icon={Bus} title="Nenhuma rota cadastrada">
          Cadastre as rotas do fretado para controlar ocupação e pontos de embarque.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {routes.map(r => {
            const riders = rows.filter(p => p.routeId === r.id && p.mode === 'chartered')
            const over = r.capacity !== null && r.riders > r.capacity
            return (
              <Panel
                key={r.id}
                title={r.name}
                aside={
                  manage && (
                    <span className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)} aria-label={`Editar ${r.name}`}>
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.confirm(`Excluir a rota ${r.name}?`) && remove.mutate(r.id)}
                        aria-label={`Excluir ${r.name}`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </span>
                  )
                }
              >
                <p className={cn('num font-display text-4xl font-semibold', over ? 'text-danger' : 'text-ink')}>
                  {r.riders}
                  <span className="text-xl text-steel">/{r.capacity ?? '—'}</span>
                </p>
                <p className="mt-1 text-sm text-steel">{[r.vehicle, r.shift, r.driver].filter(Boolean).join(' · ') || 'Sem veículo informado'}</p>
                {over && <Badge tone="danger">Acima da capacidade</Badge>}
                {riders.length > 0 && (
                  <ul className="mt-3 max-h-48 divide-y divide-line overflow-y-auto border-t border-line text-sm">
                    {riders.map(p => (
                      <li key={p.id} className="flex justify-between gap-2 py-1.5">
                        <span className="truncate text-ink-soft">{p.fullName}</span>
                        <span className="truncate text-[13px] text-steel">{p.pickupDistrict ?? p.pickupPoint ?? ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )
          })}
        </div>
      )}
      {editing !== undefined && <RouteDrawer route={editing} onClose={() => setEditing(undefined)} />}
    </div>
  )
}

function RouteDrawer({ route, onClose }: { route: Route | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: route?.name ?? '',
    vehicle: route?.vehicle ?? '',
    capacity: route?.capacity ? String(route.capacity) : '',
    driver: route?.driver ?? '',
    shift: route?.shift ?? '',
  })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [key]: e.target.value }))
  const save = useMutation({
    mutationFn: () => {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]))
      return route ? api(`/transport/routes/${route.id}`, { method: 'PUT', body }) : api('/transport/routes', { method: 'POST', body })
    },
    onSuccess: () => {
      toast.success('Rota salva.')
      void queryClient.invalidateQueries({ queryKey: ['transport-routes'] })
      onClose()
    },
    onError: fail('Não foi possível salvar.'),
  })
  return (
    <Drawer
      open
      onOpenChange={open => !open && onClose()}
      title={route ? 'Editar rota' : 'Nova rota'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="route-form" loading={save.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        id="route-form"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={e => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Field label="Nome da rota" required className="sm:col-span-2">
          {props => <Input {...props} required minLength={2} value={form.name} onChange={set('name')} />}
        </Field>
        <Field label="Veículo">{props => <Input {...props} placeholder="Ônibus, van…" value={form.vehicle} onChange={set('vehicle')} />}</Field>
        <Field label="Lugares">{props => <Input {...props} type="number" min={1} max={200} value={form.capacity} onChange={set('capacity')} />}</Field>
        <Field label="Turno">{props => <Input {...props} placeholder="Manhã, 06h…" value={form.shift} onChange={set('shift')} />}</Field>
        <Field label="Motorista ou empresa">{props => <Input {...props} value={form.driver} onChange={set('driver')} />}</Field>
      </form>
    </Drawer>
  )
}

// ---------- cidades ----------

function Cities({ rows }: { rows: Row[] }) {
  const table = useMemo(() => {
    const map = new Map<string, { id: string; city: string; total: number; chartered: number; mobility: number; cost: number }>()
    for (const r of rows) {
      const city = cityOf(r) ?? 'Sem cidade'
      const e = map.get(city) ?? { id: city, city, total: 0, chartered: 0, mobility: 0, cost: 0 }
      e.total++
      if (r.mode === 'chartered') e.chartered++
      if (r.mode === 'mobility') e.mobility++
      e.cost += r.monthlyCostCents ?? 0
      map.set(city, e)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [rows])
  return (
    <DataTable
      rows={table}
      empty="Sem dados"
      columns={[
        { label: 'Cidade', render: c => <span className="font-medium text-ink">{c.city}</span> },
        { label: 'Colaboradores', render: c => <span className="num">{c.total}</span> },
        { label: 'Fretado', render: c => <span className="num">{c.chartered}</span> },
        { label: 'Mobilidade', render: c => <span className="num">{c.mobility}</span> },
        { label: 'Custo/mês', className: 'text-right', render: c => <span className="num">{money(c.cost)}</span> },
      ]}
    />
  )
}

// ---------- qualidade dos dados ----------

function Quality({ rows, routes, onEdit }: { rows: Row[]; routes: Route[]; onEdit?: (row: BoardRow) => void }) {
  const checks: { title: string; hint: string; rows: Row[] }[] = [
    { title: 'Sem modalidade cadastrada', hint: 'Ninguém sabe como essa pessoa chega à obra.', rows: rows.filter(r => r.mode === null) },
    {
      title: 'Afastados com transporte ativo',
      hint: 'Afastados não deveriam consumir fretado nem crédito de mobilidade.',
      rows: rows.filter(r => r.status === 'on_leave' && (r.mode === 'chartered' || r.mode === 'mobility')),
    },
    { title: 'Fretado sem ponto de embarque', hint: 'O motorista não sabe onde buscar.', rows: rows.filter(r => r.mode === 'chartered' && !r.pickupPoint) },
    { title: 'Fretado sem rota', hint: 'A rota foi excluída ou nunca foi informada.', rows: rows.filter(r => r.mode === 'chartered' && !r.routeId) },
    { title: 'Mobilidade sem custo informado', hint: 'Sem o valor, o custo mensal fica subestimado.', rows: rows.filter(r => r.mode === 'mobility' && r.monthlyCostCents === null) },
    { title: 'Sem cidade', hint: 'Nem cidade de embarque nem endereço na ficha.', rows: rows.filter(r => !cityOf(r)) },
    {
      title: 'Embarque em cidade diferente da residência',
      hint: 'Pode ser endereço desatualizado na ficha.',
      rows: rows.filter(r => r.pickupCity && r.homeCity && r.pickupCity.trim().toLowerCase() !== r.homeCity.trim().toLowerCase()),
    },
  ]
  const overbooked = routes.filter(r => r.capacity !== null && r.riders > r.capacity)
  const issues = checks.reduce((sum, c) => sum + c.rows.length, 0) + overbooked.length
  const score = rows.length ? Math.max(0, 1 - checks[0]!.rows.length / rows.length) : 1

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-6 rounded-md border border-line bg-paper px-6 py-5">
        <div>
          <p className="text-sm text-steel">Cobertura do cadastro</p>
          <p className="num font-display text-5xl font-semibold text-ink">
            <CountUp value={score} format={n => `${Math.round(n * 100)}%`} />
          </p>
        </div>
        <p className="max-w-lg text-sm text-steel">
          {issues === 0 ? 'Nenhuma inconsistência encontrada.' : `${issues} pontos para conferir. Clique numa pessoa para corrigir.`}
        </p>
      </div>
      {overbooked.length > 0 && (
        <Panel title={`Rotas acima da capacidade (${overbooked.length})`}>
          <ul className="flex flex-wrap gap-2 text-sm">
            {overbooked.map(r => (
              <li key={r.id}>
                <Badge tone="danger">
                  {r.name}: {r.riders}/{r.capacity}
                </Badge>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {checks.map(check => (
          <Panel
            key={check.title}
            title={
              <span className="flex items-center gap-2">
                {check.rows.length ? <AlertTriangle className="size-4 text-danger" aria-hidden /> : <CheckCircle2 className="size-4 text-ok" aria-hidden />}
                {check.title}
              </span>
            }
            aside={<span className="num text-sm font-semibold text-ink">{check.rows.length}</span>}
            bodyClassName="p-0"
          >
            <p className="px-5 pt-3 text-[13px] text-steel">{check.hint}</p>
            {check.rows.length > 0 && (
              <ul className="mt-2 max-h-56 divide-y divide-line overflow-y-auto border-t border-line">
                {check.rows.map(r => (
                  <li key={r.id}>
                    <button
                      type="button"
                      disabled={!onEdit}
                      onClick={() => onEdit?.(r)}
                      className="flex w-full justify-between gap-3 px-5 py-2 text-left text-sm enabled:hover:bg-concrete/50"
                    >
                      <span className="truncate text-ink">{r.fullName}</span>
                      <span className="text-[13px] text-steel">{r.registration}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ))}
      </div>
    </div>
  )
}

// ---------- edição ----------

function TransportDrawer({ row, routes, onClose }: { row: BoardRow; routes: Route[]; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    mode: row.mode ?? 'mobility',
    provider: row.provider ?? '',
    routeId: row.routeId ?? '',
    pickupPoint: row.pickupPoint ?? '',
    pickupDistrict: row.pickupDistrict ?? '',
    pickupCity: row.pickupCity ?? row.homeCity ?? '',
    monthlyCost: row.monthlyCostCents === null ? '' : (row.monthlyCostCents / 100).toFixed(2).replace('.', ','),
    notes: row.notes ?? '',
  })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [key]: e.target.value }))
  const refresh = () => Promise.all(['transport-board', 'transport-routes'].map(key => queryClient.invalidateQueries({ queryKey: [key] })))
  const save = useMutation({
    mutationFn: () => {
      const { monthlyCost, ...rest } = form
      const cost = monthlyCost.trim() === '' ? null : Math.round(Number(monthlyCost.replace(/\./g, '').replace(',', '.')) * 100)
      if (cost !== null && !Number.isFinite(cost)) throw new ApiError(400, 'invalid', 'Custo mensal inválido.')
      const body = { ...Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === '' ? null : v])), monthlyCostCents: cost }
      return api(`/transport/employees/${row.employeeId}`, { method: 'PUT', body })
    },
    onSuccess: () => {
      toast.success('Transporte atualizado.')
      void refresh()
      onClose()
    },
    onError: fail('Não foi possível salvar.'),
  })
  const clear = useMutation({
    mutationFn: () => api(`/transport/employees/${row.employeeId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Cadastro de transporte removido.')
      void refresh()
      onClose()
    },
    onError: fail('Não foi possível remover.'),
  })
  return (
    <Drawer
      open
      onOpenChange={open => !open && onClose()}
      title={row.fullName}
      description={`Matrícula ${row.registration}${row.status === 'on_leave' ? ' · afastado' : ''}`}
      footer={
        <>
          {row.mode && (
            <Button variant="danger" className="mr-auto" loading={clear.isPending} onClick={() => clear.mutate()}>
              Remover
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="transport-form" loading={save.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        id="transport-form"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={e => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Field label="Modalidade" required className="sm:col-span-2">
          {props => (
            <Select {...props} value={form.mode} onChange={set('mode')}>
              {TRANSPORT_MODES.map(m => (
                <option key={m} value={m}>
                  {TRANSPORT_MODE_LABELS[m]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {form.mode === 'chartered' && (
          <Field label="Rota" required className="sm:col-span-2">
            {props => (
              <Select {...props} required value={form.routeId} onChange={set('routeId')}>
                <option value="">Selecione a rota</option>
                {routes.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.riders}/{r.capacity ?? '—'})
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {form.mode === 'mobility' && (
          <Field label="Fornecedor do cartão ou app">{props => <Input {...props} value={form.provider} onChange={set('provider')} />}</Field>
        )}
        {(form.mode === 'mobility' || form.mode === 'chartered') && (
          <Field label="Custo mensal (R$)">
            {props => <Input {...props} inputMode="decimal" placeholder="0,00" value={form.monthlyCost} onChange={set('monthlyCost')} />}
          </Field>
        )}
        {form.mode !== 'none' && (
          <>
            <Field label="Ponto de embarque" className="sm:col-span-2">
              {props => <Input {...props} value={form.pickupPoint} onChange={set('pickupPoint')} />}
            </Field>
            <Field label="Bairro">{props => <Input {...props} value={form.pickupDistrict} onChange={set('pickupDistrict')} />}</Field>
            <Field label="Cidade">{props => <Input {...props} value={form.pickupCity} onChange={set('pickupCity')} />}</Field>
          </>
        )}
        <Field label="Observações" className="sm:col-span-2">
          {props => <Textarea {...props} rows={3} value={form.notes} onChange={set('notes')} />}
        </Field>
      </form>
    </Drawer>
  )
}

// ---------- importação ----------

type ImportResult = { rows: { line: number; registration: string; fullName: string; errors: string[] }[]; total: number; failed: number; imported: number }

function ImportPanel() {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const send = useMutation({
    mutationFn: (commit: boolean) => apiUpload<ImportResult>(`/transport/import?commit=${commit}`, {}, file!),
    onSuccess: (result, commit) => {
      setPreview(result)
      if (commit && result.imported) {
        toast.success(`${result.imported} cadastros de transporte atualizados.`)
        void queryClient.invalidateQueries({ queryKey: ['transport-board'] })
        void queryClient.invalidateQueries({ queryKey: ['transport-routes'] })
        setFile(null)
      }
    },
    onError: fail('Não foi possível importar.'),
  })
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Panel title="Atualizar por planilha">
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-ink-soft">
          <li>Baixe a planilha atual em “Exportar planilha”.</li>
          <li>Ajuste modalidade, rota, embarque e custo. A matrícula identifica a pessoa.</li>
          <li>Envie de volta: primeiro conferimos, depois gravamos.</li>
        </ol>
        <FileInput
          file={file}
          onChange={f => {
            setFile(f)
            setPreview(null)
          }}
          accept=".xlsx,.csv"
          hint="Planilha .xlsx ou .csv, no formato da exportação."
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={!file} loading={send.isPending && !send.variables} onClick={() => send.mutate(false)}>
            <FileSpreadsheet className="size-4" aria-hidden /> Conferir
          </Button>
          <Button
            variant="primary"
            disabled={!file || !preview || preview.failed > 0 || preview.imported > 0}
            loading={send.isPending && send.variables}
            onClick={() => send.mutate(true)}
          >
            <Upload className="size-4" aria-hidden /> Gravar {preview && !preview.failed ? `${preview.total} linhas` : ''}
          </Button>
        </div>
      </Panel>
      <Panel title="Resultado">
        {!preview ? (
          <p className="text-sm text-steel">Envie uma planilha para conferir antes de gravar.</p>
        ) : (
          <>
            <p className="mb-3 text-sm">
              <span className="num font-semibold text-ink">{preview.total}</span> linhas ·{' '}
              <span className={cn('num font-semibold', preview.failed ? 'text-danger' : 'text-ok')}>{preview.failed}</span> com erro
              {preview.imported > 0 && <span className="text-ok"> · {preview.imported} gravadas</span>}
            </p>
            <ul className="max-h-96 divide-y divide-line overflow-y-auto rounded-sm border border-line text-sm">
              {preview.rows
                .filter(r => r.errors.length)
                .map(r => (
                  <li key={r.line} className="px-3 py-2">
                    <span className="font-medium text-ink">
                      Linha {r.line}: {r.fullName || r.registration || 'sem matrícula'}
                    </span>
                    <span className="block text-danger">{r.errors.join(' ')}</span>
                  </li>
                ))}
              {preview.failed === 0 && <li className="px-3 py-2 text-ok">Tudo certo para gravar.</li>}
            </ul>
          </>
        )}
      </Panel>
    </div>
  )
}

