import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { ArrowLeft, Banknote, Briefcase, Building2, Check, CircleAlert, Clock, MapPin, Send, Share2 } from 'lucide-react'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'

import { CONTRACT_TYPE_LABELS, WORK_MODE_LABELS } from '@falcao-rh/contracts'

import { RevealScope } from '../components/motion'
import { Button } from '../components/ui/button'
import { CheckCard, Field, Input } from '../components/ui/field'
import { FileInput } from '../components/ui/file-input'
import { ErrorState, Skeleton } from '../components/ui/layout'
import { ApiError } from '../lib/api'
import { cn } from '../lib/cn'
import { cpfStatus, maskCpf } from '../lib/masks'
import { gsap, MOTION, useGSAP } from '../lib/gsap'
import { Paragraphs } from './career-page-view'
import { formatSalary, postedAgo, publicApi, type PublicJobDetail, type PublicQuestion } from './public-api'
import { PublicFrame } from './public-frame'

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')

export function JobPage() {
  const { empresa, token } = useParams({ strict: false }) as { empresa: string; token: string }
  const query = useQuery({ queryKey: ['public-job', empresa, token], queryFn: () => publicApi.job(empresa, token), retry: false })
  const job = query.data

  return (
    <PublicFrame slug={empresa}>
      <RevealScope routeKey={`job-${token}`}>
        <div className="mx-auto max-w-6xl px-4 pt-8 pb-20 sm:px-6">
          <Link
            to="/vagas/$empresa"
            params={{ empresa }}
            className="group mb-6 inline-flex items-center gap-1.5 text-[13.5px] text-steel transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-1" aria-hidden /> Todas as vagas
          </Link>
          {query.isError ? (
            <ErrorState error={query.error} />
          ) : !job ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-48 rounded-xl" />
              <Skeleton className="h-96" />
            </div>
          ) : (
            <JobDetail slug={empresa} token={token} job={job} />
          )}
        </div>
      </RevealScope>
    </PublicFrame>
  )
}

function JobDetail({ slug, token, job }: { slug: string; token: string; job: PublicJobDetail }) {
  const salary = formatSalary(job.salary)
  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: job.title, url })
      else {
        await navigator.clipboard.writeText(url)
        toast.success('Link da vaga copiado.')
      }
    } catch {
      // Compartilhamento cancelado: nada a fazer.
    }
  }
  return (
    <>
      <header data-reveal className="night-glow grain relative overflow-hidden rounded-xl border border-night-line p-7 text-snow shadow-lift sm:p-10">
        <div className="blueprint pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_right,transparent,black_60%)]" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 max-w-3xl">
            <p className="text-[11px] font-medium tracking-[0.16em] text-fog uppercase">{job.departmentName ?? 'Falcão Construções e Engenharia'}</p>
            <h1 className="mt-2 font-display text-[clamp(38px,5vw,64px)] leading-[0.92] font-semibold tracking-[-0.015em]">{job.title}</h1>
            <div className="mt-5 flex flex-wrap gap-2">
              <Chip icon={MapPin}>
                {job.city}
                {job.state ? `/${job.state}` : ''}
              </Chip>
              <Chip icon={Building2}>{WORK_MODE_LABELS[job.workMode]}</Chip>
              <Chip icon={Briefcase}>{CONTRACT_TYPE_LABELS[job.contractType]}</Chip>
              {salary && <Chip icon={Banknote}>{salary}</Chip>}
              {job.publishedAt && <Chip icon={Clock}>{postedAgo(job.publishedAt)}</Chip>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="glass" onClick={share}>
              <Share2 className="size-4" aria-hidden /> Compartilhar
            </Button>
            {job.accepting && (
              <a
                href="#candidatura"
                className="inline-flex h-10 items-center gap-2 rounded-sm border border-brand-strong/70 bg-brand px-4 text-[14.5px] font-semibold text-night shadow-brand transition-transform hover:-translate-y-0.5"
              >
                Candidatar-se
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <article data-reveal className="surface flex flex-col gap-8 p-7 sm:p-9">
          <TextBlock title="Sobre a vaga">
            <div className="flex flex-col gap-3">
              <Paragraphs text={job.description} className="text-[15.5px] leading-relaxed text-ink-soft" />
            </div>
          </TextBlock>
          {job.requirements.trim() && (
            <TextBlock title="Requisitos">
              <Bullets text={job.requirements} />
            </TextBlock>
          )}
          {job.benefits.trim() && (
            <TextBlock title="Benefícios">
              <Bullets text={job.benefits} />
            </TextBlock>
          )}
        </article>

        <aside id="candidatura" className="scroll-mt-24 lg:sticky lg:top-24">
          {job.accepting ? (
            <ApplicationForm slug={slug} token={token} job={job} />
          ) : (
            <div className="surface flex items-start gap-3 p-6 text-[14.5px] text-ink-soft">
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden />
              Esta vaga não está recebendo candidaturas no momento. Veja as outras vagas abertas.
            </div>
          )}
        </aside>
      </div>
    </>
  )
}

function Chip({ icon: Icon, children }: { icon: typeof MapPin; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[13px] text-snow/90 backdrop-blur">
      <Icon className="size-3.5 text-brand" aria-hidden />
      {children}
    </span>
  )
}

function TextBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-display text-[26px] leading-none font-semibold text-ink">{title}</h2>
      {children}
    </section>
  )
}

