import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, FileDown, FileUp, Plus, SearchX, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useEffect, useState } from 'react'

import { EMPLOYEE_STATUSES } from '@falcao-rh/contracts'

import { EmployeeForm } from '../features/employee-form'
import { ImportDrawer } from '../features/employee-import'
import { Button } from '../components/ui/button'
import { Input, Select } from '../components/ui/field'
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui/layout'
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

  return (
    <>
      <PageHeader
        title="Colaboradores"
        description={data ? `${formatNumber(data.total)} ${data.total === 1 ? 'pessoa encontrada' : 'pessoas encontradas'}.` : undefined}
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

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Nome, matrícula ou e-mail"
          aria-label="Buscar"
          className="max-w-xs"
        />
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
          className="w-auto max-w-60"
        >
          <option value="">Todos os departamentos</option>
          {departments.data?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        {filtered && (
          <Button variant="ghost" onClick={() => navigate({ to: '/colaboradores', search: {} })}>
            Limpar filtros
          </Button>
        )}
      </div>

      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}

      <div className={cn('overflow-hidden rounded-md border border-line bg-paper', query.isFetching && 'opacity-75')}>
        {!data && query.isPending ? (
          <div className="flex flex-col gap-3 p-5">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-9" />)}</div>
        ) : data && data.items.length === 0 ? (
          filtered ? (
            <EmptyState icon={SearchX} title="Ninguém encontrado com esses filtros" action={<Button onClick={() => navigate({ to: '/colaboradores', search: {} })}>Limpar filtros</Button>}>
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
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line bg-concrete/60 text-[13px] text-steel">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">Colaborador</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Cargo e departamento</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Gestor</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Admissão</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data?.items.map(e => (
                  <tr key={e.id} className="group hover:bg-concrete/50">
                    <td className="px-5 py-3">
                      <Link to="/colaboradores/$id" params={{ id: e.id }} className="font-medium text-ink group-hover:underline">
                        {e.socialName ?? e.fullName}
                      </Link>
                      <div className="num text-[13px] text-steel">Matrícula {e.registration}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-ink-soft">{e.positionTitle ?? <span className="text-steel-soft">Sem cargo</span>}</div>
                      <div className="text-[13px] text-steel">{e.departmentName ?? 'Sem departamento'}</div>
                    </td>
                    <td className="px-3 py-3 text-ink-soft">{e.managerName ?? <span className="text-steel-soft">Não definido</span>}</td>
                    <td className="num px-3 py-3 text-ink-soft">
                      {formatDate(e.hireDate)}
                      <div className="text-[13px] text-steel">{contractLabel(e.contractType)}</div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={statusTone(e.status)}>{statusLabel(e.status)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > PAGE_SIZE && (
          <nav aria-label="Paginação" className="flex items-center justify-between border-t border-line px-5 py-2.5 text-sm text-steel">
            <span className="num">Página {page} de {pages}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setSearch({ page: page - 1 })} aria-label="Página anterior">
                <ChevronLeft className="size-4" />
              </Button>
              <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setSearch({ page: page + 1 })} aria-label="Próxima página">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </nav>
        )}
      </div>

      {canImport && <ImportDrawer open={importing} onOpenChange={setImporting} />}
      <EmployeeForm
        open={creating}
        onOpenChange={setCreating}
        onSaved={id => navigate({ to: '/colaboradores/$id', params: { id } })}
      />
    </>
  )
}
