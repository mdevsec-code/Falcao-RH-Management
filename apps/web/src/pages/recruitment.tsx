import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Archive,
  BriefcaseBusiness,
  Copy,
  EllipsisVertical,
  ExternalLink,
  EyeOff,
  Globe,
  MapPin,
  Pause,
  Pencil,
  Play,
  Plus,
  Rocket,
  UserCheck,
  Users,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { WORK_MODE_LABELS } from '@falcao-rh/contracts'

import { CountUp, SpotlightGlow, useSpotlight } from '../components/motion'
import { Button } from '../components/ui/button'
import { TableFrame, TableSkeleton } from '../components/ui/data-table'
import { Badge, EmptyState, ErrorState, PageHeader } from '../components/ui/layout'
import { JobFormDrawer } from '../features/job-form'
import { api, ApiError } from '../lib/api'
import { cn } from '../lib/cn'
import { formatDate } from '../lib/format'
import { useCan } from '../lib/session'
import type { JobDetail, JobListItem, JobStatus, RecruitmentStage } from '../lib/types'

const STATUS: Record<JobStatus, { label: string; tone: 'ok' | 'warn' | 'neutral' | 'info' }> = {
  draft: { label: 'Rascunho', tone: 'neutral' },
  published: { label: 'Publicada', tone: 'ok' },
  paused: { label: 'Pausada', tone: 'warn' },
  closed: { label: 'Encerrada', tone: 'info' },
}

const FILTERS: { value: JobStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'published', label: 'Publicadas' },
  { value: 'draft', label: 'Rascunhos' },
  { value: 'paused', label: 'Pausadas' },
  { value: 'closed', label: 'Encerradas' },
]

/** Tons das etapas no funil de cada vaga: do mais claro (entrada) ao mais forte. */
const STAGE_TONES = ['bg-line-strong', 'bg-steel-soft', 'bg-ink-soft', 'bg-brand', 'bg-brand-strong']

export function RecruitmentPage() {
  const canManage = useCan('recruitment.manage')
  const [filter, setFilter] = useState<JobStatus | 'all'>('all')
  const [editing, setEditing] = useState<JobDetail | 'new' | null>(null)
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => api<JobListItem[]>('/jobs') })
  const stages = useQuery({ queryKey: ['recruitment-stages'], queryFn: () => api<RecruitmentStage[]>('/recruitment/stages') })
  const list = jobs.data ?? []
  const visible = filter === 'all' ? list : list.filter(j => j.status === filter)

  const openEditor = async (job: JobListItem) => {
    try {
      setEditing(await api<JobDetail>(`/jobs/${job.id}`))
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Não foi possível abrir a vaga.')
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Recrutamento"
        title="Vagas"
        description="Crie vagas, publique na página de recrutamento e acompanhe quantas pessoas estão em cada etapa."
        actions={
          canManage && (
            <>
              <Link
                to="/recrutamento/pagina-de-vagas"
                className="inline-flex h-10 items-center gap-2 rounded-sm border border-line-strong bg-paper px-4 text-[14.5px] text-ink-soft shadow-xs transition-colors hover:border-steel-soft hover:text-ink"
              >
                <Globe className="size-4" aria-hidden /> Editar página de vagas
              </Link>
              <Button variant="primary" onClick={() => setEditing('new')}>
                <Plus className="size-4" aria-hidden /> Nova vaga
              </Button>
            </>
          )
        }
      />

      {jobs.isError && <ErrorState error={jobs.error} onRetry={() => jobs.refetch()} />}

      <Summary jobs={list} loading={jobs.isPending} />

      <div className="mb-4 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Situação">
        {FILTERS.map(f => {
          const count = f.value === 'all' ? list.length : list.filter(j => j.status === f.value).length
          return (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-all duration-200',
                filter === f.value ? 'border-night bg-night text-snow shadow-card' : 'border-line bg-paper text-ink-soft hover:border-steel-soft',
              )}
            >
              {f.label}
              <span className={cn('num rounded-full px-1.5 text-[11px]', filter === f.value ? 'bg-white/15' : 'bg-sunken text-steel')}>{count}</span>
            </button>
          )
        })}
      </div>

      <TableFrame>
        {jobs.isPending ? (
          <TableSkeleton rows={5} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={BriefcaseBusiness}
            title={list.length === 0 ? 'Nenhuma vaga ainda' : 'Nenhuma vaga nesta situação'}
            action={canManage && list.length === 0 && <Button variant="primary" onClick={() => setEditing('new')}>Criar a primeira vaga</Button>}
          >
            {list.length === 0 ? 'Crie uma vaga, publique e ela aparece na página de recrutamento para os candidatos.' : 'Escolha outro filtro acima.'}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map(job => (
              <JobRow key={job.id} job={job} stages={stages.data ?? []} canManage={canManage} onEdit={() => openEditor(job)} />
            ))}
          </ul>
        )}
      </TableFrame>

      {canManage && <JobFormDrawer open={editing !== null} onOpenChange={o => !o && setEditing(null)} job={editing && editing !== 'new' ? editing : undefined} />}
    </>
  )
}

