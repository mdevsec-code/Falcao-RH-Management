import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { UserRoundSearch } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { CountUp } from '../components/motion'
import { Select } from '../components/ui/field'
import { EmptyState, ErrorState, PageHeader, Panel, Skeleton } from '../components/ui/layout'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { formatDate, formatMonth } from '../lib/format'
import type { JobListItem } from '../lib/types'

type Insights = {
  totals: {
    applications: number
    open: number
    hired: number
    rejected: number
    openJobs: number
    openings: number
    conversionRate: number | null
    avgDaysToHire: number | null
  }
  stages: { id: string; name: string; current: number; reached: number; rejected: number }[]
  monthly: { month: string; received: number; hired: number; rejected: number }[]
  byJob: { id: string; title: string; status: string; openings: number; hiredCount: number; open: number; rejected: number }[]
  recent: {
    id: string
    outcome: 'hired' | 'rejected' | 'reopened' | null
    fromLabel: string | null
    toLabel: string | null
    candidateName: string
    jobTitle: string
    createdAt: string
  }[]
}

const percent = (n: number) => `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
const tooltip = { contentStyle: { borderRadius: 5, borderColor: 'var(--color-ink)', fontSize: 13 }, cursor: { fill: 'var(--color-concrete)' } }
const tick = { fontSize: 12, fill: 'var(--color-steel)' }

const describe = (e: Insights['recent'][number]) => {
  if (e.outcome === 'hired') return 'Contratado'
  if (e.outcome === 'rejected') return `Recusado${e.fromLabel ? ` em ${e.fromLabel}` : ''}`
  if (e.outcome === 'reopened') return `Reaberto em ${e.toLabel ?? '—'}`
  if (!e.fromLabel) return `Candidatura recebida`
  return `${e.fromLabel} → ${e.toLabel ?? '—'}`
}

/** Painel executivo de R&S: o retrato do processo seletivo para apresentar à diretoria. */
export function RecruitmentInsightsPage() {
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => api<JobListItem[]>('/jobs') })
  const [jobId, setJobId] = useState('')
  const query = useQuery({
    queryKey: ['recruitment-insights', jobId],
    queryFn: () => api<Insights>('/recruitment/insights', { query: { jobId: jobId || undefined } }),
    placeholderData: previous => previous,
    refetchInterval: 60_000,
  })
  const data = query.data

  return (
    <>
      <PageHeader
        title="Painel de R&S"
        description="Status de cada processo seletivo em tempo real: quem está em cada etapa, quem foi contratado e onde os candidatos são recusados."
        actions={
          <Select aria-label="Vaga" value={jobId} onChange={e => setJobId(e.target.value)} className="sm:w-72">
            <option value="">Todas as vagas</option>
            {jobs.data?.map(j => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </Select>
        }
      />
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {!data ? (
        query.isPending && (
          <div className="flex flex-col gap-6">
            <Skeleton className="h-40" />
            <Skeleton className="h-80" />
          </div>
        )
      ) : (
        <Board data={data} fetching={query.isFetching} />
      )}
    </>
  )
}

function Board({ data, fetching }: { data: Insights; fetching: boolean }) {
  const t = data.totals
  const top = data.stages[0]?.reached || 1
  return (
    <div className={cn('flex flex-col gap-6 transition-opacity', fetching && 'opacity-70')}>
      <p className="-mt-4 flex items-center gap-2 text-[13px] text-steel">
        <span className="size-2 animate-pulse rounded-full bg-ok" aria-hidden /> Atualiza sozinho a cada minuto
      </p>

      <section aria-label="Indicadores do processo seletivo" className="grid overflow-hidden rounded-md border border-ink bg-paper md:grid-cols-[auto_1fr]">
        <div className="blueprint flex items-end gap-6 bg-ink px-7 py-7">
          <div>
            <p className="text-sm text-steel-soft">Em andamento</p>
            <p className="num font-display text-[96px] leading-[0.82] font-semibold text-brand">
              <CountUp value={t.open} />
            </p>
          </div>
          <div className="mb-1 text-sm leading-6 text-paper/85">
            <p>
              <span className="num font-semibold text-paper">{t.openJobs}</span> vagas publicadas
            </p>
            <p>
              <span className="num font-semibold text-paper">{t.openings}</span> posições a preencher
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 divide-line max-md:divide-y lg:grid-cols-4 lg:divide-x">
          <Stat label="Contratados">
            <CountUp value={t.hired} />
          </Stat>
          <Stat label="Recusados">
            <CountUp value={t.rejected} />
          </Stat>
          <Stat label="Conversão" hint="Contratados sobre todas as candidaturas recebidas">
            {t.conversionRate === null ? '—' : <CountUp value={t.conversionRate} format={percent} />}
          </Stat>
          <Stat label="Dias até contratar" hint="Média entre a candidatura e a contratação">
            {t.avgDaysToHire === null ? '—' : <CountUp value={Math.round(t.avgDaysToHire)} />}
          </Stat>
        </dl>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Funil por etapa" aside={<span className="text-[13px] text-steel">Quantos chegaram a cada etapa e quantos foram recusados nela</span>}>
          {t.applications === 0 ? (
            <EmptyState icon={UserRoundSearch} title="Nenhuma candidatura ainda">
              As candidaturas da página de vagas aparecem aqui.
            </EmptyState>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {data.stages.map((s, i) => (
                <li key={s.id} className="grid grid-cols-[11rem_1fr_auto] items-center gap-3 text-sm">
                  <span className="truncate text-ink-soft" title={s.name}>
                    <span className="num mr-1.5 text-steel">{i + 1}</span>
                    {s.name}
                  </span>
                  <span className="relative h-7 overflow-hidden rounded-sm bg-concrete">
                    <span className="funnel-bar absolute inset-y-0 left-0 rounded-sm bg-ink" style={{ width: `${(s.reached / top) * 100}%`, animationDelay: `${i * 60}ms` }} />
                    {s.current > 0 && (
                      <span className="absolute top-1/2 left-1.5 -translate-y-1/2 rounded-sm bg-ink px-1.5 py-0.5 text-[12px] font-medium text-brand">
                        {s.current} em andamento
                      </span>
                    )}
                  </span>
                  <span className="num w-20 text-right text-ink">
                    {s.reached}
                    {s.rejected > 0 && <span className="ml-1.5 text-danger">−{s.rejected}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Onde os candidatos são recusados">
          <div style={{ height: Math.max(240, data.stages.length * 30 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.stages} layout="vertical" margin={{ left: 8, right: 8 }}>
                <CartesianGrid stroke="var(--color-line)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={tick} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={150} interval={0} tick={tick} axisLine={false} tickLine={false} />
                <Tooltip {...tooltip} />
                <Bar dataKey="rejected" name="Recusados" fill="var(--color-danger)" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Últimos seis meses">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthly}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="month" tickFormatter={formatMonth} tick={tick} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} />
                <Tooltip labelFormatter={v => formatMonth(String(v))} {...tooltip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="received" name="Candidaturas" fill="var(--color-line-strong)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="hired" name="Contratados" fill="var(--color-brand)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="rejected" name="Recusados" fill="var(--color-danger)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Movimentações recentes" bodyClassName="p-0">
          {data.recent.length === 0 ? (
            <p className="p-5 text-sm text-steel">Nada por aqui ainda.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.recent.map(e => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">{e.candidateName}</span>
                    <span className="block truncate text-[13px] text-steel">
                      {describe(e)} · {e.jobTitle}
                    </span>
                  </span>
                  <span className="text-[13px] whitespace-nowrap text-steel">{formatDate(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Vagas em andamento" bodyClassName="p-0">
        {data.byJob.length === 0 ? (
          <p className="p-5 text-sm text-steel">Nenhuma vaga publicada.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.byJob.map(j => (
              <li key={j.id}>
                <Link
                  to="/recrutamento/vagas/$id"
                  params={{ id: j.id }}
                  className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3 hover:bg-concrete/50 sm:grid-cols-[1fr_14rem_auto]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{j.title}</span>
                    <span className="text-[13px] text-steel">
                      {j.open} em andamento · {j.rejected} recusados{j.status === 'paused' ? ' · pausada' : ''}
                    </span>
                  </span>
                  <span className="hidden h-2 overflow-hidden rounded-full bg-concrete sm:block" title={`${j.hiredCount} de ${j.openings} preenchidas`}>
                    <span className="block h-full bg-ok" style={{ width: `${Math.min(100, (j.hiredCount / Math.max(1, j.openings)) * 100)}%` }} />
                  </span>
                  <span className="num text-sm whitespace-nowrap text-ink">
                    {j.hiredCount}/{j.openings} preenchidas
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
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
