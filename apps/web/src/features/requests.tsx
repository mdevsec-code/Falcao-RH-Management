import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronLeft, ChevronRight, Clock, Lock, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import {
  ABSENCE_KIND_LABELS,
  ABSENCE_KINDS,
  APPROVER_LABELS,
  addDaysIso,
  calendarDays,
  REQUEST_STATUS_LABELS,
  type AbsenceKind,
  type RequestStatus,
  type RequestType,
} from '@falcao-rh/contracts'

import { Button } from '../components/ui/button'
import { Drawer } from '../components/ui/drawer'
import { Field, Input, Select, Textarea } from '../components/ui/field'
import { FileInput } from '../components/ui/file-input'
import { Badge, Skeleton } from '../components/ui/layout'
import { api, apiUpload, ApiError } from '../lib/api'
import { cn } from '../lib/cn'
import { formatDate, todayIso } from '../lib/format'
import { useMe } from '../lib/session'
import type { CalendarItem, DocumentCategory, EmployeeListItem, Page, RequestDetail, RequestItem, VacationBalance } from '../lib/types'

// ---------- rótulos ----------

const STATUS_TONES: Record<RequestStatus, 'warn' | 'ok' | 'danger' | 'neutral'> = {
  pending: 'warn',
  approved: 'ok',
  rejected: 'danger',
  cancelled: 'neutral',
}

export const RequestStatusBadge = ({ status }: { status: RequestStatus }) => (
  <Badge tone={STATUS_TONES[status]}>{REQUEST_STATUS_LABELS[status]}</Badge>
)

/** "Férias", "Atestado médico" ou, para quem não pode ver o tipo, "Ausência justificada". */
export const requestLabel = (item: { type: RequestType; absenceKind: AbsenceKind | null; isRestricted?: boolean }) =>
  item.type === 'vacation'
    ? 'Férias'
    : item.isRestricted || !item.absenceKind
      ? 'Ausência justificada'
      : ABSENCE_KIND_LABELS[item.absenceKind]

export const periodLabel = (item: { startDate: string; endDate: string; days: number }) =>
  item.startDate === item.endDate
    ? `${formatDate(item.startDate)} (1 dia)`
    : `${formatDate(item.startDate)} a ${formatDate(item.endDate)} (${item.days} dias)`

const invalidateRequests = (queryClient: ReturnType<typeof useQueryClient>) =>
  Promise.all(
    ['requests', 'me-requests', 'request', 'calendar', 'vacation-balance', 'dashboard', 'notifications'].map(key =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    ),
  )

// ---------- detalhe e decisão ----------

const STEP_ICON = {
  approved: <Check className="size-3.5" strokeWidth={3} />,
  rejected: <X className="size-3.5" strokeWidth={3} />,
  pending: <Clock className="size-3.5" />,
  waiting: null,
  skipped: null,
} as const

