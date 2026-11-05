import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { ArrowDown, ArrowRight, ArrowUpRight, Banknote, Briefcase, Building2, MapPin, Search, SearchX } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { CONTRACT_TYPE_LABELS, WORK_MODE_LABELS, type WorkMode } from '@falcao-rh/contracts'

import falcon from '../assets/falcao-mark.svg'
import { RevealScope, SplitTitle } from '../components/motion'
import { Input, Select } from '../components/ui/field'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/layout'
import { cn } from '../lib/cn'
import { gsap, MOTION, useGSAP } from '../lib/gsap'
import { CareerSections } from './career-page-view'
import { formatSalary, postedAgo, publicApi, type CareerPageContent, type PublicJob } from './public-api'
import { PublicFrame } from './public-frame'

const DEFAULT_HERO: CareerPageContent['hero'] = {
  enabled: true,
  title: 'Construa sua carreira na Falcão',
  subtitle: 'Vagas abertas em obras e no escritório. Venha fazer parte.',
  imageId: null,
}

export function CareersPage() {
  const { empresa } = useParams({ strict: false }) as { empresa: string }
  const query = useQuery({ queryKey: ['careers', empresa], queryFn: () => publicApi.careers(empresa) })
  const data = query.data
  const hero = data?.page?.hero.enabled ? data.page.hero : DEFAULT_HERO
  const cities = new Set((data?.jobs ?? []).map(j => j.city)).size

  return (
    <PublicFrame slug={empresa} company={data?.company.name}>
      <RevealScope routeKey={`careers-${empresa}`}>
        {query.isError ? (
          <div className="mx-auto max-w-3xl px-4 py-24">
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          </div>
        ) : (
          <>
            {data ? (
              <Hero title={hero.title} subtitle={hero.subtitle} jobs={data.jobs.length} cities={cities} imageUrl={hero.imageId ? publicApi.assetUrl(empresa, hero.imageId) : null} slug={empresa} openJobs={data.jobs} />
            ) : (
              <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
                <Skeleton className="h-[380px] rounded-xl" />
              </div>
            )}
            <JobList slug={empresa} jobs={data?.jobs} loading={query.isPending} />
            {data?.page && <CareerSections content={data.page} stats={{ jobs: data.jobs.length, cities }} />}
          </>
        )}
      </RevealScope>
    </PublicFrame>
  )
}

const HERO_ROWS = 4

/** Faixa zebrada de obra: a assinatura visual da capa. */
const HAZARD = 'repeating-linear-gradient(-45deg, var(--color-brand) 0 14px, var(--color-night) 14px 28px)'

/**
 * Capa como placa de obra: o convite à esquerda, solto sobre o fundo, e à
 * direita o quadro com as vagas mais recentes, para o candidato já ver o que
 * há de aberto. Sem `openJobs` (pré-visualização do editor) mostra exemplos.
 */
