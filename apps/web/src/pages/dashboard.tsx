import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Cake, ClipboardList, History, Palmtree, UserPlus } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { CountUp } from '../components/motion'
import { Select } from '../components/ui/field'
import { EmptyState, ErrorState, PageHeader, Panel, Skeleton } from '../components/ui/layout'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { EVENT_LABELS, formatDate, formatMonth, todayIso } from '../lib/format'
import { gsap, reducedMotion, useGSAP } from '../lib/gsap'
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
        title={`Olá, ${firstName}`}
        description={me.scope === 'team' ? 'Como está a sua equipe hoje.' : `Como está ${me.tenant.name} hoje.`}
        actions={
          <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <Select aria-label="Período" value={period} onChange={e => setPeriod(e.target.value as keyof typeof PERIODS)} className="sm:w-auto">
              {Object.entries(PERIODS).map(([key, p]) => (
                <option key={key} value={key}>
                  {p.label}
                </option>
              ))}
            </Select>
            <Select aria-label="Departamento" value={departmentId} onChange={e => setDepartmentId(e.target.value)} className="sm:w-64">
              <option value="">Todos os departamentos</option>
              {departments.data?.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Select aria-label="Unidade" value={unitId} onChange={e => setUnitId(e.target.value)} className="sm:w-56">
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
          <HeadcountBand data={data} />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Panel title="Evolução do quadro" aside={<span className="text-[13px] text-steel">Pessoas no último dia de cada mês</span>}>
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
                <Row key={v.id} to="/colaboradores/$id" id={v.employeeId} title={v.name} detail={`${formatDate(v.startDate)} a ${formatDate(v.endDate)}`} aside={`${v.days} dias`} />
              ))}
            </ListPanel>
            <ListPanel title="Aniversariantes do mês" icon={Cake} empty="Nenhum aniversário este mês">
              {data.birthdays.map(b => (
                <li key={b.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="num w-9 font-display text-2xl leading-none font-semibold text-ink">{String(b.day).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">{b.name}</span>
                    <span className="block truncate text-[13px] text-steel">{b.departmentName ?? 'Sem departamento'}</span>
                  </span>
                </li>
              ))}
            </ListPanel>
            <ListPanel title="Admissões no período" icon={UserPlus} empty="Nenhuma admissão no período">
              {data.recentHires.map(h => (
                <Row key={h.id} to="/colaboradores/$id" id={h.id} title={h.name} detail={h.positionTitle ?? 'Cargo não informado'} aside={formatDate(h.hireDate)!} />
              ))}
            </ListPanel>
            <ListPanel title="Atividades recentes" icon={History} empty="Nenhuma movimentação registrada">
              {data.activity.map(a => (
                <Row key={a.id} to="/colaboradores/$id" id={a.employeeId} title={a.employeeName} detail={`${EVENT_LABELS[a.type]}, ${formatDate(a.effectiveDate)}`} />
              ))}
            </ListPanel>
          </div>
        </div>
      )}
    </>
  )
}

