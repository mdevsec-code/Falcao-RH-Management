import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  BadgeCheck,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleDashed,
  CircleSlash,
  Globe2,
  Plane,
  Plus,
  Search,
  UserRoundPlus,
  type LucideIcon,
} from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { toast } from 'sonner'

import {
  FOREIGN_PHASES,
  FOREIGN_STEP_STATUS_LABELS,
  foreignProcess,
  type ForeignCandidate,
  type ForeignPhase,
  type ForeignProcess,
  type ForeignStepKey,
  type ForeignStepStatus,
} from '@falcao-rh/contracts'

import { Hoverable, KpiCard, SpotlightGrid } from '../components/kpi'
import { CountUp, Ring } from '../components/motion'
import { Button } from '../components/ui/button'
import { Drawer } from '../components/ui/drawer'
import { CheckCard, Field, Input } from '../components/ui/field'
import { Avatar, Badge, EmptyState, ErrorState, PageHeader, Panel, Segmented, SkeletonKpis, SkeletonList, SkeletonText } from '../components/ui/layout'
import { api, ApiError } from '../lib/api'
import { cn } from '../lib/cn'
import { todayIso } from '../lib/format'
import { useCan } from '../lib/session'
import type { CandidateListItem, Page } from '../lib/types'

type ForeignRow = {
  id: string
  fullName: string
  email: string
  phone: string
  city: string
  state: string | null
  foreign: ForeignCandidate
  jobTitle: string | null
  stage: string | null
}
type Person = ForeignRow & { process: ForeignProcess }

const foreignQuery = { queryKey: ['candidates-foreign'], queryFn: () => api<ForeignRow[]>('/candidates/foreign') }
const phaseLabel = (key: ForeignPhase) => FOREIGN_PHASES.find(p => p.key === key)!.label
const br = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—')
const percentFormat = (n: number) => `${Math.round(n)}%`

const STATUS_ICON: Record<ForeignStepStatus, LucideIcon> = { pending: Circle, in_progress: CircleDashed, done: CheckCircle2, na: CircleSlash }
const STATUS_TONE: Record<ForeignStepStatus, string> = { pending: 'text-steel-soft', in_progress: 'text-brand-ink', done: 'text-ok', na: 'text-steel-soft' }

/**
 * Triagem de estrangeiros: o que falta para cada pessoa poder trabalhar
 * (documentos, autorização no MJSP, visto, RNM, admissão e conformidade).
 */