/** Uma linha do texto do RH = um item. */
function Bullets({ text }: { text: string }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {text
        .split('\n')
        .map(line => line.replace(/^[-•*]\s*/, '').trim())
        .filter(Boolean)
        .map(line => (
          <li key={line} className="flex gap-3 text-[15px] leading-relaxed text-ink-soft">
            <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-ink">
              <Check className="size-3" strokeWidth={3} aria-hidden />
            </span>
            {line}
          </li>
        ))}
    </ul>
  )
}

// ---------- candidatura ----------

type FormState = {
  fullName: string
  email: string
  phone: string
  city: string
  state: string
  cpf: string
  linkedin: string
  talentPoolConsent: boolean
  privacyConsent: boolean
}

function ApplicationForm({ slug, token, job }: { slug: string; token: string; job: PublicJobDetail }) {
  const startedAt = useRef(Date.now())
  const [form, setForm] = useState<FormState>({
    fullName: '',
    email: '',
    phone: '',
    city: job.city,
    state: job.state ?? '',
    cpf: '',
    linkedin: '',
    talentPoolConsent: true,
    privacyConsent: false,
  })
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [file, setFile] = useState<File | null>(null)
  const [website, setWebsite] = useState('')
  const set = (key: keyof FormState) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })

  const send = useMutation({
    mutationFn: () => {
      const data = new FormData()
      for (const [key, value] of Object.entries(form)) data.append(key, String(value))
      data.append('answers', JSON.stringify(answers))
      data.append('website', website)
      data.append('startedAt', String(startedAt.current))
      data.append('file', file!)
      return publicApi.apply(slug, token, data)
    },
  })

  const missingAnswer = job.questions.some(q => q.required && !answers[q.id]?.trim())
  const cpf = cpfStatus(form.cpf)
  const valid =
    form.fullName.trim().length >= 3 &&
    /\S+@\S+\.\S+/.test(form.email) &&
    form.phone.replace(/\D/g, '').length >= 10 &&
    cpf === 'valid' &&
    form.city.trim() &&
    form.state &&
    file &&
    form.privacyConsent &&
    !missingAnswer

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (valid) send.mutate()
  }

  if (send.isSuccess) return <Success name={form.fullName} email={form.email} title={job.title} />

  return (
    <form data-reveal onSubmit={submit} className="surface overflow-hidden" noValidate>
      <div className="relative border-b border-line px-6 pt-6 pb-5">
        <span className="absolute top-0 left-6 h-[3px] w-12 rounded-b-full bg-brand" aria-hidden />
        <h2 className="font-display text-[28px] leading-none font-semibold text-ink">Candidatar-se</h2>
        <p className="mt-2 text-[13.5px] text-steel">Leva menos de 2 minutos. Não precisa criar conta.</p>
      </div>
      <div className="flex flex-col gap-4 px-6 py-6">
        <Field label="Nome completo" required>
          {p => <Input {...p} value={form.fullName} onChange={set('fullName')} autoComplete="name" />}
        </Field>
        <Field label="E-mail" required>
          {p => <Input {...p} type="email" value={form.email} onChange={set('email')} autoComplete="email" />}
        </Field>
        <Field label="Celular (WhatsApp)" required>
          {p => <Input {...p} type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="(81) 99999-9999" />}
        </Field>
        <Field
          label="CPF"
          required
          hint="Digite só os números: os pontos e o traço aparecem sozinhos."
          error={cpf === 'invalid' ? 'CPF inválido. Confira os números.' : undefined}
        >
          {p => (
            <Input
              {...p}
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              maxLength={14}
              value={form.cpf}
              onChange={e => setForm({ ...form, cpf: maskCpf(e.target.value) })}
              className="num tracking-wide"
            />
          )}
        </Field>
        <div className="grid grid-cols-[1fr_92px] gap-3">
          <Field label="Cidade" required>
            {p => <Input {...p} value={form.city} onChange={set('city')} autoComplete="address-level2" />}
          </Field>
          <Field label="UF" required>
            {p => (
              <select
                {...p}
                value={form.state}
                onChange={set('state')}
                className="h-10 w-full rounded-sm border border-line-strong bg-paper px-2 text-[14.5px] text-ink shadow-xs focus:border-ink focus:outline-none"
              >
                <option value="">—</option>
                {UFS.map(uf => (
                  <option key={uf}>{uf}</option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Field label="LinkedIn" hint="Opcional.">
          {p => <Input {...p} type="url" value={form.linkedin} onChange={set('linkedin')} placeholder="https://www.linkedin.com/in/…" />}
        </Field>

        {job.questions.map(question => (
          <QuestionField key={question.id} question={question} value={answers[question.id] ?? ''} onChange={value => setAnswers({ ...answers, [question.id]: value })} />
        ))}

        <Field label="Currículo (PDF)" required>
          {() => <FileInput file={file} onChange={setFile} accept=".pdf" hint="Somente PDF, até 10 MB." />}
        </Field>

        {/* Campo-armadilha: invisível para pessoas, preenchido por robôs. */}
        <input
          type="text"
          name="website"
          value={website}
          onChange={e => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          className="absolute -left-[9999px] size-px opacity-0"
        />

        <div className="flex flex-col gap-2 pt-1">
          <CheckCard
            checked={form.privacyConsent}
            onChange={checked => setForm({ ...form, privacyConsent: checked })}
            label="Autorizo o uso dos meus dados para este processo seletivo."
          />
          <CheckCard
            checked={form.talentPoolConsent}
            onChange={checked => setForm({ ...form, talentPoolConsent: checked })}
            label="Quero fazer parte do banco de talentos da Falcão por até 2 anos."
            description="Opcional. Você pode pedir a exclusão a qualquer momento pelo link do e-mail."
          />
        </div>

        {send.isError && (
          <p role="alert" className="flex items-start gap-2 rounded-md border border-danger/25 bg-danger-soft px-3.5 py-3 text-[13.5px] text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {send.error instanceof ApiError ? send.error.message : 'Não foi possível enviar. Tente de novo.'}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" loading={send.isPending} disabled={!valid} className="w-full">
          <Send className="size-4" aria-hidden /> Enviar candidatura
        </Button>
      </div>
    </form>
  )
}

function QuestionField({ question, value, onChange }: { question: PublicQuestion; value: string; onChange: (value: string) => void }) {
  if (question.kind === 'text')
    return (
      <Field label={question.label} required={question.required}>
        {p => <Input {...p} value={value} onChange={e => onChange(e.target.value)} />}
      </Field>
    )
  const options = question.kind === 'yes_no' ? ['sim', 'não'] : (question.options ?? [])
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13.5px] font-medium text-ink-soft">
        {question.label}
        {question.required && <span className="text-danger"> *</span>}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(option => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            onClick={() => onChange(option)}
            className={cn(
              'h-9 rounded-full border px-3.5 text-[13.5px] font-medium capitalize transition-all duration-200',
              value === option ? 'border-night bg-night text-snow shadow-card' : 'border-line-strong bg-paper text-ink-soft hover:border-steel-soft',
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/** Confirmação: o visto é desenhado (DrawSVG) e o texto sobe em seguida. */
function Success({ name, email, title }: { name: string; email: string; title: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION.ok, () => {
        gsap
          .timeline()
          .from('[data-ring]', { scale: 0.4, autoAlpha: 0, duration: 0.6, ease: 'back.out(1.8)' })
          .from('[data-check]', { drawSVG: 0, duration: 0.6, ease: 'power2.out' }, '-=0.15')
          .from('[data-success-text]', { y: 14, autoAlpha: 0, stagger: 0.08, duration: 0.6 }, '-=0.2')
      })
    },
    { scope: ref },
  )
  return (
    <div ref={ref} className="surface flex flex-col items-center px-6 py-10 text-center">
      <span data-ring className="flex size-20 items-center justify-center rounded-full bg-ok-soft ring-8 ring-ok/10">
        <svg viewBox="0 0 24 24" className="size-10 text-ok" aria-hidden>
          <path data-check d="M5 12.5 10 17.5 19 7" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <h2 data-success-text className="mt-6 font-display text-[30px] leading-none font-semibold text-ink">
        Candidatura enviada!
      </h2>
      <p data-success-text className="mt-3 text-[14.5px] leading-relaxed text-steel">
        Obrigado, {name.split(' ')[0]}. Recebemos sua candidatura para <span className="font-medium text-ink">{title}</span>. Enviamos uma confirmação
        para <span className="font-medium text-ink">{email}</span> e você será avisado de cada novidade.
      </p>
    </div>
  )
}
