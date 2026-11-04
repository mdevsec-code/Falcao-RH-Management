import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  CloudCheck,
  ExternalLink,
  Eye,
  HelpCircle,
  Image as ImageIcon,
  Link2,
  LoaderCircle,
  Monitor,
  PencilLine,
  Plus,
  Rocket,
  Smartphone,
  Sparkles,
  Trash2,
  Type,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { BENEFIT_ICONS, careerPageContent, type BenefitIcon, type CareerPageContent } from '@falcao-rh/contracts'

import { Button } from '../components/ui/button'
import { Field, Input, Textarea } from '../components/ui/field'
import { ErrorState, PageHeader, Panel, Skeleton } from '../components/ui/layout'
import { api, ApiError } from '../lib/api'
import { cn } from '../lib/cn'
import { useMe } from '../lib/session'
import { BENEFIT_ICON_MAP, CareerSections } from '../public/career-page-view'
import { Hero } from '../public/careers'

type EditorState = { draft: CareerPageContent; published: CareerPageContent | null; publishedAt: string | null; previewUrl: string }

const careerPageQuery = { queryKey: ['career-page'], queryFn: () => api<EditorState>('/career-page') }

/**
 * Editor da página oficial de vagas: formulário por seção à esquerda,
 * pré-visualização ao vivo à direita. O rascunho salva sozinho; o público só
 * vê as mudanças depois de "Publicar alterações".
 */
export function CareersEditorPage() {
  const query = useQuery(careerPageQuery)
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (!query.data)
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-24" />
        <div className="grid gap-6 xl:grid-cols-2">
          <Skeleton className="h-[600px]" />
          <Skeleton className="h-[600px]" />
        </div>
      </div>
    )
  return <Editor initial={query.data} />
}

type SaveState = 'saved' | 'saving' | 'dirty' | 'invalid' | 'error'

