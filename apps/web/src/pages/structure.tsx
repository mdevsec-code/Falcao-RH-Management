import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Building2, ChevronDown, Network, Pencil, Plus, Trash2, UserRound, Users } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { Button } from '../components/ui/button'
import { Drawer } from '../components/ui/drawer'
import { Field, Input, Select } from '../components/ui/field'
import { TableFrame, TableSkeleton, thClass, trClass } from '../components/ui/data-table'
import { Avatar, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui/layout'
import { TabList, Tabs } from '../components/ui/tabs'
import { gsap, MOTION, useGSAP } from '../lib/gsap'
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
  const [tab, setTab] = useState<string>('organograma')
  return (
    <>
      <PageHeader
        eyebrow="Organização"
        title="Estrutura"
        description="Como a empresa se organiza: departamentos, quem os lidera, unidades, cargos e centros de custo."
      />
      <Tabs.Root value={tab} onValueChange={setTab}>
        <TabList label="Seções da estrutura" value={tab} items={TABS.map(([value, label]) => ({ value, label }))} />
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
      <div className="surface">
        <EmptyState icon={Network} title="Nenhum departamento ainda">
          Crie os departamentos na aba Departamentos e indique a quem cada um se subordina.
        </EmptyState>
      </div>
    )

  return (
    <div data-reveal className="surface overflow-x-auto p-5 sm:p-6">
      <ul role="tree" aria-label="Organograma" className="flex flex-col gap-2">
        {tree.map(node => <OrgNode key={node.id} node={node} depth={0} canSeePeople={canSeePeople} />)}
      </ul>
    </div>
  )
}

/**
 * Nó do organograma. Abrir e fechar anima a altura do grupo de subáreas
 * (GSAP), com os filhos entrando em cascata.
 */
function OrgNode({ node, depth, canSeePeople }: { node: Node; depth: number; canSeePeople: boolean }) {
  const [open, setOpen] = useState(depth < 2)
  const hasChildren = node.children.length > 0
  const total = totalHeadcount(node)
  const group = useRef<HTMLUListElement>(null)
  const closing = useRef(false)
  // Abriu: o grupo (já no DOM) cresce e os filhos entram em cascata.
  const first = useRef(true)
  useGSAP(
    () => {
      if (first.current || !open || !group.current) return void (first.current = false)
      const mm = gsap.matchMedia()
      mm.add(MOTION.ok, () => {
        gsap.fromTo(group.current, { height: 0, autoAlpha: 0 }, { height: 'auto', autoAlpha: 1, duration: 0.5, clearProps: 'height,opacity,visibility' })
        gsap.from(group.current!.children, { x: -12, autoAlpha: 0, stagger: 0.04, duration: 0.45, delay: 0.08, clearProps: 'transform,opacity,visibility' })
      })
    },
    { dependencies: [open] },
  )
  const { contextSafe } = useGSAP()
  // Fechando: recolhe antes de sair do DOM.
  const toggle = contextSafe(() => {
    const el = group.current
    if (!open || !el || !window.matchMedia(MOTION.ok).matches) return setOpen(!open)
    if (closing.current) return
    closing.current = true
    gsap.to(el, {
      height: 0,
      autoAlpha: 0,
      duration: 0.35,
      ease: 'power2.inOut',
      onComplete: () => {
        closing.current = false
        setOpen(false)
      },
    })
  })
  const root = depth === 0
  return (
    <li role="treeitem" aria-expanded={hasChildren ? open : undefined} aria-level={depth + 1}>
      <div className="group/node flex items-center gap-2 py-1">
        <button
          type="button"
          onClick={toggle}
          disabled={!hasChildren}
          aria-label={open ? `Recolher ${node.name}` : `Expandir ${node.name}`}
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-steel transition-colors hover:bg-ink/5 hover:text-ink disabled:invisible"
        >
          <ChevronDown className={cn('size-4 transition-transform duration-300', !open && '-rotate-90')} />
        </button>
        <div
          className={cn(
            'relative flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-1.5 overflow-hidden rounded-md border px-4 py-3 transition-all duration-300',
            root ? 'night-glow border-night-line text-snow shadow-lift' : 'border-line bg-paper shadow-xs group-hover/node:border-line-strong group-hover/node:shadow-card',
          )}
        >
          {!root && <span className="absolute inset-y-0 left-0 w-[3px] bg-brand opacity-0 transition-opacity group-hover/node:opacity-100" aria-hidden />}
          <span className={cn('font-display text-[21px] leading-none font-semibold', root ? 'text-brand' : 'text-ink')}>{node.name}</span>
          <span className={cn('flex items-center gap-2 text-[13px]', root ? 'text-fog' : 'text-steel')}>
            {node.managerName ? <Avatar name={node.managerName} size="sm" className="rounded-full" /> : <UserRound className="size-3.5" aria-hidden />}
            {node.managerName ?? 'Sem gestor'}
          </span>
          <span className={cn('num ml-auto flex items-center gap-1.5 text-[13px]', root ? 'text-fog' : 'text-steel')}>
            <Users className="size-3.5" aria-hidden />
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
        <ul ref={group} role="group" className="ml-[13px] flex flex-col gap-2 overflow-hidden border-l-2 border-dashed border-line-strong pt-1 pl-6">
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
  if (loading)
    return (
      <TableFrame>
        <TableSkeleton rows={5} />
      </TableFrame>
    )
  if (rows.length === 0)
    return (
      <TableFrame>
        <EmptyState icon={Building2} title={empty} />
      </TableFrame>
    )
  return (
    <TableFrame>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-line bg-sunken/70">
            <tr>
              {columns.map(([label]) => <th key={label} scope="col" className={thClass}>{label}</th>)}
              {actions && <th scope="col" className="w-24 px-5 py-3"><span className="sr-only">Ações</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(row => (
              <tr key={row.id} data-reveal-row className={trClass}>
                {columns.map(([label, render]) => <td key={label} className="px-5 py-3 text-ink-soft">{render(row)}</td>)}
                {actions && (
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    <div className="flex justify-end gap-0.5 opacity-70 transition-opacity group-hover/row:opacity-100">{actions(row)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TableFrame>
  )
}