export function ForeignWorkersPage() {
  const query = useQuery(foreignQuery)
  const manage = useCan('recruitment.manage')
  const [phase, setPhase] = useState<ForeignPhase | 'alerts' | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const today = todayIso()

  const people = useMemo<Person[]>(
    () =>
      (query.data ?? [])
        .map(r => ({ ...r, process: foreignProcess(r.foreign, today) }))
        // Quem tem alerta grave primeiro, depois quem está mais atrás no processo.
        .sort((a, b) => Number(b.process.alerts.some(x => x.tone === 'danger')) - Number(a.process.alerts.some(x => x.tone === 'danger')) || a.process.progress - b.process.progress),
    [query.data, today],
  )
  const shown = people.filter(p => (phase === 'alerts' ? p.process.alerts.length > 0 : phase ? p.process.phase === phase && !p.process.ready : true))
  const open = people.find(p => p.id === openId) ?? null

  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />

  const ready = people.filter(p => p.process.ready)
  const danger = people.filter(p => p.process.alerts.some(a => a.tone === 'danger'))
  const rnmSoon = people.filter(p => p.process.rnmDaysLeft !== null && p.process.rnmDaysLeft <= 30)
  const avg = people.length ? people.reduce((s, p) => s + p.process.progress, 0) / people.length : 0

  return (
    <>
      <PageHeader
        eyebrow="Recrutamento"
        title="Estrangeiros"
        description="Triagem de cada pessoa contratada fora do Brasil: documentos, autorização de residência, visto, RNM e admissão, com os prazos que geram multa."
        actions={
          manage && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <UserRoundPlus className="size-4" aria-hidden /> Adicionar pessoa
            </Button>
          )
        }
      />

      {query.isPending ? (
        <div className="flex flex-col gap-6">
          <SkeletonKpis />
          <SkeletonList rows={4} />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <SpotlightGrid className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              icon={Globe2}
              tone="ink"
              label="Em processo"
              value={<CountUp value={people.length - ready.length} />}
              note={`Progresso médio de ${Math.round(avg * 100)}% · ${people.length} no total`}
              aside={<Ring value={avg} size={58} thickness={7} track="var(--color-sunken)" />}
              details={{
                title: 'Pessoas por fase',
                rows: FOREIGN_PHASES.map(ph => {
                  const n = people.filter(p => !p.process.ready && p.process.phase === ph.key).length
                  return { label: ph.label, value: String(n), share: people.length ? n / people.length : 0, color: 'var(--color-brand)' }
                }),
              }}
            />
            <KpiCard
              icon={BadgeCheck}
              tone="ok"
              label="Prontos para trabalhar"
              value={<CountUp value={ready.length} />}
              note="Documentos, autorização, visto, RNM e admissão concluídos"
              details={{ title: 'Quem já pode trabalhar', rows: ready.map(p => ({ label: p.fullName, value: p.jobTitle ?? '—', tone: 'ok' as const })) }}
            />
            <KpiCard
              icon={AlertTriangle}
              tone={danger.length ? 'danger' : 'ok'}
              label="Alertas graves"
              value={<CountUp value={danger.length} />}
              note={danger.length ? 'Prazo vencido, trabalho sem autorização ou admissão sem RNM' : 'Nenhum risco grave agora'}
              details={{ title: 'O que está em risco', rows: danger.map(p => ({ label: p.fullName, value: p.process.alerts.find(a => a.tone === 'danger')!.message, tone: 'danger' as const })) }}
            />
            <KpiCard
              icon={CalendarClock}
              tone={rnmSoon.some(p => (p.process.rnmDaysLeft ?? 0) < 0) ? 'danger' : rnmSoon.length ? 'warn' : 'ok'}
              label="RNM com prazo em 30 dias"
              value={<CountUp value={rnmSoon.length} />}
              note="90 dias após a entrada no Brasil; depois, multa diária"
              details={{
                title: 'Prazo do RNM',
                rows: rnmSoon.map(p => ({
                  label: p.fullName,
                  value: p.process.rnmDaysLeft! < 0 ? `vencido há ${-p.process.rnmDaysLeft!} dias` : `${p.process.rnmDaysLeft} dias · até ${br(p.process.rnmDeadline)}`,
                  tone: p.process.rnmDaysLeft! < 0 ? ('danger' as const) : undefined,
                })),
              }}
            />
          </SpotlightGrid>

          <PhaseBar people={people} value={phase} onChange={setPhase} />

          {people.length === 0 ? (
            <EmptyState icon={Plane} title="Nenhum estrangeiro em processo">
              Use “Adicionar pessoa” para começar a triagem de um candidato do banco de talentos.
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-3">
              {shown.map(p => (
                <PersonRow key={p.id} person={p} onOpen={() => setOpenId(p.id)} />
              ))}
              {shown.length === 0 && <li className="surface p-6 text-center text-sm text-steel">Ninguém nesta fase.</li>}
            </ul>
          )}

          <Guide />
        </div>
      )}

      {open && <ProcessDrawer person={open} canEdit={manage} onClose={() => setOpenId(null)} />}
      {adding && <AddDrawer onClose={() => setAdding(false)} onAdded={id => setOpenId(id)} />}
    </>
  )
}

