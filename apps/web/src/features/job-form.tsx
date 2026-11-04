import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Rocket, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { can, CONTRACT_TYPE_LABELS, CONTRACT_TYPES, jobInput, WORK_MODE_LABELS, WORK_MODES, type JobInput } from '@falcao-rh/contracts'

import { Button } from '../components/ui/button'
import { Drawer } from '../components/ui/drawer'
import { CheckCard, Field, Input, Select, Textarea } from '../components/ui/field'
import { api, ApiError } from '../lib/api'
import { cn } from '../lib/cn'
import { orgQueries } from '../lib/queries'
import { useMe } from '../lib/session'
import type { JobDetail, Member } from '../lib/types'

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')

type Question = { id?: string; kind: 'text' | 'yes_no' | 'choice'; label: string; options: string; required: boolean }
type FormState = {
  title: string
  departmentId: string
  contractType: (typeof CONTRACT_TYPES)[number]
  workMode: (typeof WORK_MODES)[number]
  city: string
  state: string
  salaryMin: string
  salaryMax: string
  showSalary: boolean
  openings: string
  managerUserId: string
  visibility: 'public' | 'unlisted'
  description: string
  requirements: string
  benefits: string
  questions: Question[]
}

const empty: FormState = {
  title: '',
  departmentId: '',
  contractType: 'clt',
  workMode: 'site',
  city: '',
  state: 'PE',
  salaryMin: '',
  salaryMax: '',
  showSalary: false,
  openings: '1',
  managerUserId: '',
  visibility: 'public',
  description: '',
  requirements: '',
  benefits: '',
  questions: [],
}

const fromJob = (job: JobDetail): FormState => ({
  title: job.title,
  departmentId: job.departmentId ?? '',
  contractType: job.contractType,
  workMode: job.workMode,
  city: job.city,
  state: job.state ?? '',
  salaryMin: job.salaryMin === null ? '' : String(job.salaryMin),
  salaryMax: job.salaryMax === null ? '' : String(job.salaryMax),
  showSalary: job.showSalary,
  openings: String(job.openings),
  managerUserId: job.managerUserId ?? '',
  visibility: job.visibility,
  description: job.description,
  requirements: job.requirements,
  benefits: job.benefits,
  questions: job.questions.map(q => ({ id: q.id, kind: q.kind, label: q.label, options: (q.options ?? []).join('\n'), required: q.required })),
})

const money = (value: string) => (value.trim() === '' ? null : Number(value.replace(/\./g, '').replace(',', '.')))

const toInput = (form: FormState) =>
  jobInput.safeParse({
    title: form.title,
    departmentId: form.departmentId || null,
    contractType: form.contractType,
    workMode: form.workMode,
    city: form.city,
    state: form.state || undefined,
    salaryMin: money(form.salaryMin),
    salaryMax: money(form.salaryMax),
    showSalary: form.showSalary,
    openings: Number(form.openings),
    managerUserId: form.managerUserId || null,
    visibility: form.visibility,
    description: form.description,
    requirements: form.requirements,
    benefits: form.benefits,
    questions: form.questions.map(q => ({
      ...(q.id ? { id: q.id } : {}),
      kind: q.kind,
      label: q.label,
      required: q.required,
      ...(q.kind === 'choice' ? { options: q.options.split('\n').map(o => o.trim()).filter(Boolean) } : {}),
    })),
  })

/**
 * Cadastro e edição de vaga. Nova vaga nasce como rascunho; "Salvar e
 * publicar" já coloca na página de vagas.
 */
