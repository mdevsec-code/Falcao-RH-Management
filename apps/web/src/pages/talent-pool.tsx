import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Contact, Copy, FileText, MapPin, Search, SearchX, X } from 'lucide-react'
import { useDeferredValue, useState } from 'react'

import { Button } from '../components/ui/button'
import { Input } from '../components/ui/field'
import { Avatar, Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui/layout'
import { TalentDrawer } from '../features/talent-drawer'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import type { CandidateListItem, Page } from '../lib/types'

const PAGE_SIZE = 25

const CONSENT_FILTERS = [
  { value: 'yes', label: 'Autorizaram o banco' },
  { value: 'all', label: 'Todas as fichas' },
] as const

export const isoToBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

/** Fichas de quem já se candidatou: busca, etiquetas, duplicatas e convite para novas vagas. */
export function TalentPoolPage() {
  const [q, setQ] = useState('')
  const [city, setCity] = useState('')
  const [tag, setTag] = useState('')
  const [consent, setConsent] = useState<'yes' | 'all'>('yes')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)
  const search = useDeferredValue(q)
  const place = useDeferredValue(city)

  const query = useQuery({
    queryKey: ['candidates', { search, place, tag, consent, page }],
    queryFn: () => api<Page<CandidateListItem>>('/candidates', { query: { q: search || undefined, city: place || undefined, tag: tag || undefined, consent, page, pageSize: PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  })
  const data = query.data
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const filtering = Boolean(search || place || tag)
  const resetPage = <T,>(set: (value: T) => void) => (value: T) => {
    set(value)
    setPage(1)
  }

  return (
    <>
      <PageHeader eyebrow="Recrutamento" title="Banco de talentos" description="Todas as pessoas que já se candidataram. Encontre talentos antigos e convide para uma vaga nova." />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <label className="relative min-w-60 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-4 -translate-y-1/2 text-steel" aria-hidden />
          <Input value={q} onChange={e => resetPage(setQ)(e.target.value)} placeholder="Nome, e-mail ou resposta" aria-label="Buscar no banco de talentos" className="h-11 rounded-full pl-10" />
        </label>
        <Input value={city} onChange={e => resetPage(setCity)(e.target.value)} placeholder="Cidade" aria-label="Filtrar por cidade" className="h-11 w-44 rounded-full" />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Consentimento">
          {CONSENT_FILTERS.map(filter => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={consent === filter.value}
              onClick={() => resetPage(setConsent)(filter.value)}
              className={cn(
                'h-9 rounded-full border px-3.5 text-[13px] font-medium transition-all duration-200',
                consent === filter.value ? 'border-night bg-night text-snow shadow-card' : 'border-line bg-paper text-ink-soft hover:border-steel-soft',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
        {tag && (
          <button type="button" onClick={() => resetPage(setTag)('')} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-soft px-3 text-[13px] font-medium text-brand-ink" aria-label={`Remover filtro ${tag}`}>
            {tag} <X className="size-3.5" aria-hidden />
          </button>
        )}
        {data && <p className="ml-auto text-[13.5px] text-steel">{data.total === 1 ? '1 pessoa' : `${data.total} pessoas`}</p>}
      </div>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !data ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <div className="surface">
          <EmptyState icon={filtering ? SearchX : Contact} title={filtering ? 'Ninguém com esses filtros' : 'O banco de talentos ainda está vazio'}>
            {filtering ? 'Tente outra busca ou limpe os filtros.' : 'As pessoas aparecem aqui quando se candidatam pela página de vagas e autorizam o banco de talentos.'}
          </EmptyState>
        </div>
      ) : (
        <ul className="surface divide-y divide-line overflow-hidden">
          {data.items.map(person => (
            <li key={person.id} data-reveal-row>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4 transition-colors hover:bg-sunken/50">
                <button type="button" onClick={() => setOpenId(person.id)} className="flex min-w-56 flex-1 items-center gap-3 text-left">
                  <Avatar name={person.fullName} />
                  <span className="min-w-0">
                    <span className="block font-semibold break-words text-ink">{person.fullName}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-[13px] text-steel">
                      <MapPin className="size-3.5 shrink-0" aria-hidden /> {person.city}/{person.state}
                    </span>
                  </span>
                </button>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  {person.tags.map(t => (
                    <button key={t} type="button" onClick={() => resetPage(setTag)(t)} className="rounded-full bg-sunken px-2.5 py-0.5 text-[12.5px] text-ink-soft ring-1 ring-line transition-colors hover:bg-brand-soft hover:text-brand-ink">
                      {t}
                    </button>
                  ))}
                  {person.duplicateOf.length > 0 && (
                    <Badge tone="warn">
                      <Copy className="size-3" aria-hidden /> Possível duplicata
                    </Badge>
                  )}
                </div>
                <div className="flex w-52 shrink-0 flex-col text-[13px] text-steel">
                  <span className="flex items-center gap-1.5 text-ink-soft">
                    <FileText className="size-3.5" aria-hidden /> {person.applications === 1 ? '1 candidatura' : `${person.applications} candidaturas`}
                  </span>
                  <span>{person.consentUntil ? `Autorização até ${isoToBr(person.consentUntil)}` : 'Sem autorização do banco'}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-end gap-2" aria-label="Páginas">
          <Button size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="size-4" aria-hidden /> Anterior
          </Button>
          <span className="num text-[13px] text-steel">
            {page} de {pages}
          </span>
          <Button size="sm" disabled={page === pages} onClick={() => setPage(page + 1)}>
            Próxima <ChevronRight className="size-4" aria-hidden />
          </Button>
        </nav>
      )}

      <TalentDrawer id={openId} onClose={() => setOpenId(null)} onMerged={setOpenId} />
    </>
  )
}
