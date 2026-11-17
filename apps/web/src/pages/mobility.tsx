import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  AlertTriangle,
  Building2,
  Bus,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Gauge,
  MapPin,
  PauseCircle,
  Pencil,
  Plus,
  Search,
  Smartphone,
  Trash2,
  Upload,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
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
  positionTitle: string | null
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
type Row = BoardRow & { id: string; city: string | null; duplicate: boolean }

type Route = {
  id: string
  name: string
  vehicle: string | null
  capacity: number | null
  driver: string | null
  shift: string | null
  riders: number
}

type Tab = 'visao' | 'colaboradores' | 'mobilidade' | 'fretado' | 'cidades' | 'indicadores' | 'qualidade' | 'atualizar'
const TABS: { key: Tab; label: string }[] = [
  { key: 'visao', label: 'Visão geral' },
  { key: 'colaboradores', label: 'Colaboradores' },
  { key: 'mobilidade', label: 'Mobilidade' },
  { key: 'fretado', label: 'Fretado' },
  { key: 'cidades', label: 'Cidades' },
  { key: 'indicadores', label: 'Indicadores' },
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
const UNSET = 'Sem cadastro'

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)}%` : '0%')
const modeLabel = (mode: TransportMode | null) => (mode ? TRANSPORT_MODE_LABELS[mode] : UNSET)
const normName = (name: string) => name.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/\s+/g, ' ')
const countBy = <T,>(rows: T[], key: (r: T) => string | null | undefined) => {
  const map = new Map<string, number>()
  for (const r of rows) {
    const k = key(r)
    if (k) map.set(k, (map.get(k) ?? 0) + 1)
  }
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
}

const boardQuery = { queryKey: ['transport-board'], queryFn: () => api<BoardRow[]>('/transport/board') }
const routesQuery = { queryKey: ['transport-routes'], queryFn: () => api<Route[]>('/transport/routes') }

const fail = (fallback: string) => (error: unknown) => toast.error(error instanceof ApiError ? error.message : fallback)

type Filters = { q: string; department: string; city: string; mode: TransportMode | 'unset' | ''; status: EmployeeStatus | '' }
const NO_FILTERS: Filters = { q: '', department: '', city: '', mode: '', status: '' }

export function MobilityPage() {
  const search = useSearch({ strict: false }) as { tab?: Tab }
  const navigate = useNavigate()
  const tab = search.tab ?? 'visao'
  const manage = useCan('transport.manage')
  const board = useQuery(boardQuery)
  const routes = useQuery(routesQuery)
  const [editing, setEditing] = useState<BoardRow | null>(null)
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)

  // Mesmo nome mais de uma vez no cadastro: provável duplicidade.
  const all = useMemo<Row[]>(() => {
    const data = board.data ?? []
    const names = countBy(data, r => normName(r.fullName))
    const repeated = new Set(names.filter(n => n.value > 1).map(n => n.label))
    return data.map(r => ({ ...r, id: r.employeeId, city: r.pickupCity ?? r.homeCity, duplicate: repeated.has(normName(r.fullName)) }))
  }, [board.data])

  const rows = all.filter(r => {
    const term = filters.q.trim().toLowerCase()
    if (term && ![r.fullName, r.registration, r.city, r.pickupDistrict, r.departmentName].some(v => v?.toLowerCase().includes(term))) return false
    if (filters.department && r.departmentName !== filters.department) return false
    if (filters.city && r.city !== filters.city) return false
    if (filters.mode && (filters.mode === 'unset' ? r.mode !== null : r.mode !== filters.mode)) return false
    if (filters.status && r.status !== filters.status) return false
    return true
  })
  const filtered = rows.length !== all.length

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
        description="Transporte e localidade de cada colaborador: mobilidade, fretado e condução própria, com os pontos que precisam de cadastro."
        actions={
          <Button onClick={download}>
            <Download className="size-4" aria-hidden /> Exportar planilha
          </Button>
        }
      />

      <nav className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0" aria-label="Seções de mobilidade">
        {TABS.filter(t => t.key !== 'atualizar' || manage).map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => void navigate({ to: '/mobilidade', search: { tab: t.key } })}
            aria-current={tab === t.key ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3.5 py-2.5 text-[14.5px] whitespace-nowrap transition-colors',
              tab === t.key ? 'border-ink font-semibold text-ink' : 'border-transparent text-steel hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab !== 'atualizar' && <FilterBar all={all} filters={filters} onChange={setFilters} shown={rows.length} />}

      {(board.isError || routes.isError) && <ErrorState error={board.error ?? routes.error} onRetry={() => void board.refetch()} />}
      {board.isPending || routes.isPending ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-40" />
          <Skeleton className="h-80" />
        </div>
      ) : all.length === 0 && tab !== 'atualizar' ? (
        <EmptyState icon={Bus} title="Nenhum colaborador ativo">
          Cadastre colaboradores para acompanhar a mobilidade.
        </EmptyState>
      ) : (
        <>
          {tab === 'visao' && <Overview rows={rows} routes={routes.data ?? []} filtered={filtered} />}
          {tab === 'colaboradores' && <People rows={rows} onEdit={manage ? setEditing : undefined} />}
          {tab === 'mobilidade' && <MobilityList rows={rows} onEdit={manage ? setEditing : undefined} />}
          {tab === 'fretado' && <Chartered rows={rows} routes={routes.data ?? []} onEdit={manage ? setEditing : undefined} />}
          {tab === 'cidades' && <Cities rows={rows} onPick={city => setFilters(f => ({ ...f, city }))} />}
          {tab === 'indicadores' && <Indicators rows={rows} />}
          {tab === 'qualidade' && <Quality rows={rows} routes={routes.data ?? []} onEdit={manage ? setEditing : undefined} />}
          {tab === 'atualizar' && manage && <ImportPanel />}
        </>
      )}

      {editing && <TransportDrawer row={editing} routes={routes.data ?? []} onClose={() => setEditing(null)} />}
    </>
  )
}

// ---------- filtros: valem para todas as abas ----------

function FilterBar({ all, filters, onChange, shown }: { all: Row[]; filters: Filters; onChange: (f: Filters) => void; shown: number }) {
  const departments = useMemo(() => countBy(all, r => r.departmentName).map(d => d.label).sort(), [all])
  const cities = useMemo(() => countBy(all, r => r.city).map(c => c.label).sort(), [all])
  const set = <K extends keyof Filters>(key: K) => (value: Filters[K]) => onChange({ ...filters, [key]: value })
  const active = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS)
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-paper p-2.5">
      <div className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel" aria-hidden />
        <Input aria-label="Buscar" placeholder="Nome, matrícula, cidade ou bairro" value={filters.q} onChange={e => set('q')(e.target.value)} className="h-9 pl-9" />
      </div>
      <Select aria-label="Departamento" value={filters.department} onChange={e => set('department')(e.target.value)} className="h-9 w-auto">
        <option value="">Todos os departamentos</option>
        {departments.map(d => (
          <option key={d}>{d}</option>
        ))}
      </Select>
      <Select aria-label="Cidade" value={filters.city} onChange={e => set('city')(e.target.value)} className="h-9 w-auto">
        <option value="">Todas as cidades</option>
        {cities.map(c => (
          <option key={c}>{c}</option>
        ))}
      </Select>
      <Select aria-label="Transporte" value={filters.mode} onChange={e => set('mode')(e.target.value as Filters['mode'])} className="h-9 w-auto">
        <option value="">Todos os transportes</option>
        {TRANSPORT_MODES.map(m => (
          <option key={m} value={m}>
            {TRANSPORT_MODE_LABELS[m]}
          </option>
        ))}
        <option value="unset">{UNSET}</option>
      </Select>
      <Select aria-label="Situação" value={filters.status} onChange={e => set('status')(e.target.value as Filters['status'])} className="h-9 w-auto">
        <option value="">Todas as situações</option>
        <option value="active">Trabalhando</option>
        <option value="on_leave">Afastado</option>
      </Select>
      {active && (
        <Button size="sm" variant="ghost" onClick={() => onChange(NO_FILTERS)}>
          <X className="size-4" aria-hidden /> Limpar filtros
        </Button>
      )}
      <span className="ml-auto px-2 text-[13px] text-steel">
        <span className="num font-semibold text-ink">{formatNumber(shown)}</span> colaboradores
      </span>
    </div>
  )
}

// ---------- peças visuais ----------

const TONES = {
  brand: 'bg-brand-soft text-brand-ink',
  ink: 'bg-sunken text-ink',
  info: 'bg-info-soft text-info',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-brand-ink',
  danger: 'bg-danger-soft text-danger',
} as const

function KpiCard({ icon: Icon, tone, label, value, note }: { icon: LucideIcon; tone: keyof typeof TONES; label: string; value: ReactNode; note: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-paper p-4 transition-[box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-md">
      <span className={cn('mb-1 flex size-8 items-center justify-center rounded-lg', TONES[tone])}>
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="text-[12.5px] font-medium text-steel">{label}</span>
      <span className="num font-display text-[30px] leading-none font-semibold text-ink">{value}</span>
      <span className="text-[12px] text-steel-soft">{note}</span>
    </div>
  )
}

/** Barras horizontais com rótulo, trilho e valor. */
function HBars({ data, color = 'var(--color-ink)', empty = 'Sem dados neste recorte.' }: { data: { label: string; value: number }[]; color?: string; empty?: string }) {
  if (!data.length) return <p className="text-sm text-steel">{empty}</p>
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <ul className="flex flex-col gap-2.5">
      {data.map((d, i) => (
        <li key={d.label} className="grid grid-cols-[minmax(0,9.5rem)_1fr_3rem] items-center gap-3 text-[13px]">
          <span className="truncate text-ink-soft" title={d.label}>
            {d.label}
          </span>
          <span className="h-5 overflow-hidden rounded-md bg-sunken">
            <span className="funnel-bar block h-full rounded-md" style={{ width: `${(d.value / max) * 100}%`, background: color, animationDelay: `${i * 40}ms` }} />
          </span>
          <span className="num text-right font-semibold text-ink">{formatNumber(d.value)}</span>
        </li>
      ))}
    </ul>
  )
}

/** Rosca com o total no centro e a legenda com participação. */
function Donut({ data }: { data: { label: string; value: number; color: string }[] }) {
  const items = data.filter(d => d.value > 0)
  const total = items.reduce((s, d) => s + d.value, 0)
  if (!total) return <p className="text-sm text-steel">Sem dados neste recorte.</p>
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative size-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={items} dataKey="value" nameKey="label" innerRadius="66%" outerRadius="100%" paddingAngle={1.5} stroke="var(--color-paper)" startAngle={90} endAngle={-270}>
              {items.map(d => (
                <Cell key={d.label} fill={d.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: 8, borderColor: 'var(--color-line)', fontSize: 13 }} />
          </PieChart>
        </ResponsiveContainer>
        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="num font-display text-[28px] leading-none font-semibold text-ink">{formatNumber(total)}</span>
          <span className="text-[11.5px] text-steel">total</span>
        </span>
      </div>
      <ul className="flex flex-col gap-2 text-[13px]">
        {items.map(d => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ background: d.color }} aria-hidden />
            <span className="num font-semibold text-ink">{formatNumber(d.value)}</span>
            <span className="text-ink-soft">{d.label}</span>
            <span className="text-steel-soft">({pct(d.value, total)})</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const modeSlices = (rows: Row[], includeUnset = true) =>
  [...TRANSPORT_MODES, ...(includeUnset ? (['unset'] as const) : [])].map(m => ({
    label: m === 'unset' ? UNSET : TRANSPORT_MODE_LABELS[m],
    value: rows.filter(r => (m === 'unset' ? r.mode === null : r.mode === m)).length,
    color: MODE_COLORS[m],
  }))

// ---------- visão geral ----------

function Overview({ rows, routes, filtered }: { rows: Row[]; routes: Route[]; filtered: boolean }) {
  const total = rows.length
  const count = (mode: TransportMode | null) => rows.filter(r => r.mode === mode).length
  const cost = rows.reduce((s, r) => s + (r.monthlyCostCents ?? 0), 0)
  const capacity = routes.reduce((s, r) => s + (r.capacity ?? 0), 0)
  const riders = routes.reduce((s, r) => s + r.riders, 0)
  const cities = new Set(rows.map(r => r.city).filter(Boolean)).size
  const kpis: Parameters<typeof KpiCard>[0][] = [
    { icon: Users, tone: 'ink', label: 'Total de colaboradores', value: <CountUp value={total} />, note: filtered ? 'No recorte filtrado' : 'Trabalhando e afastados' },
    { icon: Smartphone, tone: 'brand', label: 'Mobilidade', value: <CountUp value={count('mobility')} />, note: `${pct(count('mobility'), total)} da base` },
    { icon: Bus, tone: 'ink', label: 'Fretado', value: <CountUp value={count('chartered')} />, note: `${pct(count('chartered'), total)} da base` },
    { icon: AlertTriangle, tone: 'danger', label: 'Sem transporte definido', value: <CountUp value={count(null)} />, note: 'Pendente de cadastro' },
    { icon: PauseCircle, tone: 'warn', label: 'Afastados', value: <CountUp value={rows.filter(r => r.status === 'on_leave').length} />, note: 'Situação na ficha' },
    { icon: MapPin, tone: 'ok', label: 'Cidades atendidas', value: <CountUp value={cities} />, note: 'Municípios distintos' },
    { icon: Wallet, tone: 'info', label: 'Custo mensal', value: <span className="text-[24px]">{money(cost)}</span>, note: 'Mobilidade e fretado' },
    { icon: Gauge, tone: riders > capacity ? 'danger' : 'ok', label: 'Ocupação do fretado', value: capacity ? pct(riders, capacity) : '—', note: `${riders} de ${capacity} lugares` },
    { icon: Copy, tone: 'danger', label: 'Cadastros duplicados', value: <CountUp value={rows.filter(r => r.duplicate).length} />, note: 'Mesmo nome repetido' },
    { icon: MapPin, tone: 'warn', label: 'Sem cidade', value: <CountUp value={rows.filter(r => !r.city).length} />, note: 'Endereço ou ponto ausente' },
  ]
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map(k => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Cidades" aside={<span className="text-[13px] text-steel">Top 10 por número de colaboradores</span>}>
          <HBars data={countBy(rows, r => r.city).slice(0, 10)} color="var(--color-brand)" />
        </Panel>
        <Panel title="Transporte" aside={<span className="text-[13px] text-steel">Distribuição por tipo</span>}>
          <Donut data={modeSlices(rows)} />
        </Panel>
        <Panel title="Departamentos" aside={<span className="text-[13px] text-steel">Colaboradores por departamento</span>}>
          <HBars data={countBy(rows, r => r.departmentName ?? 'Sem departamento').slice(0, 10)} />
        </Panel>
        <Panel title="Rotas do fretado" aside={<span className="text-[13px] text-steel">Passageiros por lugares</span>}>
          <Occupancy routes={routes} />
        </Panel>
      </div>
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
          <li key={r.id} className="grid grid-cols-[minmax(0,9.5rem)_1fr_4rem] items-center gap-3 text-[13px]">
            <span className="truncate text-ink-soft" title={r.name}>
              {r.name}
            </span>
            <span className="h-5 overflow-hidden rounded-md bg-sunken">
              <span
                className={cn('funnel-bar block h-full rounded-md', ratio > 1 ? 'bg-danger' : ratio > 0.85 ? 'bg-brand' : 'bg-ink')}
                style={{ width: `${Math.min(100, ratio * 100)}%`, animationDelay: `${i * 40}ms` }}
              />
            </span>
            <span className={cn('num text-right font-semibold', ratio > 1 ? 'text-danger' : 'text-ink')}>
              {r.riders}/{r.capacity ?? '—'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// ---------- listas ----------

const personColumn = {
  label: 'Colaborador',
  render: (r: Row) => (
    <span>
      <span className="flex items-center gap-1.5 font-medium text-ink">
        {r.fullName}
        {r.duplicate && <Badge tone="danger">duplicado?</Badge>}
      </span>
      <span className="text-[13px] text-steel">
        {r.registration}
        {r.departmentName ? `, ${r.departmentName}` : ''}
      </span>
    </span>
  ),
}

function People({ rows, onEdit }: { rows: Row[]; onEdit?: (row: BoardRow) => void }) {
  return (
    <DataTable
      rows={rows}
      empty="Ninguém com esses filtros"
      minWidth={960}
      onRowClick={onEdit}
      columns={[
        personColumn,
        { label: 'Situação', render: r => <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge> },
        { label: 'Transporte', render: r => (r.mode ? modeLabel(r.mode) : <Badge tone="danger">{UNSET}</Badge>) },
        { label: 'Rota ou fornecedor', render: r => r.routeName ?? r.provider ?? '—' },
        { label: 'Embarque', render: r => <span className="block max-w-56 truncate">{[r.pickupPoint, r.pickupDistrict].filter(Boolean).join(', ') || '—'}</span> },
        { label: 'Cidade', render: r => r.city ?? '—' },
        { label: 'Custo/mês', className: 'text-right', render: r => (r.monthlyCostCents === null ? '—' : <span className="num">{money(r.monthlyCostCents)}</span>) },
      ]}
    />
  )
}

function MobilityList({ rows, onEdit }: { rows: Row[]; onEdit?: (row: BoardRow) => void }) {
  const list = rows.filter(r => r.mode === 'mobility')
  const cost = list.reduce((s, r) => s + (r.monthlyCostCents ?? 0), 0)
  const withCost = list.filter(r => r.monthlyCostCents !== null).length
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={Smartphone} tone="brand" label="Com mobilidade" value={<CountUp value={list.length} />} note={`${pct(list.length, rows.length)} da base`} />
        <KpiCard icon={Wallet} tone="info" label="Custo mensal" value={<span className="text-[24px]">{money(cost)}</span>} note="Soma dos cartões e apps" />
        <KpiCard icon={Wallet} tone="ok" label="Custo médio" value={<span className="text-[24px]">{withCost ? money(Math.round(cost / withCost)) : '—'}</span>} note="Por pessoa com valor informado" />
        <KpiCard icon={AlertTriangle} tone="warn" label="Sem custo informado" value={<CountUp value={list.length - withCost} />} note="Custo mensal fica subestimado" />
      </div>
      <DataTable
        rows={list}
        empty="Ninguém com mobilidade neste recorte"
        minWidth={820}
        onRowClick={onEdit}
        columns={[
          personColumn,
          { label: 'Fornecedor', render: r => r.provider ?? '—' },
          { label: 'Bairro', render: r => r.pickupDistrict ?? r.homeDistrict ?? '—' },
          { label: 'Cidade', render: r => r.city ?? '—' },
          { label: 'Custo/mês', className: 'text-right', render: r => (r.monthlyCostCents === null ? <Badge tone="warn">sem valor</Badge> : <span className="num">{money(r.monthlyCostCents)}</span>) },
        ]}
      />
    </div>
  )
}

function Chartered({ rows, routes, onEdit }: { rows: Row[]; routes: Route[]; onEdit?: (row: BoardRow) => void }) {
  const list = rows.filter(r => r.mode === 'chartered')
  return (
    <div className="flex flex-col gap-6">
      <Routes routes={routes} rows={list} />
      <Panel title="Passageiros" aside={<span className="text-[13px] text-steel">Ponto de embarque de cada pessoa no fretado</span>} bodyClassName="p-0">
        <DataTable
          rows={list}
          empty="Ninguém no fretado neste recorte"
          minWidth={820}
          onRowClick={onEdit}
          columns={[
            personColumn,
            { label: 'Rota', render: r => r.routeName ?? <Badge tone="danger">sem rota</Badge> },
            { label: 'Ponto de embarque', render: r => r.pickupPoint ?? <Badge tone="warn">não informado</Badge> },
            { label: 'Bairro', render: r => r.pickupDistrict ?? '—' },
            { label: 'Cidade', render: r => r.city ?? '—' },
          ]}
        />
      </Panel>
    </div>
  )
}

// ---------- cidades ----------

function Cities({ rows, onPick }: { rows: Row[]; onPick: (city: string) => void }) {
  const cities = useMemo(() => {
    const map = new Map<string, { name: string; total: number; mobility: number; chartered: number; cost: number }>()
    for (const r of rows) {
      if (!r.city) continue
      const c = map.get(r.city) ?? { name: r.city, total: 0, mobility: 0, chartered: 0, cost: 0 }
      c.total++
      if (r.mode === 'mobility') c.mobility++
      if (r.mode === 'chartered') c.chartered++
      c.cost += r.monthlyCostCents ?? 0
      map.set(r.city, c)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [rows])
  if (!cities.length) return <EmptyState icon={MapPin} title="Nenhuma cidade identificada neste recorte" />
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {cities.map(c => (
        <button
          key={c.name}
          type="button"
          onClick={() => onPick(c.name)}
          title="Filtrar por esta cidade"
          className="rounded-xl border border-line bg-paper p-4 text-left transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-px hover:border-line-strong hover:shadow-md"
        >
          <span className="mb-3 flex items-center gap-2 font-semibold text-ink">
            <MapPin className="size-4 text-brand-ink" aria-hidden /> {c.name}
          </span>
          {[
            ['Colaboradores', formatNumber(c.total)],
            ['Mobilidade', formatNumber(c.mobility)],
            ['Fretado', formatNumber(c.chartered)],
            ['Custo mensal', money(c.cost)],
          ].map(([label, value]) => (
            <span key={label} className="flex justify-between py-0.5 text-[13px]">
              <span className="text-steel">{label}</span>
              <span className="num font-semibold text-ink">{value}</span>
            </span>
          ))}
          <span className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
            <span style={{ width: `${(c.mobility / c.total) * 100}%`, background: MODE_COLORS.mobility }} />
            <span style={{ width: `${(c.chartered / c.total) * 100}%`, background: MODE_COLORS.chartered }} />
          </span>
        </button>
      ))}
    </div>
  )
}

// ---------- indicadores ----------

function Indicators({ rows }: { rows: Row[] }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Todas as cidades" aside={<span className="text-[13px] text-steel">Por total de colaboradores</span>}>
        <div className="max-h-[420px] overflow-y-auto pr-1">
          <HBars data={countBy(rows, r => r.city)} color="var(--color-brand)" />
        </div>
      </Panel>
      <Panel title="Cargos" aside={<span className="text-[13px] text-steel">Top 10 por número de colaboradores</span>}>
        <HBars data={countBy(rows, r => r.positionTitle ?? 'Cargo não informado').slice(0, 10)} empty="Nenhum cargo neste recorte." />
      </Panel>
      <Panel title="Situação" aside={<span className="text-[13px] text-steel">Trabalhando e afastados</span>}>
        <Donut
          data={[
            { label: 'Trabalhando', value: rows.filter(r => r.status === 'active').length, color: 'var(--color-ok)' },
            { label: 'Afastado', value: rows.filter(r => r.status === 'on_leave').length, color: 'var(--color-brand)' },
          ]}
        />
      </Panel>
      <Panel title="Participação de cada transporte" aside={<span className="text-[13px] text-steel">Sobre quem tem transporte definido</span>}>
        <Donut data={modeSlices(rows, false)} />
      </Panel>
    </div>
  )
}

// ---------- qualidade dos dados ----------

function ScoreRing({ score }: { score: number }) {
  const r = 46
  const circ = 2 * Math.PI * r
  const color = score >= 85 ? 'var(--color-ok)' : score >= 65 ? 'var(--color-brand)' : 'var(--color-danger)'
  return (
    <div className="relative size-[120px] shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-sunken)" strokeWidth="12" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ - (score / 100) * circ} />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num font-display text-[30px] leading-none font-semibold text-ink">{score}%</span>
        <span className="text-[11.5px] text-steel">qualidade</span>
      </span>
    </div>
  )
}

function IssueList({ title, hint, rows, onEdit, empty }: { title: string; hint: string; rows: Row[]; onEdit?: (row: BoardRow) => void; empty: string }) {
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {rows.length ? <AlertTriangle className="size-4 text-danger" aria-hidden /> : <CheckCircle2 className="size-4 text-ok" aria-hidden />}
          {title}
        </span>
      }
      aside={<span className="num text-sm font-semibold text-ink">{rows.length}</span>}
      bodyClassName="p-0"
    >
      <p className="px-5 pt-3 text-[13px] text-steel">{rows.length ? hint : empty}</p>
      {rows.length > 0 && (
        <ul className="mt-2 max-h-60 divide-y divide-line overflow-y-auto border-t border-line">
          {rows.map(r => (
            <li key={r.id}>
              <button
                type="button"
                disabled={!onEdit}
                onClick={() => onEdit?.(r)}
                className="flex w-full justify-between gap-3 px-5 py-2 text-left text-sm enabled:hover:bg-sunken"
              >
                <span className="truncate text-ink">{r.fullName}</span>
                <span className="text-[13px] text-steel">{r.registration}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function Quality({ rows, routes, onEdit }: { rows: Row[]; routes: Route[]; onEdit?: (row: BoardRow) => void }) {
  const duplicates = rows.filter(r => r.duplicate)
  const noCity = rows.filter(r => !r.city)
  const noTransport = rows.filter(r => r.mode === null)
  const noPosition = rows.filter(r => !r.positionTitle)
  const issues = new Set([...duplicates, ...noCity, ...noTransport].map(r => r.id)).size
  const score = rows.length ? Math.max(0, Math.round(100 - (issues / rows.length) * 100)) : 100
  const overbooked = routes.filter(r => r.capacity !== null && r.riders > r.capacity)
  const summary: [string, number, string][] = [
    ['Registros completos', rows.length - issues, 'text-ok'],
    ['Nomes duplicados', duplicates.length, 'text-danger'],
    ['Sem cidade', noCity.length, 'text-brand-ink'],
    ['Sem transporte definido', noTransport.length, 'text-danger'],
    ['Sem cargo cadastrado', noPosition.length, 'text-brand-ink'],
  ]
  const more = [
    { title: 'Afastados com transporte ativo', hint: 'Afastados não deveriam consumir fretado nem crédito de mobilidade.', rows: rows.filter(r => r.status === 'on_leave' && (r.mode === 'chartered' || r.mode === 'mobility')) },
    { title: 'Fretado sem ponto de embarque', hint: 'O motorista não sabe onde buscar.', rows: rows.filter(r => r.mode === 'chartered' && !r.pickupPoint) },
    { title: 'Mobilidade sem custo informado', hint: 'Sem o valor, o custo mensal fica subestimado.', rows: rows.filter(r => r.mode === 'mobility' && r.monthlyCostCents === null) },
  ]
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-8 rounded-xl border border-line bg-paper p-6">
        <ScoreRing score={score} />
        <dl className="grid min-w-64 flex-1 gap-x-10 gap-y-1.5 sm:grid-cols-2">
          {summary.map(([label, value, tone]) => (
            <div key={label} className="flex justify-between border-b border-line py-1.5 text-sm">
              <dt className="text-steel">{label}</dt>
              <dd className={cn('num font-semibold', tone)}>{formatNumber(value)}</dd>
            </div>
          ))}
        </dl>
      </div>
      {overbooked.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">
          <Building2 className="size-4" aria-hidden /> Rotas acima da capacidade:
          {overbooked.map(r => (
            <Badge key={r.id} tone="danger">
              {r.name}: {r.riders}/{r.capacity}
            </Badge>
          ))}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <IssueList title="Nomes duplicados" hint="O mesmo nome aparece mais de uma vez no cadastro." empty="Nenhum nome duplicado neste recorte." rows={duplicates} onEdit={onEdit} />
        <IssueList title="Sem cidade" hint="Sem ponto de embarque nem endereço com cidade na ficha." empty="Todos têm cidade identificada." rows={noCity} onEdit={onEdit} />
        <IssueList title="Sem transporte definido" hint="Nenhuma modalidade registrada." empty="Todos têm transporte definido." rows={noTransport} onEdit={onEdit} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {more.map(m => (
          <IssueList key={m.title} {...m} empty="Nada a corrigir aqui." onEdit={onEdit} />
        ))}
      </div>
    </div>
  )
}

// ---------- fretado: rotas ----------

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

