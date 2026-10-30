import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, CircleX, Download } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '../components/ui/button'
import { Drawer } from '../components/ui/drawer'
import { FileInput } from '../components/ui/file-input'
import { Badge } from '../components/ui/layout'
import { apiDownload, ApiError, apiUpload } from '../lib/api'
import { cn } from '../lib/cn'
import type { ImportReport } from '../lib/types'

/**
 * Importação em duas etapas: a prévia confere cada linha sem gravar nada; a
 * gravação só acontece com a planilha 100% válida, tudo ou nada.
 */
export function ImportDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [createMissing, setCreateMissing] = useState(false)
  const [report, setReport] = useState<ImportReport | null>(null)

  const path = (commit: boolean) => `/employees/import?commit=${commit}&createMissing=${createMissing}`
  const preview = useMutation({
    mutationFn: () => apiUpload<ImportReport>(path(false), {}, file!),
    onSuccess: setReport,
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível ler a planilha.'),
  })
  const commit = useMutation({
    mutationFn: () => apiUpload<ImportReport>(path(true), {}, file!),
    onSuccess: async result => {
      toast.success(`${result.imported} colaboradores importados.`)
      await Promise.all(['employees', 'dashboard', 'departments'].map(key => queryClient.invalidateQueries({ queryKey: [key] })))
      setReport(null)
      setFile(null)
      onOpenChange(false)
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível importar.'),
  })

  const reset = (next: File | null) => {
    setFile(next)
    setReport(null)
  }
  const missing = report ? [...report.toCreate.departments, ...report.toCreate.positions, ...report.toCreate.units] : []

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Importar colaboradores"
      description="Use o modelo. Nada é gravado até você confirmar a importação."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
          {report && report.invalid === 0 ? (
            <Button variant="primary" onClick={() => commit.mutate()} loading={commit.isPending}>
              Importar {report.valid} {report.valid === 1 ? 'colaborador' : 'colaboradores'}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => preview.mutate()} loading={preview.isPending} disabled={!file}>
              Conferir planilha
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Button className="self-start" onClick={() => apiDownload('/employees/import/template', 'modelo-importacao.xlsx').catch(() => toast.error('Não foi possível baixar o modelo.'))}>
          <Download className="size-4" aria-hidden /> Baixar modelo (.xlsx)
        </Button>
        <FileInput file={file} onChange={reset} accept=".xlsx,.csv" hint="Planilha .xlsx ou .csv, até 10 MB." />
        <label className="flex cursor-pointer items-start gap-3 rounded-sm border border-line px-3 py-2.5 text-sm hover:border-ink">
          <input
            type="checkbox"
            checked={createMissing}
            onChange={e => {
              setCreateMissing(e.target.checked)
              setReport(null)
            }}
            className="mt-0.5 size-4 accent-ink"
          />
          <span>
            Criar departamentos, cargos e unidades que ainda não existem
            <span className="block text-[13px] text-steel">Sem esta opção, nomes desconhecidos viram erro na linha.</span>
          </span>
        </label>

        {report && (
          <section className="flex flex-col gap-3">
            <div className="grid grid-cols-3 divide-x divide-line rounded-sm border border-line text-center">
              <Count label="Linhas" value={report.total} />
              <Count label="Prontas" value={report.valid} tone="ok" />
              <Count label="Com erro" value={report.invalid} tone={report.invalid ? 'danger' : undefined} />
            </div>
            {missing.length > 0 && (
              <p className="text-sm text-ink-soft">
                Serão criados: <span className="font-medium">{missing.join(', ')}</span>.
              </p>
            )}
            <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-sm border border-line">
              {report.rows.map(row => (
                <li key={row.line} className="flex gap-3 px-3 py-2.5 text-sm">
                  {row.errors.length ? <CircleX className="mt-0.5 size-4 shrink-0 text-danger" aria-label="Com erro" /> : <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-label="Pronta" />}
                  <span className="min-w-0 flex-1">
                    <span className="text-ink">
                      Linha {row.line}: {row.fullName || 'sem nome'} {row.registration && <span className="text-steel">({row.registration})</span>}
                    </span>
                    {row.errors.map(error => (
                      <span key={error} className="block text-[13px] text-danger">
                        {error}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            {report.invalid > 0 && <Badge tone="danger">Corrija a planilha e confira de novo.</Badge>}
          </section>
        )}
      </div>
    </Drawer>
  )
}

function Count({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'danger' }) {
  return (
    <div className="px-3 py-3">
      <p className={cn('num font-display text-3xl leading-none font-semibold', tone === 'ok' ? 'text-ok' : tone === 'danger' ? 'text-danger' : 'text-ink')}>{value}</p>
      <p className="mt-1 text-[13px] text-steel">{label}</p>
    </div>
  )
}