export function JobFormDrawer({ open, onOpenChange, job }: { open: boolean; onOpenChange: (open: boolean) => void; job?: JobDetail }) {
  const me = useMe()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(job ? fromJob(job) : empty)
  const departments = useQuery({ ...orgQueries.departments, enabled: open })
  const members = useQuery({
    queryKey: ['members'],
    queryFn: () => api<Member[]>('/members'),
    enabled: open && can(me.role, 'users.manage'),
  })
  const managers = (members.data ?? []).filter(m => m.status === 'active' && m.role !== 'employee')

  useEffect(() => {
    if (open) setForm(job ? fromJob(job) : empty)
  }, [open, job])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(current => ({ ...current, [key]: value }))
  const parsed = toInput(form)
  const issue = parsed.success ? null : parsed.error.issues[0]

  const save = useMutation({
    mutationFn: async ({ input, publish }: { input: JobInput; publish: boolean }) => {
      const saved = job
        ? await api<JobDetail>(`/jobs/${job.id}`, { method: 'PUT', body: input })
        : await api<JobDetail>('/jobs', { method: 'POST', body: input })
      return publish ? api<JobDetail>(`/jobs/${saved.id}/status`, { method: 'POST', body: { status: 'published' } }) : saved
    },
    onSuccess: async (saved, { publish }) => {
      await queryClient.invalidateQueries({ queryKey: ['jobs'] })
      if (publish)
        toast.success('Vaga publicada na página de vagas.', {
          action: { label: 'Copiar link', onClick: () => void navigator.clipboard.writeText(saved.shareUrl) },
        })
      else toast.success(job ? 'Vaga atualizada.' : 'Rascunho salvo. Publique quando estiver pronta.')
      onOpenChange(false)
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar a vaga.'),
  })

  const submit = (publish: boolean) => (event?: FormEvent) => {
    event?.preventDefault()
    if (parsed.success) save.mutate({ input: parsed.data, publish })
  }
  const canPublishNow = !job || job.status === 'draft'

  const setQuestion = (index: number, patch: Partial<Question>) => set('questions', form.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)))
  const moveQuestion = (index: number, delta: number) => {
    const next = [...form.questions]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item!)
    set('questions', next)
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={job ? 'Editar vaga' : 'Nova vaga'}
      description={job ? `Situação: ${job.status === 'draft' ? 'rascunho' : job.status === 'published' ? 'publicada' : job.status === 'paused' ? 'pausada' : 'encerrada'}.` : 'Começa como rascunho; os candidatos só veem depois de publicada.'}
      footer={
        <>
          {issue && <p className="mr-auto self-center text-[12.5px] text-danger">{issue.message}</p>}
          <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit(false)} disabled={!parsed.success} loading={save.isPending && !save.variables?.publish}>
            {job ? 'Salvar' : 'Salvar rascunho'}
          </Button>
          {canPublishNow && (
            <Button variant="primary" onClick={submit(true)} disabled={!parsed.success || !form.city || !form.state} loading={save.isPending && save.variables?.publish}>
              <Rocket className="size-4" aria-hidden /> Salvar e publicar
            </Button>
          )}
        </>
      }
    >
      <form onSubmit={submit(false)} className="flex flex-col gap-5">
        <Field label="Título da vaga" required hint="Como o candidato vai procurar. Ex.: Pedreiro de acabamento">
          {p => <Input {...p} value={form.title} maxLength={120} onChange={e => set('title', e.target.value)} />}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Departamento">
            {p => (
              <Select {...p} value={form.departmentId} onChange={e => set('departmentId', e.target.value)}>
                <option value="">Sem departamento</option>
                {departments.data?.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Posições abertas" required>
            {p => <Input {...p} type="number" min={1} max={99} value={form.openings} onChange={e => set('openings', e.target.value)} />}
          </Field>
          <Field label="Tipo de contrato" required>
            {p => (
              <Select {...p} value={form.contractType} onChange={e => set('contractType', e.target.value as FormState['contractType'])}>
                {CONTRACT_TYPES.map(t => (
                  <option key={t} value={t}>
                    {CONTRACT_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Regime" required>
            {p => (
              <Select {...p} value={form.workMode} onChange={e => set('workMode', e.target.value as FormState['workMode'])}>
                {WORK_MODES.map(m => (
                  <option key={m} value={m}>
                    {WORK_MODE_LABELS[m]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <div className="grid grid-cols-[1fr_110px] gap-4">
          <Field label="Cidade" required hint="Obrigatória para publicar.">
            {p => <Input {...p} value={form.city} onChange={e => set('city', e.target.value)} />}
          </Field>
          <Field label="UF" required>
            {p => (
              <Select {...p} value={form.state} onChange={e => set('state', e.target.value)}>
                <option value="">—</option>
                {UFS.map(uf => (
                  <option key={uf}>{uf}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <div className="rounded-md border border-line bg-sunken/60 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Salário mínimo (R$)">
              {p => <Input {...p} inputMode="decimal" value={form.salaryMin} placeholder="2.500" onChange={e => set('salaryMin', e.target.value)} />}
            </Field>
            <Field label="Salário máximo (R$)">
              {p => <Input {...p} inputMode="decimal" value={form.salaryMax} placeholder="3.200" onChange={e => set('salaryMax', e.target.value)} />}
            </Field>
          </div>
          <div className="mt-3">
            <CheckCard checked={form.showSalary} onChange={checked => set('showSalary', checked)} label="Mostrar a faixa salarial na página de vagas" />
          </div>
        </div>

        {managers.length > 0 && (
          <Field label="Gestor responsável" hint="Acompanha os candidatos desta vaga e recebe os avisos.">
            {p => (
              <Select {...p} value={form.managerUserId} onChange={e => set('managerUserId', e.target.value)}>
                <option value="">Sem gestor</option>
                {managers.map(m => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <fieldset>
          <legend className="mb-2 text-[13.5px] font-medium text-ink-soft">Quem pode ver</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ['public', Eye, 'Pública', 'Aparece na lista da página de vagas.'],
                ['unlisted', EyeOff, 'Não listada', 'Só quem recebe o link consegue se candidatar.'],
              ] as const
            ).map(([value, Icon, label, hint]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={form.visibility === value}
                onClick={() => set('visibility', value)}
                className={cn(
                  'rounded-md border px-4 py-3 text-left transition-all duration-200',
                  form.visibility === value ? 'border-night bg-night text-snow shadow-lift' : 'border-line-strong bg-paper hover:border-steel-soft',
                )}
              >
                <Icon className={cn('mb-1.5 size-4', form.visibility === value ? 'text-brand' : 'text-steel')} aria-hidden />
                <span className="block font-medium">{label}</span>
                <span className={cn('block text-[12.5px]', form.visibility === value ? 'text-fog' : 'text-steel')}>{hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <Field label="Sobre a vaga" required hint="O dia a dia, a obra ou o setor. Deixe uma linha em branco entre parágrafos.">
          {p => <Textarea {...p} value={form.description} onChange={e => set('description', e.target.value)} className="min-h-32" />}
        </Field>
        <Field label="Requisitos" hint="Um por linha.">
          {p => <Textarea {...p} value={form.requirements} onChange={e => set('requirements', e.target.value)} placeholder={'NR-35 válida\nExperiência em obra vertical'} />}
        </Field>
        <Field label="Benefícios" hint="Um por linha.">
          {p => <Textarea {...p} value={form.benefits} onChange={e => set('benefits', e.target.value)} placeholder={'Plano de saúde\nVale-alimentação'} />}
        </Field>

        <section className="flex flex-col gap-3">
          <div>
            <h3 className="eyebrow">Perguntas para o candidato</h3>
            <p className="mt-1 text-[12.5px] text-steel">Ajudam na triagem. Ex.: "Tem NR-35 válida?"</p>
          </div>
          {form.questions.map((question, index) => (
            <div key={question.id ?? index} className="flex gap-3 rounded-md border border-line bg-sunken/60 p-4">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Input value={question.label} placeholder="Pergunta" aria-label={`Pergunta ${index + 1}`} onChange={e => setQuestion(index, { label: e.target.value })} />
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    aria-label="Tipo de resposta"
                    value={question.kind}
                    onChange={e => setQuestion(index, { kind: e.target.value as Question['kind'] })}
                    className="h-9 w-auto"
                  >
                    <option value="yes_no">Sim ou não</option>
                    <option value="choice">Múltipla escolha</option>
                    <option value="text">Resposta curta</option>
                  </Select>
                  <label className="inline-flex items-center gap-2 text-[13px] text-ink-soft">
                    <input type="checkbox" checked={question.required} onChange={e => setQuestion(index, { required: e.target.checked })} className="size-4 accent-[var(--color-ink)]" />
                    Obrigatória
                  </label>
                </div>
                {question.kind === 'choice' && (
                  <Textarea
                    value={question.options}
                    aria-label="Opções"
                    placeholder={'Uma opção por linha\nMenos de 2 anos\nMais de 2 anos'}
                    onChange={e => setQuestion(index, { options: e.target.value })}
                    className="min-h-20"
                  />
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                <Button size="icon" variant="ghost" aria-label="Subir" disabled={index === 0} onClick={() => moveQuestion(index, -1)}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label="Descer" disabled={index === form.questions.length - 1} onClick={() => moveQuestion(index, 1)}>
                  <ArrowDown className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label="Remover pergunta" onClick={() => set('questions', form.questions.filter((_, i) => i !== index))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            className="self-start"
            disabled={form.questions.length >= 10}
            onClick={() => set('questions', [...form.questions, { kind: 'yes_no', label: '', options: '', required: false }])}
          >
            <Plus className="size-4" aria-hidden /> Adicionar pergunta
          </Button>
        </section>
        <button type="submit" hidden />
      </form>
    </Drawer>
  )
}
