import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowUpRight, ChevronLeft, ChevronRight, FileDown, FileUp, Plus, Search, SearchX, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { useEffect, useState } from 'react'

import { EMPLOYEE_STATUSES } from '@falcao-rh/contracts'

import { EmployeeForm } from '../features/employee-form'
import { ImportDrawer } from '../features/employee-import'
import { Button } from '../components/ui/button'
import { TableFrame, TableSkeleton, thClass, trClass } from '../components/ui/data-table'
import { Input, Select } from '../components/ui/field'
import { Avatar, Badge, EmptyState, ErrorState, PageHeader } from '../components/ui/layout'
import { api, apiDownload } from '../lib/api'
import { cn } from '../lib/cn'
import { contractLabel, formatDate, formatNumber, statusLabel, statusTone } from '../lib/format'
import { orgQueries } from '../lib/queries'
import { useCan } from '../lib/session'
import type { EmployeeListItem, EmployeeStatus, Page } from '../lib/types'

const PAGE_SIZE = 25

export function EmployeesPage() {
  const search = useSearch({ strict: false }) as {
    q?: string
    status?: EmployeeStatus
    departmentId?: string
    page?: number
  }
  const navigate = useNavigate()
  const canCreate = useCan('employees.create')
  const canImport = useCan('employees.import')
  const canExport = useCan('employees.export')
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const exportSheet = async () => {
    setExporting(true)
    await apiDownload('/employees/export', 'colaboradores.xlsx').catch(() => toast.error('Não foi possível exportar.'))
    setExporting(false)
  }
  const [q, setQ] = useState(search.q ?? '')
  const departments = useQuery(orgQueries.departments)

  // Busca enquanto digita, sem uma requisição por tecla.
  useEffect(() => setQ(search.q ?? ''), [search.q])
  useEffect(() => {
    const handle = setTimeout(() => {
      if ((search.q ?? '') !== q.trim()) setSearch({ q: q.trim() || undefined, page: undefined })
    }, 300)
    return () => clearTimeout(handle)
  })

  const setSearch = (patch: Partial<typeof search>) =>
    void navigate({ to: '/colaboradores', search: { ...search, ...patch }, replace: true })

  const page = search.page ?? 1
  const query = useQuery({
    queryKey: ['employees', search],
    queryFn: () =>
      api<Page<EmployeeListItem>>('/employees', {
        query: { q: search.q, status: search.status, departmentId: search.departmentId, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: previous => previous,
  })
  const data = query.data
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const filtered = Boolean(search.q || search.status || search.departmentId)
  const clear = () => navigate({ to: '/colaboradores', search: {} })
  const departmentName = departments.data?.find(d => d.id === search.departmentId)?.name

  return (
    <>
      <PageHeader
        eyebrow="Gestão de pessoas"
        title="Colaboradores"
        description={data ? `${formatNumber(data.total)} ${data.total === 1 ? 'pessoa encontrada' : 'pessoas encontradas'}.` : 'Cadastro, fichas e histórico.'}
        actions={
          <>
            {canExport && (
              <Button onClick={exportSheet} loading={exporting}>
                <FileDown className="size-4" aria-hidden /> Exportar
              </Button>
            )}
            {canImport && (
              <Button onClick={() => setImporting(true)}>
                <FileUp className="size-4" aria-hidden /> Importar
              </Button>
            )}
            {canCreate && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus className="size-4" aria-hidden /> Novo colaborador
              </Button>
            )}
          </>
        }
      />

      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}

      <TableFrame>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <label className="relative min-w-56 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel" aria-hidden />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Nome, matrícula ou e-mail" aria-label="Buscar" className="pl-9" />
          </label>
          <Select
            aria-label="Situação"
            value={search.status ?? ''}
            onChange={e => setSearch({ status: (e.target.value || undefined) as EmployeeStatus | undefined, page: undefined })}
            className="w-auto"
          >
            <option value="">Todas as situações</option>
            {EMPLOYEE_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </Select>
          <Select
            aria-label="Departamento"
            value={search.departmentId ?? ''}
            onChange={e => setSearch({ departmentId: e.target.value || undefined, page: undefined })}
            className="w-auto max-w-64"
          >
            <option value="">Todos os departamentos</option>
            {departments.data?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          {filtered && (
            <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
              {search.status && <Chip onRemove={() => setSearch({ status: undefined, page: undefined })}>{statusLabel(search.status)}</Chip>}
              {departmentName && <Chip onRemove={() => setSearch({ departmentId: undefined, page: undefined })}>{departmentName}</Chip>}
              <Button size="sm" variant="ghost" onClick={clear}>
                Limpar filtros
              </Button>
            </div>
          )}
        </div>

        <div className={cn('transition-opacity duration-300', query.isFetching && data && 'opacity-60')}>
          {!data && query.isPending ? (
            <TableSkeleton rows={8} />
          ) : data && data.items.length === 0 ? (
            filtered ? (
              <EmptyState icon={SearchX} title="Ninguém encontrado com esses filtros" action={<Button onClick={clear}>Limpar filtros</Button>}>
                Confira a grafia ou tente buscar pela matrícula.
              </EmptyState>
            ) : (
              <EmptyState
                icon={Users}
                title="Nenhum colaborador cadastrado"
                action={canCreate && <Button variant="primary" onClick={() => setCreating(true)}>Cadastrar o primeiro</Button>}
              >
                Comece pelo cadastro das pessoas; departamentos e cargos podem ser criados em Estrutura.
              </EmptyState>
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-line bg-sunken/70">
                  <tr>
                    <th scope="col" className={thClass}>Colaborador</th>
                    <th scope="col" className={thClass}>Cargo e departamento</th>
                    <th scope="col" className={thClass}>Gestor</th>
                    <th scope="col" className={thClass}>Admissão</th>
                    <th scope="col" className={thClass}>Situação</th>
                    <th scope="col" className="w-12"><span className="sr-only">Abrir</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data?.items.map(e => (
                    <tr
                      key={e.id}
                      data-reveal-row
                      className={cn(trClass, 'cursor-pointer')}
                      onClick={() => navigate({ to: '/colaboradores/$id', params: { id: e.id } })}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={e.socialName ?? e.fullName} />
                          <div className="min-w-0">
                            <Link
                              to="/colaboradores/$id"
                              params={{ id: e.id }}
                              onClick={event => event.stopPropagation()}
                              className="block truncate font-medium text-ink decoration-brand decoration-2 underline-offset-4 group-hover/row:underline"
                            >
                              {e.socialName ?? e.fullName}
                            </Link>
                            <div className="num text-[12.5px] text-steel">Matrícula {e.registration}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="text-ink-soft">{e.positionTitle ?? <span className="text-steel-soft">Sem cargo</span>}</div>
                        <div className="text-[12.5px] text-steel">{e.departmentName ?? 'Sem departamento'}</div>
                      </td>
                      <td className="px-5 py-3 text-ink-soft">{e.managerName ?? <span className="text-steel-soft">Não definido</span>}</td>
                      <td className="num px-5 py-3 text-ink-soft">
                        {formatDate(e.hireDate)}
                        <div className="text-[12.5px] text-steel">{contractLabel(e.contractType)}</div>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={statusTone(e.status)}>{statusLabel(e.status)}</Badge>
                      </td>
                      <td className="pr-4">
                        <ArrowUpRight className="size-4 text-steel-soft opacity-0 transition-all duration-300 group-hover/row:translate-x-0.5 group-hover/row:-translate-y-0.5 group-hover/row:text-ink group-hover/row:opacity-100" aria-hidden />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {data && data.total > 0 && (
          <nav aria-label="Paginação" className="flex items-center justify-between gap-3 border-t border-line bg-sunken/50 px-5 py-2.5 text-[13px] text-steel">
            <span className="num">
              {formatNumber((page - 1) * PAGE_SIZE + 1)}–{formatNumber(Math.min(page * PAGE_SIZE, data.total))} de {formatNumber(data.total)}
            </span>
            {pages > 1 && (
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" disabled={page <= 1} onClick={() => setSearch({ page: page - 1 })} aria-label="Página anterior">
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="num px-2">
                  Página <span className="font-medium text-ink">{page}</span> de {pages}
                </span>
                <Button size="icon" variant="ghost" disabled={page >= pages} onClick={() => setSearch({ page: page + 1 })} aria-label="Próxima página">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </nav>
        )}
      </TableFrame>

      {canImport && <ImportDrawer open={importing} onOpenChange={setImporting} />}
      <EmployeeForm
        open={creating}
        onOpenChange={setCreating}
        onSaved={id => navigate({ to: '/colaboradores/$id', params: { id } })}
      />
    </>
  )
}

function Chip({ children, onRemove }: { children: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-0.5 pr-1 pl-2.5 text-[12.5px] font-medium text-brand-ink ring-1 ring-brand-strong/30">
      {children}
      <button type="button" onClick={onRemove} className="rounded-full p-0.5 hover:bg-brand/30" aria-label={`Remover filtro ${children}`}>
        <X className="size-3" />
      </button>
    </span>
  )
}