export function Hero({
  title,
  subtitle,
  jobs,
  cities,
  imageUrl,
  slug,
  openJobs,
}: {
  title: string
  subtitle: string
  jobs?: number
  cities: number
  imageUrl: string | null
  slug?: string
  openJobs?: PublicJob[]
}) {
  const ref = useRef<HTMLElement>(null)
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION.ok, () => {
        gsap.from('[data-hero-fade]', { y: 18, autoAlpha: 0, duration: 0.9, stagger: 0.09, delay: 0.35 })
        gsap
          .timeline({ delay: 0.25 })
          .from('[data-hero-board]', { y: 36, autoAlpha: 0, duration: 1, ease: 'expo.out' })
          .from('[data-hero-hazard]', { scaleX: 0, transformOrigin: 'left', duration: 1.1, ease: 'expo.inOut' }, 0.1)
          .from('[data-hero-row]', { x: 18, autoAlpha: 0, duration: 0.7, stagger: 0.07 }, 0.45)
      })
    },
    { scope: ref },
  )
  const scrollToJobs = () => document.getElementById('vagas')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const total = jobs ?? openJobs?.length ?? 0
  const rows = openJobs?.slice(0, HERO_ROWS)

  return (
    <section ref={ref} className="relative overflow-hidden border-b border-line">
      <div className="canvas-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14 lg:py-20">
        <div>
          <p data-hero-fade className="eyebrow mb-5 flex items-center gap-2.5">
            <span className="h-px w-8 bg-brand-strong" aria-hidden /> Carreiras
          </p>
          <SplitTitle as="h1" className="font-display text-[clamp(50px,7vw,92px)] leading-[0.92] font-semibold tracking-[-0.02em] text-ink">
            {title}
          </SplitTitle>
          <p data-hero-fade className="mt-6 max-w-lg text-[17px] leading-relaxed text-ink-soft">
            {subtitle}
          </p>
          <div data-hero-fade className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <button
              type="button"
              onClick={scrollToJobs}
              className="inline-flex h-12 items-center gap-2 rounded-[10px] border border-brand-strong/70 bg-brand px-5 font-semibold text-night shadow-brand transition-transform hover:-translate-y-0.5"
            >
              Ver vagas abertas <ArrowDown className="size-4" aria-hidden />
            </button>
            {jobs !== undefined && cities > 0 && (
              <p className="text-[14px] text-steel">
                <span className="num font-semibold text-ink">{jobs}</span> {jobs === 1 ? 'vaga' : 'vagas'} em <span className="num font-semibold text-ink">{cities}</span> {cities === 1 ? 'cidade' : 'cidades'}
              </p>
            )}
          </div>
        </div>

        <aside data-hero-board aria-label="Vagas mais recentes" className="overflow-hidden rounded-xl border border-night-line bg-night text-snow shadow-lift">
          <div data-hero-hazard className="h-2.5" style={{ backgroundImage: HAZARD }} aria-hidden />
          {imageUrl && <img src={imageUrl} alt="" className="h-40 w-full object-cover" />}
          <div className="flex items-center gap-3 border-b border-night-line px-5 py-4">
            <img src={falcon} alt="" className="h-7 w-auto" />
            <p className="font-display text-[22px] leading-none font-semibold">Vagas abertas</p>
            <span className="num ml-auto flex h-7 min-w-7 items-center justify-center rounded-full bg-brand px-2 text-[13px] font-bold text-night">{total}</span>
          </div>
          {rows && rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-[14px] text-fog">Nenhuma vaga aberta agora. Volte em breve: novas vagas são publicadas toda semana.</p>
          ) : (
            <ul className="divide-y divide-night-line">
              {(rows ?? SAMPLE_ROWS).map(job => {
                const body = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold break-words text-snow">{job.title}</span>
                      <span className="mt-0.5 block text-[13px] break-words text-fog">
                        {[job.departmentName, job.state ? `${job.city}/${job.state}` : job.city].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-brand transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
                  </>
                )
                const row = 'group flex items-center gap-4 px-5 py-3.5'
                return (
                  <li key={job.token} data-hero-row>
                    {rows && slug ? (
                      <Link to="/vagas/$empresa/$token" params={{ empresa: slug, token: job.token }} className={cn(row, 'transition-colors hover:bg-white/5')}>
                        {body}
                      </Link>
                    ) : (
                      <div className={row}>{body}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {total > HERO_ROWS && (
            <button type="button" onClick={scrollToJobs} className="flex w-full items-center justify-center gap-1.5 border-t border-night-line px-5 py-3.5 text-[13.5px] font-medium text-brand transition-colors hover:bg-white/5">
              Ver todas as {total} vagas <ArrowDown className="size-3.5" aria-hidden />
            </button>
          )}
        </aside>
      </div>
    </section>
  )
}

/** Linhas de exemplo da pré-visualização do editor. */
const SAMPLE_ROWS = [
  { token: 'a', title: 'Mestre de obras', departmentName: 'Obras', city: 'Camaçari', state: 'BA' },
  { token: 'b', title: 'Eletricista predial', departmentName: 'Obras', city: 'Camaçari', state: 'BA' },
  { token: 'c', title: 'Técnico(a) de segurança do trabalho', departmentName: 'Segurança do Trabalho', city: 'Camaçari', state: 'BA' },
]

const MODE_FILTERS: { value: '' | WorkMode; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'site', label: 'Canteiro de obras' },
  { value: 'onsite', label: 'Presencial' },
  { value: 'hybrid', label: 'Híbrido' },
]

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function JobList({ slug, jobs, loading }: { slug: string; jobs?: PublicJob[]; loading: boolean }) {
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<'' | WorkMode>('')
  const [city, setCity] = useState('')
  const cities = useMemo(() => [...new Set((jobs ?? []).map(j => j.city))].sort(), [jobs])
  const filtered = (jobs ?? []).filter(
    job =>
      (!mode || job.workMode === mode) &&
      (!city || job.city === city) &&
      (!q || normalize(`${job.title} ${job.departmentName ?? ''} ${job.city}`).includes(normalize(q))),
  )
  const presentModes = new Set((jobs ?? []).map(j => j.workMode))

  return (
    <section id="vagas" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-3 flex items-center gap-2">
            <span className="h-px w-5 bg-brand" aria-hidden /> Oportunidades
          </p>
          <h2 className="font-display text-[clamp(34px,4vw,52px)] leading-[0.95] font-semibold tracking-[-0.01em] text-ink">Vagas abertas</h2>
        </div>
        {jobs && (
          <p className="text-[14px] text-steel">
            {filtered.length === jobs.length ? `${jobs.length} vagas` : `${filtered.length} de ${jobs.length} vagas`}
          </p>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <label className="relative min-w-60 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-steel" aria-hidden />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Cargo, área ou cidade" aria-label="Buscar vagas" className="h-11 rounded-full pl-10" />
        </label>
        {cities.length > 1 && (
          <Select aria-label="Cidade" value={city} onChange={e => setCity(e.target.value)} className="h-11 w-auto [&_select]:rounded-full">
            <option value="">Todas as cidades</option>
            {cities.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        )}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Regime de trabalho">
          {MODE_FILTERS.filter(f => !f.value || presentModes.has(f.value)).map(filter => (
            <button
              key={filter.label}
              type="button"
              aria-pressed={mode === filter.value}
              onClick={() => setMode(filter.value)}
              className={cn(
                'h-9 rounded-full border px-3.5 text-[13px] font-medium transition-all duration-200',
                mode === filter.value ? 'border-night bg-night text-snow shadow-card' : 'border-line bg-paper text-ink-soft hover:border-steel-soft',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-44 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="surface">
            <EmptyState icon={SearchX} title={jobs?.length ? 'Nenhuma vaga com esses filtros' : 'No momento não há vagas abertas'}>
              {jobs?.length ? 'Tente outra busca ou limpe os filtros.' : 'Volte em breve: novas vagas são publicadas toda semana.'}
            </EmptyState>
          </div>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {filtered.map(job => (
              <li key={job.token} data-reveal-row>
                <JobCard slug={slug} job={job} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function JobCard({ slug, job }: { slug: string; job: PublicJob }) {
  const salary = formatSalary(job.salary)
  return (
    <Link
      to="/vagas/$empresa/$token"
      params={{ empresa: slug, token: job.token }}
      className="surface group relative flex h-full flex-col gap-4 overflow-hidden p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift"
    >
      <span className="absolute inset-y-0 left-0 w-1 origin-top scale-y-0 bg-brand transition-transform duration-500 group-hover:scale-y-100" aria-hidden />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[12px] font-medium tracking-wide text-steel uppercase">{job.departmentName ?? 'Falcão'}</p>
          <h3 className="mt-1 font-display text-[26px] leading-[1.05] font-semibold text-ink">{job.title}</h3>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sunken text-ink ring-1 ring-line transition-all duration-300 group-hover:bg-brand group-hover:text-night group-hover:ring-brand-strong">
          <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:rotate-45" aria-hidden />
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13.5px] text-steel">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-3.5" aria-hidden /> {job.city}
          {job.state ? `/${job.state}` : ''}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Building2 className="size-3.5" aria-hidden /> {WORK_MODE_LABELS[job.workMode]}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Briefcase className="size-3.5" aria-hidden /> {CONTRACT_TYPE_LABELS[job.contractType]}
        </span>
      </div>
      <p className="line-clamp-2 text-[14.5px] leading-relaxed text-ink-soft">{job.description}</p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-[13px]">
        {salary ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
            <Banknote className="size-4 text-ok" aria-hidden /> {salary}
          </span>
        ) : (
          <span className="text-steel">Salário a combinar</span>
        )}
        <span className="text-steel-soft">{postedAgo(job.publishedAt)}</span>
      </div>
    </Link>
  )
}
