import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { ArrowLeft, ChevronDown, Copy, ExternalLink, FileClock, GripVertical, MapPin, MoveRight, Pencil, Star, Users } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Avatar, Badge, ErrorState, Skeleton } from '../components/ui/layout'
import { CandidateDrawer } from '../features/candidate-drawer'
import { JobFormDrawer } from '../features/job-form'
import { api, ApiError } from '../lib/api'
import { cn } from '../lib/cn'
import { canHover, Draggable, Flip, gsap, reducedMotion, useGSAP } from '../lib/gsap'
import { useCan } from '../lib/session'
import type { BoardCard, JobBoard, JobDetail } from '../lib/types'

const STATUS_LABEL = { draft: 'Rascunho', published: 'Publicada', paused: 'Pausada', closed: 'Encerrada' } as const
const STATUS_TONE = { draft: 'neutral', published: 'ok', paused: 'warn', closed: 'info' } as const

const ago = (iso: string) => {
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (hours < 1) return 'agora'
  if (hours < 24) return `há ${hours} h`
  const days = Math.round(hours / 24)
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`
}

/**
 * Quadro da vaga: uma coluna por etapa da organização. Com mouse, os cartões
 * são arrastados entre colunas (GSAP Draggable) e reacomodam com Flip; no
 * teclado e no celular, o menu "Mover para…" faz o mesmo.
 */
export function JobBoardPage() {
  const { id } = useParams({ strict: false }) as { id: string }
  const queryClient = useQueryClient()
  const canManage = useCan('recruitment.manage')
  const job = useQuery({ queryKey: ['job', id], queryFn: () => api<JobDetail>(`/jobs/${id}`) })
  const board = useQuery({ queryKey: ['job-board', id], queryFn: () => api<JobBoard>(`/jobs/${id}/applications`) })
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [showRejected, setShowRejected] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const flipState = useRef<Flip.FlipState | null>(null)

  const move = useMutation({
    mutationFn: ({ cardId, stageId }: { cardId: string; stageId: string }) => api(`/applications/${cardId}/stage`, { method: 'POST', body: { stageId } }),
    onError: error => {
      toast.error(error instanceof ApiError ? error.message : 'Não foi possível mover o candidato.')
      void queryClient.invalidateQueries({ queryKey: ['job-board', id] })
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  })

  /** Move na hora (otimista) e confirma com a API; o Flip anima a mudança de coluna. */
  const moveCard = (cardId: string, stageId: string) => {
    const data = queryClient.getQueryData<JobBoard>(['job-board', id])
    const card = data?.cards.find(c => c.id === cardId)
    if (!data || !card || card.stageId === stageId) return
    if (root.current && !reducedMotion()) flipState.current = Flip.getState(root.current.querySelectorAll('[data-flip-id]'))
    queryClient.setQueryData<JobBoard>(['job-board', id], {
      ...data,
      cards: [{ ...card, stageId }, ...data.cards.filter(c => c.id !== cardId)],
    })
    move.mutate({ cardId, stageId })
    toast.success(`${card.candidate.fullName.split(' ')[0]} foi para ${data.stages.find(s => s.id === stageId)?.name}.`)
  }

  useLayoutEffect(() => {
    if (!flipState.current) return
    Flip.from(flipState.current, { duration: 0.55, ease: 'falcon', absolute: true, zIndex: 20 })
    flipState.current = null
  }, [board.data])

  // Arrastar entre colunas (só com mouse). Recriado quando os cartões mudam.
  const cardIds = board.data?.cards.map(c => `${c.id}:${c.stageId}`).join() ?? ''
  useGSAP(
    () => {
      if (!canHover() || !root.current) return
      const cards = gsap.utils.toArray<HTMLElement>('[data-card]', root.current)
      const draggables = cards.map(el =>
        Draggable.create(el, {
          type: 'x,y',
          zIndexBoost: false,
          minimumMovement: 6,
          cursor: 'grab',
          activeCursor: 'grabbing',
          onDragStart() {
            gsap.set(el, { zIndex: 30, position: 'relative' })
            gsap.to(el, { rotate: 2, scale: 1.03, boxShadow: 'var(--shadow-pop)', duration: 0.2 })
          },
          onDrag(this: Draggable) {
            const over = document.elementsFromPoint(this.pointerX, this.pointerY).find(node => (node as HTMLElement).dataset?.column) as HTMLElement | undefined
            root.current?.querySelectorAll('[data-column]').forEach(column => column.toggleAttribute('data-over', column === over))
          },
          onDragEnd(this: Draggable) {
            root.current?.querySelectorAll('[data-column]').forEach(column => column.removeAttribute('data-over'))
            const over = document.elementsFromPoint(this.pointerX, this.pointerY).find(node => (node as HTMLElement).dataset?.column) as HTMLElement | undefined
            const target = over?.dataset.column
            gsap.to(el, { rotate: 0, scale: 1, boxShadow: '', duration: 0.2, clearProps: 'zIndex' })
            if (target && target !== el.dataset.stage) {
              moveCard(el.dataset.card!, target)
              gsap.set(el, { x: 0, y: 0 })
            } else gsap.to(el, { x: 0, y: 0, duration: 0.45, ease: 'falcon' })
          },
          onClick() {
            setOpenId(el.dataset.card!)
          },
        })[0]!,
      )
      return () => draggables.forEach(d => d.kill())
    },
    { scope: root, dependencies: [cardIds], revertOnUpdate: true },
  )

  const copyLink = async () => {
    if (!job.data) return
    await navigator.clipboard.writeText(job.data.shareUrl)
    toast.success('Link da vaga copiado.')
  }

  if (job.isError) return <ErrorState error={job.error} onRetry={() => job.refetch()} />
  const stages = board.data?.stages ?? []

  return (
    <>
      <Link to="/recrutamento" className="group mb-5 inline-flex items-center gap-1.5 text-[13.5px] text-steel transition-colors hover:text-ink">
        <ArrowLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-1" aria-hidden /> Vagas
      </Link>

      {!job.data ? (
        <Skeleton className="mb-6 h-28 rounded-xl" />
      ) : (
        <header data-reveal className="night-glow grain relative mb-6 overflow-hidden rounded-xl border border-night-line px-6 py-6 text-snow shadow-lift sm:px-8">
          <div className="blueprint pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_right,transparent,black_60%)]" aria-hidden />
          <div className="relative flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONE[job.data.status]}>{STATUS_LABEL[job.data.status]}</Badge>
                <span className="text-[12px] tracking-[0.12em] text-fog uppercase">{job.data.departmentName ?? 'Sem departamento'}</span>
              </div>
              <h1 className="font-display text-[clamp(32px,4vw,52px)] leading-[0.92] font-semibold">{job.data.title}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-fog">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-brand" aria-hidden /> {job.data.city}
                  {job.data.state ? `/${job.data.state}` : ''}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-3.5 text-brand" aria-hidden /> {job.data.hiredCount}/{job.data.openings} posições preenchidas
                </span>
                {job.data.managerName && <span>Gestor: {job.data.managerName}</span>}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(job.data.status === 'published' || job.data.status === 'paused') && (
                <>
                  <button type="button" onClick={copyLink} className="inline-flex h-10 items-center gap-2 rounded-sm border border-white/15 bg-white/[0.06] px-4 text-[14px] text-snow transition-colors hover:bg-white/[0.12]">
                    <Copy className="size-4" aria-hidden /> Copiar link
                  </button>
                  <a href={job.data.shareUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-sm border border-white/15 bg-white/[0.06] px-4 text-[14px] text-snow transition-colors hover:bg-white/[0.12]">
                    <ExternalLink className="size-4" aria-hidden /> Ver página
                  </a>
                </>
              )}
              {canManage && job.data.status !== 'closed' && (
                <button type="button" onClick={() => setEditing(true)} className="inline-flex h-10 items-center gap-2 rounded-sm border border-brand-strong/70 bg-brand px-4 text-[14px] font-semibold text-night shadow-brand">
                  <Pencil className="size-4" aria-hidden /> Editar vaga
                </button>
              )}
            </div>
          </div>
        </header>
      )}

      {board.isError && <ErrorState error={board.error} onRetry={() => board.refetch()} />}

      <div ref={root} data-no-reveal className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <div className="flex min-w-max gap-4">
          {!board.data
            ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[420px] w-[290px] rounded-lg" />)
            : stages.map((stage, index) => {
                const cards = board.data.cards.filter(c => c.stageId === stage.id)
                return (
                  <section
                    key={stage.id}
                    data-column={stage.id}
                    aria-label={`Etapa ${stage.name}`}
                    className="group/col flex w-[290px] shrink-0 flex-col rounded-lg border border-line bg-sunken/70 transition-all duration-200 data-[over]:border-brand-strong data-[over]:bg-brand-soft/60 data-[over]:shadow-[0_0_0_4px_rgb(254_190_2/0.15)]"
                  >
                    <header className="flex items-center gap-2 px-4 pt-4 pb-3">
                      <span className={cn('size-2 rounded-full', index === 0 ? 'bg-brand' : index === stages.length - 1 ? 'bg-ok' : 'bg-steel-soft')} aria-hidden />
                      <h2 className="text-[14px] font-semibold text-ink">{stage.name}</h2>
                      <span className="num ml-auto rounded-full bg-paper px-2 py-px text-[12px] font-semibold text-steel ring-1 ring-line">{cards.length}</span>
                    </header>
                    <ul className="flex min-h-24 flex-1 flex-col gap-2 px-3 pb-3">
                      {cards.length === 0 && (
                        <li className="flex flex-1 items-center justify-center rounded-md border-2 border-dashed border-line px-3 py-8 text-center text-[12.5px] text-steel-soft">
                          Arraste candidatos para cá
                        </li>
                      )}
                      {cards.map(card => (
                        <li key={card.id}>
                          <Card card={card} stages={stages} onOpen={() => setOpenId(card.id)} onMove={stageId => moveCard(card.id, stageId)} />
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              })}

          {board.data && (
            <section aria-label="Recusados" className={cn('flex shrink-0 flex-col rounded-lg border border-dashed border-line-strong transition-all duration-300', showRejected ? 'w-[290px]' : 'w-14')}>
              <button
                type="button"
                onClick={() => setShowRejected(v => !v)}
                className={cn('flex items-center gap-2 px-4 pt-4 pb-3 text-left', !showRejected && 'h-full flex-col justify-start px-0 pt-4')}
                aria-expanded={showRejected}
              >
                <span className="size-2 rounded-full bg-danger" aria-hidden />
                <span className={cn('text-[14px] font-semibold text-steel', !showRejected && '[writing-mode:vertical-rl]')}>Recusados</span>
                <span className="num rounded-full bg-paper px-2 py-px text-[12px] font-semibold text-steel ring-1 ring-line">{board.data.rejected.length}</span>
                {showRejected && <ChevronDown className="ml-auto size-4 rotate-90 text-steel" aria-hidden />}
              </button>
              {showRejected && (
                <ul className="flex flex-col gap-2 px-3 pb-3">
                  {board.data.rejected.map(card => (
                    <li key={card.id}>
                      <button
                        type="button"
                        onClick={() => setOpenId(card.id)}
                        className="flex w-full items-center gap-2.5 rounded-md border border-line bg-paper px-3 py-2.5 text-left opacity-75 transition-opacity hover:opacity-100"
                      >
                        <Avatar name={card.candidate.fullName} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] text-ink">{card.candidate.fullName}</span>
                          <span className="block text-[11.5px] text-steel">{card.candidate.city}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>

      <CandidateDrawer id={openId} stages={stages} job={job.data} onClose={() => setOpenId(null)} />
      {canManage && job.data && <JobFormDrawer open={editing} onOpenChange={setEditing} job={job.data} />}
    </>
  )
}

function Card({ card, stages, onOpen, onMove }: { card: BoardCard; stages: JobBoard['stages']; onOpen: () => void; onMove: (stageId: string) => void }) {
  const touch = !canHover()
  return (
    <div
      data-card={card.id}
      data-stage={card.stageId ?? ''}
      data-flip-id={card.id}
      role="button"
      tabIndex={0}
      aria-label={`Abrir ${card.candidate.fullName}`}
      onClick={touch ? onOpen : undefined}
      onKeyDown={event => event.key === 'Enter' && onOpen()}
      className="group/card relative cursor-grab rounded-md border border-line bg-paper p-3.5 shadow-xs transition-[border-color,box-shadow] duration-200 select-none hover:border-line-strong hover:shadow-card focus-visible:outline-2"
    >
      <div className="flex items-start gap-2.5">
        <Avatar name={card.candidate.fullName} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-ink">{card.candidate.fullName}</p>
          <p className="flex items-center gap-1 text-[12px] text-steel">
            <MapPin className="size-3" aria-hidden /> {card.candidate.city}/{card.candidate.state}
          </p>
        </div>
        <GripVertical className="size-4 shrink-0 text-line-strong opacity-0 transition-opacity group-hover/card:opacity-100" aria-hidden />
      </div>
      <div className="mt-3 flex items-center gap-2">
        {card.rating ? (
          <span className="inline-flex items-center gap-0.5 text-[12px] font-medium text-ink" aria-label={`Avaliação ${card.rating} de 5`}>
            <Star className="size-3.5 fill-brand text-brand-strong" aria-hidden /> {card.rating}
          </span>
        ) : (
          <span className="text-[11.5px] text-steel-soft">Sem avaliação</span>
        )}
        {card.fileStatus === 'pending' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-1.5 py-px text-[11px] font-medium text-brand-ink" title="Currículo em verificação de segurança">
            <FileClock className="size-3" aria-hidden /> Em verificação
          </span>
        )}
        <span className="ml-auto text-[11.5px] text-steel-soft">{ago(card.createdAt)}</span>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            onClick={event => event.stopPropagation()}
            onPointerDown={event => event.stopPropagation()}
            className="flex size-7 items-center justify-center rounded-[6px] text-steel transition-colors hover:bg-sunken hover:text-ink"
            aria-label={`Mover ${card.candidate.fullName} para…`}
          >
            <MoveRight className="size-3.5" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={6} className="pop z-50 min-w-44 rounded-lg border border-line bg-paper p-1.5 text-sm shadow-pop">
              <DropdownMenu.Label className="eyebrow px-3 py-1.5">Mover para</DropdownMenu.Label>
              {stages
                .filter(s => s.id !== card.stageId)
                .map(stage => (
                  <DropdownMenu.Item
                    key={stage.id}
                    onSelect={() => onMove(stage.id)}
                    className="cursor-pointer rounded-sm px-3 py-2 text-ink-soft outline-none data-[highlighted]:bg-sunken"
                  >
                    {stage.name}
                  </DropdownMenu.Item>
                ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </div>
  )
}
