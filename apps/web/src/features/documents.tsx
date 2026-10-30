import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Download, FileText, FileUp, Lock } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { addDaysIso } from '@falcao-rh/contracts'

import { Button } from '../components/ui/button'
import { DataTable } from '../components/ui/data-table'
import { Drawer } from '../components/ui/drawer'
import { Field, Input, Select } from '../components/ui/field'
import { FileInput, formatBytes } from '../components/ui/file-input'
import { Badge, Skeleton } from '../components/ui/layout'
import { api, ApiError, apiUpload, openDownload } from '../lib/api'
import { formatDate, todayIso } from '../lib/format'
import { useCan } from '../lib/session'
import type { DocumentCategory, DocumentDetail, DocumentItem, EmployeeListItem, Page } from '../lib/types'

export const categoriesQuery = { queryKey: ['document-categories'], queryFn: () => api<DocumentCategory[]>('/document-categories') }

/** Situação da validade: vencido, vence em até 30 dias ou em dia. */
export function ExpiryBadge({ date }: { date: string | null }) {
  if (!date) return <span className="text-steel-soft">Sem validade</span>
  const today = todayIso()
  if (date < today) return <Badge tone="danger">Vencido em {formatDate(date)}</Badge>
  if (date <= addDaysIso(today, 30)) return <Badge tone="warn">Vence em {formatDate(date)}</Badge>
  return <span className="num text-ink-soft">{formatDate(date)}</span>
}

const download = async (id: string, version?: number) => {
  try {
    const { url } = await api<{ url: string }>(`/documents/${id}/download`, { query: { version } })
    openDownload(url)
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'Não foi possível baixar.')
  }
}

const invalidateDocuments = (queryClient: ReturnType<typeof useQueryClient>) =>
  Promise.all(['documents', 'my-documents', 'document', 'dashboard'].map(key => queryClient.invalidateQueries({ queryKey: [key] })))

/** Tabela de documentos: usada na central, na ficha e no portal. */
export function DocumentTable({
  rows,
  loading,
  onOpen,
  showEmployee = true,
  empty = 'Nenhum documento',
}: {
  rows: DocumentItem[]
  loading?: boolean
  onOpen?: (id: string) => void
  showEmployee?: boolean
  empty?: string
}) {
  return (
    <DataTable
      loading={loading}
      rows={rows}
      onRowClick={onOpen ? r => onOpen(r.id) : undefined}
      empty={empty}
      emptyIcon={FileText}
      minWidth={showEmployee ? 760 : 520}
      columns={[
        {
          label: 'Documento',
          render: d => (
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm bg-concrete text-steel">
                <FileText className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="truncate font-medium text-ink">{d.title}</div>
                <div className="truncate text-[13px] text-steel">
                  {d.filename}, {formatBytes(d.sizeBytes)}
                  {d.currentVersion > 1 && `, versão ${d.currentVersion}`}
                </div>
              </div>
            </div>
          ),
        },
        ...(showEmployee ? [{ label: 'Colaborador', render: (d: DocumentItem) => d.employeeName ?? <span className="text-steel">Empresa</span> }] : []),
        {
          label: 'Categoria',
          render: d => (
            <span className="inline-flex items-center gap-1.5">
              {d.sensitive && <Lock className="size-3.5 text-steel" aria-label="Sensível" />}
              {d.categoryName}
            </span>
          ),
        },
        { label: 'Validade', render: d => <ExpiryBadge date={d.expiresAt} /> },
      ]}
      actions={d => (
        <Button size="sm" variant="ghost" onClick={() => download(d.id)} aria-label={`Baixar ${d.title}`}>
          <Download className="size-4" />
        </Button>
      )}
    />
  )
}

// ---------- detalhe ----------