/** Fases do processo como trilha: quantas pessoas estão em cada uma; clique filtra. */
function PhaseBar({ people, value, onChange }: { people: Person[]; value: ForeignPhase | 'alerts' | null; onChange: (v: ForeignPhase | 'alerts' | null) => void }) {
  const withAlerts = people.filter(p => p.process.alerts.length).length
  const items = [
    ...FOREIGN_PHASES.filter(ph => ph.key !== 'conformidade').map(ph => ({ key: ph.key as ForeignPhase | 'alerts', label: ph.label, n: people.filter(p => !p.process.ready && p.process.phase === ph.key).length })),
    { key: 'alerts' as const, label: 'Com alerta', n: withAlerts },
  ]
  return (
    <section data-reveal className="surface p-2" aria-label="Fases do processo">
      <ol className="grid gap-1 sm:grid-cols-3 xl:grid-cols-6">
        {items.map((it, i) => {
          const active = value === it.key
          return (
            <li key={it.key}>
              <button
                type="button"
                onClick={() => onChange(active ? null : it.key)}
                aria-pressed={active}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors',
                  active ? 'bg-night text-snow' : 'hover:bg-sunken',
                )}
              >
                <span
                  className={cn(
                    'num flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold transition-transform duration-500 group-hover:scale-110',
                    it.key === 'alerts' ? (it.n ? 'bg-danger text-snow' : 'bg-ok-soft text-ok') : active ? 'bg-brand text-night' : 'bg-sunken text-ink',
                  )}
                >
                  {it.key === 'alerts' ? <AlertTriangle className="size-4" aria-hidden /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className={cn('block text-[13px] leading-tight font-medium', active ? 'text-snow' : 'text-ink')}>{it.label}</span>
                  <span className={cn('num block text-[12px]', active ? 'text-fog' : 'text-steel')}>
                    <CountUp value={it.n} /> {it.n === 1 ? 'pessoa' : 'pessoas'}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function PersonRow({ person: p, onOpen }: { person: Person; onOpen: () => void }) {
  const { process: pr, foreign: f } = p
  const top = pr.alerts[0]
  return (
    <li data-reveal-row>
      <Hoverable
        details={{
          title: `${p.fullName}: ${pr.done} de ${pr.total} etapas`,
          rows: FOREIGN_PHASES.map(ph => {
            const steps = pr.steps.filter(s => s.phase === ph.key && s.status !== 'na')
            const done = steps.filter(s => s.status === 'done').length
            return { label: ph.label, value: `${done}/${steps.length}`, share: steps.length ? done / steps.length : 1, color: done === steps.length ? 'var(--color-ok)' : 'var(--color-brand)' }
          }),
          hint: pr.alerts.length > 1 ? `Mais ${pr.alerts.length - 1} alerta(s) na ficha.` : undefined,
        }}
      >
        <button
          type="button"
          onClick={onOpen}
          className="surface group flex w-full flex-wrap items-center gap-x-6 gap-y-3 p-4 text-left transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-lift sm:flex-nowrap"
        >
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar name={p.fullName} />
            <span className="min-w-0">
              <span className="block truncate font-semibold text-ink">{p.fullName}</span>
              <span className="block truncate text-[12.5px] text-steel">
                {f.nationality}
                {p.jobTitle ? ` · ${p.jobTitle}` : ''}
                {f.consulate ? ` · ${f.consulate}` : ''}
              </span>
            </span>
          </span>

          <span className="w-full sm:w-56">
            <span className="flex items-center justify-between text-[12px]">
              <span className="text-steel">{pr.ready ? 'Pronto para trabalhar' : phaseLabel(pr.phase)}</span>
              <span className="num font-semibold text-ink">{Math.round(pr.progress * 100)}%</span>
            </span>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-sunken">
              <span className={cn('funnel-bar block h-full rounded-full', pr.ready ? 'bg-ok' : 'bg-brand')} style={{ width: `${pr.progress * 100}%` }} />
            </span>
          </span>

          <span className="min-w-0 sm:w-72">
            {top ? (
              <span className={cn('flex items-start gap-1.5 text-[12.5px] leading-snug', top.tone === 'danger' ? 'text-danger' : 'text-brand-ink')}>
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span className="line-clamp-2">{top.message}</span>
              </span>
            ) : pr.next ? (
              <span className="block text-[12.5px] leading-snug text-steel">
                <span className="text-steel-soft">Próximo: </span>
                <span className="font-medium text-ink">{pr.next.label}</span>
              </span>
            ) : (
              <Badge tone="ok">Tudo em dia</Badge>
            )}
          </span>

          <ChevronRight className="size-4 shrink-0 text-steel transition-transform group-hover:translate-x-0.5" aria-hidden />
        </button>
      </Hoverable>
    </li>
  )
}

// ---------- ficha do processo ----------

function ProcessDrawer({ person, canEdit, onClose }: { person: Person; canEdit: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ForeignCandidate>(person.foreign)
  const pr = foreignProcess(form, todayIso())
  const set = <K extends keyof ForeignCandidate>(key: K, value: ForeignCandidate[K]) => setForm(f => ({ ...f, [key]: value }))
  const setStep = (key: ForeignStepKey, patch: Partial<{ status: ForeignStepStatus; date: string | null; note: string }>) =>
    setForm(f => ({ ...f, steps: { ...f.steps, [key]: { status: 'pending', date: null, note: '', ...f.steps[key], ...patch } } }))

  const save = useMutation({
    mutationFn: () => api(`/candidates/${person.id}/foreign`, { method: 'PUT', body: { foreign: form } }),
    onSuccess: async () => {
      toast.success('Processo atualizado.')
      await queryClient.invalidateQueries({ queryKey: foreignQuery.queryKey })
      onClose()
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar.'),
  })

  const date = (key: 'authorizationPublishedAt' | 'arrivalDate' | 'rnmAppointmentAt' | 'visaExpiresAt') => (
    <Input type="date" value={form[key] ?? ''} disabled={!canEdit} onChange={e => set(key, e.target.value || null)} />
  )

  return (
    <Drawer
      open
      onOpenChange={o => !o && onClose()}
      title={person.fullName}
      description={`${form.nationality} · ${pr.done} de ${pr.total} etapas concluídas`}
      footer={
        canEdit && (
          <>
            <Button onClick={onClose}>Cancelar</Button>
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
              Salvar processo
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-6">
        {pr.alerts.length > 0 && (
          <ul className="flex flex-col gap-2">
            {pr.alerts.map(a => (
              <li
                key={a.message}
                className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]', a.tone === 'danger' ? 'border-danger/25 bg-danger-soft text-danger' : 'border-brand-strong/30 bg-warn-soft text-brand-ink')}
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {a.message}
              </li>
            ))}
          </ul>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Nacionalidade" required>
            {p => <Input {...p} value={form.nationality} disabled={!canEdit} onChange={e => set('nationality', e.target.value)} />}
          </Field>
          <Field label="Consulado do visto" hint="Pequim, Xangai, Cantão ou Hong Kong">
            {p => <Input {...p} value={form.consulate} disabled={!canEdit} onChange={e => set('consulate', e.target.value)} />}
          </Field>
          <Field label="Passaporte">{p => <Input {...p} value={form.passport} disabled={!canEdit} onChange={e => set('passport', e.target.value)} />}</Field>
          <Field label="RNM">{p => <Input {...p} value={form.rnm} disabled={!canEdit} onChange={e => set('rnm', e.target.value)} />}</Field>
          <Field label="Autorização publicada no DOU em">{() => date('authorizationPublishedAt')}</Field>
          <Field label="Entrada no Brasil em" hint={pr.rnmDeadline ? `Prazo do RNM: ${br(pr.rnmDeadline)}` : 'O prazo do RNM conta daqui (90 dias)'}>
            {() => date('arrivalDate')}
          </Field>
          <Field label="Atendimento na PF agendado para">{() => date('rnmAppointmentAt')}</Field>
          <Field label="Visto ou residência vence em">{() => date('visaExpiresAt')}</Field>
          <div className="sm:col-span-2">
            <CheckCard
              checked={form.regulatedProfession}
              onChange={v => canEdit && set('regulatedProfession', v)}
              label="Profissão regulamentada (engenharia, técnico)"
              description="Inclui o registro temporário no CREA nas etapas."
            />
          </div>
        </section>

        {FOREIGN_PHASES.map(ph => {
          const steps = pr.steps.filter(s => s.phase === ph.key)
          const done = steps.filter(s => s.status === 'done' || s.status === 'na').length
          return (
            <section key={ph.key}>
              <h3 className="mb-2 flex items-center justify-between gap-3 text-[13px] font-semibold tracking-[0.08em] text-steel uppercase">
                {ph.label}
                <span className={cn('num rounded-full px-2 py-0.5 text-[11.5px] tracking-normal', done === steps.length ? 'bg-ok-soft text-ok' : 'bg-sunken text-ink')}>
                  {done}/{steps.length}
                </span>
              </h3>
              <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
                {steps.map(s => {
                  const Icon = STATUS_ICON[s.status]
                  return (
                    <li key={s.key} className={cn('flex flex-col gap-2 px-3.5 py-3 transition-colors', s.status === 'done' && 'bg-ok-soft/30')}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <span className="flex min-w-0 items-start gap-2">
                          <Icon className={cn('mt-0.5 size-4 shrink-0', STATUS_TONE[s.status])} aria-hidden />
                          <span className="min-w-0">
                            <span className={cn('block text-[13.5px] font-medium', s.status === 'na' ? 'text-steel line-through' : 'text-ink')}>{s.label}</span>
                            {'hint' in s && s.hint && <span className="block text-[12px] leading-snug text-steel">{s.hint}</span>}
                          </span>
                        </span>
                        {canEdit ? (
                          <Segmented label={s.label} value={s.status} onChange={status => setStep(s.key, { status })} options={FOREIGN_STEP_STATUS_LABELS} />
                        ) : (
                          <Badge tone={s.status === 'done' ? 'ok' : s.status === 'in_progress' ? 'warn' : 'neutral'}>{FOREIGN_STEP_STATUS_LABELS[s.status]}</Badge>
                        )}
                      </div>
                      {canEdit && s.status !== 'na' && s.status !== 'pending' && (
                        <div className="grid gap-2 pl-6 sm:grid-cols-[10rem_1fr]">
                          <Input type="date" aria-label={`Data: ${s.label}`} value={s.date ?? ''} onChange={e => setStep(s.key, { date: e.target.value || null })} className="h-9" />
                          <Input aria-label={`Observação: ${s.label}`} placeholder="Protocolo, número, observação" value={s.note} maxLength={300} onChange={e => setStep(s.key, { note: e.target.value })} className="h-9" />
                        </div>
                      )}
                      {!canEdit && (s.date || s.note) && (
                        <p className="pl-6 text-[12px] text-steel">{[s.date && br(s.date), s.note].filter(Boolean).join(' · ')}</p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </Drawer>
  )
}

// ---------- incluir alguém do banco de talentos ----------

function AddDrawer({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [nationality, setNationality] = useState('Chinesa')
  const search = useDeferredValue(q.trim())
  const results = useQuery({
    queryKey: ['candidates', 'foreign-add', search],
    queryFn: () => api<Page<CandidateListItem>>('/candidates', { query: { q: search, consent: 'all', pageSize: 8 } }),
    enabled: search.length >= 2,
  })
  const add = useMutation({
    mutationFn: (id: string) => api(`/candidates/${id}/foreign`, { method: 'PUT', body: { foreign: { nationality } } }),
    onSuccess: async (_, id) => {
      toast.success('Pessoa incluída na triagem.')
      await queryClient.invalidateQueries({ queryKey: foreignQuery.queryKey })
      onClose()
      onAdded(id)
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível incluir.'),
  })
  return (
    <Drawer open onOpenChange={o => !o && onClose()} title="Adicionar pessoa" description="Escolha a ficha do banco de talentos para começar a triagem migratória.">
      <div className="flex flex-col gap-4">
        <Field label="Nacionalidade" required>
          {p => <Input {...p} value={nationality} onChange={e => setNationality(e.target.value)} />}
        </Field>
        <label className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-steel" aria-hidden />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome ou e-mail" aria-label="Buscar candidato" className="pl-10" autoComplete="off" />
        </label>
        {search.length < 2 ? (
          <p className="text-[13px] text-steel">Digite ao menos 2 letras.</p>
        ) : results.isPending ? (
          <SkeletonText lines={4} className="py-2" />
        ) : (results.data?.items ?? []).length === 0 ? (
          <p className="text-[13px] text-steel">Nenhuma ficha encontrada.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {results.data!.items.map(c => (
              <li key={c.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <Avatar name={c.fullName} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{c.fullName}</span>
                  <span className="block truncate text-[12px] text-steel">{[c.city, c.state].filter(Boolean).join('/')}</span>
                </span>
                <Button size="sm" disabled={nationality.trim().length < 2} loading={add.isPending && add.variables === c.id} onClick={() => add.mutate(c.id)}>
                  <Plus className="size-4" aria-hidden /> Incluir
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  )
}

// ---------- guia ----------

/** Resumo do processo para quem está fazendo a triagem (pesquisa de 18/11/2026). */
function Guide() {
  const items: [string, string][] = [
    ['1. Documentos de origem', 'Passaporte, antecedentes criminais (país e onde morou nos últimos 5 anos) e diploma ou comprovação de experiência, com apostila emitida na China, que aderiu à Convenção da Apostila em 07/11/2023. Tradução juramentada feita no Brasil.'],
    ['2. Autorização de residência', 'A empresa pede no MigranteWeb, ao Ministério da Justiça (CGIL), com o contrato de trabalho (RN CNIg 02/2017) e a taxa paga. Análise em até 30 dias, mais 30 se houver exigência. A aprovação sai no Diário Oficial.'],
    ['3. Visto VITEM V', 'Com a publicação no DOU, a pessoa pede o visto de trabalho no consulado da jurisdição dela na China.'],
    ['4. Chegada e RNM', 'Até 90 dias da entrada: pré-cadastro no SISMIGRA, taxa paga e atendimento na Polícia Federal com biometria. Depois do prazo, multa diária. O protocolo da PF já vale para admitir.'],
    ['5. Admissão', 'CPF, Carteira de Trabalho Digital ativada, exame admissional e eSocial. Engenheiros e técnicos precisam do registro temporário no CREA.'],
    ['Atenção', 'A isenção de visto Brasil–China de 30 dias é só para turismo e negócios e não permite trabalhar. Reter passaporte e usar visto diferente da função real foram o centro do caso BYD/Jinjiang em Camaçari (2024).'],
  ]
  return (
    <Panel title="Guia do processo" icon={BookOpen} aside={<span className="text-[13px] text-steel">Regras conferidas em novembro de 2026</span>}>
      <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2">
        {items.map(([title, text]) => (
          <div key={title}>
            <dt className={cn('text-[13.5px] font-semibold', title === 'Atenção' ? 'text-danger' : 'text-ink')}>{title}</dt>
            <dd className="mt-1 text-[13px] leading-relaxed text-steel">{text}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}