function Editor({ initial }: { initial: EditorState }) {
  const me = useMe()
  const queryClient = useQueryClient()
  const [content, setContent] = useState<CareerPageContent>(initial.draft)
  const [published, setPublished] = useState(initial.published)
  const [publishedAt, setPublishedAt] = useState(initial.publishedAt)
  const [save, setSave] = useState<SaveState>('saved')
  const [issue, setIssue] = useState<string | null>(null)
  const [view, setView] = useState<'edit' | 'preview'>('edit')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  // Último conteúdo gravado: não salva de novo o que já está salvo.
  const lastSaved = useRef(JSON.stringify(initial.draft))

  const parsed = useMemo(() => careerPageContent.safeParse(content), [content])
  const unpublished = JSON.stringify(published) !== JSON.stringify(parsed.success ? parsed.data : content)

  // Salvamento automático do rascunho, 1 s depois de parar de editar.
  useEffect(() => {
    if (!parsed.success) {
      setSave('invalid')
      setIssue(parsed.error.issues[0]?.message ?? 'Confira os campos.')
      return
    }
    setIssue(null)
    const serialized = JSON.stringify(parsed.data)
    if (serialized === lastSaved.current) {
      setSave('saved')
      return
    }
    setSave('dirty')
    const handle = setTimeout(async () => {
      setSave('saving')
      try {
        await api<EditorState>('/career-page', { method: 'PUT', body: parsed.data })
        lastSaved.current = serialized
        setSave('saved')
      } catch {
        setSave('error')
      }
    }, 1000)
    return () => clearTimeout(handle)
  }, [content, parsed])

  const publish = useMutation({
    mutationFn: () => api<EditorState>('/career-page/publish', { method: 'POST' }),
    onSuccess: data => {
      setPublished(data.published)
      setPublishedAt(data.publishedAt)
      void queryClient.invalidateQueries({ queryKey: careerPageQuery.queryKey })
      toast.success('Página de vagas publicada.', { action: { label: 'Abrir', onClick: () => window.open(data.previewUrl, '_blank', 'noopener') } })
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível publicar.'),
  })

  const update = <K extends keyof CareerPageContent>(key: K, patch: Partial<CareerPageContent[K]>) =>
    setContent(current => ({ ...current, [key]: { ...current[key], ...patch } }))

  const canPublish = parsed.success && save === 'saved' && unpublished

  return (
    <>
      <PageHeader
        eyebrow="Recrutamento"
        title="Página de vagas"
        description={
          <>
            O que os candidatos veem em <span className="font-medium text-ink">/vagas/{me.tenant.slug}</span>. As alterações ficam em rascunho até você publicar.
          </>
        }
        actions={
          <>
            <a
              href={initial.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-sm border border-line-strong bg-paper px-4 text-[14.5px] text-ink-soft shadow-xs transition-colors hover:border-steel-soft hover:text-ink"
            >
              <ExternalLink className="size-4" aria-hidden /> Abrir página pública
            </a>
            <Button variant="primary" disabled={!canPublish} loading={publish.isPending} onClick={() => publish.mutate()}>
              <Rocket className="size-4" aria-hidden /> Publicar alterações
            </Button>
          </>
        }
      />

      <StatusBar save={save} issue={issue} unpublished={unpublished} publishedAt={publishedAt} />

      <div className="mb-4 flex rounded-[9px] border border-line bg-sunken p-0.5 text-[13px] xl:hidden" role="tablist" aria-label="Visão">
        {(
          [
            ['edit', 'Editar', PencilLine],
            ['preview', 'Pré-visualizar', Eye],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-[7px] py-2 font-medium transition-all',
              view === key ? 'bg-paper text-ink shadow-xs ring-1 ring-line' : 'text-steel',
            )}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className={cn('flex flex-col gap-5', view === 'preview' && 'max-xl:hidden')}>
          <SectionPanel icon={Sparkles} title="Capa" enabled={content.hero.enabled} onToggle={enabled => update('hero', { enabled })}>
            <Field label="Título" required hint="Aparece grande no topo da página.">
              {p => <Input {...p} value={content.hero.title} maxLength={80} onChange={e => update('hero', { title: e.target.value })} />}
            </Field>
            <Field label="Subtítulo">
              {p => <Textarea {...p} value={content.hero.subtitle} maxLength={200} onChange={e => update('hero', { subtitle: e.target.value })} className="min-h-20" />}
            </Field>
            <Counter value={content.hero.subtitle} max={200} />
          </SectionPanel>

          <SectionPanel icon={Type} title="Sobre a Falcão" enabled={content.about.enabled} onToggle={enabled => update('about', { enabled })}>
            <Field label="Título da seção" required>
              {p => <Input {...p} value={content.about.title} maxLength={80} onChange={e => update('about', { title: e.target.value })} />}
            </Field>
            <Field label="Texto" hint="Deixe uma linha em branco para separar parágrafos.">
              {p => <Textarea {...p} value={content.about.body} maxLength={3000} onChange={e => update('about', { body: e.target.value })} className="min-h-40" />}
            </Field>
            <Counter value={content.about.body} max={3000} />
          </SectionPanel>

          <SectionPanel icon={ImageIcon} title="Por que trabalhar aqui" enabled={content.benefits.enabled} onToggle={enabled => update('benefits', { enabled })}>
            <Field label="Título da seção" required>
              {p => <Input {...p} value={content.benefits.title} maxLength={80} onChange={e => update('benefits', { title: e.target.value })} />}
            </Field>
            <BenefitsEditor items={content.benefits.items} onChange={items => update('benefits', { items })} />
          </SectionPanel>

          <SectionPanel icon={HelpCircle} title="Perguntas frequentes" enabled={content.faq.enabled} onToggle={enabled => update('faq', { enabled })}>
            <FaqEditor items={content.faq.items} onChange={items => update('faq', { items })} />
          </SectionPanel>

          <SectionPanel icon={Link2} title="Canais de contato">
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ['instagram', 'Instagram', 'https://instagram.com/…'],
                  ['linkedin', 'LinkedIn', 'https://linkedin.com/company/…'],
                  ['facebook', 'Facebook', 'https://facebook.com/…'],
                  ['site', 'Site', 'https://falcao.com.br'],
                  ['whatsapp', 'WhatsApp do RH', '(81) 99999-9999'],
                  ['email', 'E-mail do RH', 'rh@falcao.com.br'],
                ] as const
              ).map(([key, label, placeholder]) => (
                <Field key={key} label={label}>
                  {p => (
                    <Input
                      {...p}
                      value={content.links[key] ?? ''}
                      placeholder={placeholder}
                      onChange={e => setContent(c => ({ ...c, links: { ...c.links, [key]: e.target.value || undefined } }))}
                    />
                  )}
                </Field>
              ))}
            </div>
          </SectionPanel>
        </div>

        <div className={cn('xl:sticky xl:top-24', view === 'edit' && 'max-xl:hidden')}>
          <Preview content={parsed.success ? parsed.data : content} slug={me.tenant.slug} device={device} onDevice={setDevice} />
        </div>
      </div>
    </>
  )
}

