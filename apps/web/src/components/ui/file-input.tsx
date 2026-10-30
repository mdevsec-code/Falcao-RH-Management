import { FileCheck2, FileUp, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'

import { cn } from '../../lib/cn'

export const ACCEPTED_DOCUMENTS = '.pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx'

export const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`

/** Área de arquivo clicável (ou de soltar) e acessível; mostra o escolhido e permite trocar. */
export function FileInput({
  file,
  onChange,
  accept = ACCEPTED_DOCUMENTS,
  hint = 'PDF, imagem, DOCX ou XLSX, até 10 MB.',
}: {
  file: File | null
  onChange: (file: File | null) => void
  accept?: string
  hint?: string
}) {
  const id = useId()
  const ref = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div>
      <input
        ref={ref}
        id={id}
        type="file"
        accept={accept}
        className="peer sr-only"
        onChange={event => onChange(event.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="flex items-center gap-3 rounded-md border border-line bg-sunken px-3 py-3 text-sm shadow-xs">
          <span className="flex size-9 items-center justify-center rounded-sm bg-ok-soft text-ok">
            <FileCheck2 className="size-[18px]" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-ink">{file.name}</span>
            <span className="text-[12.5px] text-steel">{formatBytes(file.size)}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null)
              if (ref.current) ref.current.value = ''
            }}
            className="flex size-8 items-center justify-center rounded-full text-steel transition-colors hover:bg-paper hover:text-ink"
            aria-label="Remover arquivo"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <label
          htmlFor={id}
          onDragOver={event => {
            event.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={event => {
            event.preventDefault()
            setOver(false)
            const dropped = event.dataTransfer.files?.[0]
            if (dropped) onChange(dropped)
          }}
          className={cn(
            'group flex cursor-pointer flex-col items-center gap-1.5 rounded-md border-[1.5px] border-dashed px-4 py-7 text-center text-sm transition-all duration-200',
            'peer-focus-visible:border-ink peer-focus-visible:ring-4 peer-focus-visible:ring-brand/40',
            over ? 'border-brand-strong bg-brand-soft' : 'border-line-strong hover:border-steel-soft hover:bg-sunken',
          )}
        >
          <span className="mb-1 flex size-10 items-center justify-center rounded-sm bg-paper text-ink shadow-xs ring-1 ring-line transition-transform duration-300 group-hover:-translate-y-0.5">
            <FileUp className="size-[18px]" aria-hidden />
          </span>
          <span className="font-medium text-ink">
            Escolher arquivo <span className="font-normal text-steel">ou arraste aqui</span>
          </span>
          <span className="text-[12.5px] text-steel">{hint}</span>
        </label>
      )}
    </div>
  )
}
