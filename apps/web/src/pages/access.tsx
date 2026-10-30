import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Crown, MailPlus, UserRound, Users, UsersRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { ROLE_LABELS, ROLES, type Role } from '@falcao-rh/contracts'

import { Button } from '../components/ui/button'
import { Drawer } from '../components/ui/drawer'
import { Field, Input, Select } from '../components/ui/field'
import { TableFrame, TableSkeleton, thClass, trClass } from '../components/ui/data-table'
import { Avatar, Badge, ErrorState, PageHeader } from '../components/ui/layout'
import { api, ApiError } from '../lib/api'
import { formatDate } from '../lib/format'
import { useMe } from '../lib/session'
import type { EmployeeListItem, Member, Page } from '../lib/types'

const ROLE_ICONS = { admin: Crown, hr: UsersRound, manager: Users, employee: UserRound } as const

const ROLE_HINTS: Record<Role, string> = {
  admin: 'Tudo, inclusive usuários e configurações.',
  hr: 'Cadastros, estrutura e dados pessoais de todos.',
  manager: 'Painel e dados da própria equipe, sem dados pessoais sensíveis.',
  employee: 'Apenas o próprio cadastro, pelo portal.',
}

export function AccessPage() {
  const me = useMe()
  const queryClient = useQueryClient()
  const [inviting, setInviting] = useState(false)
  const members = useQuery({ queryKey: ['members'], queryFn: () => api<Member[]>('/members') })
  const people = useQuery({
    queryKey: ['employees', 'all-active'],
    queryFn: () => api<Page<EmployeeListItem>>('/employees', { query: { pageSize: 100 } }),
  })

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Pick<Member, 'role' | 'status' | 'employeeId'>> }) =>
      api(`/members/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['members'] })
      toast.success('Acesso atualizado.')
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível atualizar.'),
  })

  return (
    <>
      <PageHeader
        eyebrow="Administração"
        title="Usuários e acessos"
        description="Quem entra no sistema e o que cada perfil pode ver. Cada pessoa recebe um link para definir a própria senha."
        actions={
          <Button variant="primary" onClick={() => setInviting(true)}>
            <MailPlus className="size-4" aria-hidden /> Convidar pessoa
          </Button>
        }
      />

      <dl className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ROLES.map(role => {
          const Icon = ROLE_ICONS[role]
          const total = members.data?.filter(m => m.role === role).length
          return (
            <div key={role} data-reveal className="surface group relative overflow-hidden p-5 transition-shadow duration-300 hover:shadow-lift">
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-sm bg-night text-brand transition-transform duration-500 group-hover:-rotate-6">
                  <Icon className="size-4" aria-hidden />
                </span>
                {total !== undefined && <span className="num font-display text-[32px] leading-none font-semibold text-ink">{total}</span>}
              </div>
              <dt className="mt-4 font-medium text-ink">{ROLE_LABELS[role]}</dt>
              <dd className="mt-0.5 text-[13px] leading-snug text-steel">{ROLE_HINTS[role]}</dd>
            </div>
          )
        })}
      </dl>

      {members.isError && <ErrorState error={members.error} onRetry={() => members.refetch()} />}
      {members.isPending ? (
        <TableFrame>
          <TableSkeleton />
        </TableFrame>
      ) : (
        <TableFrame>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-line bg-sunken/70">
              <tr>
                <th scope="col" className={thClass}>Pessoa</th>
                <th scope="col" className={thClass}>Perfil</th>
                <th scope="col" className={thClass}>Ficha de colaborador</th>
                <th scope="col" className={thClass}>Desde</th>
                <th scope="col" className={thClass}>Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {members.data?.map(m => {
                const self = m.userId === me.user.id
                return (
                  <tr key={m.id} data-reveal-row className={trClass}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={m.name} className={m.status === 'active' ? undefined : 'opacity-50'} />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-ink">
                            {m.name}
                            {self && <span className="ml-1.5 rounded-full bg-brand-soft px-1.5 py-px text-[11px] font-medium text-brand-ink">você</span>}
                          </div>
                          <div className="truncate text-[12.5px] text-steel">{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Select
                        aria-label={`Perfil de ${m.name}`}
                        value={m.role}
                        disabled={self || update.isPending}
                        onChange={e => update.mutate({ id: m.id, body: { role: e.target.value as Role } })}
                        className="h-9 w-44"
                      >
                        {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </Select>
                    </td>
                    <td className="px-5 py-3">
                      <Select
                        aria-label={`Ficha de ${m.name}`}
                        value={m.employeeId ?? ''}
                        disabled={update.isPending}
                        onChange={e => update.mutate({ id: m.id, body: { employeeId: e.target.value || null } })}
                        className="h-9 w-56"
                      >
                        <option value="">Não vinculada</option>
                        {people.data?.items.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                      </Select>
                    </td>
                    <td className="num px-5 py-3 text-steel">{formatDate(m.createdAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Badge tone={m.status === 'active' ? 'ok' : 'neutral'}>{m.status === 'active' ? 'Ativo' : 'Desativado'}</Badge>
                        {!self && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => update.mutate({ id: m.id, body: { status: m.status === 'active' ? 'disabled' : 'active' } })}
                          >
                            {m.status === 'active' ? 'Desativar' : 'Reativar'}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </TableFrame>
      )}

      <InviteDrawer open={inviting} onOpenChange={setInviting} people={people.data?.items ?? []} />
    </>
  )
}

function InviteDrawer({
  open,
  onOpenChange,
  people,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  people: EmployeeListItem[]
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ name: '', email: '', role: 'employee' as Role, employeeId: '' })
  const invite = useMutation({
    mutationFn: () => api('/members', { method: 'POST', body: { ...form, employeeId: form.employeeId || null } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['members'] })
      toast.success(`Convite enviado para ${form.email}.`)
      setForm({ name: '', email: '', role: 'employee', employeeId: '' })
      onOpenChange(false)
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível convidar.'),
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    invite.mutate()
  }
  const valid = form.name.trim().length >= 3 && /\S+@\S+\.\S+/.test(form.email)

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Convidar pessoa"
      description="Ela recebe por e-mail um link, válido por 24 horas, para definir a senha."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="primary" onClick={submit} loading={invite.isPending} disabled={!valid}>Enviar convite</Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nome" required>{p => <Input {...p} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />}</Field>
        <Field label="E-mail" required>{p => <Input {...p} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />}</Field>
        <Field label="Perfil" required hint={ROLE_HINTS[form.role]}>
          {p => (
            <Select {...p} value={form.role} onChange={e => setForm({ ...form, role: e.target.value as Role })}>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Ficha de colaborador" hint="Necessária para o portal e para o escopo de gestor.">
          {p => (
            <Select {...p} value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })}>
              <option value="">Não vincular agora</option>
              {people.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}
            </Select>
          )}
        </Field>
        <button type="submit" hidden />
      </form>
    </Drawer>
  )
}
