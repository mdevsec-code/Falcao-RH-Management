import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Download, FileClock, FileText, Mail, MapPin, Merge, Phone, Send, ShieldAlert, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { Button } from '../components/ui/button'
import { Drawer } from '../components/ui/drawer'
import { Input, Select } from '../components/ui/field'
import { Avatar, Badge, Skeleton } from '../components/ui/layout'
import { api, ApiError, openDownload } from '../lib/api'
import { displayCpf } from '../lib/format'
import { useCan } from '../lib/session'
import type { CandidateDetail, CandidateDuplicate, JobListItem } from '../lib/types'

const MAX_TAGS = 20
const dateBr = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

/** Ficha do banco de talentos: contato, etiquetas, duplicatas, convite e histórico. */
export function TalentDrawer({ id, onClose, onMerged }: { id: string | null; onClose: () => void; onMerged: (id: string) => void }) {
  const queryClient = useQueryClient()
  const canManage = useCan('recruitment.manage')
  const query = useQuery({ queryKey: ['candidate', id], queryFn: () => api<CandidateDetail>(`/candidates/${id}`), enabled: Boolean(id) })
  const duplicates = useQuery({ queryKey: ['candidate-duplicates', id], queryFn: () => api<CandidateDuplicate[]>(`/candidates/${id}/duplicates`), enabled: Boolean(id) })
  const jobs = useQuery({ queryKey: ['jobs', 'published'], queryFn: () => api<JobListItem[]>('/jobs', { query: { status: 'published' } }), enabled: Boolean(id) && canManage })
  const c = query.data
  const [tagDraft, setTagDraft] = useState('')
  const [jobId, setJobId] = useState('')
  const [confirmMerge, setConfirmMerge] = useState<string | null>(null)

  const fail = (error: unknown) => toast.error(error instanceof ApiError ? error.message : 'Não foi possível concluir.')
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['candidates'] }),
      queryClient.invalidateQueries({ queryKey: ['candidate'] }),
      queryClient.invalidateQueries({ queryKey: ['candidate-duplicates'] }),
    ])

  const saveTags = useMutation({
    mutationFn: (tags: string[]) => api(`/candidates/${id}`, { method: 'PATCH', body: { tags } }),
    onSuccess: refresh,
    onError: fail,
  })
  const merge = useMutation({
    mutationFn: (sourceId: string) => api(`/candidates/${id}/merge`, { method: 'POST', body: { sourceId } }),
    onSuccess: async () => {
      setConfirmMerge(null)
      await refresh()
      onMerged(id!)
      toast.success('Fichas juntadas.')
    },
    onError: fail,
  })
  const invite = useMutation({
    mutationFn: () => api(`/candidates/${id}/invite`, { method: 'POST', body: { jobId } }),
    onSuccess: async () => {
      setJobId('')
      await refresh()
      toast.success('Convite enviado por e-mail.')
    },
    onError: fail,
  })

  const addTag = () => {
    const tag = tagDraft.trim()
    if (!c || !tag) return
    setTagDraft('')
    if (!c.tags.includes(tag)) saveTags.mutate([...c.tags, tag])
  }
  const download = async (fileId: string) => {
    try {
      const { url } = await api<{ url: string }>(`/candidate-files/${fileId}/download`)
      openDownload(url)
    } catch (error) {
      fail(error)
    }
  }

  return (
    <Drawer
      open={Boolean(id)}
      onOpenChange={open => {
        if (!open) {
          setConfirmMerge(null)
          onClose()
        }
      }}
      title={c?.fullName ?? 'Ficha'}
      description={c ? `${c.applications.length === 1 ? '1 candidatura' : `${c.applications.length} candidaturas`}${c.invitedAt ? ` · convidado em ${dateBr(c.invitedAt)}` : ''}` : undefined}
    >
      {!c ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <Avatar name={c.fullName} size="lg" />
            <div className="min-w-0 text-[13.5px] text-steel">
              <p className="flex items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0" aria-hidden /> {c.city}/{c.state}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 break-all">
                <Mail className="size-3.5 shrink-0" aria-hidden /> {c.email}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5">
                <Phone className="size-3.5 shrink-0" aria-hidden /> {c.phone}
              </p>
              {c.cpf && <p className="num mt-0.5">CPF {displayCpf(c.cpf)}</p>}
            </div>
          </div>

          {duplicates.data && duplicates.data.length > 0 && (
            <div className="rounded-md border border-brand-strong/40 bg-brand-soft/60 p-4">
              <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                <Copy className="size-4 text-brand-ink" aria-hidden /> Pode ser a mesma pessoa
              </p>
              <p className="mt-0.5 text-[13px] text-ink-soft">Estas fichas têm o mesmo e-mail ou CPF. Juntar leva candidaturas e arquivos para esta ficha e não pode ser desfeito.</p>
              <ul className="mt-3 flex flex-col gap-2">
                {duplicates.data.map(d => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-paper px-3 py-2 text-[13.5px] ring-1 ring-line">
                    <span className="min-w-0">
                      <span className="block font-medium break-words text-ink">{d.fullName}</span>
                      <span className="block text-[12.5px] break-all text-steel">
                        {d.email} · {d.city}/{d.state}
                      </span>
                    </span>
                    {canManage &&
                      (confirmMerge === d.id ? (
                        <span className="flex gap-1.5">
                          <Button size="sm" onClick={() => setConfirmMerge(null)}>
                            Cancelar
                          </Button>
                          <Button size="sm" variant="primary" loading={merge.isPending} onClick={() => merge.mutate(d.id)}>
                            Confirmar
                          </Button>
                        </span>
                      ) : (
                        <Button size="sm" onClick={() => setConfirmMerge(d.id)}>
                          <Merge className="size-4" aria-hidden /> Juntar fichas
                        </Button>
                      ))}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Section title="Etiquetas">
            <div className="flex flex-wrap items-center gap-1.5">
              {c.tags.map(tag => (
                <span key={tag} className="inline-flex h-8 items-center gap-1 rounded-full bg-sunken pr-1.5 pl-3 text-[13px] text-ink-soft ring-1 ring-line">
                  {tag}
                  {canManage && (
                    <button type="button" aria-label={`Remover etiqueta ${tag}`} onClick={() => saveTags.mutate(c.tags.filter(t => t !== tag))} className="rounded-full p-0.5 text-steel transition-colors hover:bg-line hover:text-ink">
                      <X className="size-3.5" aria-hidden />
                    </button>
                  )}
                </span>
              ))}
              {c.tags.length === 0 && !canManage && <p className="text-[13.5px] text-steel">Sem etiquetas.</p>}
            </div>
            {canManage && c.tags.length < MAX_TAGS && (
              <form
                className="mt-2 flex gap-2"
                onSubmit={event => {
                  event.preventDefault()
                  addTag()
                }}
              >
                <Input value={tagDraft} onChange={e => setTagDraft(e.target.value)} maxLength={40} placeholder="Ex.: NR-35, pedreiro, indicação" aria-label="Nova etiqueta" />
                <Button type="submit" disabled={!tagDraft.trim()} loading={saveTags.isPending}>
                  Adicionar
                </Button>
              </form>
            )}
          </Section>

          {canManage && (
            <Section title="Convidar para uma vaga">
              {c.canInvite ? (
                <div className="flex flex-wrap gap-2">
                  <Select aria-label="Vaga" value={jobId} onChange={e => setJobId(e.target.value)} className="min-w-56 flex-1">
                    <option value="">Escolha uma vaga publicada</option>
                    {jobs.data?.map(job => (
                      <option key={job.id} value={job.id}>
                        {job.title}
                      </option>
                    ))}
                  </Select>
                  <Button variant="primary" disabled={!jobId} loading={invite.isPending} onClick={() => invite.mutate()}>
                    <Send className="size-4" aria-hidden /> Enviar convite
                  </Button>
                </div>
              ) : (
                <p className="rounded-md border border-line bg-sunken/60 px-4 py-3 text-[13.5px] text-ink-soft">Esta pessoa não autorizou contato pelo banco de talentos, ou a autorização venceu. Por isso não pode receber convites.</p>
              )}
            </Section>
          )}

          <Section title="Candidaturas">
            <ul className="flex flex-col gap-2">
              {c.applications.map(application => (
                <li key={application.id} className="rounded-md border border-line bg-paper px-4 py-3 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium break-words text-ink">{application.jobTitle}</p>
                    {application.status === 'rejected' ? <Badge tone="danger">Recusado</Badge> : application.status === 'hired' ? <Badge tone="ok">Contratado</Badge> : <Badge>{application.stage ?? 'Em andamento'}</Badge>}
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-steel">
                    {dateBr(application.createdAt)}
                    {application.rating ? ` · nota ${application.rating} de 5` : ''}
                    {application.talentPoolConsent ? ' · autorizou o banco' : ''}
                  </p>
                  {application.rejectionReason && <p className="mt-1 text-[13px] text-ink-soft">Motivo: {application.rejectionReason}</p>}
                  {application.notes.map(note => (
                    <p key={note.id} className="mt-2 rounded-md bg-sunken/70 px-3 py-2 text-[13px] text-ink-soft">
                      {note.body}
                      <span className="mt-0.5 block text-[11.5px] text-steel-soft">{note.authorName ?? 'Sistema'}</span>
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </Section>

          {c.files.length > 0 && (
            <Section title="Currículos">
              <ul className="flex flex-col gap-2">
                {c.files.map(file => (
                  <li key={file.id} className="flex items-center gap-3 rounded-md border border-line bg-sunken/60 px-4 py-2.5">
                    {file.scanStatus === 'pending' ? <FileClock className="size-5 shrink-0 text-brand-ink" aria-hidden /> : file.scanStatus === 'infected' ? <ShieldAlert className="size-5 shrink-0 text-danger" aria-hidden /> : <FileText className="size-5 shrink-0 text-danger" aria-hidden />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink">{file.filename}</span>
                      <span className="block text-[12.5px] text-steel">{file.scanStatus === 'pending' ? 'Em verificação de segurança.' : file.scanStatus === 'infected' ? 'Removido: não passou na verificação.' : dateBr(file.createdAt)}</span>
                    </span>
                    <Button size="sm" disabled={file.scanStatus !== 'clean'} onClick={() => download(file.id)}>
                      <Download className="size-4" aria-hidden /> Baixar
                    </Button>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </Drawer>
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