export function DocumentDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const canManage = useCan('documents.manage')
  const [file, setFile] = useState<File | null>(null)
  const [expiresAt, setExpiresAt] = useState('')
  const query = useQuery({ queryKey: ['document', id], queryFn: () => api<DocumentDetail>(`/documents/${id}`), enabled: Boolean(id) })
  const doc = query.data
  useEffect(() => setExpiresAt(doc?.expiresAt ?? ''), [doc?.expiresAt])

  const newVersion = useMutation({
    mutationFn: () => apiUpload<DocumentDetail>(`/documents/${id}/versions`, {}, file!),
    onSuccess: async () => {
      toast.success('Nova versão enviada. A anterior continua no histórico.')
      setFile(null)
      await invalidateDocuments(queryClient)
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível enviar.'),
  })
  const update = useMutation({
    mutationFn: (body: { expiresAt?: string | null; status?: 'archived' }) => api(`/documents/${id}`, { method: 'PATCH', body }),
    onSuccess: async (_, body) => {
      toast.success(body.status === 'archived' ? 'Documento arquivado.' : 'Validade atualizada.')
      await invalidateDocuments(queryClient)
      if (body.status === 'archived') onClose()
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar.'),
  })

  return (
    <Drawer
      open={Boolean(id)}
      onOpenChange={open => !open && onClose()}
      title={doc?.title ?? 'Documento'}
      description={doc ? doc.categoryName : undefined}
      footer={
        doc && (
          <>
            {canManage && (
              <Button variant="ghost" className="mr-auto" onClick={() => window.confirm('Arquivar este documento?') && update.mutate({ status: 'archived' })}>
                <Archive className="size-4" aria-hidden /> Arquivar
              </Button>
            )}
            <Button variant="primary" onClick={() => download(doc.id)}>
              <Download className="size-4" aria-hidden /> Baixar versão atual
            </Button>
          </>
        )
      }
    >
      {query.isPending && <Skeleton className="h-60" />}
      {doc && (
        <div className="flex flex-col gap-6">
          {doc.sensitive && (
            <p className="flex items-center gap-2 rounded-sm bg-concrete px-3 py-2 text-[13px] text-ink-soft">
              <Lock className="size-4" aria-hidden /> Documento sensível: só o RH e o titular têm acesso. Cada download fica registrado.
            </p>
          )}

          {canManage && (
            <form
              onSubmit={(event: FormEvent) => {
                event.preventDefault()
                update.mutate({ expiresAt: expiresAt || null })
              }}
              className="flex items-end gap-2"
            >
              <Field label="Validade" className="flex-1">
                {p => <Input {...p} type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />}
              </Field>
              <Button type="submit" disabled={(doc.expiresAt ?? '') === expiresAt} loading={update.isPending}>
                Salvar
              </Button>
            </form>
          )}

          <section>
            <h3 className="mb-3 font-medium text-ink">Versões</h3>
            <ul className="divide-y divide-line rounded-sm border border-line">
              {doc.versions.map(v => (
                <li key={v.version} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="num flex size-8 items-center justify-center rounded-sm bg-ink font-display text-[15px] font-semibold text-brand">
                    v{v.version}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">{v.filename}</span>
                    <span className="block text-[13px] text-steel">
                      {formatBytes(v.sizeBytes)}, enviado por {v.uploadedByName ?? 'sistema'} em {new Date(v.createdAt).toLocaleString('pt-BR')}
                    </span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => download(doc.id, v.version)} aria-label={`Baixar versão ${v.version}`}>
                    <Download className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>

          {canManage && (
            <section className="flex flex-col gap-3">
              <h3 className="font-medium text-ink">Enviar nova versão</h3>
              <FileInput file={file} onChange={setFile} />
              <Button className="self-start" disabled={!file} loading={newVersion.isPending} onClick={() => newVersion.mutate()}>
                <FileUp className="size-4" aria-hidden /> Enviar versão {doc.currentVersion + 1}
              </Button>
            </section>
          )}
        </div>
      )}
    </Drawer>
  )
}

// ---------- envio ----------

export function UploadDocumentDrawer({
  open,
  onOpenChange,
  mode,
  employeeId: fixedEmployee,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `hr`: central de documentos; `self`: o colaborador pelo portal. */
  mode: 'hr' | 'self'
  employeeId?: string
}) {
  const queryClient = useQueryClient()
  const categories = useQuery({ ...categoriesQuery, enabled: open })
  const people = useQuery({
    queryKey: ['employees', 'document-picker'],
    queryFn: () => api<Page<EmployeeListItem>>('/employees', { query: { pageSize: 100 } }),
    enabled: open && mode === 'hr' && !fixedEmployee,
  })
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [employeeId, setEmployeeId] = useState(fixedEmployee ?? '')
  const [expiresAt, setExpiresAt] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const options = (categories.data ?? []).filter(c => mode === 'hr' || c.employeeUpload)
  const category = options.find(c => c.id === categoryId)

  const send = useMutation({
    mutationFn: () =>
      apiUpload(mode === 'hr' ? '/documents' : '/me/documents', { title, categoryId, employeeId: mode === 'hr' ? employeeId : null, expiresAt }, file!),
    onSuccess: async () => {
      toast.success(mode === 'hr' ? 'Documento enviado.' : 'Documento enviado. O RH foi avisado.')
      setTitle('')
      setFile(null)
      setExpiresAt('')
      await invalidateDocuments(queryClient)
      onOpenChange(false)
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível enviar.'),
  })
  const valid = title.trim().length >= 2 && categoryId && file && (!category?.requiresExpiry || expiresAt)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (valid) send.mutate()
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Enviar documento"
      description={mode === 'self' ? 'O arquivo fica no seu cadastro e o RH é avisado.' : 'O arquivo fica guardado de forma privada; cada download é registrado.'}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="primary" onClick={submit} loading={send.isPending} disabled={!valid}>
            Enviar documento
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Arquivo" required>
          {() => <FileInput file={file} onChange={f => {
            setFile(f)
            if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''))
          }} />}
        </Field>
        <Field label="Título" required>{p => <Input {...p} value={title} onChange={e => setTitle(e.target.value)} />}</Field>
        <Field label="Categoria" required hint={category?.sensitive ? 'Categoria sensível: só o RH e o titular veem.' : undefined}>
          {p => (
            <Select {...p} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">Escolha</option>
              {options.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {mode === 'hr' && !fixedEmployee && (
          <Field label="Colaborador" hint="Deixe em branco para documentos da empresa (políticas, modelos).">
            {p => (
              <Select {...p} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
                <option value="">Documento da empresa</option>
                {people.data?.items.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.fullName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Validade" required={category?.requiresExpiry} hint={category?.requiresExpiry ? 'Obrigatória nesta categoria. O sistema avisa 30 e 7 dias antes.' : 'Opcional.'}>
          {p => <Input {...p} type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />}
        </Field>
        <button type="submit" hidden />
      </form>
    </Drawer>
  )
}
