import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { Download, X } from 'lucide-react'
import type { ReactNode } from 'react'

import falcon from '../../assets/falcao-mark.svg'
import { Button } from '../../components/ui/button'
import { ErrorState, Skeleton } from '../../components/ui/layout'
import { ADMISSION_OPTIONAL, ADMISSION_REQUIRED, type ChecklistItem } from '../../documents/admission-checklist'
import { api } from '../../lib/api'
import type { ApplicationDetail } from '../../lib/types'

/** Página A4 sem margem do navegador: o documento desenha as próprias margens. */
const PRINT_CSS = `
@page { size: A4; margin: 0; }
@media print {
  html, body { background: #fff !important; }
  [data-print-hide] { display: none !important; }
  [data-sheet] { box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; }
}
[data-sheet] { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`

/**
 * Relação de documentos para admissão de um candidato. Na tela é uma folha A4
 * com o botão de baixar; "Baixar PDF" usa a impressão do navegador
 * (Salvar como PDF), que mantém o texto selecionável e a nitidez do vetor.
 */
export function AdmissionDocumentsPage() {
  const { id } = useParams({ strict: false }) as { id: string }
  const query = useQuery({ queryKey: ['application', id], queryFn: () => api<ApplicationDetail>(`/applications/${id}`) })
  const a = query.data
  if (a) document.title = `Documentos para admissão - ${a.candidate.fullName}`

  return (
    <div className="min-h-dvh bg-concrete py-8 print:bg-white print:py-0">
      <style>{PRINT_CSS}</style>
      <div data-print-hide className="mx-auto mb-5 flex w-[210mm] max-w-full items-center justify-between gap-3 px-4">
        <p className="text-[13.5px] text-steel">Confira e baixe. No diálogo, escolha “Salvar como PDF”.</p>
        <div className="flex gap-2">
          <Button onClick={() => window.close()}>
            <X className="size-4" aria-hidden /> Fechar
          </Button>
          <Button variant="primary" disabled={!a} onClick={() => window.print()}>
            <Download className="size-4" aria-hidden /> Baixar PDF
          </Button>
        </div>
      </div>
      {query.isError ? (
        <div className="mx-auto max-w-lg px-4">
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </div>
      ) : !a ? (
        <Skeleton className="mx-auto h-[297mm] w-[210mm] max-w-full" />
      ) : (
        <Sheet candidate={a.candidate.fullName} role={a.jobTitle} />
      )}
    </div>
  )
}