function Summary({ jobs, loading }: { jobs: JobListItem[]; loading: boolean }) {
  const ref = useRef<HTMLDListElement>(null)
  useSpotlight(ref)
  const totals = useMemo(() => {
    const open = jobs.filter(j => j.status !== 'closed')
    return {
      published: jobs.filter(j => j.status === 'published').length,
      inProcess: open.reduce((sum, j) => sum + Object.values(j.counts.stages).reduce((a, b) => a + b, 0), 0),
      hired: jobs.reduce((sum, j) => sum + j.counts.hired, 0),
      positions: open.reduce((sum, j) => sum + Math.max(0, j.openings - j.hiredCount), 0),
    }
  }, [jobs])
  const items = [
    { label: 'Vagas publicadas', value: totals.published, icon: Rocket, tone: 'bg-ok-soft text-ok ring-ok/15' },
    { label: 'Candidatos em andamento', value: totals.inProcess, icon: Users, tone: 'bg-info-soft text-info ring-info/15' },
    { label: 'Contratados', value: totals.hired, icon: UserCheck, tone: 'bg-brand-soft text-brand-ink ring-brand-strong/25' },
    { label: 'Posições a preencher', value: totals.positions, icon: BriefcaseBusiness, tone: 'bg-sunken text-steel ring-line' },
  ]
  return (
    <dl ref={ref} className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(item => (
        <div key={item.label} data-reveal data-spotlight className="surface group relative overflow-hidden p-5">
          <SpotlightGlow />
          <div className="relative flex items-start justify-between gap-3">
            <dt className="text-[13.5px] font-medium text-steel">{item.label}</dt>
            <span className={cn('flex size-9 items-center justify-center rounded-sm ring-1', item.tone)}>
              <item.icon className="size-[17px]" aria-hidden />
            </span>
          </div>
          <dd className="num relative mt-4 font-display text-[44px] leading-none font-semibold text-ink">{loading ? '—' : <CountUp value={item.value} />}</dd>
        </div>
      ))}
    </dl>
  )
}

