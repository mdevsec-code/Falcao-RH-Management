import { FileUp, X } from 'lucide-react'
import { useId, useRef } from 'react'

import { cn } from '../../lib/cn'

export const ACCEPTED_DOCUMENTS = '.pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx'

export const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`

/** Área de arquivo clicável e acessível; mostra o escolhido e permite trocar. */
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
        <div className="flex items-center gap-3 rounded-sm border border-line-strong bg-concrete/50 px-3 py-2.5 text-sm">
          <FileUp className="size-4 text-steel" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-ink">{file.name}</span>
          <span className="text-steel">{formatBytes(file.size)}</span>
          <button
            type="button"
            onClick={() => {
              onChange(null)
              if (ref.current) ref.current.value = ''
            }}
            className="rounded-sm p-1 text-steel hover:bg-paper hover:text-ink"
            aria-label="Remover arquivo"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <label
          htmlFor={id}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-1 rounded-sm border border-dashed border-line-strong px-4 py-6 text-center text-sm',
            'hover:border-ink hover:bg-concrete/40 peer-focus-visible:border-ink peer-focus-visible:ring-4 peer-focus-visible:ring-brand',
          )}
        >
          <FileUp className="size-5 text-steel" aria-hidden />
          <span className="font-medium text-ink">Escolher arquivo</span>
          <span className="text-[13px] text-steel">{hint}</span>
        </label>
      )}
    </div>
  )
}