function StatusBar({ save, issue, unpublished, publishedAt }: { save: SaveState; issue: string | null; unpublished: boolean; publishedAt: string | null }) {
  const state = {
    saved: { icon: CloudCheck, text: 'Rascunho salvo', tone: 'text-ok' },
    saving: { icon: LoaderCircle, text: 'Salvando rascunho…', tone: 'text-steel' },
    dirty: { icon: PencilLine, text: 'Alterações não salvas', tone: 'text-steel' },
    invalid: { icon: CircleAlert, text: issue ?? 'Confira os campos.', tone: 'text-danger' },
    error: { icon: CircleAlert, text: 'Não foi possível salvar. Tentaremos de novo ao editar.', tone: 'text-danger' },
  }[save]
  return (
    <div data-reveal className="surface mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-[13.5px]">
      <span className={cn('inline-flex items-center gap-2 font-medium', state.tone)}>
        <state.icon className={cn('size-4', save === 'saving' && 'animate-spin')} aria-hidden /> {state.text}
      </span>
      <span className="text-steel">
        {unpublished ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-brand" aria-hidden /> O rascunho tem mudanças ainda não publicadas
          </span>
        ) : (
          'A página pública está igual ao rascunho'
        )}
      </span>
      {publishedAt && <span className="ml-auto text-steel-soft">Última publicação em {new Date(publishedAt).toLocaleString('pt-BR')}</span>}
    </div>
  )
}

/** Painel de uma seção, com interruptor para mostrar ou esconder na página. */
function SectionPanel({
  icon,
  title,
  enabled,
  onToggle,
  children,
}: {
  icon: typeof Sparkles
  title: string
  enabled?: boolean
  onToggle?: (enabled: boolean) => void
  children: ReactNode
}) {
  return (
    <Panel
      title={title}
      icon={icon}
      aside={onToggle && <Switch checked={Boolean(enabled)} onChange={onToggle} label={enabled ? 'Visível' : 'Oculta'} />}
      bodyClassName={cn('flex flex-col gap-4 transition-opacity duration-300', onToggle && !enabled && 'opacity-50')}
    >
      {children}
    </Panel>
  )
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-2 text-[12.5px] font-medium text-steel"
    >
      {label}
      <span className={cn('relative h-5 w-9 rounded-full transition-colors duration-300', checked ? 'bg-ok' : 'bg-line-strong')}>
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-4 rounded-full bg-snow shadow-xs transition-transform duration-300 ease-[var(--ease-falcon)]',
            checked && 'translate-x-4',
          )}
        />
      </span>
    </button>
  )
}

function Counter({ value, max }: { value: string; max: number }) {
  return (
    <p className={cn('-mt-2 text-right text-[11.5px]', value.length > max * 0.9 ? 'text-brand-ink' : 'text-steel-soft')}>
      {value.length}/{max}
    </p>
  )
}

const MAX_BENEFITS = 12
const MAX_FAQ = 15

