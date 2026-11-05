import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Ban, Download, FileClock, FileText, Mail, MapPin, MessageCircle, Phone, ShieldAlert, Star, UserCheck } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { formatCpf } from '@falcao-rh/contracts'

import { Button } from '../components/ui/button'
import { Drawer } from '../components/ui/drawer'
import { Textarea } from '../components/ui/field'
import { Avatar, Badge, Skeleton } from '../components/ui/layout'
import { api, ApiError, openDownload } from '../lib/api'
import { cn } from '../lib/cn'
import { displayCpf, todayIso } from '../lib/format'
import { useCan } from '../lib/session'
import type { ApplicationDetail, JobBoard, JobDetail } from '../lib/types'
import { EmployeeForm, type HireMode, type HireResult } from './employee-form'

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * Ficha da candidatura: contato, avaliação, etapa, currículo verificado,
 * respostas, notas internas e histórico. Gestor vê só o que precisa para
 * conduzir a vaga (sem CPF nem outras candidaturas).
 */
export function CandidateDrawer({ id, stages, job, onClose }: { id: string | null; stages: JobBoard['stages']; job?: JobDetail; onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const canManage = useCan('recruitment.manage')
  const canCreateEmployee = useCan('employees.create')
  const canHire = canManage && canCreateEmployee
  const [hiring, setHiring] = useState(false)
  const query = useQuery({ queryKey: ['application', id], queryFn: () => api<ApplicationDetail>(`/applications/${id}`), enabled: Boolean(id) })
  const a = query.data
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['application', id] }),
      queryClient.invalidateQueries({ queryKey: ['job-board'] }),
      queryClient.invalidateQueries({ queryKey: ['jobs'] }),
    ])
  const fail = (error: unknown) => toast.error(error instanceof ApiError ? error.message : 'Não foi possível concluir.')

  const move = useMutation({
    mutationFn: (body: { stageId: string } | { outcome: 'rejected'; reason: string }) => api(`/applications/${id}/stage`, { method: 'POST', body }),
    onSuccess: async (_, body) => {
      await refresh()
      setRejecting(false)
      setReason('')
      toast.success('outcome' in body ? 'Candidatura recusada. O candidato foi avisado por e-mail.' : `Movido para ${stages.find(s => s.id === body.stageId)?.name}.`)
    },
    onError: fail,
  })
  const rate = useMutation({ mutationFn: (rating: number | null) => api(`/applications/${id}`, { method: 'PATCH', body: { rating } }), onSuccess: refresh, onError: fail })
  const addNote = useMutation({
    mutationFn: () => api(`/applications/${id}/notes`, { method: 'POST', body: { body: note } }),
    onSuccess: async () => {
      setNote('')
      await refresh()
    },
    onError: fail,
  })
  const download = async () => {
    try {
      const { url } = await api<{ url: string }>(`/candidate-files/${a!.file!.id}/download`)
      openDownload(url)
    } catch (error) {
      fail(error)
    }
  }

  const closeJob = useMutation({
    mutationFn: () => api(`/jobs/${job!.id}/status`, { method: 'POST', body: { status: 'closed' } }),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['job', job!.id] }), queryClient.invalidateQueries({ queryKey: ['jobs'] })])
      toast.success('Vaga encerrada.')
    },
    onError: fail,
  })

  const onHired = ({ employeeId, suggestCloseJob }: HireResult) => {
    const name = a!.candidate.fullName
    void queryClient.invalidateQueries({ queryKey: ['job-board'] })
    void queryClient.invalidateQueries({ queryKey: ['jobs'] })
    void queryClient.invalidateQueries({ queryKey: ['job', job?.id] })
    queryClient.removeQueries({ queryKey: ['application', id] })
    onClose()
    toast.success(`${name} agora é colaborador.`, {
      description: 'O candidato foi avisado por e-mail.',
      action: { label: 'Ver cadastro', onClick: () => void navigate({ to: '/colaboradores/$id', params: { id: employeeId } }) },
    })
    if (suggestCloseJob)
      toast('Todas as posições desta vaga foram preenchidas.', {
        description: 'Quer encerrar a vaga? Ela sai da página de vagas.',
        duration: 15_000,
        action: { label: 'Encerrar vaga', onClick: () => closeJob.mutate() },
      })
  }

  const inFirstStage = a?.stageId === stages[0]?.id
  const hireMode: HireMode | undefined =
    a && job
      ? {
          applicationId: a.id,
          candidateName: a.candidate.fullName,
          jobTitle: a.jobTitle,
          prefill: {
            fullName: a.candidate.fullName,
            cpf: a.candidate.cpf ? formatCpf(a.candidate.cpf) : '',
            email: a.candidate.email,
            phone: a.candidate.phone,
            hireDate: todayIso(),
            contractType: job.contractType,
            departmentId: job.departmentId,
            positionId: job.positionId,
            unitId: job.unitId,
          },
          notices: [
            a.file?.scanStatus === 'clean'
              ? 'O currículo vai para os documentos do colaborador, na categoria Currículo.'
              : a.file
                ? 'O currículo não passou pela verificação de segurança e não será levado para o cadastro.'
                : 'Esta candidatura não tem currículo para levar ao cadastro.',
            'A ficha de candidato é apagada: os dados passam a viver no cadastro do colaborador.',
            ...(a.otherApplications?.length ? ['As outras candidaturas desta pessoa também serão encerradas.'] : []),
          ],
          onHired,
        }
      : undefined

  return (
    <>
    <Drawer
      open={Boolean(id)}
      onOpenChange={open => {
        if (!open) {
          setRejecting(false)
          onClose()
        }
      }}
      title={a?.candidate.fullName ?? 'Candidatura'}
      description={a ? `${a.jobTitle} · candidatou-se em ${when(a.createdAt)}` : undefined}
    >
      {!a ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={a.candidate.fullName} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[13.5px] text-steel">
                <MapPin className="size-3.5" aria-hidden /> {a.candidate.city}/{a.candidate.state}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {a.status === 'rejected' && <Badge tone="danger">Recusado</Badge>}
                {a.status === 'hired' && <Badge tone="ok">Contratado</Badge>}
                {a.talentPoolConsent && <Badge tone="info">Banco de talentos</Badge>}
                {a.candidate.tags.map(tag => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>
            </div>
            <Stars value={a.rating} onChange={value => rate.mutate(value)} />
          </div>

          {a.status !== 'hired' && (
            <Section title="Etapa">
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Mover para a etapa">
                {stages.map(stage => {
                  const current = a.status === 'open' && a.stageId === stage.id
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      role="radio"
                      aria-checked={current}
                      disabled={move.isPending}
                      onClick={() => !current && move.mutate({ stageId: stage.id })}
                      className={cn(
                        'h-9 rounded-full border px-3.5 text-[13px] font-medium transition-all duration-200',
                        current ? 'border-night bg-night text-snow shadow-card' : 'border-line-strong bg-paper text-ink-soft hover:border-steel-soft',
                      )}
                    >
                      {stage.name}
                    </button>
                  )
                })}
                {a.status === 'open' && canHire && job && !inFirstStage && !rejecting && (
                  <Button size="sm" variant="primary" className="h-9" onClick={() => setHiring(true)}>
                    <UserCheck className="size-4" aria-hidden /> Contratar
                  </Button>
                )}
                {a.status === 'open' && !rejecting && (
                  <Button size="sm" variant="ghost" className="h-9 text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setRejecting(true)}>
                    <Ban className="size-4" aria-hidden /> Recusar
                  </Button>
                )}
              </div>
              {a.status === 'open' && canHire && inFirstStage && (
                <p className="mt-2.5 text-[12.5px] text-steel">Para contratar, mova o candidato para além de {stages[0]?.name}.</p>
              )}
              {a.status === 'rejected' && a.rejectionReason && (
                <p className="mt-3 rounded-md border border-danger/20 bg-danger-soft px-3.5 py-2.5 text-[13.5px] text-ink-soft">
                  Motivo da recusa: {a.rejectionReason}. Para reabrir, escolha uma etapa acima.
                </p>
              )}
              {rejecting && (
                <div className="mt-3 flex flex-col gap-2 rounded-md border border-danger/25 bg-danger-soft/60 p-4">
                  <label htmlFor="reject-reason" className="text-[13.5px] font-medium text-ink-soft">
                    Motivo da recusa <span className="text-danger">*</span>
                  </label>
                  <Textarea id="reject-reason" value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder="Fica registrado no histórico. O candidato recebe a mensagem padrão, sem o motivo." className="min-h-20 bg-paper" />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" onClick={() => setRejecting(false)}>
                      Cancelar
                    </Button>
                    <Button size="sm" variant="danger" disabled={reason.trim().length < 3} loading={move.isPending} onClick={() => move.mutate({ outcome: 'rejected', reason })}>
                      Recusar e avisar o candidato
                    </Button>
                  </div>
                </div>
              )}
            </Section>
          )}

          <Section title="Contato">
            <div className="grid gap-2 sm:grid-cols-2">
              <ContactLink href={`mailto:${a.candidate.email}`} icon={Mail}>
                {a.candidate.email}
              </ContactLink>
              <ContactLink href={`tel:${a.candidate.phone.replace(/\D/g, '')}`} icon={Phone}>
                {a.candidate.phone}
              </ContactLink>
              <ContactLink href={`https://wa.me/55${a.candidate.phone.replace(/\D/g, '')}`} icon={MessageCircle}>
                Conversar no WhatsApp
              </ContactLink>
              {a.candidate.linkedin && (
                <ContactLink href={a.candidate.linkedin} icon={FileText}>
                  Perfil no LinkedIn
                </ContactLink>
              )}
            </div>
            {a.candidate.cpf && <p className="num mt-2 text-[13px] text-steel">CPF {displayCpf(a.candidate.cpf)}</p>}
          </Section>

          <Section title="Currículo">
            {!a.file ? (
              <p className="text-[13.5px] text-steel">Nenhum arquivo enviado.</p>
            ) : (
              <div className="flex items-center gap-3 rounded-md border border-line bg-sunken/60 px-4 py-3">
                <span
                  className={cn(
                    'flex size-10 items-center justify-center rounded-sm',
                    a.file.scanStatus === 'clean' ? 'bg-danger-soft text-danger' : a.file.scanStatus === 'pending' ? 'bg-warn-soft text-brand-ink' : 'bg-danger-soft text-danger',
                  )}
                >
                  {a.file.scanStatus === 'pending' ? <FileClock className="size-5" aria-hidden /> : a.file.scanStatus === 'infected' ? <ShieldAlert className="size-5" aria-hidden /> : <FileText className="size-5" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-ink">{a.file.filename}</p>
                  <p className="text-[12.5px] text-steel">
                    {a.file.scanStatus === 'pending' ? 'Em verificação de segurança: libera em alguns minutos.' : a.file.scanStatus === 'infected' ? 'Removido: não passou na verificação.' : 'Verificado pelo antivírus.'}
                  </p>
                </div>
                <Button size="sm" disabled={a.file.scanStatus !== 'clean'} onClick={download}>
                  <Download className="size-4" aria-hidden /> Baixar
                </Button>
              </div>
            )}
          </Section>

          {a.answers.length > 0 && (
            <Section title="Respostas">
              <dl className="divide-y divide-line rounded-md border border-line">
                {a.answers.map(answer => (
                  <div key={answer.questionId} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-[13.5px]">
                    <dt className="text-steel">{answer.label}</dt>
                    <dd className={cn('text-right font-medium', answer.value === 'não' ? 'text-danger' : 'text-ink')}>{answer.value.charAt(0).toUpperCase() + answer.value.slice(1)}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          <Section title="Notas internas">
            <div className="flex flex-col gap-2">
              <Textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} placeholder="Ex.: entrevista marcada para quinta às 9h" className="min-h-20" aria-label="Nova nota" />
              <Button size="sm" className="self-end" disabled={!note.trim()} loading={addNote.isPending} onClick={() => addNote.mutate()}>
                Adicionar nota
              </Button>
            </div>
            {a.notes.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
                {a.notes.map(n => (
                  <li key={n.id} className="rounded-md rounded-tl-none border border-line bg-paper px-3.5 py-2.5 text-[13.5px] shadow-xs">
                    <p className="text-ink-soft">{n.body}</p>
                    <p className="mt-1 text-[11.5px] text-steel-soft">
                      {n.authorName ?? 'Sistema'} · {when(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Histórico">
            <ol className="relative ml-2 border-l-2 border-line">
              {a.events.map(event => (
                <li key={event.id} className="relative pb-4 pl-5 last:pb-0">
                  <span
                    className={cn(
                      'absolute top-1.5 -left-[7px] size-3 rounded-full ring-4 ring-paper',
                      event.outcome === 'rejected' ? 'bg-danger' : event.outcome === 'hired' ? 'bg-ok' : event.fromLabel ? 'bg-ink' : 'bg-brand',
                    )}
                    aria-hidden
                  />
                  <p className="text-[13.5px] font-medium text-ink">
                    {event.outcome === 'rejected'
                      ? 'Recusado'
                      : event.outcome === 'hired'
                        ? 'Contratado'
                        : event.outcome === 'reopened'
                          ? `Reaberto em ${event.toLabel}`
                          : event.fromLabel
                            ? `${event.fromLabel} → ${event.toLabel}`
                            : 'Candidatura recebida'}
                  </p>
                  <p className="text-[12px] text-steel">
                    {event.actorName ?? 'Página de vagas'} · {when(event.createdAt)}
                  </p>
                  {event.note && <p className="mt-0.5 text-[12.5px] text-ink-soft">{event.note}</p>}
                </li>
              ))}
            </ol>
          </Section>

          {a.otherApplications && a.otherApplications.length > 0 && (
            <Section title="Outras candidaturas desta pessoa">
              <ul className="divide-y divide-line rounded-md border border-line">
                {a.otherApplications.map(o => (
                  <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px]">
                    <span className="text-ink">{o.jobTitle}</span>
                    <Badge>{o.stage}</Badge>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </Drawer>
    {hireMode && <EmployeeForm open={hiring} onOpenChange={setHiring} hire={hireMode} />}
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="eyebrow mb-2.5">{title}</h3>
      {children}
    </section>
  )
}

function ContactLink({ href, icon: Icon, children }: { href: string; icon: typeof Mail; children: ReactNode }) {
  return (
    <a
      href={href}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel="noopener noreferrer"
      className="flex min-w-0 items-center gap-2 rounded-md border border-line bg-paper px-3 py-2.5 text-[13.5px] text-ink-soft shadow-xs transition-colors hover:border-steel-soft hover:text-ink"
    >
      <Icon className="size-4 shrink-0 text-steel" aria-hidden />
      <span className="break-words">{children}</span>
    </a>
  )
}

/** Avaliação de 1 a 5; clicar na nota atual limpa. */
function Stars({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0
  return (
    <div className="flex" role="radiogroup" aria-label="Avaliação" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} de 5`}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(value === n ? null : n)}
          className="p-0.5 transition-transform hover:scale-110"
        >
          <Star className={cn('size-5', n <= shown ? 'fill-brand text-brand-strong' : 'text-line-strong')} aria-hidden />
        </button>
      ))}
    </div>
  )
}