function HeadcountBand({ data }: { data: Dashboard }) {
  const { headcount, movement, period, absence } = data
  return (
    <section aria-label="Quadro de pessoal" className="grid overflow-hidden rounded-md border border-ink bg-paper md:grid-cols-[auto_1fr]">
      <div className="blueprint relative flex items-end gap-6 bg-ink px-7 py-7">
        <div>
          <p className="text-sm text-steel-soft">Quadro de pessoal</p>
          <p className="num font-display text-[96px] leading-[0.82] font-semibold text-brand">
            <CountUp value={headcount.total} />
          </p>
        </div>
        <div className="mb-1 text-sm leading-6 text-paper/85">
          <p>
            <span className="num font-semibold text-paper">
              <CountUp value={headcount.active} />
            </span>{' '}
            ativos
          </p>
          <p>
            <span className="num font-semibold text-paper">
              <CountUp value={headcount.onLeave} />
            </span>{' '}
            afastados
          </p>
        </div>
      </div>
      <div className="flex flex-col">
        <dl className="grid flex-1 grid-cols-2 divide-line max-md:divide-y lg:grid-cols-4 lg:divide-x">
          <Stat label="Admissões">
            <CountUp value={movement.hires} />
          </Stat>
          <Stat label="Desligamentos">
            <CountUp value={movement.terminations} />
          </Stat>
          <Stat label="Rotatividade" hint="(admissões + desligamentos) ÷ 2, sobre o quadro médio do período">
            {movement.turnover === null ? '—' : <CountUp value={movement.turnover} format={percent} />}
          </Stat>
          <Stat label="Absenteísmo" hint={`${absence.lostDays} dias úteis perdidos em ausências aprovadas, de ${absence.workdays} dias úteis no período`}>
            {absence.absenteeism === null ? '—' : <CountUp value={absence.absenteeism} format={percent} />}
          </Stat>
        </dl>
        <p className="border-t border-line px-6 py-2.5 text-[13px] text-steel">
          De {formatDate(period.from)} a {formatDate(period.to)}
        </p>
      </div>
    </section>
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

function PendingCard({ total }: { total: number }) {
  const canSee = useCan('requests.read')
  if (!canSee) return null
  return (
    <Link
      to="/solicitacoes"
      className="group flex items-center justify-between gap-4 rounded-md border border-line bg-paper px-6 py-5 transition-colors hover:border-ink"
    >
      <div>
        <p className="text-sm text-steel">Solicitações aguardando decisão</p>
        <p className="num mt-1 font-display text-[52px] leading-none font-semibold text-ink">
          <CountUp value={total} />
        </p>
      </div>
      <span className="flex size-11 items-center justify-center rounded-sm bg-concrete text-ink transition-all duration-300 group-hover:bg-brand group-hover:-rotate-12">
        <ArrowUpRight className="size-5" aria-hidden />
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
              <stop offset="0%" stopColor="var(--color-brand)" stopOpacity={0.55} />
              <stop offset="100%" stopColor="var(--color-brand)" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 12, fill: 'var(--color-steel)' }} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--color-steel)' }} tickLine={false} axisLine={false} />
          <Tooltip
            labelFormatter={label => formatMonth(String(label))}
            formatter={(value, name) => [value, { headcount: 'Quadro', hires: 'Admissões', terminations: 'Desligamentos' }[name as string] ?? name]}
            contentStyle={{ borderRadius: 5, borderColor: 'var(--color-ink)', fontSize: 13 }}
            cursor={{ stroke: 'var(--color-ink)', strokeDasharray: '3 3' }}
          />
          <Area
            isAnimationActive={!reducedMotion()}
            animationDuration={1400}
            animationEasing="ease-out"
            type="monotone"
            dataKey="headcount"
            stroke="var(--color-ink)"
            strokeWidth={2.25}
            fill="url(#trend-fill)"
            activeDot={{ r: 5, fill: 'var(--color-brand)', stroke: 'var(--color-ink)', strokeWidth: 2 }}
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
      <Panel title="Pendências">
        <p className="text-sm text-ok">Nenhuma pendência. Cadastros completos, documentos e férias em dia.</p>
      </Panel>
    )
  return (
    <section className="overflow-hidden rounded-md border border-ink bg-paper">
      <div className="hazard-stripe h-2" aria-hidden />
      <div className="px-5 py-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink">
          <ClipboardList className="size-4" aria-hidden /> Pendências
        </h2>
        <ul className="flex flex-col">
          {alerts.map(alert => (
            <li key={alert.key}>
              <Link to={alert.href} className="group flex items-baseline gap-3 rounded-sm py-1.5 hover:text-ink">
                <span className="num min-w-8 font-display text-[28px] leading-none font-semibold text-ink">{alert.total}</span>
                <span className="flex-1 text-sm text-ink-soft group-hover:underline">
                  {alert.key === 'documents_expiring' ? alert.label : `${alert.total === 1 ? 'colaborador' : 'colaboradores'} ${alert.label}`}
                </span>
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

  // Barras crescem em cascata ao trocar o agrupamento.
  useGSAP(
    () => {
      if (reducedMotion() || !list.current) return
      gsap.from(list.current.querySelectorAll('[data-bar]'), { scaleX: 0, transformOrigin: 'left', duration: 1, stagger: 0.04 })
    },
    { dependencies: [dimension, rows.length], scope: list },
  )

  return (
    <Panel
      title="Distribuição do quadro"
      aside={
        <div role="tablist" aria-label="Agrupar por" className="flex rounded-sm border border-line p-0.5 text-sm">
          {Object.entries(DIMENSIONS).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={dimension === key}
              onClick={() => setDimension(key as keyof typeof DIMENSIONS)}
              className={cn('rounded-[2px] px-2.5 py-1 transition-colors', dimension === key ? 'bg-ink text-paper' : 'text-steel hover:text-ink')}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nenhum colaborador no filtro atual" />
      ) : (
        <ul ref={list} className="grid gap-x-12 gap-y-3.5 md:grid-cols-2">
          {rows.map(row => (
            <li key={row.label}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-ink-soft">{row.label}</span>
                <span className="num shrink-0 text-steel">
                  <span className="font-semibold text-ink">{row.total}</span> ({Math.round((row.total / total) * 100)}%)
                </span>
              </div>
              <div className="h-2.5 rounded-[2px] bg-concrete">
                <div data-bar className="h-full rounded-[2px] bg-ink" style={{ width: `${Math.max(2, (row.total / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function ListPanel({ title, icon, empty, children }: { title: string; icon: typeof History; empty: string; children: ReactNode[] }) {
  return (
    <Panel title={title} bodyClassName="p-0">
      {children.length === 0 ? <EmptyState icon={icon} title={empty} /> : <ul className="divide-y divide-line">{children}</ul>}
    </Panel>
  )
}

function Row({ to, id, title, detail, aside }: { to: '/colaboradores/$id'; id: string; title: string; detail: string; aside?: string }) {
  return (
    <li>
      <Link to={to} params={{ id }} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-concrete">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-ink group-hover:underline">{title}</span>
          <span className="block truncate text-[13px] text-steel">{detail}</span>
        </span>
        {aside && <span className="num shrink-0 text-[13px] text-steel">{aside}</span>}
      </Link>
    </li>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-44" />
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
      <Skeleton className="h-56" />
    </div>
  )
}

