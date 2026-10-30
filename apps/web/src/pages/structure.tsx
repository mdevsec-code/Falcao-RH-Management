import * as Tabs from '@radix-ui/react-tabs'
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Building2, ChevronDown, ChevronRight, Network, Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { Button } from '../components/ui/button'
import { Drawer } from '../components/ui/drawer'
import { Field, Input, Select } from '../components/ui/field'
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui/layout'
import { api, ApiError } from '../lib/api'
import { cn } from '../lib/cn'
import { orgQueries } from '../lib/queries'
import { useCan } from '../lib/session'
import type { Department, EmployeeListItem, Page } from '../lib/types'

const TABS = [
  ['organograma', 'Organograma'],
  ['departamentos', 'Departamentos'],
  ['unidades', 'Unidades'],
  ['cargos', 'Cargos'],
  ['centros', 'Centros de custo'],
] as const

export function StructurePage() {
  return (
    <>
      <PageHeader title="Estrutura" description="Como a empresa se organiza: departamentos, quem os lidera, unidades, cargos e centros de custo." />
      <Tabs.Root defaultValue="organograma">
        <Tabs.List aria-label="Seções da estrutura" className="mb-5 flex gap-6 overflow-x-auto border-b border-line">
          {TABS.map(([value, label]) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className="-mb-px shrink-0 border-b-2 border-transparent pb-2.5 text-[15px] text-steel hover:text-ink data-[state=active]:border-ink data-[state=active]:font-medium data-[state=active]:text-ink"
            >
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="organograma"><OrgChart /></Tabs.Content>
        <Tabs.Content value="departamentos"><DepartmentsTab /></Tabs.Content>
        <Tabs.Content value="unidades">
          <SimpleTab
            query={orgQueries.units}
            path="/units"
            singular="unidade"
            columns={[['name', 'Nome'], ['code', 'Código'], ['city', 'Cidade'], ['state', 'UF']]}
            fields={[
              { name: 'name', label: 'Nome', required: true },
              { name: 'code', label: 'Código' },
              { name: 'city', label: 'Cidade' },
              { name: 'state', label: 'UF', maxLength: 2 },
            ]}
          />
        </Tabs.Content>
        <Tabs.Content value="cargos">
          <SimpleTab
            query={orgQueries.positions}
            path="/positions"
            singular="cargo"
            columns={[['title', 'Cargo'], ['level', 'Nível'], ['cbo', 'CBO']]}
            fields={[
              { name: 'title', label: 'Cargo', required: true },
              { name: 'level', label: 'Nível', hint: 'Ex.: Júnior, Pleno, Sênior' },
              { name: 'cbo', label: 'CBO', hint: 'Classificação Brasileira de Ocupações' },
            ]}
          />
        </Tabs.Content>
        <Tabs.Content value="centros">
          <SimpleTab
            query={orgQueries.costCenters}
            path="/cost-centers"
            singular="centro de custo"
            columns={[['code', 'Código'], ['name', 'Nome']]}
            fields={[
              { name: 'code', label: 'Código', required: true },
              { name: 'name', label: 'Nome', required: true },
            ]}
          />
        </Tabs.Content>
      </Tabs.Root>
    </>
  )
}

// ---------- organograma ----------

type Node = Department & { children: Node[] }

const buildTree = (list: Department[]) => {
  const byId = new Map<string, Node>(list.map(d => [d.id, { ...d, children: [] }]))
  const roots: Node[] = []
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

const totalHeadcount = (node: Node): number => node.headcount + node.children.reduce((sum, c) => sum + totalHeadcount(c), 0)

function OrgChart() {
  const query = useQuery(orgQueries.departments)
  const canSeePeople = useCan('employees.read')
  const tree = useMemo(() => buildTree(query.data ?? []), [query.data])

  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (query.isPending) return <Skeleton className="h-64" />
  if (tree.length === 0)
    return (
      <div className="rounded-md border border-line bg-paper">
        <EmptyState icon={Network} title="Nenhum departamento ainda">
          Crie os departamentos na aba Departamentos e indique a quem cada um se subordina.
        </EmptyState>
      </div>
    )

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-paper p-5">
      <ul role="tree" aria-label="Organograma" className="flex flex-col gap-1">
        {tree.map(node => <OrgNode key={node.id} node={node} depth={0} canSeePeople={canSeePeople} />)}
      </ul>
    </div>
  )
}

function OrgNode({ node, depth, canSeePeople }: { node: Node; depth: number; canSeePeople: boolean }) {
  const [open, setOpen] = useState(depth < 2)
  const hasChildren = node.children.length > 0
  const total = totalHeadcount(node)
  return (
    <li role="treeitem" aria-expanded={hasChildren ? open : undefined} aria-level={depth + 1}>
      <div className={cn('flex items-center gap-2 rounded-sm py-1.5 pr-3', depth === 0 && 'pb-2')}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          disabled={!hasChildren}
          aria-label={open ? `Recolher ${node.name}` : `Expandir ${node.name}`}
          className="flex size-6 items-center justify-center rounded-sm text-steel hover:bg-concrete disabled:invisible"
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <div className={cn('flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 rounded-sm border px-3 py-2', depth === 0 ? 'border-ink bg-ink text-paper' : 'border-line bg-paper')}>
          <span className={cn('font-display text-lg font-semibold', depth === 0 ? 'text-brand' : 'text-ink')}>{node.name}</span>
          <span className={cn('flex items-center gap-1.5 text-sm', depth === 0 ? 'text-paper/80' : 'text-steel')}>
            <UserRound className="size-3.5" aria-hidden />
            {node.managerName ?? 'Sem gestor'}
          </span>
          <span className={cn('num ml-auto text-sm', depth === 0 ? 'text-paper/80' : 'text-steel')}>
            {canSeePeople ? (
              <Link to="/colaboradores" search={{ departmentId: node.id }} className="underline-offset-2 hover:underline">
                {node.headcount} {node.headcount === 1 ? 'pessoa' : 'pessoas'}
              </Link>
            ) : (
              `${node.headcount} ${node.headcount === 1 ? 'pessoa' : 'pessoas'}`
            )}
            {hasChildren && ` (${total} com subáreas)`}
          </span>
        </div>
      </div>
      {hasChildren && open && (
        <ul role="group" className="ml-[11px] flex flex-col gap-1 border-l border-line-strong pl-5">
          {node.children.map(child => <OrgNode key={child.id} node={child} depth={depth + 1} canSeePeople={canSeePeople} />)}
        </ul>
      )}
    </li>
  )
}

// ---------- departamentos ----------

function DepartmentsTab() {
  const query = useQuery(orgQueries.departments)
  const canManage = useCan('org.manage')
  const [editing, setEditing] = useState<Department | 'new' | null>(null)
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: (d: Department) => api(`/departments/${d.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['departments'] })
      toast.success('Departamento excluído.')
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível excluir.'),
  })

  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  return (
    <>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden /> Novo departamento
          </Button>
        </div>
      )}
      <DataTable
        loading={query.isPending}
        rows={query.data ?? []}
        empty="Nenhum departamento cadastrado."
        columns={[
          ['Departamento', d => <span className="font-medium text-ink">{d.name}</span>],
          ['Subordinado a', d => d.parentName ?? '—'],
          ['Gestor', d => d.managerName ?? '—'],
          ['Unidade', d => d.unitName ?? '—'],
          ['Pessoas', d => <span className="num">{d.headcount}</span>],
        ]}
        actions={
          canManage
            ? d => (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(d)} aria-label={`Editar ${d.name}`}><Pencil className="size-4" /></Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Excluir ${d.name}`}
                    onClick={() => window.confirm(`Excluir o departamento ${d.name}?`) && remove.mutate(d)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )
            : undefined
        }
      />
      {editing && <DepartmentDrawer department={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function DepartmentDrawer({ department, onClose }: { department?: Department; onClose: () => void }) {
  const queryClient = useQueryClient()
  const departments = useQuery(orgQueries.departments)
  const units = useQuery(orgQueries.units)
  const costCenters = useQuery(orgQueries.costCenters)
  const people = useQuery({
    queryKey: ['employees', 'managers'],
    queryFn: () => api<Page<EmployeeListItem>>('/employees', { query: { status: 'active', pageSize: 100 } }),
  })
  const [form, setForm] = useState({
    name: department?.name ?? '',
    code: department?.code ?? '',
    parentId: department?.parentId ?? '',
    managerEmployeeId: department?.managerEmployeeId ?? '',
    unitId: department?.unitId ?? '',
    costCenterId: department?.costCenterId ?? '',
  })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })

  const save = useMutation({
    mutationFn: () => {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v || null]))
      return department
        ? api(`/departments/${department.id}`, { method: 'PUT', body })
        : api('/departments', { method: 'POST', body })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['departments'] })
      toast.success(department ? 'Departamento atualizado.' : 'Departamento criado.')
      onClose()
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar.'),
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate()
  }

  return (
    <Drawer
      open
      onOpenChange={open => !open && onClose()}
      title={department ? 'Editar departamento' : 'Novo departamento'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit} loading={save.isPending} disabled={form.name.trim().length < 2}>
            {department ? 'Salvar alterações' : 'Criar departamento'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" required className="sm:col-span-2">{p => <Input {...p} value={form.name} onChange={set('name')} />}</Field>
        <Field label="Código">{p => <Input {...p} value={form.code} onChange={set('code')} />}</Field>
        <Field label="Subordinado a">
          {p => (
            <Select {...p} value={form.parentId} onChange={set('parentId')}>
              <option value="">Nenhum (topo)</option>
              {departments.data?.filter(d => d.id !== department?.id).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Gestor" className="sm:col-span-2">
          {p => (
            <Select {...p} value={form.managerEmployeeId} onChange={set('managerEmployeeId')}>
              <option value="">Sem gestor</option>
              {people.data?.items.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Unidade">
          {p => (
            <Select {...p} value={form.unitId} onChange={set('unitId')}>
              <option value="">Sem unidade</option>
              {units.data?.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Centro de custo">
          {p => (
            <Select {...p} value={form.costCenterId} onChange={set('costCenterId')}>
              <option value="">Sem centro de custo</option>
              {costCenters.data?.map(c => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
            </Select>
          )}
        </Field>
        <button type="submit" hidden />
      </form>
    </Drawer>
  )
}

// ---------- cadastros simples ----------

type SimpleField = { name: string; label: string; required?: boolean; hint?: string; maxLength?: number }
type Row = { id: string } & Record<string, string | null>

function SimpleTab<T extends Row>({
  query,
  path,
  singular,
  columns,
  fields,
}: {
  query: UseQueryOptions<T[], Error, T[], string[]>
  path: string
  singular: string
  columns: [keyof T & string, string][]
  fields: SimpleField[]
}) {
  const data = useQuery(query)
  const canManage = useCan('org.manage')
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<T | 'new' | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})

  const open = (row: T | 'new') => {
    setValues(Object.fromEntries(fields.map(f => [f.name, row === 'new' ? '' : (row[f.name] ?? '')])))
    setEditing(row)
  }
  const invalidate = () => queryClient.invalidateQueries({ queryKey: query.queryKey })
  const save = useMutation({
    mutationFn: () => {
      const body = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim() || null]))
      return editing && editing !== 'new'
        ? api(`${path}/${editing.id}`, { method: 'PUT', body })
        : api(path, { method: 'POST', body })
    },
    onSuccess: () => {
      void invalidate()
      toast.success(editing === 'new' ? `Novo ${singular} salvo.` : 'Alterações salvas.')
      setEditing(null)
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar.'),
  })
  const remove = useMutation({
    mutationFn: (row: T) => api(`${path}/${row.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void invalidate()
      toast.success('Excluído.')
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível excluir.'),
  })
  const missing = fields.some(f => f.required && !values[f.name]?.trim())
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!missing) save.mutate()
  }

  if (data.isError) return <ErrorState error={data.error} onRetry={() => data.refetch()} />
  return (
    <>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button variant="primary" onClick={() => open('new')}>
            <Plus className="size-4" aria-hidden /> Adicionar {singular}
          </Button>
        </div>
      )}
      <DataTable
        loading={data.isPending}
        rows={data.data ?? []}
        empty={`Nenhum ${singular} cadastrado.`}
        columns={columns.map(([key, label], i) => [label, (row: T) => (i === 0 ? <span className="font-medium text-ink">{row[key]}</span> : (row[key] ?? '—'))])}
        actions={
          canManage
            ? row => (
                <>
                  <Button size="sm" variant="ghost" onClick={() => open(row)} aria-label="Editar"><Pencil className="size-4" /></Button>
                  <Button size="sm" variant="ghost" aria-label="Excluir" onClick={() => window.confirm(`Excluir este ${singular}?`) && remove.mutate(row)}>
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
        title={editing === 'new' ? `Novo ${singular}` : `Editar ${singular}`}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancelar</Button>
            <Button variant="primary" onClick={submit} loading={save.isPending} disabled={missing}>Salvar</Button>
          </>
        }
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          {fields.map(f => (
            <Field key={f.name} label={f.label} required={f.required} hint={f.hint}>
              {p => <Input {...p} value={values[f.name] ?? ''} maxLength={f.maxLength} onChange={e => setValues({ ...values, [f.name]: e.target.value })} />}
            </Field>
          ))}
          <button type="submit" hidden />
        </form>
      </Drawer>
    </>
  )
}

function DataTable<T extends { id: string }>({
  rows,
  columns,
  actions,
  loading,
  empty,
}: {
  rows: T[]
  columns: [string, (row: T) => React.ReactNode][]
  actions?: (row: T) => React.ReactNode
  loading: boolean
  empty: string
}) {
  if (loading) return <Skeleton className="h-48" />
  if (rows.length === 0)
    return (
      <div className="rounded-md border border-line bg-paper">
        <EmptyState icon={Building2} title={empty} />
      </div>
    )
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-paper">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-line bg-concrete/60 text-[13px] text-steel">
          <tr>
            {columns.map(([label]) => <th key={label} scope="col" className="px-5 py-2.5 font-medium">{label}</th>)}
            {actions && <th scope="col" className="w-24 px-5 py-2.5"><span className="sr-only">Ações</span></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(row => (
            <tr key={row.id} className="hover:bg-concrete/50">
              {columns.map(([label, render]) => <td key={label} className="px-5 py-2.5 text-ink-soft">{render(row)}</td>)}
              {actions && <td className="px-3 py-1.5 text-right whitespace-nowrap">{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