export function RequestDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')
  const query = useQuery({
    queryKey: ['request', id],
    queryFn: () => api<RequestDetail>(`/requests/${id}`),
    enabled: Boolean(id),
  })
  const decide = useMutation({
    mutationFn: (decision: 'approve' | 'reject') =>
      api<RequestDetail>(`/requests/${id}/decision`, { method: 'POST', body: { decision, comment } }),
    onSuccess: async (result, decision) => {
      toast.success(decision === 'approve' ? (result.status === 'approved' ? 'Solicitação aprovada.' : 'Aprovado. Seguiu para a próxima etapa.') : 'Solicitação recusada.')
      setComment('')
      await invalidateRequests(queryClient)
      onClose()
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível registrar a decisão.'),
  })
  const cancel = useMutation({
    mutationFn: () => api(`/requests/${id}/cancel`, { method: 'POST' }),
    onSuccess: async () => {
      toast.success('Solicitação cancelada.')
      await invalidateRequests(queryClient)
      onClose()
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível cancelar.'),
  })
  const r = query.data

  return (
    <Drawer
      open={Boolean(id)}
      onOpenChange={open => !open && onClose()}
      title={r ? requestLabel(r) : 'Solicitação'}
      description={r ? `${r.employeeName}${r.departmentName ? `, ${r.departmentName}` : ''}` : undefined}
      footer={
        r && (r.canDecide || r.canCancel) ? (
          <>
            {r.canCancel && (
              <Button variant="ghost" className="mr-auto" onClick={() => window.confirm('Cancelar esta solicitação?') && cancel.mutate()} loading={cancel.isPending}>
                Cancelar solicitação
              </Button>
            )}
            {r.canDecide && (
              <>
                <Button variant="danger" onClick={() => decide.mutate('reject')} loading={decide.isPending && decide.variables === 'reject'} disabled={comment.trim().length < 3}>
                  Recusar
                </Button>
                <Button variant="primary" onClick={() => decide.mutate('approve')} loading={decide.isPending && decide.variables === 'approve'}>
                  Aprovar
                </Button>
              </>
            )}
          </>
        ) : undefined
      }
    >
      {query.isPending && <Skeleton className="h-60" />}
      {r && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <RequestStatusBadge status={r.status} />
            {r.isRestricted && (
              <span className="flex items-center gap-1.5 text-[13px] text-steel">
                <Lock className="size-3.5" aria-hidden /> O tipo e as observações são visíveis só ao RH
              </span>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-[13px] text-steel">Período</dt>
              <dd className="text-ink">{formatDate(r.startDate)} a {formatDate(r.endDate)}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-steel">Duração</dt>
              <dd className="num font-display text-2xl leading-none font-semibold text-ink">{r.days} {r.days === 1 ? 'dia' : 'dias'}</dd>
            </div>
            {r.notes && (
              <div className="col-span-2">
                <dt className="text-[13px] text-steel">Observações</dt>
                <dd className="text-ink">{r.notes}</dd>
              </div>
            )}
          </dl>

          <section>
            <h3 className="mb-3 font-medium text-ink">Aprovação</h3>
            <ol className="relative ml-2 border-l-2 border-line">
              {r.steps.map((step, i) => (
                <motion.li
                  key={step.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="relative pb-5 pl-7 last:pb-0"
                >
                  <span
                    className={cn(
                      'absolute top-0 -left-[11px] flex size-5 items-center justify-center rounded-full border-2 border-paper',
                      step.status === 'approved' && 'bg-ok text-paper',
                      step.status === 'rejected' && 'bg-danger text-paper',
                      step.status === 'pending' && 'bg-brand text-ink',
                      (step.status === 'waiting' || step.status === 'skipped') && 'bg-line text-steel',
                    )}
                    aria-hidden
                  >
                    {STEP_ICON[step.status]}
                  </span>
                  <p className={cn('text-sm font-medium', step.status === 'skipped' ? 'text-steel-soft line-through' : 'text-ink')}>
                    {APPROVER_LABELS[step.approverKind]}
                    {step.approverName && <span className="font-normal text-steel">: {step.approverName}</span>}
                  </p>
                  <p className="text-[13px] text-steel">
                    {step.status === 'pending' && 'Aguardando decisão'}
                    {step.status === 'waiting' && 'Na fila, depois da etapa anterior'}
                    {step.status === 'skipped' && 'Etapa não aplicável'}
                    {(step.status === 'approved' || step.status === 'rejected') &&
                      `${step.status === 'approved' ? 'Aprovado' : 'Recusado'} por ${step.decidedByName ?? 'sistema'} em ${new Date(step.decidedAt!).toLocaleString('pt-BR')}`}
                  </p>
                  {step.comment && <p className="mt-1 text-sm text-ink-soft">“{step.comment}”</p>}
                </motion.li>
              ))}
            </ol>
          </section>

          {r.canDecide && (
            <Field label="Comentário" hint="Obrigatório para recusar; opcional para aprovar.">
              {p => <Textarea {...p} value={comment} onChange={e => setComment(e.target.value)} maxLength={500} />}
            </Field>
          )}
        </div>
      )}
    </Drawer>
  )
}

// ---------- novo pedido ----------

const nextMonday = () => {
  let date = addDaysIso(todayIso(), 1)
  while (new Date(`${date}T12:00:00Z`).getUTCDay() !== 1) date = addDaysIso(date, 1)
  return date
}

export function NewRequestDrawer({
  open,
  onOpenChange,
  onBehalf,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** RH registrando em nome de alguém: o pedido nasce aprovado. */
  onBehalf?: boolean
}) {
  const me = useMe()
  const queryClient = useQueryClient()
  const [type, setType] = useState<RequestType>('vacation')
  const [kind, setKind] = useState<AbsenceKind>('justified')
  const [startDate, setStartDate] = useState(nextMonday())
  const [endDate, setEndDate] = useState(addDaysIso(nextMonday(), 13))
  const [notes, setNotes] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)

  const balance = useQuery({
    queryKey: ['vacation-balance', onBehalf ? employeeId : 'me'],
    queryFn: () => api<VacationBalance>(onBehalf ? `/employees/${employeeId}/vacation-balance` : '/me/vacation-balance'),
    enabled: open && type === 'vacation' && (!onBehalf || Boolean(employeeId)),
  })
  const people = useQuery({
    queryKey: ['employees', 'request-picker'],
    queryFn: () => api<Page<EmployeeListItem>>('/employees', { query: { status: 'active', pageSize: 100 } }),
    enabled: open && Boolean(onBehalf),
  })
  const categories = useQuery({
    queryKey: ['document-categories'],
    queryFn: () => api<DocumentCategory[]>('/document-categories'),
    enabled: open && kind === 'medical',
  })

  const days = endDate >= startDate ? calendarDays(startDate, endDate) : 0
  const kinds = ABSENCE_KINDS.filter(k => onBehalf || k !== 'unjustified')

  const submit = useMutation({
    mutationFn: async () => {
      let documentId: string | null = null
      // Atestado anexado: vai para "Atestados médicos" (categoria sensível) antes do pedido.
      if (type === 'absence' && kind === 'medical' && attachment && !onBehalf) {
        const category = categories.data?.find(c => c.sensitive && c.employeeUpload)
        if (!category) throw new ApiError(400, 'no_category', 'Não há categoria para atestados. Fale com o RH.')
        const doc = await apiUpload<{ id: string }>('/me/documents', { title: `Atestado ${formatDate(startDate)}`, categoryId: category.id }, attachment)
        documentId = doc.id
      }
      return api('/requests', {
        method: 'POST',
        body: {
          type,
          ...(type === 'absence' ? { kind, documentId } : {}),
          startDate,
          endDate,
          notes,
          ...(onBehalf ? { employeeId } : {}),
        },
      })
    },
    onSuccess: async () => {
      toast.success(onBehalf ? 'Registro feito.' : 'Solicitação enviada. Você será avisado da decisão.')
      setNotes('')
      setAttachment(null)
      await invalidateRequests(queryClient)
      onOpenChange(false)
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível enviar.'),
  })

  const send = (event: FormEvent) => {
    event.preventDefault()
    submit.mutate()
  }
  const valid = days > 0 && (!onBehalf || employeeId)

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={onBehalf ? 'Registrar férias ou ausência' : 'Nova solicitação'}
      description={onBehalf ? 'Registro do RH: entra aprovado e avisa o colaborador.' : `Vai para aprovação. ${me.user.name.split(' ')[0]}, você acompanha tudo por aqui.`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="primary" onClick={send} loading={submit.isPending} disabled={!valid}>
            {onBehalf ? 'Registrar' : 'Enviar solicitação'}
          </Button>
        </>
      }
    >
      <form onSubmit={send} className="flex flex-col gap-5">
        <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 gap-2">
          {(['vacation', 'absence'] as const).map(option => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={type === option}
              onClick={() => setType(option)}
              className={cn(
                'relative rounded-sm border px-4 py-3 text-left transition-colors',
                type === option ? 'border-ink bg-ink text-paper' : 'border-line-strong bg-paper text-ink-soft hover:border-ink',
              )}
            >
              <span className="block font-medium">{option === 'vacation' ? 'Férias' : 'Ausência'}</span>
              <span className={cn('block text-[13px]', type === option ? 'text-paper/70' : 'text-steel')}>
                {option === 'vacation' ? 'Descanso anual remunerado' : 'Folga, atestado, licença'}
              </span>
            </button>
          ))}
        </div>

        {onBehalf && (
          <Field label="Colaborador" required>
            {p => (
              <Select {...p} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
                <option value="">Escolha</option>
                {people.data?.items.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
              </Select>
            )}
          </Field>
        )}

        {type === 'absence' && (
          <Field label="Motivo" required>
            {p => (
              <Select {...p} value={kind} onChange={e => setKind(e.target.value as AbsenceKind)}>
                {kinds.map(k => <option key={k} value={k}>{ABSENCE_KIND_LABELS[k]}</option>)}
              </Select>
            )}
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Início" required>{p => <Input {...p} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />}</Field>
          <Field label="Fim" required error={endDate < startDate ? 'Antes do início.' : undefined}>
            {p => <Input {...p} type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />}
          </Field>
        </div>

        {type === 'vacation' && (
          <div className="rounded-sm border border-line bg-concrete/60 p-4 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="text-steel">Dias corridos pedidos</span>
              <span className="num font-display text-3xl leading-none font-semibold text-ink">{days}</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-steel">Saldo disponível</span>
              <span className="num font-semibold text-ink">{balance.data ? `${balance.data.available} dias` : '…'}</span>
            </div>
            <p className="mt-3 text-[13px] text-steel">
              Regras da CLT: cada parte com pelo menos 5 dias, uma delas com 14 ou mais, até 3 partes por período, sem começar na
              sexta ou no sábado. O sistema confere tudo ao enviar.
            </p>
          </div>
        )}

        {type === 'absence' && kind === 'medical' && !onBehalf && (
          <Field label="Atestado (opcional)" hint="Fica guardado como documento sensível: só você e o RH veem.">
            {() => <FileInput file={attachment} onChange={setAttachment} accept=".pdf,.png,.jpg,.jpeg,.webp" hint="PDF ou foto, até 10 MB." />}
          </Field>
        )}

        <Field label="Observações">{p => <Textarea {...p} value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} />}</Field>
        <button type="submit" hidden />
      </form>
    </Drawer>
  )
}

// ---------- saldo de férias ----------

export function VacationBalanceCard({ balance }: { balance: VacationBalance | undefined }) {
  if (!balance) return <Skeleton className="h-40" />
  const periods = balance.periods.filter(p => p.complete && (p.remaining > 0 || p.pending > 0)).reverse()
  const current = balance.periods.find(p => !p.complete)
  return (
    <section className="overflow-hidden rounded-md border border-line bg-paper">
      <div className="flex items-end justify-between gap-4 bg-ink px-6 py-5">
        <div>
          <p className="text-sm text-steel-soft">Saldo de férias</p>
          <p className="num font-display text-[64px] leading-[0.9] font-semibold text-brand">{balance.available}</p>
        </div>
        <p className="mb-1 text-right text-sm text-paper/80">dias disponíveis</p>
      </div>
      <ul className="divide-y divide-line">
        {periods.map(p => {
          const used = p.entitled - p.remaining
          return (
            <li key={p.start} className="px-6 py-3.5 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-ink">Período {formatDate(p.start)} a {formatDate(p.end)}</span>
                <span className="num text-steel">{p.remaining} de {p.entitled} dias</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-[2px] bg-concrete">
                <motion.div
                  className="h-full bg-ink"
                  initial={{ width: 0 }}
                  animate={{ width: `${p.entitled ? (used / p.entitled) * 100 : 0}%` }}
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <p className={cn('mt-1.5 text-[13px]', p.deadline < todayIso() ? 'font-medium text-danger' : p.deadline <= addDaysIso(todayIso(), 60) ? 'font-medium text-ink' : 'text-steel')}>
                {p.deadline < todayIso() ? `Prazo vencido em ${formatDate(p.deadline)}: pagamento em dobro (CLT art. 137)` : `Tire até ${formatDate(p.deadline)}`}
                {p.pending > 0 && `, ${p.pending} dias aguardando aprovação`}
                {p.unjustifiedAbsences > 5 && `, reduzido por ${p.unjustifiedAbsences} faltas (CLT art. 130)`}
              </p>
            </li>
          )
        })}
        {current && (
          <li className="px-6 py-3.5 text-[13px] text-steel">
            Próximo período completa em {formatDate(current.end)}.
          </li>
        )}
      </ul>
    </section>
  )
}

// ---------- calendário (linha do tempo do mês) ----------

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export function TimelineCalendar({ onOpen }: { onOpen: (id: string) => void }) {
  const today = todayIso()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [y, m] = month.split('-').map(Number) as [number, number]
  const first = `${month}-01`
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const last = `${month}-${String(daysInMonth).padStart(2, '0')}`
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1))
    setMonth(d.toISOString().slice(0, 7))
  }

  const query = useQuery({
    queryKey: ['calendar', month],
    queryFn: () => api<CalendarItem[]>('/calendar', { query: { from: first, to: last } }),
    placeholderData: previous => previous,
  })

  const rows = useMemo(() => {
    const byPerson = new Map<string, { name: string; department: string | null; items: CalendarItem[] }>()
    for (const item of query.data ?? []) {
      const row = byPerson.get(item.employeeId) ?? { name: item.employeeName, department: item.departmentName, items: [] }
      row.items.push(item)
      byPerson.set(item.employeeId, row)
    }
    return [...byPerson.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))
  }, [query.data])

  const dayIndex = (iso: string) => Math.min(daysInMonth, Math.max(1, iso < first ? 1 : iso > last ? daysInMonth : Number(iso.slice(8))))
  const weekend = (day: number) => [0, 6].includes(new Date(Date.UTC(y, m - 1, day)).getUTCDay())
  const todayDay = today.startsWith(month) ? Number(today.slice(8)) : null
  const grid = { gridTemplateColumns: `200px repeat(${daysInMonth}, minmax(22px, 1fr))` }

  return (
    <section className="rounded-md border border-line bg-paper">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => shift(-1)} aria-label="Mês anterior"><ChevronLeft className="size-4" /></Button>
          <h2 className="min-w-44 text-center font-display text-xl font-semibold text-ink">
            {MONTHS[m - 1]!.charAt(0).toUpperCase() + MONTHS[m - 1]!.slice(1)} de {y}
          </h2>
          <Button size="sm" variant="ghost" onClick={() => shift(1)} aria-label="Próximo mês"><ChevronRight className="size-4" /></Button>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[13px] text-steel">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-[2px] bg-brand" /> Férias</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-[2px] bg-ink" /> Ausência</span>
          <span className="flex items-center gap-1.5"><span className="pending-stripe h-2.5 w-5 rounded-[2px] border border-steel-soft" /> Aguardando</span>
        </div>
      </header>
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid border-b border-line text-center text-[11px] text-steel" style={grid}>
            <div className="sticky left-0 bg-paper px-4 py-2 text-left text-[12px]">Pessoa</div>
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => (
              <div key={day} className={cn('num py-2', weekend(day) && 'bg-concrete/70', day === todayDay && 'font-semibold text-ink')}>
                {day}
              </div>
            ))}
          </div>
          {query.isPending ? (
            <Skeleton className="m-4 h-32" />
          ) : rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-steel">Ninguém de férias ou ausente neste mês.</p>
          ) : (
            rows.map(([employeeId, row], r) => (
              <div key={employeeId} className="relative grid items-center border-b border-line last:border-0" style={grid}>
                <div className="sticky left-0 z-10 truncate bg-paper px-4 py-2.5 text-sm">
                  <span className="block truncate text-ink">{row.name}</span>
                  <span className="block truncate text-[12px] text-steel">{row.department ?? 'Sem departamento'}</span>
                </div>
                {Array.from({ length: daysInMonth }, (_, i) => (
                  <div key={i} className={cn('h-full', weekend(i + 1) && 'bg-concrete/70')} style={{ gridColumn: i + 2, gridRow: 1 }} />
                ))}
                {todayDay && <div className="pointer-events-none h-full w-px justify-self-center bg-danger/60" style={{ gridColumn: todayDay + 1, gridRow: 1 }} aria-hidden />}
                {row.items.map(item => (
                  <motion.button
                    key={item.id}
                    type="button"
                    onClick={() => onOpen(item.id)}
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: r * 0.04 }}
                    style={{ gridColumn: `${dayIndex(item.startDate) + 1} / ${dayIndex(item.endDate) + 2}`, gridRow: 1, transformOrigin: 'left' }}
                    title={`${requestLabel(item)}: ${periodLabel(item)}`}
                    className={cn(
                      'z-[1] mx-px h-6 truncate rounded-[3px] px-1.5 text-left text-[11px] font-medium transition-[filter] hover:brightness-95 focus-visible:z-20',
                      item.status === 'pending'
                        ? 'pending-stripe border border-steel-soft text-ink'
                        : item.type === 'vacation'
                          ? 'bg-brand text-ink'
                          : 'bg-ink text-paper',
                    )}
                  >
                    {item.days >= 3 ? requestLabel(item) : <span className="sr-only">{requestLabel(item)}</span>}
                  </motion.button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}

