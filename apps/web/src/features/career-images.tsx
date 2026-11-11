import { useQueries, useQuery } from '@tanstack/react-query'
import { ImagePlus, LoaderCircle, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { api, ApiError, apiUpload } from '../lib/api'
import { cn } from '../lib/cn'

/** Links da pré-visualização valem 5 min no servidor: renova antes. */
const LINK_STALE_MS = 4 * 60_000
const assetQuery = (id: string) => ({
  queryKey: ['career-asset', id],
  queryFn: () => api<{ url: string }>(`/career-page/assets/${id}`).then(r => r.url),
  staleTime: LINK_STALE_MS,
  refetchInterval: LINK_STALE_MS,
})

/** Link temporário de uma imagem da página (inclusive as ainda não publicadas). */
export function useCareerAssetUrl(id: string | null) {
  return useQuery({ ...assetQuery(id ?? ''), enabled: Boolean(id) }).data ?? null
}

/** Mapa id → link, para a pré-visualização resolver várias imagens. */
export function useCareerAssetUrls(ids: string[]) {
  const results = useQueries({ queries: ids.map(assetQuery) })
  const map = new Map<string, string>()
  ids.forEach((id, i) => {
    const url = results[i]?.data
    if (url) map.set(id, url)
  })
  return (id: string) => map.get(id) ?? null
}

const ACCEPT = 'image/png,image/jpeg,image/webp'
const MAX_BYTES = 5 * 1024 * 1024

/**
 * Seletor de imagens da página de vagas: envia na hora (PNG, JPEG ou WebP até
 * 5 MB) e devolve os ids. `max` 1 = uma imagem só (capa).
 */
export function CareerImagePicker({ ids, max, onChange, label }: { ids: string[]; max: number; onChange: (ids: string[]) => void; label: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [sending, setSending] = useState(0)
  const urlOf = useCareerAssetUrls(ids)
  const room = max - ids.length

  const send = async (files: File[]) => {
    const accepted: File[] = []
    for (const file of files) {
      if (!ACCEPT.split(',').includes(file.type)) toast.error(`${file.name}: envie PNG, JPEG ou WebP.`)
      else if (file.size > MAX_BYTES) toast.error(`${file.name}: a imagem passa de 5 MB.`)
      else accepted.push(file)
    }
    const batch = max === 1 ? accepted.slice(0, 1) : accepted.slice(0, room)
    if (accepted.length > batch.length) toast.message(`Cabem ${max} ${max === 1 ? 'imagem' : 'imagens'} nesta seção.`)
    if (!batch.length) return
    setSending(batch.length)
    const added: string[] = []
    for (const file of batch) {
      try {
        const { id } = await apiUpload<{ id: string; url: string }>('/career-page/assets', {}, file)
        added.push(id)
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : `Não foi possível enviar ${file.name}.`)
      }
    }
    setSending(0)
    if (added.length) onChange(max === 1 ? added.slice(0, 1) : [...ids, ...added])
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13.5px] font-medium text-ink-soft">{label}</p>
      <div className={cn('grid gap-3', max === 1 ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-4')}>
        {ids.map(id => (
          <figure key={id} className={cn('group relative overflow-hidden rounded-md border border-line bg-sunken', max === 1 ? 'aspect-[21/9]' : 'aspect-square')}>
            {urlOf(id) ? (
              <img src={urlOf(id)!} alt="" className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-steel">
                <LoaderCircle className="size-5 animate-spin" aria-hidden />
              </span>
            )}
            <button
              type="button"
              onClick={() => onChange(ids.filter(other => other !== id))}
              className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-night/80 text-snow opacity-90 transition-opacity hover:bg-danger focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              aria-label="Remover imagem"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </figure>
        ))}
        {(room > 0 || sending > 0) && (
          <button
            type="button"
            disabled={sending > 0}
            onClick={() => input.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault()
              void send([...e.dataTransfer.files])
            }}
            className={cn(
              'flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-line-strong px-3 text-center text-[13px] text-steel transition-colors hover:border-brand hover:text-ink disabled:cursor-wait',
              max === 1 ? 'aspect-[21/9]' : 'aspect-square',
            )}
          >
            {sending > 0 ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <ImagePlus className="size-5" aria-hidden />}
            <span className="font-medium">{sending > 0 ? 'Enviando…' : 'Adicionar imagem'}</span>
            <span className="text-[12px] text-steel-soft">PNG, JPEG ou WebP até 5 MB</span>
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple={max > 1}
        className="hidden"
        onChange={e => {
          void send([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
    </div>
  )
}