function JobRow({ job, stages, canManage, onEdit }: { job: JobListItem; stages: RecruitmentStage[]; canManage: boolean; onEdit: () => void }) {
  const queryClient = useQueryClient()
  const status = useMutation({
    mutationFn: (to: JobStatus) => api<JobDetail>(`/jobs/${job.id}/status`, { method: 'POST', body: { status: to } }),
    onSuccess: async (_, to) => {
      await queryClient.invalidateQueries({ queryKey: ['jobs'] })
      toast.success(
        { published: 'Vaga publicada na página de vagas.', paused: 'Vaga pausada: não recebe novas candidaturas.', closed: 'Vaga encerrada.', draft: '' }[to],
      )
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível mudar a situação.'),
  })
  const copy = async () => {
    await navigator.clipboard.writeText(job.shareUrl)
    toast.success('Link da vaga copiado. É só colar no WhatsApp ou nas redes.')
  }
  const open = Object.values(job.counts.stages).reduce((a, b) => a + b, 0)
  const s = STATUS[job.status]

  return (
    <li data-reveal-row className="group/row relative flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-4 transition-colors hover:bg-sunken">
      <span className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-brand opacity-0 transition-opacity group-hover/row:opacity-100" aria-hidden />
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/recrutamento/vagas/$id" params={{ id: job.id }} className="truncate text-[15.5px] font-semibold text-ink decoration-brand decoration-2 underline-offset-4 hover:underline">
            {job.title}
          </Link>
          <Badge tone={s.tone}>{s.label}</Badge>
          {job.visibility === 'unlisted' && (
            <span className="inline-flex items-center gap-1 text-[12px] text-steel">
              <EyeOff className="size-3.5" aria-hidden /> Não listada
            </span>
          )}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-steel">
          <span>{job.departmentName ?? 'Sem departamento'}</span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden />
            {job.city ? `${job.city}${job.state ? `/${job.state}` : ''}` : 'Sem cidade'}
          </span>
          <span>{WORK_MODE_LABELS[job.workMode]}</span>
          {job.managerName && <span>Gestor: {job.managerName}</span>}
        </p>
      </div>

      <Pipeline job={job} stages={stages} open={open} />

      <div className="w-28 text-[13px]">
        <p className="num font-medium text-ink">
          {job.hiredCount}/{job.openings} {job.openings === 1 ? 'posição' : 'posições'}
        </p>
        <p className="text-steel-soft">
          {job.status === 'closed' && job.closedAt
            ? `Encerrada ${formatDate(job.closedAt.slice(0, 10))}`
            : job.publishedAt
              ? `Desde ${formatDate(job.publishedAt.slice(0, 10))}`
              : 'Não publicada'}
        </p>
      </div>

      <div className="flex items-center gap-1">
        {canManage && job.status === 'draft' && (
          <Button size="sm" variant="primary" loading={status.isPending} onClick={() => status.mutate('published')}>
            <Rocket className="size-3.5" aria-hidden /> Publicar
          </Button>
        )}
        {(job.status === 'published' || job.status === 'paused') && (
          <Button size="icon" variant="ghost" onClick={copy} aria-label="Copiar link da vaga" title="Copiar link da vaga">
            <Copy className="size-4" />
          </Button>
        )}
        {canManage && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="flex size-9 items-center justify-center rounded-sm text-steel transition-colors hover:bg-ink/5 hover:text-ink" aria-label={`Ações de ${job.title}`}>
              <EllipsisVertical className="size-4" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={6} className="pop z-50 min-w-52 rounded-lg border border-line bg-paper p-1.5 text-sm shadow-pop">
                {job.status !== 'closed' && <MenuItem icon={Pencil} label="Editar vaga" onSelect={onEdit} />}
                {(job.status === 'published' || job.status === 'paused') && (
                  <MenuItem icon={ExternalLink} label="Ver na página de vagas" onSelect={() => window.open(job.shareUrl, '_blank', 'noopener')} />
                )}
                {job.status === 'published' && <MenuItem icon={Pause} label="Pausar candidaturas" onSelect={() => status.mutate('paused')} />}
                {job.status === 'paused' && <MenuItem icon={Play} label="Retomar candidaturas" onSelect={() => status.mutate('published')} />}
                {(job.status === 'published' || job.status === 'paused') && (
                  <>
                    <DropdownMenu.Separator className="my-1 h-px bg-line" />
                    <MenuItem
                      icon={Archive}
                      label="Encerrar vaga"
                      danger
                      onSelect={() => window.confirm(`Encerrar a vaga "${job.title}"? Ela sai da página e não recebe mais candidaturas.`) && status.mutate('closed')}
                    />
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>
    </li>
  )
}

function MenuItem({ icon: Icon, label, onSelect, danger }: { icon: typeof Pencil; label: string; onSelect: () => void; danger?: boolean }) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-sm px-3 py-2 outline-none transition-colors',
        danger ? 'text-danger data-[highlighted]:bg-danger-soft' : 'text-ink-soft data-[highlighted]:bg-sunken',
      )}
    >
      <Icon className="size-4" aria-hidden /> {label}
    </DropdownMenu.Item>
  )
}

/** Funil da vaga: barra empilhada por etapa e totais de andamento e recusas. */
function Pipeline({ job, stages, open }: { job: JobListItem; stages: RecruitmentStage[]; open: boolean | number }) {
  const total = Number(open) || 0
  return (
    <div className="w-full basis-56 sm:w-56">
      <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
        <span className="text-steel">
          <span className="num font-semibold text-ink">{total}</span> em andamento
        </span>
        <span className="num text-steel-soft">{job.counts.rejected} recusados</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-sunken ring-1 ring-line ring-inset" aria-hidden>
        {total > 0 &&
          stages.map((stage, i) => {
            const n = job.counts.stages[stage.id] ?? 0
            return n ? <span key={stage.id} className={STAGE_TONES[Math.min(i, STAGE_TONES.length - 1)]} style={{ width: `${(n / total) * 100}%` }} title={`${stage.name}: ${n}`} /> : null
          })}
      </div>
      {total > 0 && (
        <p className="mt-1.5 truncate text-[11.5px] text-steel-soft">
          {stages
            .filter(stage => job.counts.stages[stage.id])
            .map(stage => `${stage.name} ${job.counts.stages[stage.id]}`)
            .join(' · ')}
        </p>
      )}
    </div>
  )
}
