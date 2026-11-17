import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { CircleCheck, FileCheck2, LoaderCircle, ShieldCheck, Upload } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { Button } from '../components/ui/button'
import { Field, Input } from '../components/ui/field'
import { ACCEPTED_DOCUMENTS } from '../components/ui/file-input'
import { ErrorState, Skeleton } from '../components/ui/layout'
import { ADMISSION_OPTIONAL, ADMISSION_REQUIRED, type ChecklistItem } from '../documents/admission-checklist'
import { ApiError } from '../lib/api'

type Address = { zip: string | null; street: string | null; number: string | null; complement: string | null; district: string | null; city: string | null; state: string | null }
type View = {
  employee: { fullName: string; socialName: string | null; birthDate: string | null; email: string | null; phone: string | null; address: Partial<Address> | null }
  documents: { id: string; title: string }[]
}

/** Rotas públicas: sem cookie de sessão nem organização no cabeçalho. */
async function publicFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/public/v1${url}`, init).catch(() => {
    throw new ApiError(0, 'network', 'Sem conexão. Verifique sua internet e tente de novo.')
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string }
    throw new ApiError(response.status, body.code ?? 'error', body.message ?? 'Não foi possível concluir.')
  }
  return (response.status === 204 ? undefined : await response.json()) as T
}

const ADDRESS = ['zip', 'street', 'number', 'complement', 'district', 'city', 'state'] as const
const ADDRESS_LABELS: Record<(typeof ADDRESS)[number], string> = {
  zip: 'CEP',
  street: 'Rua',
  number: 'Número',
  complement: 'Complemento',
  district: 'Bairro',
  city: 'Cidade',
  state: 'UF',
}
const SPAN: Record<(typeof ADDRESS)[number], string> = {
  zip: 'sm:col-span-2',
  street: 'sm:col-span-4',
  number: 'sm:col-span-2',
  complement: 'sm:col-span-2',
  district: 'sm:col-span-2',
  city: 'sm:col-span-4',
  state: 'sm:col-span-2',
}

/** Admissão digital: o novo colaborador confere os dados e envia os documentos, sem login. */
export function AdmissionPage() {
  const { token } = useParams({ strict: false }) as { token: string }
  const base = `/admission/${token}`
  const [done, setDone] = useState(false)
  const query = useQuery({ queryKey: ['admission', base], queryFn: () => publicFetch<View>(base), retry: false, enabled: !done })

  return (
    <div className="min-h-dvh bg-concrete">
      <header className="blueprint bg-ink px-5 py-8 text-paper sm:px-10">
        <div className="mx-auto max-w-3xl">
          <p className="font-display text-sm tracking-[0.2em] text-brand uppercase">Falcão · Admissão digital</p>
          <h1 className="mt-2 font-display text-[clamp(32px,5vw,52px)] leading-[0.95] font-semibold">
            {done ? 'Tudo certo!' : query.data ? `Bem-vindo(a), ${query.data.employee.fullName.split(' ')[0]}` : 'Seus dados para a admissão'}
          </h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-10">
        {done ? (
          <div className="flex flex-col items-center rounded-md border border-line bg-paper px-6 py-14 text-center">
            <CircleCheck className="size-12 text-ok" aria-hidden strokeWidth={1.5} />
            <p className="mt-4 text-lg font-medium text-ink">Recebemos seus dados e documentos.</p>
            <p className="mt-1 max-w-md text-steel">O RH vai conferir tudo e falar com você sobre os próximos passos. Pode fechar esta página.</p>
          </div>
        ) : query.isPending ? (
          <Skeleton className="h-[480px]" />
        ) : query.isError ? (
          <ErrorState error={query.error} />
        ) : (
          <AdmissionForm base={base} view={query.data} onDone={() => setDone(true)} />
        )}
      </main>
    </div>
  )
}

function AdmissionForm({ base, view, onDone }: { base: string; view: View; onDone: () => void }) {
  const e = view.employee
  const [form, setForm] = useState({ socialName: e.socialName ?? '', birthDate: e.birthDate ?? '', phone: e.phone ?? '', email: e.email ?? '' })
  const [address, setAddress] = useState<Record<string, string>>(() => Object.fromEntries(ADDRESS.map(k => [k, e.address?.[k] ?? ''])))
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm(f => ({ ...f, [key]: event.target.value }))
  const missing = ADMISSION_REQUIRED.filter(item => !view.documents.some(d => d.title === item.label))

  const submit = useMutation({
    mutationFn: () => {
      const nullify = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.trim() === '' ? null : v]))
      return publicFetch(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...nullify(form), address: nullify(address) }),
      })
    },
    onSuccess: onDone,
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível enviar.'),
  })
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    // Alguns itens não se aplicam a todos (ex.: reservista): o RH confere o que faltar.
    if (missing.length && !window.confirm(`Ainda faltam: ${missing.map(m => m.label).join(', ')}. Enviar mesmo assim?`)) return
    submit.mutate()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <p className="flex items-start gap-2 text-sm text-steel">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
        Link pessoal e seguro. Seus dados vão direto para o RH da Falcão e são tratados conforme a LGPD.
      </p>

      <section className="rounded-md border border-line bg-paper p-5">
        <h2 className="mb-4 text-[15px] font-semibold text-ink">1. Seus dados</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data de nascimento" required>
            {props => <Input {...props} type="date" required autoComplete="bday" value={form.birthDate} onChange={set('birthDate')} />}
          </Field>
          <Field label="Celular com DDD" required>
            {props => <Input {...props} type="tel" required minLength={8} autoComplete="tel" value={form.phone} onChange={set('phone')} />}
          </Field>
          <Field label="E-mail">{props => <Input {...props} type="email" autoComplete="email" value={form.email} onChange={set('email')} />}</Field>
          <Field label="Nome social" hint="Se preferir ser chamado(a) por outro nome.">
            {props => <Input {...props} value={form.socialName} onChange={set('socialName')} />}
          </Field>
        </div>
      </section>

      <section className="rounded-md border border-line bg-paper p-5">
        <h2 className="mb-4 text-[15px] font-semibold text-ink">2. Endereço</h2>
        <div className="grid gap-4 sm:grid-cols-6">
          {ADDRESS.map(key => (
            <Field key={key} label={ADDRESS_LABELS[key]} required={key === 'city' || key === 'state'} className={SPAN[key]}>
              {props => (
                <Input
                  {...props}
                  required={key === 'city' || key === 'state'}
                  maxLength={key === 'state' ? 2 : key === 'zip' ? 9 : undefined}
                  value={address[key]}
                  onChange={event => setAddress(a => ({ ...a, [key]: key === 'state' ? event.target.value.toUpperCase() : event.target.value }))}
                />
              )}
            </Field>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-line bg-paper p-5">
        <h2 className="text-[15px] font-semibold text-ink">3. Documentos</h2>
        <p className="mt-1 mb-4 text-sm text-steel">Foto nítida ou PDF, até 10 MB cada. Envie o que se aplica a você.</p>
        <DocList base={base} title="Obrigatórios" items={ADMISSION_REQUIRED} sent={view.documents} />
        <DocList base={base} title="Se aplicável" items={ADMISSION_OPTIONAL} sent={view.documents} />
      </section>

      <div className="flex flex-col items-start gap-2">
        <Button type="submit" variant="primary" loading={submit.isPending} className="h-12 px-6 text-base">
          Enviar para o RH
        </Button>
        {missing.length > 0 && <p className="text-sm text-steel">Faltam {missing.length} documentos obrigatórios.</p>}
      </div>
    </form>
  )
}

function DocList({ base, title, items, sent }: { base: string; title: string; items: ChecklistItem[]; sent: View['documents'] }) {
  return (
    <div className="mb-4 last:mb-0">
      <h3 className="mb-2 text-[13px] font-medium text-steel uppercase">{title}</h3>
      <ul className="divide-y divide-line rounded-sm border border-line">
        {items.map(item => (
          <DocRow key={item.label} base={base} item={item} count={sent.filter(d => d.title === item.label).length} />
        ))}
      </ul>
    </div>
  )
}

function DocRow({ base, item, count }: { base: string; item: ChecklistItem; count: number }) {
  const queryClient = useQueryClient()
  const id = `doc-${item.label.replace(/\W+/g, '-')}`
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('title', item.label)
      form.append('file', file)
      return publicFetch(`${base}/documents`, { method: 'POST', body: form })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admission', base] }),
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível enviar.'),
  })
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          {count > 0 && <FileCheck2 className="size-4 text-ok" aria-label="Enviado" />}
          {item.label}
        </span>
        {item.detail && <span className="block text-[13px] text-steel">{item.detail}</span>}
      </span>
      <input
        type="file"
        accept={ACCEPTED_DOCUMENTS}
        className="sr-only"
        id={id}
        onChange={event => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) upload.mutate(file)
        }}
      />
      <label
        htmlFor={id}
        className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-sm border border-line-strong bg-paper px-3 text-sm text-ink-soft hover:border-ink hover:text-ink"
      >
        {upload.isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
        {count ? 'Enviar outro' : 'Enviar'}
      </label>
    </li>
  )
}
