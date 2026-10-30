import * as Tabs from '@radix-ui/react-tabs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { FolderCog, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { Button } from '../components/ui/button'
import { DataTable } from '../components/ui/data-table'
import { Drawer } from '../components/ui/drawer'
import { Field, Input, Select } from '../components/ui/field'
import { Badge, ErrorState, PageHeader } from '../components/ui/layout'
import { categoriesQuery, DocumentDrawer, DocumentTable, UploadDocumentDrawer } from '../features/documents'
import { api, ApiError } from '../lib/api'
import { useCan } from '../lib/session'
import type { DocumentCategory, DocumentItem } from '../lib/types'

export function DocumentsPage() {
  const search = useSearch({ strict: false }) as { id?: string; expiring?: number }
  const navigate = useNavigate()
  const canManage = useCan('documents.manage')
  const [tab, setTab] = useState<'docs' | 'cats'>('docs')
  const [uploading, setUploading] = useState(false)
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const expiring = Boolean(search.expiring)
  const categories = useQuery(categoriesQuery)
  const setSearch = (patch: { id?: string; expiring?: number }) =>
    void navigate({ to: '/documentos', search: { ...search, ...patch }, replace: true })

  const list = useQuery({
    queryKey: ['documents', q, categoryId, expiring],
    queryFn: () => api<DocumentItem[]>('/documents', { query: { q, categoryId, expiring: expiring ? 'true' : undefined } }),
    placeholderData: previous => previous,
  })

  return (
    <>
      <PageHeader
        title="Documentos"
        description="Arquivos de cada pessoa e da empresa, com validade, versões e registro de quem acessou."
        actions={
          canManage && (
            <Button variant="primary" onClick={() => setUploading(true)}>
              <Upload className="size-4" aria-hidden /> Enviar documento
            </Button>
          )
        }
      />

      <Tabs.Root value={tab} onValueChange={value => setTab(value as 'docs' | 'cats')}>
        <Tabs.List aria-label="Seções" className="mb-5 flex gap-6 border-b border-line">
          {(
            [
              ['docs', 'Documentos'],
              ['cats', 'Categorias'],
            ] as const
          ).map(([value, label]) => (
            <Tabs.Trigger key={value} value={value} className="relative pb-2.5 text-[15px] text-steel hover:text-ink data-[state=active]:font-medium data-[state=active]:text-ink">
              {label}
              {tab === value && <motion.span layoutId="documents-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-ink" />}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="docs">
          <div className="mb-4 flex flex-wrap gap-2">
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar pelo título" aria-label="Buscar" className="max-w-xs" />
            <Select aria-label="Categoria" value={categoryId} onChange={e => setCategoryId(e.target.value)} className="w-auto">
              <option value="">Todas as categorias</option>
              {categories.data?.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Button variant={expiring ? 'primary' : 'secondary'} onClick={() => setSearch({ expiring: expiring ? undefined : 1 })} aria-pressed={expiring}>
              Vencidos ou vencendo em 30 dias
            </Button>
          </div>
          {list.isError && <ErrorState error={list.error} onRetry={() => list.refetch()} />}
          <DocumentTable rows={list.data ?? []} loading={list.isPending} onOpen={id => setSearch({ id })} empty={expiring ? 'Nenhum documento vencendo' : 'Nenhum documento enviado ainda'} />
        </Tabs.Content>

        <Tabs.Content value="cats">
          <CategoriesTab categories={categories.data ?? []} loading={categories.isPending} canManage={canManage} />
        </Tabs.Content>
      </Tabs.Root>

      <DocumentDrawer id={search.id ?? null} onClose={() => setSearch({ id: undefined })} />
      {canManage && <UploadDocumentDrawer open={uploading} onOpenChange={setUploading} mode="hr" />}
    </>
  )
}

const FLAGS = [
  ['employeeVisible', 'O colaborador vê no portal'],
  ['employeeUpload', 'O colaborador pode enviar'],
  ['sensitive', 'Sensível (só RH e titular)'],
  ['requiresExpiry', 'Exige data de validade'],
] as const

type Flags = Pick<DocumentCategory, (typeof FLAGS)[number][0]>

function CategoriesTab({ categories, loading, canManage }: { categories: DocumentCategory[]; loading: boolean; canManage: boolean }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<DocumentCategory | 'new' | null>(null)
  const [name, setName] = useState('')
  const [flags, setFlags] = useState<Flags>({ employeeVisible: true, employeeUpload: false, sensitive: false, requiresExpiry: false })

  const open = (category: DocumentCategory | 'new') => {
    setName(category === 'new' ? '' : category.name)
    setFlags(category === 'new' ? { employeeVisible: true, employeeUpload: false, sensitive: false, requiresExpiry: false } : category)
    setEditing(category)
  }
  const save = useMutation({
    mutationFn: () =>
      editing && editing !== 'new'
        ? api(`/document-categories/${editing.id}`, { method: 'PUT', body: { name, ...flags } })
        : api('/document-categories', { method: 'POST', body: { name, ...flags } }),
    onSuccess: async () => {
      toast.success('Categoria salva.')
      await queryClient.invalidateQueries({ queryKey: categoriesQuery.queryKey })
      setEditing(null)
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar.'),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/document-categories/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('Categoria excluída.')
      await queryClient.invalidateQueries({ queryKey: categoriesQuery.queryKey })
    },
    onError: error => toast.error(error instanceof ApiError ? 'Há documentos nesta categoria. Mova-os antes de excluir.' : 'Não foi possível excluir.'),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim().length >= 2) save.mutate()
  }

  return (
    <>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button variant="primary" onClick={() => open('new')}>
            <Plus className="size-4" aria-hidden /> Nova categoria
          </Button>
        </div>
      )}
      <DataTable
        loading={loading}
        rows={categories}
        empty="Nenhuma categoria"
        emptyIcon={FolderCog}
        columns={[
          { label: 'Categoria', render: c => <span className="font-medium text-ink">{c.name}</span> },
          {
            label: 'Regras',
            render: c => (
              <div className="flex flex-wrap gap-1.5">
                {c.employeeVisible && <Badge>Visível no portal</Badge>}
                {c.employeeUpload && <Badge tone="info">Envio pelo colaborador</Badge>}
                {c.sensitive && <Badge tone="danger">Sensível</Badge>}
                {c.requiresExpiry && <Badge tone="warn">Com validade</Badge>}
              </div>
            ),
          },
        ]}
        actions={
          canManage
            ? c => (
                <>
                  <Button size="sm" variant="ghost" onClick={() => open(c)} aria-label={`Editar ${c.name}`}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => window.confirm(`Excluir a categoria ${c.name}?`) && remove.mutate(c.id)} aria-label={`Excluir ${c.name}`}>
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )
            : undefined
        }
      />
      <Drawer
        open={editing !== null}
        onOpenChange={o => !o && setEditing(null)}
        title={editing === 'new' ? 'Nova categoria' : 'Editar categoria'}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancelar</Button>
            <Button variant="primary" onClick={submit} loading={save.isPending} disabled={name.trim().length < 2}>
              Salvar categoria
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="flex flex-col gap-5">
          <Field label="Nome" required>{p => <Input {...p} value={name} onChange={e => setName(e.target.value)} />}</Field>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-medium text-ink-soft">Regras</legend>
            {FLAGS.map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center gap-3 rounded-sm border border-line px-3 py-2.5 text-sm hover:border-ink">
                <input type="checkbox" checked={flags[key]} onChange={e => setFlags({ ...flags, [key]: e.target.checked })} className="size-4 accent-ink" />
                {label}
              </label>
            ))}
          </fieldset>
          <button type="submit" hidden />
        </form>
      </Drawer>
    </>
  )
}