function BenefitsEditor({ items, onChange }: { items: CareerPageContent['benefits']['items']; onChange: (items: CareerPageContent['benefits']['items']) => void }) {
  const set = (index: number, patch: Partial<(typeof items)[number]>) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => {
        const Icon = BENEFIT_ICON_MAP[item.icon]!
        return (
          <div key={index} className="rounded-md border border-line bg-sunken/60 p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-night text-brand">
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Input value={item.title} maxLength={60} placeholder="Ex.: Plano de saúde" aria-label="Título do benefício" onChange={e => set(index, { title: e.target.value })} />
                <Input value={item.text} maxLength={240} placeholder="Descrição curta (opcional)" aria-label="Descrição do benefício" onChange={e => set(index, { text: e.target.value })} />
              </div>
              <Button size="icon" variant="ghost" aria-label="Remover benefício" onClick={() => onChange(items.filter((_, i) => i !== index))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1" role="radiogroup" aria-label="Ícone">
              {BENEFIT_ICONS.map(name => {
                const Option = BENEFIT_ICON_MAP[name]!
                return (
                  <button
                    key={name}
                    type="button"
                    role="radio"
                    aria-checked={item.icon === name}
                    aria-label={name}
                    onClick={() => set(index, { icon: name as BenefitIcon })}
                    className={cn(
                      'flex size-8 items-center justify-center rounded-[7px] transition-all',
                      item.icon === name ? 'bg-night text-brand shadow-card' : 'text-steel hover:bg-paper hover:text-ink',
                    )}
                  >
                    <Option className="size-4" aria-hidden />
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      <Button disabled={items.length >= MAX_BENEFITS} onClick={() => onChange([...items, { icon: 'Smile', title: '', text: '' }])} className="self-start">
        <Plus className="size-4" aria-hidden /> Adicionar benefício
        <span className="text-steel-soft">
          {items.length}/{MAX_BENEFITS}
        </span>
      </Button>
    </div>
  )
}

function FaqEditor({ items, onChange }: { items: CareerPageContent['faq']['items']; onChange: (items: CareerPageContent['faq']['items']) => void }) {
  const set = (index: number, patch: Partial<(typeof items)[number]>) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  const move = (index: number, delta: number) => {
    const next = [...items]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item!)
    onChange(next)
  }
  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && <p className="text-[13.5px] text-steel">Nenhuma pergunta ainda. Adicione as dúvidas que os candidatos mais têm.</p>}
      {items.map((item, index) => (
        <div key={index} className="flex gap-3 rounded-md border border-line bg-sunken/60 p-4">
          <span className="num mt-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-paper text-[12px] font-semibold text-steel ring-1 ring-line">{index + 1}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Input value={item.question} maxLength={200} placeholder="Pergunta" aria-label={`Pergunta ${index + 1}`} onChange={e => set(index, { question: e.target.value })} />
            <Textarea value={item.answer} maxLength={1500} placeholder="Resposta" aria-label={`Resposta ${index + 1}`} onChange={e => set(index, { answer: e.target.value })} className="min-h-20" />
          </div>
          <div className="flex flex-col gap-0.5">
            <Button size="icon" variant="ghost" aria-label="Subir" disabled={index === 0} onClick={() => move(index, -1)}>
              <ArrowUp className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Descer" disabled={index === items.length - 1} onClick={() => move(index, 1)}>
              <ArrowDown className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Remover pergunta" onClick={() => onChange(items.filter((_, i) => i !== index))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}
      <Button disabled={items.length >= MAX_FAQ} onClick={() => onChange([...items, { question: '', answer: '' }])} className="self-start">
        <Plus className="size-4" aria-hidden /> Adicionar pergunta
        <span className="text-steel-soft">
          {items.length}/{MAX_FAQ}
        </span>
      </Button>
    </div>
  )
}

/** Pré-visualização ao vivo, numa moldura de navegador reduzida. */
function Preview({ content, slug, device, onDevice }: { content: CareerPageContent; slug: string; device: 'desktop' | 'mobile'; onDevice: (d: 'desktop' | 'mobile') => void }) {
  const width = device === 'desktop' ? 1200 : 390
  const zoom = device === 'desktop' ? 0.5 : 0.85
  return (
    <div className="surface overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line bg-sunken/70 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-danger/60" />
          <span className="size-2.5 rounded-full bg-brand" />
          <span className="size-2.5 rounded-full bg-ok/70" />
        </span>
        <span className="min-w-0 flex-1 truncate rounded-full bg-paper px-3 py-1 text-[12px] text-steel ring-1 ring-line">/vagas/{slug}</span>
        <div className="flex rounded-[8px] border border-line bg-paper p-0.5" role="tablist" aria-label="Dispositivo">
          {(
            [
              ['desktop', Monitor, 'Computador'],
              ['mobile', Smartphone, 'Celular'],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={device === key}
              aria-label={label}
              onClick={() => onDevice(key)}
              className={cn('flex size-7 items-center justify-center rounded-[6px] transition-colors', device === key ? 'bg-night text-brand' : 'text-steel hover:text-ink')}
            >
              <Icon className="size-3.5" aria-hidden />
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-[calc(100dvh-200px)] overflow-auto bg-concrete">
        <div className="mx-auto origin-top" style={{ width, zoom }}>
          <div data-no-reveal className="pointer-events-none select-none" aria-hidden>
            {content.hero.enabled && <Hero title={content.hero.title || 'Título da capa'} subtitle={content.hero.subtitle} jobs={6} cities={3} imageUrl={null} />}
            <div className="mx-auto max-w-6xl px-6 py-10">
              <div className="rounded-lg border-2 border-dashed border-line-strong p-8 text-center text-[15px] text-steel">Aqui aparecem as vagas abertas, automaticamente.</div>
            </div>
            <CareerSections content={content} stats={{ jobs: 6, cities: 3 }} />
          </div>
        </div>
      </div>
    </div>
  )
}
