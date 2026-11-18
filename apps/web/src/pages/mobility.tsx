import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  AlertTriangle,
  Building2,
  Bus,
  CheckCircle2,
  Copy,
  Download,
  Gauge,
  MapPin,
  PauseCircle,
  Pencil,
  Plus,
  Search,
  Smartphone,
  Trash2,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { toast } from 'sonner'

import { TRANSPORT_MODE_LABELS, TRANSPORT_MODES, type TransportMode } from '@falcao-rh/contracts'

import { CountUp, Ring, SpotlightGlow, useIndicator, useSpotlight, useTilt } from '../components/motion'
import { Button } from '../components/ui/button'
import { DataTable } from '../components/ui/data-table'
import { Drawer } from '../components/ui/drawer'
import { Field, Input, Select, Textarea } from '../components/ui/field'
import { Badge, EmptyState, ErrorState, PageHeader, Panel, Skeleton } from '../components/ui/layout'
import { api, ApiError, apiDownload } from '../lib/api'
import { cn } from '../lib/cn'
import { formatNumber, statusLabel, statusTone } from '../lib/format'
import { gsap, reducedMotion, useGSAP } from '../lib/gsap'
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

type Tab = 'visao' | 'colaboradores' | 'mobilidade' | 'fretado' | 'cidades' | 'indicadores' | 'qualidade'
const TABS: { key: Tab; label: string }[] = [
  { key: 'visao', label: 'Visão geral' },
  { key: 'colaboradores', label: 'Colaboradores' },
  { key: 'mobilidade', label: 'Mobilidade' },
  { key: 'fretado', label: 'Fretado' },
  { key: 'cidades', label: 'Cidades' },
  { key: 'indicadores', label: 'Indicadores' },
  { key: 'qualidade', label: 'Qualidade dos dados' },
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
  // Aba que não existe mais (ex.: link antigo de "Atualizar dados") cai na visão geral.
  const tab: Tab = TABS.some(t => t.key === search.tab) ? search.tab! : 'visao'
  const manage = useCan('transport.manage')
  const board = useQuery(boardQuery)
  const routes = useQuery(routesQuery)
  const [editing, setEditing] = useState<BoardRow | null>(null)
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const tabsRef = useRef<HTMLElement>(null)
  useIndicator(tabsRef, tab)

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

      <nav ref={tabsRef} className="relative -mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0" aria-label="Seções de mobilidade">
        {/* Sublinhado que desliza até a aba ativa. */}
        <span data-indicator className="pointer-events-none absolute border-b-2 border-ink" aria-hidden />
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => void navigate({ to: '/mobilidade', search: { tab: t.key } })}
            aria-current={tab === t.key ? 'page' : undefined}
            data-active={tab === t.key}
            className={cn('px-3.5 py-2.5 text-[14.5px] whitespace-nowrap transition-colors', tab === t.key ? 'font-semibold text-ink' : 'text-steel hover:text-ink')}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <FilterBar all={all} filters={filters} onChange={setFilters} shown={rows.length} />

      {(board.isError || routes.isError) && <ErrorState error={board.error ?? routes.error} onRetry={() => void board.refetch()} />}
      {board.isPending || routes.isPending ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-40" />
          <Skeleton className="h-80" />
        </div>
      ) : all.length === 0 ? (
        <EmptyState icon={Bus} title="Nenhum colaborador ativo">
          Cadastre colaboradores para acompanhar a mobilidade.
        </EmptyState>
      ) : (
        <>
          {tab === 'visao' && <Overview rows={rows} routes={routes.data ?? []} filtered={filtered} onPickCity={city => setFilters(f => ({ ...f, city }))} />}
          {tab === 'colaboradores' && <People rows={rows} onEdit={manage ? setEditing : undefined} />}
          {tab === 'mobilidade' && <MobilityList rows={rows} onEdit={manage ? setEditing : undefined} />}
          {tab === 'fretado' && <Chartered rows={rows} routes={routes.data ?? []} onEdit={manage ? setEditing : undefined} />}
          {tab === 'cidades' && <Cities rows={rows} onPick={city => setFilters(f => ({ ...f, city }))} />}
          {tab === 'indicadores' && <Indicators rows={rows} />}
          {tab === 'qualidade' && <Quality rows={rows} routes={routes.data ?? []} onEdit={manage ? setEditing : undefined} />}
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

/** Grade de cartões com a luz que segue o mouse. */
function SpotlightGrid({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useSpotlight(ref)
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

/** Uma linha do painel de detalhes: rótulo, valor e, se houver, a fatia numa barrinha. */
type Detail = { label: string; value: ReactNode; share?: number; color?: string; tone?: 'danger' | 'ok' }
type Details = { title: string; rows: Detail[]; hint?: string }

/**
 * Painel que aparece ao passar o mouse (ou ao focar com o teclado) logo abaixo
 * do bloco, com o detalhamento do número.
 */
function Hoverable({ details, className, children }: { details?: Details; className?: string; children: ReactNode }) {
  if (!details) return <div className={className}>{children}</div>
  return (
    <div className={cn('group/hv relative focus-within:z-40 hover:z-40', className)}>
      {children}
      <div
        role="tooltip"
        className="pointer-events-none invisible absolute inset-x-0 top-full z-40 mt-2 translate-y-1.5 opacity-0 transition-[opacity,transform,visibility] duration-200 ease-out group-focus-within/hv:visible group-focus-within/hv:translate-y-0 group-focus-within/hv:opacity-100 group-hover/hv:visible group-hover/hv:translate-y-0 group-hover/hv:opacity-100"
      >
        <div className="min-w-56 rounded-lg border border-line bg-paper p-3.5 text-[12.5px] shadow-pop">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-steel uppercase">{details.title}</p>
          {details.rows.length === 0 ? (
            <p className="text-steel">Nada para detalhar neste recorte.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {details.rows.map(d => (
                <li key={d.label}>
                  <span className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-1.5 text-ink-soft">
                      {d.color && <span className="size-2 shrink-0 rounded-sm" style={{ background: d.color }} aria-hidden />}
                      <span className="truncate">{d.label}</span>
                    </span>
                    <span className={cn('num shrink-0 font-semibold', d.tone === 'danger' ? 'text-danger' : d.tone === 'ok' ? 'text-ok' : 'text-ink')}>{d.value}</span>
                  </span>
                  {d.share !== undefined && (
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-sunken">
                      <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.min(100, d.share * 100)}%`, background: d.color ?? 'var(--color-ink)' }} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {details.hint && <p className="mt-2.5 border-t border-line pt-2 text-[11.5px] leading-snug text-steel">{details.hint}</p>}
        </div>
      </div>
    </div>
  )
}

/** Linhas por tipo de transporte (com fatia e cor), para os detalhes. */
const modeRows = (rows: Row[], value: (list: Row[]) => ReactNode = list => formatNumber(list.length)): Detail[] =>
  MODE_KEYS.map(m => ({ m, list: rows.filter(r => modeKey(r) === m) }))
    .filter(x => x.list.length)
    .map(({ m, list }) => ({ label: modeLabel(m === 'unset' ? null : m), value: value(list), share: rows.length ? list.length / rows.length : 0, color: MODE_COLORS[m] }))

/** Top N de uma contagem como linhas de detalhe. */
const topRows = (data: { label: string; value: number }[], total: number, n = 5, color = 'var(--color-ink)'): Detail[] =>
  data.slice(0, n).map(d => ({ label: d.label, value: `${formatNumber(d.value)} · ${pct(d.value, total)}`, share: total ? d.value / total : 0, color }))

const sumCost = (list: Row[]) => list.reduce((s, r) => s + (r.monthlyCostCents ?? 0), 0)

/** Custo de cada tipo de transporte (× meses), com a fatia do custo total. */
const costRows = (rows: Row[], months = 1): Detail[] => {
  const total = sumCost(rows)
  return MODE_KEYS.map(m => ({ m, cost: sumCost(rows.filter(r => modeKey(r) === m)) }))
    .filter(x => x.cost > 0)
    .map(({ m, cost }) => ({ label: modeLabel(m === 'unset' ? null : m), value: money(cost * months), share: cost / total, color: MODE_COLORS[m] }))
}

function KpiCard({
  icon: Icon,
  tone,
  label,
  value,
  note,
  aside,
  details,
}: {
  icon: LucideIcon
  tone: keyof typeof TONES
  label: string
  value: ReactNode
  note: ReactNode
  aside?: ReactNode
  details?: Details
}) {
  return (
    <Hoverable details={details} className="flex">
    <div
      data-reveal
      data-spotlight
      tabIndex={details ? 0 : undefined}
      className="surface group relative flex flex-1 flex-col justify-between gap-5 overflow-hidden p-5 outline-none transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-lift focus-visible:ring-2 focus-visible:ring-brand"
    >
      <SpotlightGlow />
      <div className="relative flex items-start justify-between gap-3">
        <span className="text-[13px] font-medium text-steel">{label}</span>
        <span className={cn('flex size-9 items-center justify-center rounded-sm transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110', TONES[tone])}>
          <Icon className="size-[17px]" aria-hidden />
        </span>
      </div>
      <div className="relative flex items-end justify-between gap-3">
        <div className="min-w-0">
          <span className="num block font-display text-[40px] leading-[0.9] font-semibold tracking-[-0.01em] text-ink">{value}</span>
          <span className="mt-2 block text-[12px] leading-snug text-steel">{note}</span>
        </div>
        {aside}
      </div>
    </div>
    </Hoverable>
  )
}

const moneyFormat = (cents: number) => money(Math.round(cents))
/** Custo médio por pessoa de um tipo de transporte, só entre quem tem valor informado. */
const avgCost = (rows: Row[], mode: TransportMode) => {
  const paying = rows.filter(r => r.mode === mode && r.monthlyCostCents !== null)
  return paying.length ? paying.reduce((s, r) => s + r.monthlyCostCents!, 0) / paying.length : null
}
const percentFormat = (n: number) => `${Math.round(n)}%`

const modeSlices = (rows: Row[], includeUnset = true) =>
  [...TRANSPORT_MODES, ...(includeUnset ? (['unset'] as const) : [])].map(m => ({
    label: m === 'unset' ? UNSET : TRANSPORT_MODE_LABELS[m],
    value: rows.filter(r => (m === 'unset' ? r.mode === null : r.mode === m)).length,
    color: MODE_COLORS[m],
  }))

// ---------- visão geral ----------

function Overview({ rows, routes, filtered, onPickCity }: { rows: Row[]; routes: Route[]; filtered: boolean; onPickCity: (city: string) => void }) {
  const total = rows.length
  const count = (mode: TransportMode | null) => rows.filter(r => r.mode === mode).length
  const cost = rows.reduce((s, r) => s + (r.monthlyCostCents ?? 0), 0)
  const capacity = routes.reduce((s, r) => s + (r.capacity ?? 0), 0)
  const riders = routes.reduce((s, r) => s + r.riders, 0)
  const idle = Math.max(0, capacity - riders)
  const full = routes.filter(r => r.capacity && r.riders > r.capacity).length
  const onLeave = rows.filter(r => r.status === 'on_leave').length
  const avgChartered = avgCost(rows, 'chartered')
  const avgMobility = avgCost(rows, 'mobility')
  const gap = avgChartered !== null && avgMobility !== null ? avgChartered - avgMobility : null
  const idleRiders = rows.filter(r => r.status === 'on_leave' && (r.mode === 'chartered' || r.mode === 'mobility'))
  const idleCost = idleRiders.reduce((s, r) => s + (r.monthlyCostCents ?? 0), 0)
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <CoverageHero rows={rows} filtered={filtered} />
        <SpotlightGrid className="grid gap-4 sm:grid-cols-2">
          <KpiCard
            icon={Wallet}
            tone="info"
            label="Custo anual projetado"
            value={<CountUp value={cost * 12} format={moneyFormat} />}
            note={`${money(cost)}/mês · ${total ? money(Math.round(cost / total)) : '—'} por colaborador da base`}
            details={{
              title: 'Custo por tipo, por ano',
              rows: costRows(rows, 12),
              hint: 'Projeção: custo mensal informado × 12. Pessoas sem valor não entram.',
            }}
          />
          <KpiCard
            icon={Bus}
            tone={gap !== null && gap > 0 ? 'ok' : 'warn'}
            label="Fretado × mobilidade"
            value={gap === null ? '—' : <CountUp value={Math.abs(gap)} format={moneyFormat} />}
            note={
              gap === null
                ? 'Falta custo de um dos dois para comparar'
                : `A mobilidade sai ${gap > 0 ? 'mais barata' : 'mais cara'} por pessoa/mês (${money(Math.round(avgChartered!))} × ${money(Math.round(avgMobility!))})`
            }
            details={{
              title: 'Custo médio por pessoa/mês',
              rows: [
                { label: 'Fretado', value: avgChartered === null ? '—' : money(Math.round(avgChartered)), color: MODE_COLORS.chartered, share: avgChartered && avgMobility ? avgChartered / Math.max(avgChartered, avgMobility) : 0 },
                { label: 'Mobilidade', value: avgMobility === null ? '—' : money(Math.round(avgMobility)), color: MODE_COLORS.mobility, share: avgChartered && avgMobility ? avgMobility / Math.max(avgChartered, avgMobility) : 0 },
                ...(gap !== null ? [{ label: 'Diferença por ano, por pessoa', value: money(Math.round(Math.abs(gap) * 12)), tone: gap > 0 ? ('ok' as const) : ('danger' as const) }] : []),
              ],
              hint: 'Só entram pessoas com custo mensal informado.',
            }}
          />
          <KpiCard
            icon={Gauge}
            tone={full ? 'danger' : idle / (capacity || 1) > 0.5 ? 'warn' : 'ok'}
            label="Lugares ociosos no fretado"
            value={capacity ? <CountUp value={idle} /> : '—'}
            note={capacity ? (full ? `${full} ${full === 1 ? 'rota acima' : 'rotas acima'} da capacidade` : `${pct(idle, capacity)} da capacidade contratada sem uso`) : 'Nenhuma rota cadastrada'}
            aside={capacity > 0 && <Ring value={idle / capacity} size={58} thickness={7} track="var(--color-sunken)" color="var(--color-steel-soft)" />}
            details={{
              title: 'Lugares livres por rota',
              rows: routes.map(r => ({
                label: r.name,
                value: r.capacity ? (r.riders > r.capacity ? `${r.riders - r.capacity} acima` : `${r.capacity - r.riders} de ${r.capacity}`) : '—',
                share: r.capacity ? Math.max(0, r.capacity - r.riders) / r.capacity : 0,
                color: 'var(--color-steel-soft)',
                tone: r.capacity && r.riders > r.capacity ? ('danger' as const) : undefined,
              })),
              hint: 'Rota muito ociosa pode ir para um veículo menor ou ser juntada a outra.',
            }}
          />
          <KpiCard
            icon={PauseCircle}
            tone={idleRiders.length ? 'danger' : 'ok'}
            label="Afastados com transporte pago"
            value={<CountUp value={idleRiders.length} />}
            note={idleRiders.length ? `${money(idleCost)}/mês pagos a quem não está trabalhando` : `Nenhum dos ${formatNumber(onLeave)} afastados consome transporte`}
            details={{
              title: 'Quem são',
              rows: idleRiders.slice(0, 6).map(r => ({ label: r.fullName, value: `${modeLabel(r.mode)} · ${r.monthlyCostCents === null ? 'sem valor' : money(r.monthlyCostCents)}`, tone: 'danger' as const })),
              hint: idleRiders.length ? `Suspender enquanto durar o afastamento economiza ${money(idleCost * 12)} por ano.` : undefined,
            }}
          />
        </SpotlightGrid>
      </div>
      <Pending rows={rows} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel className="overflow-visible" title="Cidades" aside={<span className="text-[13px] text-steel">Top 10 · clique para filtrar</span>}>
          <ModeLegend />
          <StackedBars groups={groupByMode(rows, r => r.city).slice(0, 10)} total={total} onPick={onPickCity} />
        </Panel>
        <Panel title="Transporte" aside={<span className="text-[13px] text-steel">Pessoas e custo por tipo</span>}>
          <ModeMix rows={rows} />
        </Panel>
        <Panel className="overflow-visible" title="Departamentos" aside={<span className="text-[13px] text-steel">Transporte de cada área</span>}>
          <ModeLegend />
          <StackedBars groups={groupByMode(rows, r => r.departmentName ?? 'Sem departamento').slice(0, 10)} total={total} />
        </Panel>
        <Panel
          className="overflow-visible"
          title="Rotas do fretado"
          aside={capacity > 0 && <span className="text-[13px] text-steel">{formatNumber(riders)} de {formatNumber(capacity)} lugares ocupados</span>}
        >
          <Occupancy routes={routes} />
        </Panel>
      </div>
    </div>
  )
}

/**
 * Destaque: quanto da base tem transporte definido, com a divisão por tipo
 * numa barra segmentada que cresce na entrada.
 */
// No fundo escuro, a cor "tinta" (fretado) some: vira branco translúcido.
const onDark = (color: string) => (color === 'var(--color-ink)' ? 'rgb(255 255 255 / 0.75)' : color)

function CoverageHero({ rows, filtered }: { rows: Row[]; filtered: boolean }) {
  const ref = useRef<HTMLElement>(null)
  useTilt(ref, 3)
  const total = rows.length
  const slices = modeSlices(rows)
  const defined = total - (slices.find(s => s.label === UNSET)?.value ?? 0)
  const coverage = total ? (defined / total) * 100 : 0

  useGSAP(
    () => {
      if (reducedMotion()) return
      gsap.from('[data-seg]', { scaleX: 0, transformOrigin: 'left', duration: 1.3, ease: 'expo.out', stagger: 0.1, delay: 0.35 })
      gsap.from('[data-legend]', { autoAlpha: 0, y: 8, duration: 0.6, stagger: 0.06, delay: 0.6 })
    },
    { scope: ref, dependencies: [slices.map(s => s.value).join()], revertOnUpdate: true },
  )

  return (
    <div data-reveal className="flex">
      <section
        ref={ref}
        aria-label="Cobertura de transporte"
        className="night-glow grain relative flex min-h-[300px] flex-1 flex-col justify-between rounded-xl border border-night-line p-7 text-snow shadow-lift will-change-transform"
      >
        {/* Camadas decorativas recortadas aqui: a seção fica sem overflow para o painel de detalhes aparecer. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden>
          <div className="blueprint absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(420px circle at var(--mx, 85%) var(--my, 10%), rgb(254 190 2 / 0.14), transparent 60%)' }} />
          <Bus className="absolute -right-6 -bottom-8 size-48 text-white/[0.03]" />
        </div>
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium tracking-[0.16em] text-fog uppercase">Cobertura de transporte</p>
            <Hoverable
              className="inline-block"
              details={{
                title: 'Cobertura por departamento',
                rows: groupByMode(rows, r => r.departmentName ?? 'Sem departamento').map(g => ({
                  label: g.label,
                  value: pct(g.total - g.byMode.unset, g.total),
                  share: (g.total - g.byMode.unset) / g.total,
                  color: 'var(--color-brand)',
                  tone: g.byMode.unset ? ('danger' as const) : ('ok' as const),
                })),
                hint: 'Percentual de pessoas com transporte definido em cada área.',
              }}
            >
              <p tabIndex={0} className="num mt-3 cursor-default rounded-md font-display text-[96px] leading-[0.8] font-semibold tracking-[-0.02em] text-brand outline-none drop-shadow-[0_0_30px_rgb(254_190_2/0.25)] focus-visible:ring-2 focus-visible:ring-brand">
                <CountUp value={coverage} format={percentFormat} />
              </p>
            </Hoverable>
            <p className="mt-3 text-[13.5px] text-fog">
              <span className="num font-semibold text-snow">{formatNumber(defined)}</span> de <span className="num font-semibold text-snow">{formatNumber(total)}</span> colaboradores com transporte definido
              {filtered && ' no recorte'}
            </p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-night-line bg-white/5 px-2.5 py-1 text-[11.5px] text-fog">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-ok" />
            </span>
            Ao vivo
          </span>
        </div>

        <div className="relative mt-6">
          <div className="flex h-2.5 gap-1 overflow-hidden rounded-full" aria-hidden>
            {slices
              .filter(s => s.value > 0)
              .map(s => (
                <span key={s.label} data-seg className="h-full rounded-full" style={{ width: `${(s.value / total) * 100}%`, background: onDark(s.color) }} />
              ))}
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 text-[13px]">
            {slices.map(s => {
              const list = rows.filter(r => modeLabel(r.mode) === s.label)
              return (
                <li key={s.label} data-legend>
                  <Hoverable
                    details={{
                      title: `${s.label}: ${formatNumber(s.value)} (${pct(s.value, total)})`,
                      rows: [
                        ...topRows(countBy(list, r => r.city), list.length, 3, s.color),
                        ...(sumCost(list) ? [{ label: 'Custo mensal', value: money(sumCost(list)) }] : []),
                      ],
                      hint: 'Cidades com mais pessoas neste tipo.',
                    }}
                  >
                    <span tabIndex={0} className="-mx-1.5 flex cursor-default items-center gap-2 rounded-md px-1.5 py-0.5 outline-none transition-colors hover:bg-white/10 focus-visible:bg-white/10">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: onDark(s.color) }} aria-hidden />
                      <span className="num font-semibold">
                        <CountUp value={s.value} />
                      </span>
                      <span className="truncate text-fog">{s.label}</span>
                    </span>
                  </Hoverable>
                </li>
              )
            })}
          </ul>
        </div>
      </section>
    </div>
  )
}

/** Tudo que falta no cadastro, num lugar só; cada item leva à aba Qualidade dos dados. */
function Pending({ rows }: { rows: Row[] }) {
  const navigate = useNavigate()
  const chartered = rows.filter(r => r.mode === 'chartered')
  const items = [
    { icon: AlertTriangle, label: 'Sem transporte definido', list: rows.filter(r => r.mode === null) },
    { icon: Copy, label: 'Cadastros duplicados', list: rows.filter(r => r.duplicate) },
    { icon: MapPin, label: 'Sem cidade', list: rows.filter(r => !r.city) },
    { icon: Bus, label: 'Fretado sem rota', list: chartered.filter(r => !r.routeId) },
    { icon: MapPin, label: 'Fretado sem ponto de embarque', list: chartered.filter(r => !r.pickupPoint) },
    { icon: Wallet, label: 'Mobilidade sem custo', list: rows.filter(r => r.mode === 'mobility' && r.monthlyCostCents === null) },
  ].map(i => ({ ...i, value: i.list.length }))
  const open = items.reduce((s, i) => s + i.value, 0)
  return (
    <section data-reveal className="surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          Pendências de cadastro
          <Badge tone={open ? 'danger' : 'ok'}>{open ? `${formatNumber(open)} em aberto` : 'tudo em dia'}</Badge>
        </h2>
        <span className="text-[13px] text-steel">Clique para ver quem precisa de ajuste</span>
      </header>
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {items.map(({ icon: Icon, label, value, list }) => (
          <li key={label} className="border-line not-last:border-b sm:border-r">
            <Hoverable
              details={{
                title: value ? `${label}: ${formatNumber(value)}` : label,
                rows: list.slice(0, 6).map(r => ({ label: r.fullName, value: r.registration })),
                hint: value > 6 ? `E mais ${value - 6}. Veja todos em Qualidade dos dados.` : value ? 'Clique para corrigir em Qualidade dos dados.' : 'Tudo em dia aqui.',
              }}
            >
            <button
              type="button"
              onClick={() => void navigate({ to: '/mobilidade', search: { tab: 'qualidade' } })}
              className="group flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-sunken"
            >
              <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-sm transition-transform duration-500 group-hover:scale-110', value ? 'bg-danger-soft text-danger' : 'bg-ok-soft text-ok')}>
                {value ? <Icon className="size-[17px]" aria-hidden /> : <CheckCircle2 className="size-[17px]" aria-hidden />}
              </span>
              <span className="min-w-0">
                <span className={cn('num block font-display text-[26px] leading-none font-semibold', value ? 'text-ink' : 'text-ok')}>
                  <CountUp value={value} />
                </span>
                <span className="mt-1 block text-[12.5px] leading-snug text-steel">{label}</span>
              </span>
            </button>
            </Hoverable>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---------- distribuição por transporte (cidades, departamentos) ----------

type ModeKey = TransportMode | 'unset'
const MODE_KEYS: ModeKey[] = [...TRANSPORT_MODES, 'unset']
const modeKey = (r: Row): ModeKey => r.mode ?? 'unset'
type Group = { label: string; total: number; cost: number; byMode: Record<ModeKey, number> }

const groupByMode = (rows: Row[], key: (r: Row) => string | null | undefined): Group[] => {
  const map = new Map<string, Group>()
  for (const r of rows) {
    const label = key(r)
    if (!label) continue
    const g = map.get(label) ?? { label, total: 0, cost: 0, byMode: { mobility: 0, chartered: 0, own: 0, none: 0, unset: 0 } }
    g.total++
    g.cost += r.monthlyCostCents ?? 0
    g.byMode[modeKey(r)]++
    map.set(label, g)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

function ModeLegend() {
  return (
    <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-steel">
      {MODE_KEYS.map(m => (
        <li key={m} className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ background: MODE_COLORS[m] }} aria-hidden />
          {modeLabel(m === 'unset' ? null : m)}
        </li>
      ))}
    </ul>
  )
}

/** Barra por grupo, dividida pelo tipo de transporte; tamanho relativo ao maior grupo. */
function StackedBars({ groups, total, onPick }: { groups: Group[]; total: number; onPick?: (label: string) => void }) {
  if (!groups.length) return <p className="text-sm text-steel">Sem dados neste recorte.</p>
  const max = Math.max(...groups.map(g => g.total), 1)
  return (
    <ul className="-mx-2 flex flex-col">
      {groups.map((g, i) => {
        const content = (
          <>
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink-soft" title={g.label}>
                {g.label}
              </span>
              <span className="num block text-[11.5px] text-steel-soft">{g.cost ? `${money(g.cost)}/mês` : 'sem custo'}</span>
            </span>
            <span className="h-5 overflow-hidden rounded-md bg-sunken">
              <span className="funnel-bar flex h-full gap-px" style={{ width: `${(g.total / max) * 100}%`, animationDelay: `${i * 50}ms` }}>
                {MODE_KEYS.filter(m => g.byMode[m]).map(m => (
                  <span
                    key={m}
                    className="h-full transition-opacity duration-200 first:rounded-l-md last:rounded-r-md group-hover/hv:opacity-90"
                    style={{ width: `${(g.byMode[m] / g.total) * 100}%`, background: MODE_COLORS[m] }}
                  />
                ))}
              </span>
            </span>
            <span className="text-right">
              <span className="num block font-semibold text-ink">{formatNumber(g.total)}</span>
              <span className="num block text-[11.5px] text-steel-soft">{pct(g.total, total)}</span>
            </span>
          </>
        )
        const cls = 'grid w-full grid-cols-[minmax(0,9rem)_1fr_3rem] items-center gap-3 rounded-md px-2 py-1.5 text-left text-[13px] outline-none transition-colors hover:bg-sunken focus-visible:bg-sunken'
        const details: Details = {
          title: `${g.label}: ${formatNumber(g.total)} pessoas`,
          rows: [
            ...MODE_KEYS.filter(m => g.byMode[m]).map(m => ({
              label: modeLabel(m === 'unset' ? null : m),
              value: `${g.byMode[m]} · ${pct(g.byMode[m], g.total)}`,
              share: g.byMode[m] / g.total,
              color: MODE_COLORS[m],
              tone: m === 'unset' ? ('danger' as const) : undefined,
            })),
            { label: 'Custo mensal', value: money(g.cost) },
            { label: 'Custo por pessoa', value: money(Math.round(g.cost / g.total)) },
          ],
          hint: onPick ? 'Clique para filtrar a página por esta cidade.' : undefined,
        }
        return (
          <li key={g.label}>
            <Hoverable details={details}>
              {onPick ? (
                <button type="button" onClick={() => onPick(g.label)} className={cls}>
                  {content}
                </button>
              ) : (
                <div tabIndex={0} className={cn(cls, 'cursor-default')}>
                  {content}
                </div>
              )}
            </Hoverable>
          </li>
        )
      })}
    </ul>
  )
}

/** Rosca com destaque ao passar o mouse e, ao lado, pessoas, participação e custo de cada tipo. */
function ModeMix({ rows }: { rows: Row[] }) {
  const [active, setActive] = useState<ModeKey | null>(null)
  const data = MODE_KEYS.map(m => {
    const list = rows.filter(r => modeKey(r) === m)
    const cost = list.reduce((s, r) => s + (r.monthlyCostCents ?? 0), 0)
    const paying = list.filter(r => r.monthlyCostCents !== null).length
    return { key: m, label: modeLabel(m === 'unset' ? null : m), value: list.length, cost, avg: paying ? cost / paying : null }
  }).filter(d => d.value > 0)
  const total = rows.length
  if (!total) return <p className="text-sm text-steel">Sem dados neste recorte.</p>
  const shown = data.find(d => d.key === active)
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative size-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="66%"
              outerRadius="100%"
              paddingAngle={1.5}
              stroke="var(--color-paper)"
              startAngle={90}
              endAngle={-270}
              onMouseEnter={(_, i) => setActive(data[i]?.key ?? null)}
              onMouseLeave={() => setActive(null)}
            >
              {data.map(d => (
                <Cell key={d.key} fill={MODE_COLORS[d.key]} fillOpacity={active && active !== d.key ? 0.25 : 1} style={{ transition: 'fill-opacity 250ms' }} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="num font-display text-[30px] leading-none font-semibold text-ink">{shown ? pct(shown.value, total) : formatNumber(total)}</span>
          <span className="mt-0.5 max-w-24 text-[11.5px] leading-tight text-steel">{shown ? shown.label : 'colaboradores'}</span>
        </span>
      </div>
      <ul className="flex min-w-60 flex-1 flex-col gap-1 text-[13px]">
        {data.map(d => (
          <li
            key={d.key}
            onMouseEnter={() => setActive(d.key)}
            onMouseLeave={() => setActive(null)}
            className={cn('rounded-md px-2 py-1.5 transition-colors', active === d.key && 'bg-sunken')}
          >
            <span className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: MODE_COLORS[d.key] }} aria-hidden />
              <span className="flex-1 truncate text-ink-soft">{d.label}</span>
              <span className="num font-semibold text-ink">{formatNumber(d.value)}</span>
              <span className="num w-10 text-right text-steel-soft">{pct(d.value, total)}</span>
            </span>
            {d.cost > 0 && (
              <span className="num mt-0.5 block pl-[18px] text-[11.5px] text-steel">
                {money(d.cost)}/mês{d.avg !== null && ` · ${money(Math.round(d.avg))} por pessoa`}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

const routeStatus = (riders: number, capacity: number | null) => {
  if (!capacity) return { label: 'Sem capacidade', tone: 'neutral' as const, bar: 'bg-steel-soft' }
  const ratio = riders / capacity
  if (ratio > 1) return { label: 'Acima da capacidade', tone: 'danger' as const, bar: 'bg-danger' }
  if (ratio >= 0.85) return { label: 'Quase lotada', tone: 'warn' as const, bar: 'bg-brand' }
  if (ratio < 0.4) return { label: 'Ociosa', tone: 'info' as const, bar: 'bg-info' }
  return { label: 'Com vagas', tone: 'ok' as const, bar: 'bg-ok' }
}

/** Cada rota: situação, ocupação, lugares livres e dados do veículo. */
function Occupancy({ routes }: { routes: Route[] }) {
  if (routes.length === 0) return <p className="text-sm text-steel">Nenhuma rota de fretado cadastrada.</p>
  return (
    <ul className="flex flex-col gap-2">
      {[...routes]
        .sort((a, b) => b.riders / (b.capacity || 1) - a.riders / (a.capacity || 1))
        .map((r, i) => {
          const ratio = r.capacity ? r.riders / r.capacity : 0
          const status = routeStatus(r.riders, r.capacity)
          return (
            <li key={r.id}>
            <Hoverable
              details={{
                title: r.name,
                rows: [
                  { label: 'Passageiros', value: formatNumber(r.riders) },
                  { label: 'Capacidade', value: r.capacity ? formatNumber(r.capacity) : 'não informada' },
                  { label: 'Ocupação', value: r.capacity ? pct(r.riders, r.capacity) : '—', share: Math.min(1, ratio), color: 'var(--color-brand)' },
                  { label: r.capacity && r.riders > r.capacity ? 'Acima da capacidade' : 'Lugares livres', value: r.capacity ? formatNumber(Math.abs(r.capacity - r.riders)) : '—', tone: r.capacity && r.riders > r.capacity ? ('danger' as const) : undefined },
                  { label: 'Veículo', value: r.vehicle ?? '—' },
                  { label: 'Turno', value: r.shift ?? '—' },
                ],
                hint: status.label === 'Ociosa' ? 'Menos de 40% ocupada: avalie um veículo menor.' : status.tone === 'danger' ? 'Mais passageiros que lugares: remaneje ou aumente o veículo.' : undefined,
              }}
            >
            <div tabIndex={0} className="-mx-2 rounded-md px-2 py-1.5 text-[13px] outline-none transition-colors hover:bg-sunken focus-visible:bg-sunken">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-medium text-ink" title={r.name}>
                  {r.name}
                </span>
                <Badge tone={status.tone}>{status.label}</Badge>
              </div>
              <div className="mt-1.5 grid grid-cols-[1fr_auto] items-center gap-3">
                <span className="relative h-2.5 overflow-hidden rounded-full bg-sunken">
                  <span className={cn('funnel-bar block h-full rounded-full', status.bar)} style={{ width: `${Math.min(100, ratio * 100)}%`, animationDelay: `${i * 60}ms` }} />
                  {/* Marca de 85%: daqui em diante a rota está quase lotada. */}
                  <span className="absolute inset-y-0 left-[85%] w-px bg-ink/25" aria-hidden />
                </span>
                <span className="num font-semibold text-ink">
                  {r.riders}/{r.capacity ?? '—'} <span className="font-normal text-steel-soft">{r.capacity ? pct(r.riders, r.capacity) : ''}</span>
                </span>
              </div>
              <p className="mt-1 text-[11.5px] text-steel">
                {[r.vehicle, r.shift, r.driver && `Motorista: ${r.driver}`].filter(Boolean).join(' · ') || 'Sem dados do veículo'}
                {r.capacity ? ` · ${Math.max(0, r.capacity - r.riders)} lugares livres` : ''}
              </p>
            </div>
            </Hoverable>
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
  const defined = rows.filter(r => r.mode !== null).length
  const cost = rows.reduce((s, r) => s + (r.monthlyCostCents ?? 0), 0)
  const working = rows.filter(r => r.status === 'active').length
  return (
    <div className="flex flex-col gap-6">
      <SpotlightGrid className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Users} tone="ink" label="Colaboradores" details={{ title: 'Situação', rows: [{ label: 'Trabalhando', value: formatNumber(working), share: rows.length ? working / rows.length : 0, color: 'var(--color-ok)' }, { label: 'Afastados', value: formatNumber(rows.length - working), share: rows.length ? (rows.length - working) / rows.length : 0, color: 'var(--color-brand)' }, ...topRows(countBy(rows, r => r.departmentName ?? 'Sem departamento'), rows.length, 4)], hint: 'Distribuição por área no recorte atual.' }} value={<CountUp value={rows.length} />} note={`${formatNumber(working)} trabalhando, ${formatNumber(rows.length - working)} afastados`} />
        <KpiCard
          icon={CheckCircle2}
          tone="ok"
          label="Com transporte definido" details={{ title: 'Pessoas por tipo', rows: modeRows(rows) }}
          value={<CountUp value={rows.length ? (defined / rows.length) * 100 : 0} format={percentFormat} />}
          note={`${formatNumber(defined)} de ${formatNumber(rows.length)} pessoas`}
          aside={<Ring value={rows.length ? defined / rows.length : 0} size={58} thickness={7} track="var(--color-sunken)" color="var(--color-ok)" />}
        />
        <KpiCard
          icon={Wallet}
          tone="info"
          label="Custo por colaborador" details={{ title: 'Custo mensal por tipo', rows: costRows(rows), hint: 'A média divide o custo total por todos os colaboradores do recorte, inclusive quem não usa transporte pago.' }}
          value={rows.length ? <CountUp value={cost / rows.length} format={moneyFormat} /> : '—'}
          note={`Média da base inteira · ${money(cost)}/mês no total`}
        />
        <KpiCard
          icon={rows.length - defined ? AlertTriangle : CheckCircle2}
          tone={rows.length - defined ? 'danger' : 'ok'}
          label="Sem cadastro de transporte" details={{ title: 'Quem falta cadastrar', rows: rows.filter(r => r.mode === null).slice(0, 6).map(r => ({ label: r.fullName, value: r.registration, tone: 'danger' as const })), hint: rows.length - defined > 6 ? `E mais ${rows.length - defined - 6}.` : undefined }}
          value={<CountUp value={rows.length - defined} />}
          note={rows.length - defined ? 'Clique na linha para completar' : 'Todos cadastrados'}
        />
      </SpotlightGrid>
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
    </div>
  )
}

function MobilityList({ rows, onEdit }: { rows: Row[]; onEdit?: (row: BoardRow) => void }) {
  const list = rows.filter(r => r.mode === 'mobility')
  const cost = list.reduce((s, r) => s + (r.monthlyCostCents ?? 0), 0)
  const withCost = list.filter(r => r.monthlyCostCents !== null).length
  const avgMobility = avgCost(rows, 'mobility')
  const avgChartered = avgCost(rows, 'chartered')
  // Quanto a mobilidade economiza por mês frente a pôr essas pessoas no fretado.
  const saving = avgMobility !== null && avgChartered !== null ? (avgChartered - avgMobility) * list.length : null
  const providers = countBy(list, r => r.provider)
  const cities = countBy(list, r => r.city)
  return (
    <div className="flex flex-col gap-6">
      <SpotlightGrid className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={Smartphone}
          tone="brand"
          label="Participação na base" details={{ title: 'Mobilidade por departamento', rows: topRows(countBy(list, r => r.departmentName ?? 'Sem departamento'), list.length, 5, MODE_COLORS.mobility) }}
          value={<CountUp value={rows.length ? (list.length / rows.length) * 100 : 0} format={percentFormat} />}
          note={`${formatNumber(list.length)} pessoas usam cartão ou app`}
          aside={<Ring value={rows.length ? list.length / rows.length : 0} size={58} thickness={7} track="var(--color-sunken)" />}
        />
        <KpiCard
          icon={Wallet}
          tone="info"
          label="Custo anual projetado" details={{ title: 'Mês a mês e no ano', rows: [{ label: 'Por mês', value: money(cost) }, { label: 'Por pessoa/mês', value: withCost ? money(Math.round(cost / withCost)) : '—' }, { label: 'Por pessoa/ano', value: withCost ? money(Math.round((cost / withCost) * 12)) : '—' }, { label: 'Sem valor informado', value: formatNumber(list.length - withCost), tone: list.length - withCost ? ('danger' as const) : ('ok' as const) }] }}
          value={<CountUp value={cost * 12} format={moneyFormat} />}
          note={withCost ? `${money(Math.round(cost / withCost))} por pessoa/mês${withCost < list.length ? ` · ${list.length - withCost} sem valor` : ''}` : 'Nenhum valor informado'}
        />
        <KpiCard
          icon={Gauge}
          tone={saving !== null && saving >= 0 ? 'ok' : 'warn'}
          details={{ title: 'Como a conta é feita', rows: [{ label: 'Custo médio do fretado', value: avgChartered === null ? '—' : money(Math.round(avgChartered)), color: MODE_COLORS.chartered }, { label: 'Custo médio da mobilidade', value: avgMobility === null ? '—' : money(Math.round(avgMobility)), color: MODE_COLORS.mobility }, { label: 'Pessoas na mobilidade', value: formatNumber(list.length) }, ...(saving !== null ? [{ label: 'Por ano', value: money(Math.round(Math.abs(saving) * 12)), tone: saving >= 0 ? ('ok' as const) : ('danger' as const) }] : [])], hint: '(custo médio do fretado − custo médio da mobilidade) × pessoas na mobilidade.' }}
          label={saving !== null && saving < 0 ? 'Custo extra frente ao fretado' : 'Economia frente ao fretado'}
          value={saving === null ? '—' : <CountUp value={Math.abs(saving)} format={moneyFormat} />}
          note={saving === null ? 'Falta custo do fretado para comparar' : `Por mês, se essas ${list.length} pessoas fossem para o fretado`}
        />
        <KpiCard
          icon={MapPin}
          tone="ok"
          label="Cidades com mobilidade" details={{ title: 'Pessoas e custo por cidade', rows: groupByMode(list, r => r.city).slice(0, 6).map(g => ({ label: g.label, value: `${g.total} · ${money(g.cost)}`, share: g.total / (list.length || 1), color: MODE_COLORS.mobility })), hint: providers.length > 1 ? `${providers.length} fornecedores no contrato.` : undefined }}
          value={<CountUp value={cities.length} />}
          note={providers[0] ? `Fornecedor principal: ${providers[0].label} (${pct(providers[0].value, list.length)})` : 'Nenhum fornecedor informado'}
        />
      </SpotlightGrid>
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
  const capacity = routes.reduce((s, r) => s + (r.capacity ?? 0), 0)
  const riders = routes.reduce((s, r) => s + r.riders, 0)
  const cost = list.reduce((s, r) => s + (r.monthlyCostCents ?? 0), 0)
  const occupancy = capacity ? riders / capacity : 0
  const noPickup = list.filter(r => !r.routeId || !r.pickupPoint).length
  return (
    <div className="flex flex-col gap-6">
      <SpotlightGrid className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Users} tone="ink" label="Passageiros" details={{ title: 'Passageiros por rota', rows: routes.map(r => ({ label: r.name, value: formatNumber(list.filter(p => p.routeId === r.id).length), share: list.length ? list.filter(p => p.routeId === r.id).length / list.length : 0, color: MODE_COLORS.chartered })) }} value={<CountUp value={list.length} />} note={`${pct(list.length, rows.length)} da base em ${routes.length} rotas`} />
        <KpiCard
          icon={Gauge}
          tone={occupancy > 1 ? 'danger' : occupancy >= 0.85 ? 'warn' : 'ok'}
          label="Ocupação média" details={{ title: 'Ocupação de cada rota', rows: routes.map(r => ({ label: r.name, value: r.capacity ? `${r.riders}/${r.capacity} · ${pct(r.riders, r.capacity)}` : '—', share: r.capacity ? Math.min(1, r.riders / r.capacity) : 0, color: r.capacity && r.riders > r.capacity ? 'var(--color-danger)' : 'var(--color-brand)' })), hint: 'Acima de 85% a rota está quase lotada; abaixo de 40%, ociosa.' }}
          value={capacity ? <CountUp value={occupancy * 100} format={percentFormat} /> : '—'}
          note={capacity ? `${formatNumber(Math.max(0, capacity - riders))} lugares livres de ${formatNumber(capacity)}` : 'Nenhuma capacidade informada'}
          aside={capacity > 0 && <Ring value={occupancy} size={58} thickness={7} track="var(--color-sunken)" color={occupancy > 1 ? 'var(--color-danger)' : 'var(--color-brand)'} />}
        />
        <KpiCard icon={Wallet} tone="info" label="Custo mensal" details={{ title: 'Custo do fretado por rota', rows: routes.map(r => { const c = sumCost(list.filter(p => p.routeId === r.id)); return { label: r.name, value: money(c), share: cost ? c / cost : 0, color: MODE_COLORS.chartered } }), hint: `Projeção anual: ${money(cost * 12)}.` }} value={<CountUp value={cost} format={moneyFormat} />} note={list.length ? `${money(Math.round(cost / list.length))} por passageiro` : 'Sem passageiros'} />
        <KpiCard
          icon={noPickup ? AlertTriangle : CheckCircle2}
          tone={noPickup ? 'warn' : 'ok'}
          label="Sem rota ou ponto" details={{ title: 'Quem está sem rota ou ponto', rows: list.filter(r => !r.routeId || !r.pickupPoint).slice(0, 6).map(r => ({ label: r.fullName, value: !r.routeId ? 'sem rota' : 'sem ponto', tone: 'danger' as const })) }}
          value={<CountUp value={noPickup} />}
          note={noPickup ? 'O motorista não sabe onde buscar' : 'Todos com rota e ponto de embarque'}
        />
      </SpotlightGrid>
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
  const cities = useMemo(() => groupByMode(rows, r => r.city), [rows])
  if (!cities.length) return <EmptyState icon={MapPin} title="Nenhuma cidade identificada neste recorte" />
  const located = cities.reduce((s, c) => s + c.total, 0)
  const top = cities[0]!
  const cost = cities.reduce((s, c) => s + c.cost, 0)
  const withPending = cities.filter(c => c.byMode.unset > 0).length
  return (
    <div className="flex flex-col gap-6">
      <SpotlightGrid className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={MapPin} tone="ok" label="Cidades atendidas" details={{ title: 'Ranking de cidades', rows: topRows(cities.map(c => ({ label: c.label, value: c.total })), located, 6, 'var(--color-ok)') }} value={<CountUp value={cities.length} />} note={`${formatNumber(located)} colaboradores com cidade identificada`} />
        <KpiCard
          icon={Building2}
          tone="brand"
          label="Maior concentração" details={{ title: `${top.label} por tipo`, rows: MODE_KEYS.filter(m => top.byMode[m]).map(m => ({ label: modeLabel(m === 'unset' ? null : m), value: formatNumber(top.byMode[m]), share: top.byMode[m] / top.total, color: MODE_COLORS[m] })), hint: `Custo mensal da cidade: ${money(top.cost)}.` }}
          value={<CountUp value={(top.total / located) * 100} format={percentFormat} />}
          note={`${top.label}: ${formatNumber(top.total)} colaboradores`}
          aside={<Ring value={top.total / located} size={58} thickness={7} track="var(--color-sunken)" />}
        />
        <KpiCard icon={Wallet} tone="info" label="Custo médio por cidade" details={{ title: 'Cidades mais caras', rows: [...cities].sort((a, b) => b.cost - a.cost).slice(0, 6).map(c => ({ label: c.label, value: `${money(c.cost)} · ${money(Math.round(c.cost / c.total))}/pessoa`, share: cost ? c.cost / cost : 0, color: 'var(--color-info)' })) }} value={<CountUp value={cost / cities.length} format={moneyFormat} />} note={`${money(cost)}/mês somando todas`} />
        <KpiCard
          icon={withPending ? AlertTriangle : CheckCircle2}
          tone={withPending ? 'danger' : 'ok'}
          label="Cidades com pendência" details={{ title: 'Pessoas sem cadastro, por cidade', rows: cities.filter(c => c.byMode.unset).map(c => ({ label: c.label, value: `${c.byMode.unset} de ${c.total}`, share: c.byMode.unset / c.total, color: 'var(--color-danger)', tone: 'danger' as const })) }}
          value={<CountUp value={withPending} />}
          note={withPending ? 'Com gente sem transporte cadastrado' : 'Todas com transporte definido'}
        />
      </SpotlightGrid>
      <div data-reveal>
        <ModeLegend />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {cities.map((c, i) => {
          const people = rows.filter(r => r.city === c.label)
          return (
          <Hoverable
            key={c.label}
            className="flex"
            details={{
              title: `Bairros em ${c.label}`,
              rows: [
                ...topRows(countBy(people, r => r.pickupDistrict ?? r.homeDistrict), c.total, 5, 'var(--color-brand)'),
                { label: 'Custo por pessoa', value: money(Math.round(c.cost / c.total)) },
              ],
              hint: 'Clique para filtrar a página por esta cidade.',
            }}
          >
          <button
            type="button"
            data-reveal
            onClick={() => onPick(c.label)}
            title="Filtrar por esta cidade"
            className="surface group relative flex-1 overflow-hidden p-5 text-left transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-lift"
          >
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-semibold text-ink">
                  <MapPin className="size-4 shrink-0 text-brand-ink transition-transform duration-500 group-hover:-translate-y-0.5 group-hover:scale-110" aria-hidden />
                  <span className="truncate">{c.label}</span>
                </span>
                <span className="mt-1 block text-[12px] text-steel">
                  {i === 0 ? 'Maior polo' : `${i + 1}º lugar`} · {pct(c.total, located)} dos colaboradores
                </span>
              </span>
              <span className="num font-display text-[34px] leading-none font-semibold text-ink">
                <CountUp value={c.total} />
              </span>
            </span>
            <span className="mt-4 flex h-2 gap-px overflow-hidden rounded-full bg-sunken" aria-hidden>
              {MODE_KEYS.filter(m => c.byMode[m]).map(m => (
                <span key={m} className="funnel-bar h-full" style={{ width: `${(c.byMode[m] / c.total) * 100}%`, background: MODE_COLORS[m], animationDelay: `${i * 40}ms` }} />
              ))}
            </span>
            <span className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px]">
              {MODE_KEYS.filter(m => c.byMode[m]).map(m => (
                <span key={m} className="flex items-center justify-between gap-2">
                  <span className="truncate text-steel">{modeLabel(m === 'unset' ? null : m)}</span>
                  <span className={cn('num font-semibold', m === 'unset' ? 'text-danger' : 'text-ink')}>{c.byMode[m]}</span>
                </span>
              ))}
            </span>
            <span className="mt-3 flex justify-between border-t border-line pt-2.5 text-[12.5px]">
              <span className="text-steel">Custo mensal</span>
              <span className="num font-semibold text-ink">{money(c.cost)}</span>
            </span>
          </button>
          </Hoverable>
          )
        })}
      </div>
    </div>
  )
}

// ---------- indicadores ----------

function Indicators({ rows }: { rows: Row[] }) {
  const total = rows.length
  const working = rows.filter(r => r.status === 'active').length
  const positions = groupByMode(rows, r => r.positionTitle ?? 'Cargo não informado')
  const departments = groupByMode(rows, r => r.departmentName ?? 'Sem departamento')
  // Quem usa fretado ou mobilidade: o custo que a empresa banca.
  const sponsored = rows.filter(r => r.mode === 'chartered' || r.mode === 'mobility').length
  const costliest = [...departments].sort((a, b) => b.cost - a.cost)[0]
  return (
    <div className="flex flex-col gap-6">
      <SpotlightGrid className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={Users}
          tone="ok"
          label="Trabalhando" details={{ title: 'Trabalhando por departamento', rows: departments.map(g => { const w = rows.filter(r => (r.departmentName ?? 'Sem departamento') === g.label && r.status === 'active').length; return { label: g.label, value: `${w} de ${g.total}`, share: w / g.total, color: 'var(--color-ok)' } }) }}
          value={<CountUp value={total ? (working / total) * 100 : 0} format={percentFormat} />}
          note={`${formatNumber(working)} de ${formatNumber(total)} colaboradores`}
          aside={<Ring value={total ? working / total : 0} size={58} thickness={7} track="var(--color-sunken)" color="var(--color-ok)" />}
        />
        <KpiCard
          icon={Bus}
          tone="brand"
          label="Transporte pago pela empresa" details={{ title: 'Fretado e mobilidade', rows: modeRows(rows.filter(r => r.mode === 'chartered' || r.mode === 'mobility')).map(d => ({ ...d, share: total ? (d.share ?? 0) * sponsored / total : 0 })), hint: `Custo mensal desses ${sponsored}: ${money(sumCost(rows.filter(r => r.mode === 'chartered' || r.mode === 'mobility')))}.` }}
          value={<CountUp value={total ? (sponsored / total) * 100 : 0} format={percentFormat} />}
          note={`${formatNumber(sponsored)} no fretado ou na mobilidade`}
        />
        <KpiCard icon={Building2} tone="info" label="Área de maior custo" details={{ title: 'Custo mensal por área', rows: [...departments].sort((a, b) => b.cost - a.cost).slice(0, 6).map(g => ({ label: g.label, value: money(g.cost), share: costliest?.cost ? g.cost / costliest.cost : 0, color: 'var(--color-info)' })) }} value={costliest ? <CountUp value={costliest.cost} format={moneyFormat} /> : '—'} note={costliest ? `${costliest.label}, por mês` : 'Sem departamentos'} />
        <KpiCard icon={Users} tone="ink" label="Cargos distintos" details={{ title: 'Cargos mais comuns', rows: topRows(positions.map(g => ({ label: g.label, value: g.total })), total, 6) }} value={<CountUp value={positions.length} />} note={positions[0] ? `Mais comum: ${positions[0].label}` : 'Nenhum cargo'} />
      </SpotlightGrid>
      <div className="grid gap-6 xl:grid-cols-2">
      <Panel className="overflow-visible" title="Todas as cidades" aside={<span className="text-[13px] text-steel">Transporte de cada cidade</span>}>
        <ModeLegend />
        <StackedBars groups={groupByMode(rows, r => r.city)} total={total} />
      </Panel>
      <Panel className="overflow-visible" title="Cargos" aside={<span className="text-[13px] text-steel">Top 10 e o transporte de cada um</span>}>
        <ModeLegend />
        <StackedBars groups={positions.slice(0, 10)} total={total} />
      </Panel>
      <Panel className="overflow-visible" title="Fornecedores" aside={<span className="text-[13px] text-steel">Pessoas e custo mensal de cada contrato</span>}>
        <ModeLegend />
        <StackedBars groups={groupByMode(rows, r => r.provider)} total={total} />
      </Panel>
      <Panel className="overflow-visible" title="Departamentos" aside={<span className="text-[13px] text-steel">Pessoas, transporte e custo de cada área</span>}>
        <ModeLegend />
        <StackedBars groups={departments} total={total} />
      </Panel>
      </div>
    </div>
  )
}

// ---------- qualidade dos dados ----------

/** Nota da qualidade do cadastro num bloco escuro, com o anel desenhado na entrada. */
function ScoreHero({ score, complete, total, details }: { score: number; complete: number; total: number; details: Details }) {
  const ref = useRef<HTMLElement>(null)
  useTilt(ref, 3)
  const color = score >= 85 ? 'var(--color-ok)' : score >= 65 ? 'var(--color-brand)' : 'var(--color-danger)'
  const verdict = score >= 85 ? 'Cadastro confiável' : score >= 65 ? 'Precisa de atenção' : 'Cadastro crítico'
  return (
    <div data-reveal className="flex">
      <section
        ref={ref}
        aria-label="Qualidade do cadastro"
        className="night-glow grain relative flex flex-1 items-center gap-6 rounded-xl border border-night-line p-7 text-snow shadow-lift will-change-transform"
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden>
          <div className="blueprint absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" />
        </div>
        <Hoverable details={details} className="relative shrink-0">
          <div tabIndex={0} className="cursor-default rounded-full outline-none transition-transform duration-300 hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-brand">
            <Ring value={score / 100} size={132} thickness={12} color={color}>
              <span>
                <span className="num block font-display text-[38px] leading-none font-semibold text-snow">
                  <CountUp value={score} format={percentFormat} />
                </span>
                <span className="text-[11px] text-fog">qualidade</span>
              </span>
            </Ring>
          </div>
        </Hoverable>
        <div className="relative">
          <p className="text-[11px] font-medium tracking-[0.16em] text-fog uppercase">Qualidade do cadastro</p>
          <p className="mt-2 font-display text-[28px] leading-tight font-semibold" style={{ color }}>
            {verdict}
          </p>
          <p className="mt-2 text-[13.5px] text-fog">
            <span className="num font-semibold text-snow">{formatNumber(complete)}</span> de <span className="num font-semibold text-snow">{formatNumber(total)}</span> registros sem nenhuma pendência
          </p>
        </div>
      </section>
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
      aside={
        <span className={cn('num rounded-full px-2.5 py-0.5 text-sm font-semibold', rows.length ? 'bg-danger-soft text-danger' : 'bg-ok-soft text-ok')}>
          <CountUp value={rows.length} />
        </span>
      }
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
  // Completude: dos campos que a mobilidade precisa, quantos estão preenchidos.
  const fields: [string, (r: Row) => boolean][] = [
    ['Cidade', r => Boolean(r.city)],
    ['Transporte', r => r.mode !== null],
    ['Cargo', r => Boolean(r.positionTitle)],
    ['Departamento', r => Boolean(r.departmentName)],
    ['Ponto de embarque', r => r.mode !== 'chartered' || Boolean(r.pickupPoint)],
    ['Custo mensal', r => (r.mode !== 'chartered' && r.mode !== 'mobility') || r.monthlyCostCents !== null],
  ]
  const missing = fields.map(([label, ok]) => ({ label, value: rows.filter(r => !ok(r)).length })).sort((a, b) => b.value - a.value)
  const filled = rows.length ? 1 - missing.reduce((s, m) => s + m.value, 0) / (rows.length * fields.length) : 1
  const openIssues = duplicates.length + noCity.length + noTransport.length + noPosition.length
  const impact = rows.filter(
    r => (r.status === 'on_leave' && (r.mode === 'chartered' || r.mode === 'mobility')) || (r.mode === 'chartered' && !r.pickupPoint) || (r.mode === 'mobility' && r.monthlyCostCents === null),
  ).length
  const worst = missing[0]!
  const more = [
    { title: 'Afastados com transporte ativo', hint: 'Afastados não deveriam consumir fretado nem crédito de mobilidade.', rows: rows.filter(r => r.status === 'on_leave' && (r.mode === 'chartered' || r.mode === 'mobility')) },
    { title: 'Fretado sem ponto de embarque', hint: 'O motorista não sabe onde buscar.', rows: rows.filter(r => r.mode === 'chartered' && !r.pickupPoint) },
    { title: 'Mobilidade sem custo informado', hint: 'Sem o valor, o custo mensal fica subestimado.', rows: rows.filter(r => r.mode === 'mobility' && r.monthlyCostCents === null) },
  ]
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <ScoreHero
          score={score}
          complete={rows.length - issues}
          total={rows.length}
          details={{
            title: 'Como a nota é calculada',
            rows: [
              { label: 'Registros sem pendência', value: formatNumber(rows.length - issues), share: rows.length ? (rows.length - issues) / rows.length : 1, color: 'var(--color-ok)', tone: 'ok' },
              { label: 'Com alguma pendência', value: formatNumber(issues), share: rows.length ? issues / rows.length : 0, color: 'var(--color-danger)', tone: issues ? 'danger' : 'ok' },
            ],
            hint: 'Pendência = nome duplicado, sem cidade ou sem transporte. 85% ou mais é confiável; abaixo de 65%, crítico.',
          }}
        />
        <SpotlightGrid className="grid gap-4 sm:grid-cols-2">
          <KpiCard
            icon={CheckCircle2}
            tone={filled >= 0.95 ? 'ok' : 'warn'}
            label="Completude dos campos" details={{ title: 'Preenchimento de cada campo', rows: [...missing].reverse().map(m => ({ label: m.label, value: pct(rows.length - m.value, rows.length), share: rows.length ? (rows.length - m.value) / rows.length : 1, color: m.value ? 'var(--color-brand)' : 'var(--color-ok)', tone: m.value ? undefined : ('ok' as const) })) }}
            value={<CountUp value={filled * 100} format={percentFormat} />}
            note={`${fields.length} campos que a mobilidade usa, em ${formatNumber(rows.length)} registros`}
            aside={<Ring value={filled} size={58} thickness={7} track="var(--color-sunken)" color="var(--color-ok)" />}
          />
          <KpiCard
            icon={openIssues ? AlertTriangle : CheckCircle2}
            tone={openIssues ? 'danger' : 'ok'}
            label="Pendências em aberto" details={{ title: 'Pendências por tipo', rows: [{ label: 'Nomes duplicados', value: formatNumber(duplicates.length) }, { label: 'Sem cidade', value: formatNumber(noCity.length) }, { label: 'Sem transporte', value: formatNumber(noTransport.length) }, { label: 'Sem cargo', value: formatNumber(noPosition.length) }].map(d => ({ ...d, tone: d.value === '0' ? ('ok' as const) : ('danger' as const) })) }}
            value={<CountUp value={openIssues} />}
            note={openIssues ? 'Duplicados, sem cidade, sem transporte ou sem cargo' : 'Nada a corrigir'}
          />
          <KpiCard
            icon={Wallet}
            tone={impact ? 'danger' : 'ok'}
            label="Afetam custo ou operação" details={{ title: 'O que pesa no bolso ou na rota', rows: [{ label: 'Afastado com transporte ativo', value: formatNumber(rows.filter(r => r.status === 'on_leave' && (r.mode === 'chartered' || r.mode === 'mobility')).length) }, { label: 'Fretado sem ponto de embarque', value: formatNumber(rows.filter(r => r.mode === 'chartered' && !r.pickupPoint).length) }, { label: 'Mobilidade sem valor', value: formatNumber(rows.filter(r => r.mode === 'mobility' && r.monthlyCostCents === null).length) }].map(d => ({ ...d, tone: d.value === '0' ? ('ok' as const) : ('danger' as const) })) }}
            value={<CountUp value={impact} />}
            note={impact ? 'Afastado com transporte, fretado sem ponto ou mobilidade sem valor' : 'Nenhum problema com impacto direto'}
          />
          <KpiCard
            icon={MapPin}
            tone={worst.value ? 'warn' : 'ok'}
            label="Campo mais incompleto" details={{ title: 'Faltando em cada campo', rows: missing.map(m => ({ label: m.label, value: formatNumber(m.value), share: rows.length ? m.value / rows.length : 0, color: 'var(--color-danger)', tone: m.value ? ('danger' as const) : ('ok' as const) })) }}
            value={worst.value ? <CountUp value={worst.value} /> : '—'}
            note={worst.value ? `${worst.label} falta em ${pct(worst.value, rows.length)} dos registros` : 'Todos os campos preenchidos'}
          />
        </SpotlightGrid>
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
                className="overflow-visible"
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
                <Hoverable
                  details={{
                    title: 'Embarque por ponto',
                    rows: [
                      ...topRows(countBy(riders, p => [p.pickupPoint, p.pickupDistrict].filter(Boolean).join(', ') || 'Ponto não informado'), riders.length, 5, 'var(--color-brand)'),
                      { label: 'Custo mensal da rota', value: money(sumCost(riders)) },
                      ...(r.capacity ? [{ label: 'Custo por lugar ofertado', value: money(Math.round(sumCost(riders) / r.capacity)) }] : []),
                    ],
                  }}
                >
                <div tabIndex={0} className="-m-2 flex cursor-default items-center gap-4 rounded-lg p-2 outline-none transition-colors hover:bg-sunken focus-visible:bg-sunken">
                  <Ring value={r.capacity ? r.riders / r.capacity : 0} size={76} thickness={8} track="var(--color-sunken)" color={over ? 'var(--color-danger)' : 'var(--color-brand)'}>
                    <span className="num text-[15px] font-semibold text-ink">{r.capacity ? pct(r.riders, r.capacity) : '—'}</span>
                  </Ring>
                  <div className="min-w-0">
                    <p className={cn('num font-display text-4xl leading-none font-semibold', over ? 'text-danger' : 'text-ink')}>
                      <CountUp value={r.riders} />
                      <span className="text-xl text-steel">/{r.capacity ?? '—'}</span>
                    </p>
                    <span className="mt-2 inline-block">
                      <Badge tone={routeStatus(r.riders, r.capacity).tone}>
                        {routeStatus(r.riders, r.capacity).label}
                        {r.capacity && !over ? ` · ${r.capacity - r.riders} livres` : ''}
                      </Badge>
                    </span>
                  </div>
                </div>
                </Hoverable>
                <p className="mt-3 text-sm text-steel">{[r.vehicle, r.shift, r.driver && `Motorista: ${r.driver}`].filter(Boolean).join(' · ') || 'Sem veículo informado'}</p>
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
    // Mobilidade da Falcão é pelo Caju (mesmo cartão de alimentação e refeição).
    provider: row.provider ?? (row.mode === null || row.mode === 'mobility' ? 'Caju' : ''),
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
          <Field label="Fornecedor do cartão ou app">{props => <Input {...props} placeholder="Caju" value={form.provider} onChange={set('provider')} />}</Field>
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