function Sheet({ candidate, role }: { candidate: string; role: string }) {
  const today = new Date().toLocaleDateString('pt-BR')
  return (
    <article
      data-sheet
      className="mx-auto flex h-[297mm] w-[210mm] max-w-full flex-col overflow-hidden bg-white text-[#16171a] shadow-pop sm:rounded-[6px]"
      aria-label="Relação de documentos para admissão"
    >
      <header className="relative bg-[#0b0b0c] px-[14mm] pt-[8mm] pb-[7mm] text-white">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src={falcon} alt="" className="h-[13mm] w-auto" />
            <div className="leading-none">
              <p className="font-display text-[26px] font-semibold tracking-[0.02em]">FALCÃO</p>
              <p className="mt-1 text-[8.5px] font-medium tracking-[0.24em] text-[#a9aab0] uppercase">Construções e Engenharia</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[8.5px] font-semibold tracking-[0.22em] text-[#febe02] uppercase">Recursos Humanos</p>
            <h1 className="mt-1 font-display text-[24px] leading-[1.05] font-semibold">
              Relação de documentos
              <br />
              para admissão
            </h1>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[2.2mm]" style={{ backgroundImage: 'repeating-linear-gradient(-45deg, #febe02 0 3mm, #0b0b0c 3mm 6mm)' }} aria-hidden />
      </header>

      <section className="grid grid-cols-[1.6fr_1fr] gap-x-[6mm] gap-y-[3mm] px-[14mm] pt-[6mm]">
        <Info label="Nome do candidato">{candidate}</Info>
        <Info label="Data da entrega dos documentos">
          <span className="text-[#9a9ba1]">____ / ____ / ________</span>
        </Info>
        <Info label="Função">{role}</Info>
        <Info label="Situação">
          <span className="text-[#9a9ba1]">☐ Completa &nbsp; ☐ Pendente</span>
        </Info>
      </section>

      <div className="flex flex-1 flex-col gap-[4mm] px-[14mm] pt-[5mm]">
        <Checklist title="Documentos obrigatórios" note="Todo candidato entrega" items={ADMISSION_REQUIRED} tone="required" />
        <Checklist title="Documentos complementares" note="Somente quando se aplicar" items={ADMISSION_OPTIONAL} tone="optional" start={ADMISSION_REQUIRED.length + 1} />

        <section>
          <SectionTitle title="Observações do RH" />
          <div className="mt-[2mm] flex flex-col gap-[5mm] rounded-[3px] border border-[#d9d9dc] px-[4mm] pt-[5mm] pb-[2.5mm]">
            {[0, 1].map(i => (
              <span key={i} className="block border-b border-dashed border-[#c7c8cc]" />
            ))}
          </div>
        </section>

        <section className="mt-auto grid grid-cols-2 gap-[12mm] pt-[4mm] pb-[2mm]">
          {['Assinatura do candidato', 'Recebido por (RH)'].map(label => (
            <div key={label}>
              <span className="block border-b border-[#16171a]" />
              <p className="mt-[1.5mm] text-[8.5px] font-medium tracking-[0.12em] text-[#5d5e64] uppercase">{label}</p>
            </div>
          ))}
        </section>
      </div>

      <footer className="flex items-center justify-between border-t border-[#ececee] px-[14mm] py-[3mm] text-[8.5px] text-[#7b7c82]">
        <span>Falcão Construções e Engenharia · Recursos Humanos</span>
        <span>Gerado em {today}</span>
      </footer>
    </article>
  )
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-[#16171a] pb-[1.5mm]">
      <p className="text-[8px] font-semibold tracking-[0.16em] text-[#7b7c82] uppercase">{label}</p>
      <p className="mt-[1mm] min-h-[5mm] text-[12.5px] font-semibold break-words">{children}</p>
    </div>
  )
}

function SectionTitle({ title, note, count }: { title: string; note?: string; count?: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-[0.01em] uppercase">
        <span className="h-[3.5mm] w-[1.2mm] rounded-full bg-[#febe02]" aria-hidden />
        {title}
        {count !== undefined && <span className="text-[#9a9ba1]">({count})</span>}
      </h2>
      {note && <p className="text-[9px] font-medium tracking-[0.08em] text-[#7b7c82] uppercase">{note}</p>}
    </div>
  )
}

function Checklist({ title, note, items, tone, start = 1 }: { title: string; note: string; items: ChecklistItem[]; tone: 'required' | 'optional'; start?: number }) {
  return (
    <section>
      <SectionTitle title={title} note={note} count={items.length} />
      <ol className="mt-[2mm] overflow-hidden rounded-[3px] border border-[#d9d9dc]">
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center gap-[3mm] border-b border-[#ececee] px-[3mm] py-[0.85mm] last:border-b-0 even:bg-[#fafafa]">
            <span className={`num flex size-[5mm] shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${tone === 'required' ? 'bg-[#0b0b0c] text-[#febe02]' : 'bg-[#ececee] text-[#5d5e64]'}`}>
              {start + i}
            </span>
            <span className="min-w-0 flex-1 text-[11px] leading-tight">
              <span className="font-semibold">{item.label}</span>
              {item.detail && <span className="text-[#6b6c72]"> · {item.detail}</span>}
            </span>
            <span className="size-[4.2mm] shrink-0 rounded-[1px] border-[1.4px] border-[#16171a]" aria-hidden />
          </li>
        ))}
      </ol>
    </section>
  )
}
