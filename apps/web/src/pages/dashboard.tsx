import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Activity,
  ArrowUpRight,
  Cake,
  ChartSpline,
  ChevronRight,
  ClipboardList,
  History,
  Layers,
  Palmtree,
  Repeat2,
  ShieldCheck,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { CountUp, Sparkline, SpotlightGlow, useSpotlight, useTilt } from '../components/motion'
import { Select } from '../components/ui/field'
import { Avatar, EmptyState, ErrorState, PageHeader, Panel, Segmented, Skeleton } from '../components/ui/layout'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { EVENT_LABELS, formatDate, formatMonth, todayIso } from '../lib/format'
import { gsap, MOTION, reducedMotion, useGSAP } from '../lib/gsap'
import { orgQueries } from '../lib/queries'
import { useCan, useMe } from '../lib/session'
import type { Dashboard } from '../lib/types'

const year = new Date().getFullYear()
const PERIODS = {
  '12m': { label: 'Últimos 12 meses', from: undefined, to: undefined },
  current: { label: `Ano de ${year}`, from: `${year}-01-01`, to: todayIso() },
  previous: { label: `Ano de ${year - 1}`, from: `${year - 1}-01-01`, to: `${year - 1}-12-31` },
} as const

const percent = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

const greeting = () => {
  const hour = new Date().getHours()
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
}
const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

export function DashboardPage() {
  const me = useMe()
  const [period, setPeriod] = useState<keyof typeof PERIODS>('12m')
  const [departmentId, setDepartmentId] = useState('')
  const [unitId, setUnitId] = useState('')
  const departments = useQuery(orgQueries.departments)
  const units = useQuery(orgQueries.units)

  const filters = { from: PERIODS[period].from, to: PERIODS[period].to, departmentId, unitId }
  const query = useQuery({
    queryKey: ['dashboard', filters],
    queryFn: () => api<Dashboard>('/dashboard', { query: filters }),
    placeholderData: previous => previous,
  })
  const data = query.data
  const firstName = me.user.name.split(' ')[0]

  return (
    <>
      <PageHeader
        eyebrow={today}
        title={`${greeting()}, ${firstName}`}
        description={me.scope === 'team' ? 'Como está a sua equipe hoje.' : `Como está ${me.tenant.name} hoje.`}
        actions={
          <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <Select aria-label="Período" value={period} onChange={e => setPeriod(e.target.value as keyof typeof PERIODS)} className="sm:w-48">
              {Object.entries(PERIODS).map(([key, p]) => (
                <option key={key} value={key}>
                  {p.label}
                </option>
              ))}
            </Select>
            <Select aria-label="Departamento" value={departmentId} onChange={e => setDepartmentId(e.target.value)} className="sm:w-56">
              <option value="">Todos os departamentos</option>
              {departments.data?.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Select aria-label="Unidade" value={unitId} onChange={e => setUnitId(e.target.value)} className="sm:w-52">
              <option value="">Todas as unidades</option>
              {units.data?.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {!data && query.isPending && <DashboardSkeleton />}

      {data && (
        <div className={cn('flex flex-col gap-6 transition-opacity duration-300', query.isFetching && 'opacity-60')}>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <HeadcountHero data={data} />
            <KpiGrid data={data} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Panel
              title="Evolução do quadro"
              icon={ChartSpline}
              aside={<span className="text-[12.5px] text-steel">Pessoas no último dia de cada mês</span>}
            >
              <TrendChart data={data.trend} />
            </Panel>
            <div className="flex flex-col gap-6">
              <PendingCard total={data.requests.pending} />
              <AlertsPanel alerts={data.alerts} />
            </div>
          </div>

          <DistributionPanel distribution={data.distribution} />

          <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-4">
            <ListPanel title="Próximas férias" icon={Palmtree} empty="Ninguém sai de férias nos próximos 60 dias">
              {data.requests.upcomingVacations.map(v => (
                <Row key={v.id} id={v.employeeId} title={v.name} detail={`${formatDate(v.startDate)} a ${formatDate(v.endDate)}`} aside={`${v.days} dias`} />
              ))}
            </ListPanel>
            <ListPanel title="Aniversariantes do mês" icon={Cake} empty="Nenhum aniversário este mês">
              {data.birthdays.map(b => (
                <li key={b.id} className="flex items-center gap-3.5 px-5 py-3">
                  <span className="flex w-11 shrink-0 flex-col items-center rounded-sm border border-line bg-sunken py-1 leading-none">
                    <span className="num font-display text-[22px] font-semibold text-ink">{String(b.day).padStart(2, '0')}</span>
                    <span className="mt-0.5 text-[9.5px] tracking-[0.12em] text-steel uppercase">
                      {new Date().toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] text-ink">{b.name}</span>
                    <span className="block truncate text-[12.5px] text-steel">{b.departmentName ?? 'Sem departamento'}</span>
                  </span>
                </li>
              ))}
            </ListPanel>
            <ListPanel title="Admissões no período" icon={UserPlus} empty="Nenhuma admissão no período">
              {data.recentHires.map(h => (
                <Row key={h.id} id={h.id} title={h.name} detail={h.positionTitle ?? 'Cargo não informado'} aside={formatDate(h.hireDate)!} />
              ))}
            </ListPanel>
            <ListPanel title="Atividades recentes" icon={History} empty="Nenhuma movimentação registrada">
              {data.activity.map(a => (
                <Row key={a.id} id={a.employeeId} title={a.employeeName} detail={`${EVENT_LABELS[a.type]}, ${formatDate(a.effectiveDate)}`} />
              ))}
            </ListPanel>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Destaque principal: o quadro de pessoal num bloco escuro da marca, com a
 * divisão ativos/afastados e a tendência do período desenhada (DrawSVG).
 */
function HeadcountHero({ data }: { data: Dashboard }) {
  const { headcount, period, trend } = data
  const ref = useRef<HTMLElement>(null)
  useTilt(ref, 3)
  const activeShare = headcount.total ? (headcount.active / headcount.total) * 100 : 0

  useGSAP(
    () => {
      if (reducedMotion()) return
      gsap.from('[data-split]', { scaleX: 0, transformOrigin: 'left', duration: 1.4, ease: 'expo.out', stagger: 0.12, delay: 0.4 })
    },
    { scope: ref, dependencies: [headcount.active, headcount.onLeave] },
  )

  return (
    <div data-reveal className="flex">
    <section
      ref={ref}
      aria-label="Quadro de pessoal"
      className="night-glow grain relative flex min-h-[300px] flex-1 flex-col justify-between overflow-hidden rounded-xl border border-night-line p-7 text-snow shadow-lift will-change-transform"
    >
      <div className="blueprint pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(420px circle at var(--mx, 85%) var(--my, 10%), rgb(254 190 2 / 0.14), transparent 60%)' }}
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium tracking-[0.16em] text-fog uppercase">Quadro de pessoal</p>
          <p className="num mt-3 font-display text-[112px] leading-[0.78] font-semibold tracking-[-0.02em] text-brand drop-shadow-[0_0_30px_rgb(254_190_2/0.25)]">
            <CountUp value={headcount.total} />
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

      <Sparkline values={trend.map(t => t.headcount)} className="relative -mx-1 mt-4 h-16 w-[calc(100%+8px)]" />

      <div className="relative mt-4">
        <div className="flex h-2 gap-1 overflow-hidden rounded-full" aria-hidden>
          <span data-split className="h-full rounded-full bg-brand" style={{ width: `${activeShare}%` }} />
          <span data-split className="h-full flex-1 rounded-full bg-white/20" />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px]">
          <div className="flex gap-5">
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-brand" aria-hidden />
              <span className="num font-semibold">
                <CountUp value={headcount.active} />
              </span>
              <span className="text-fog">ativos</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-white/30" aria-hidden />
              <span className="num font-semibold">
                <CountUp value={headcount.onLeave} />
              </span>
              <span className="text-fog">afastados</span>
            </span>
          </div>
          <span className="num text-[12px] text-fog/80">
            {formatDate(period.from)} – {formatDate(period.to)}
          </span>
        </div>
      </div>
    </section>
    </div>
  )
}

function KpiGrid({ data }: { data: Dashboard }) {
  const { movement, absence } = data
  const ref = useRef<HTMLDListElement>(null)
  useSpotlight(ref)
  return (
    <dl ref={ref} className="grid gap-4 sm:grid-cols-2">
      <Kpi icon={UserPlus} tone="ok" label="Admissões" hint="Pessoas que entraram no período">
        <CountUp value={movement.hires} />
      </Kpi>
      <Kpi icon={UserMinus} tone="danger" label="Desligamentos" hint="Pessoas que saíram no período">
        <CountUp value={movement.terminations} />
      </Kpi>
      <Kpi icon={Repeat2} tone="info" label="Rotatividade" hint="(admissões + desligamentos) ÷ 2, sobre o quadro médio do período">
        {movement.turnover === null ? '—' : <CountUp value={movement.turnover} format={percent} />}
      </Kpi>
      <Kpi
        icon={Activity}
        tone="brand"
        label="Absenteísmo"
        hint={`${absence.lostDays} dias úteis perdidos em ausências aprovadas, de ${absence.workdays} no período`}
      >
        {absence.absenteeism === null ? '—' : <CountUp value={absence.absenteeism} format={percent} />}
      </Kpi>
    </dl>
  )
}

const KPI_TONES = {
  ok: 'bg-ok-soft text-ok ring-ok/15',
  danger: 'bg-danger-soft text-danger ring-danger/15',
  info: 'bg-info-soft text-info ring-info/15',
  brand: 'bg-brand-soft text-brand-ink ring-brand-strong/25',
} as const

function Kpi({ icon: Icon, tone, label, hint, children }: { icon: LucideIcon; tone: keyof typeof KPI_TONES; label: string; hint: string; children: ReactNode }) {
  return (
    <div data-reveal data-spotlight className="surface group relative flex flex-col justify-between gap-6 overflow-hidden p-5 transition-shadow duration-300 hover:shadow-lift">
      <SpotlightGlow />
      <div className="relative flex items-start justify-between gap-3">
        <dt className="text-[13.5px] font-medium text-steel">{label}</dt>
        <span className={cn('flex size-9 items-center justify-center rounded-sm ring-1 transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110', KPI_TONES[tone])}>
          <Icon className="size-[17px]" aria-hidden />
        </span>
      </div>
      <div className="relative">
        <dd className="num font-display text-[52px] leading-[0.85] font-semibold tracking-[-0.01em] text-ink">{children}</dd>
        <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-steel">{hint}</p>
      </div>
    </div>
  )
}

function PendingCard({ total }: { total: number }) {
  const canSee = useCan('requests.read')
  const ref = useRef<HTMLAnchorElement>(null)
  const { contextSafe } = useGSAP({ scope: ref })
  const nudge = contextSafe(() => {
    if (!reducedMotion()) gsap.fromTo('[data-arrow]', { x: -10, y: 10, autoAlpha: 0 }, { x: 0, y: 0, autoAlpha: 1, duration: 0.45, ease: 'back.out(2)' })
  })
  if (!canSee) return null
  return (
    <Link
      ref={ref}
      to="/solicitacoes"
      data-reveal
      onPointerEnter={nudge}
      className="group relative flex items-center justify-between gap-4 overflow-hidden rounded-xl border border-brand-strong/60 bg-brand px-6 py-5 text-night shadow-brand transition-transform duration-300 hover:-translate-y-0.5"
    >
      <span className="pointer-events-none absolute -right-10 -bottom-16 size-48 rounded-full border-[28px] border-night/[0.06]" aria-hidden />
      <div className="relative">
        <p className="text-[13px] font-medium text-night/70">Solicitações aguardando decisão</p>
        <p className="num mt-1 font-display text-[60px] leading-[0.85] font-semibold">
          <CountUp value={total} />
        </p>
      </div>
      <span className="relative flex size-12 items-center justify-center overflow-hidden rounded-full bg-night text-brand transition-transform duration-500 group-hover:scale-110">
        <ArrowUpRight data-arrow className="size-5" aria-hidden />
      </span>
    </Link>
  )
}

function TrendChart({ data }: { data: Dashboard['trend'] }) {
  if (data.length === 0) return <EmptyState icon={History} title="Sem dados no período" />
  return (
    <div className="h-72" role="img" aria-label={`Quadro de pessoal mês a mês: ${data.map(d => `${formatMonth(d.month)}, ${d.headcount}`).join('; ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="var(--color-brand)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 12, fill: 'var(--color-steel)' }} tickLine={false} axisLine={false} dy={6} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--color-steel)' }} tickLine={false} axisLine={false} />
          <Tooltip
            labelFormatter={label => formatMonth(String(label))}
            formatter={(value, name) => [value, { headcount: 'Quadro', hires: 'Admissões', terminations: 'Desligamentos' }[name as string] ?? name]}
            contentStyle={{
              borderRadius: 10,
              border: '1px solid var(--color-line)',
              background: 'var(--color-paper)',
              color: 'var(--color-ink)',
              fontSize: 13,
              boxShadow: 'var(--shadow-lift)',
            }}
            labelStyle={{ color: 'var(--color-steel)', marginBottom: 2 }}
            itemStyle={{ color: 'var(--color-ink)', fontWeight: 600 }}
            cursor={{ stroke: 'var(--color-ink)', strokeDasharray: '3 3', strokeOpacity: 0.4 }}
          />
          <Area
            isAnimationActive={!reducedMotion()}
            animationDuration={1600}
            animationEasing="ease-out"
            type="monotone"
            dataKey="headcount"
            stroke="var(--color-ink)"
            strokeWidth={2.25}
            fill="url(#trend-fill)"
            activeDot={{ r: 6, fill: 'var(--color-brand)', stroke: 'var(--color-ink)', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** A faixa de obra marca o único bloco que pede ação: pendências. */
function AlertsPanel({ alerts }: { alerts: Dashboard['alerts'] }) {
  if (alerts.length === 0)
    return (
      <Panel title="Pendências" icon={ShieldCheck}>
        <p className="text-sm text-ok">Nenhuma pendência. Cadastros completos, documentos e férias em dia.</p>
      </Panel>
    )
  return (
    <section data-reveal className="surface relative flex-1 overflow-hidden">
      <div className="hazard-stripe h-2" aria-hidden />
      <div className="px-5 pt-4 pb-3">
        <h2 className="mb-2 flex items-center gap-2.5 text-[14.5px] font-semibold text-ink">
          <span className="flex size-7 items-center justify-center rounded-[7px] bg-night text-brand">
            <ClipboardList className="size-[15px]" aria-hidden />
          </span>
          Pendências
          <span className="num ml-auto rounded-full bg-brand px-2 py-px text-[11.5px] font-bold text-night">
            {alerts.reduce((sum, a) => sum + a.total, 0)}
          </span>
        </h2>
        <ul className="-mx-2 flex flex-col">
          {alerts.map(alert => (
            <li key={alert.key}>
              <Link to={alert.href} className="group flex items-center gap-3.5 rounded-md px-2 py-2.5 transition-colors hover:bg-sunken">
                <span className="num flex min-w-10 justify-center font-display text-[30px] leading-none font-semibold text-ink">{alert.total}</span>
                <span className="flex-1 text-[13.5px] leading-snug text-ink-soft">
                  {alert.key === 'documents_expiring' ? alert.label : `${alert.total === 1 ? 'colaborador' : 'colaboradores'} ${alert.label}`}
                </span>
                <ChevronRight className="size-4 text-steel-soft transition-transform duration-300 group-hover:translate-x-1 group-hover:text-ink" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

const DIMENSIONS = { byDepartment: 'Departamento', byUnit: 'Unidade', byCostCenter: 'Centro de custo' } as const

function DistributionPanel({ distribution }: { distribution: Dashboard['distribution'] }) {
  const [dimension, setDimension] = useState<keyof typeof DIMENSIONS>('byDepartment')
  const rows = distribution[dimension]
  const max = Math.max(1, ...rows.map(r => r.total))
  const total = rows.reduce((sum, r) => sum + r.total, 0)
  const list = useRef<HTMLUListElement>(null)

  // Barras crescem em cascata ao trocar o agrupamento, quando o painel aparece na tela.
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION.ok, () => {
        gsap.from('[data-bar]', {
          scaleX: 0,
          transformOrigin: 'left',
          duration: 1.2,
          ease: 'expo.out',
          stagger: 0.05,
          scrollTrigger: { trigger: list.current, start: 'top 88%', once: true },
        })
      })
    },
    { dependencies: [dimension, rows.length], scope: list, revertOnUpdate: true },
  )

  return (
    <Panel
      title="Distribuição do quadro"
      icon={Layers}
      aside={<Segmented label="Agrupar por" value={dimension} onChange={setDimension} options={DIMENSIONS} />}
    >
      {rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nenhum colaborador no filtro atual" />
      ) : (
        <ul ref={list} className="grid gap-x-12 gap-y-4 md:grid-cols-2">
          {rows.map((row, index) => (
            <li key={row.label} className="group">
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-ink-soft transition-colors group-hover:text-ink">{row.label}</span>
                <span className="num shrink-0 text-[13px] text-steel">
                  <span className="font-semibold text-ink">{row.total}</span> · {Math.round((row.total / total) * 100)}%
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-sunken ring-1 ring-line ring-inset">
                <div
                  data-bar
                  className={cn('h-full rounded-full transition-[filter] group-hover:brightness-110', index === 0 ? 'bg-brand' : 'bg-ink')}
                  style={{ width: `${Math.max(3, (row.total / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function ListPanel({ title, icon, empty, children }: { title: string; icon: LucideIcon; empty: string; children: ReactNode[] }) {
  return (
    <Panel title={title} icon={icon} bodyClassName="p-0">
      {children.length === 0 ? <EmptyState icon={icon} title={empty} /> : <ul className="divide-y divide-line py-1">{children}</ul>}
    </Panel>
  )
}

function Row({ id, title, detail, aside }: { id: string; title: string; detail: string; aside?: string }) {
  return (
    <li>
      <Link to="/colaboradores/$id" params={{ id }} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-sunken">
        <Avatar name={title} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] text-ink">{title}</span>
          <span className="block truncate text-[12.5px] text-steel">{detail}</span>
        </span>
        {aside && <span className="num shrink-0 rounded-full bg-sunken px-2 py-0.5 text-[12px] text-steel ring-1 ring-line">{aside}</span>}
      </Link>
    </li>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 xl:grid-cols-[5fr_7fr]">
        <Skeleton className="h-[300px] rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
      <Skeleton className="h-56" />
    </div>
  )
}
