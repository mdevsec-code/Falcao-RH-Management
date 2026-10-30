import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'

import { CONTRACT_TYPE_LABELS, CONTRACT_TYPES, employeeInput, formatCpf } from '@falcao-rh/contracts'

import { Button } from '../components/ui/button'
import { Drawer } from '../components/ui/drawer'
import { Field, Input, Select } from '../components/ui/field'
import { api, ApiError } from '../lib/api'
import { orgQueries } from '../lib/queries'
import type { EmployeeDetail, EmployeeListItem, Page } from '../lib/types'

type FormValues = z.input<typeof employeeInput>
type Output = z.output<typeof employeeInput>

const toForm = (e?: EmployeeDetail): FormValues =>
  e
    ? {
        registration: e.registration,
        fullName: e.fullName,
        socialName: e.socialName ?? '',
        cpf: e.isMasked ? '' : formatCpf(e.cpf),
        birthDate: e.birthDate,
        email: e.email ?? '',
        phone: e.phone ?? '',
        departmentId: e.departmentId,
        positionId: e.positionId,
        managerId: e.managerId,
        unitId: e.unitId,
        costCenterId: e.costCenterId,
        hireDate: e.hireDate,
        contractType: e.contractType,
        workSchedule: e.workSchedule ?? '',
      }
    : { registration: '', fullName: '', cpf: '', hireDate: '', contractType: 'clt' }

/** Selects opcionais: "" no formulário vira null na API. */
const optional = { setValueAs: (value: string | null) => (value ? value : null) }

export function EmployeeForm({
  open,
  onOpenChange,
  employee,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee?: EmployeeDetail
  onSaved?: (id: string) => void
}) {
  const queryClient = useQueryClient()
  const departments = useQuery({ ...orgQueries.departments, enabled: open })
  const positions = useQuery({ ...orgQueries.positions, enabled: open })
  const units = useQuery({ ...orgQueries.units, enabled: open })
  const costCenters = useQuery({ ...orgQueries.costCenters, enabled: open })
  // TODO(ROADMAP): busca assíncrona de gestor para quadros acima de 100 pessoas.
  const managers = useQuery({
    queryKey: ['employees', 'managers'],
    queryFn: () => api<Page<EmployeeListItem>>('/employees', { query: { status: 'active', pageSize: 100 } }),
    enabled: open,
  })

  const form = useForm<FormValues, unknown, Output>({
    resolver: zodResolver(employeeInput),
    values: toForm(employee),
    resetOptions: { keepDirtyValues: false },
  })
  const { register, handleSubmit, formState, setError } = form
  const errors = formState.errors

  const save = useMutation({
    mutationFn: (values: Output) =>
      employee
        ? api<EmployeeDetail>(`/employees/${employee.id}`, { method: 'PATCH', body: values })
        : api<EmployeeDetail>('/employees', { method: 'POST', body: values }),
    onSuccess: saved => {
      void queryClient.invalidateQueries({ queryKey: ['employees'] })
      void queryClient.invalidateQueries({ queryKey: ['employee', saved.id] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['departments'] })
      toast.success(employee ? 'Cadastro atualizado.' : 'Colaborador cadastrado.')
      onOpenChange(false)
      onSaved?.(saved.id)
    },
    onError: error => {
      if (error instanceof ApiError && error.issues.length)
        for (const issue of error.issues) setError(issue.path as keyof FormValues, { message: issue.message })
      toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar.')
    },
  })

  // Sem permissão de dados sensíveis o CPF vem mascarado: não é reenviado.
  const submit = handleSubmit(values => {
    const body: Partial<Output> = { ...values }
    if (employee?.isMasked) delete body.cpf
    save.mutate(body as Output)
  })

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={employee ? 'Editar cadastro' : 'Novo colaborador'}
      description={employee ? employee.fullName : 'Campos com * são obrigatórios.'}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="primary" onClick={submit} loading={save.isPending}>
            {employee ? 'Salvar alterações' : 'Cadastrar colaborador'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-7" noValidate>
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 font-display text-xl font-semibold text-ink">Dados pessoais</legend>
          <Field label="Nome completo" required error={errors.fullName?.message} className="sm:col-span-2">
            {p => <Input {...p} {...register('fullName')} autoComplete="off" />}
          </Field>
          <Field label="Nome social" error={errors.socialName?.message} className="sm:col-span-2" hint="Usado em todas as telas no lugar do nome civil.">
            {p => <Input {...p} {...register('socialName')} />}
          </Field>
          {!employee?.isMasked && (
            <Field label="CPF" required error={errors.cpf?.message}>
              {p => <Input {...p} {...register('cpf')} inputMode="numeric" placeholder="000.000.000-00" />}
            </Field>
          )}
          <Field label="Data de nascimento" error={errors.birthDate?.message}>
            {p => <Input {...p} type="date" {...register('birthDate', optional)} />}
          </Field>
          <Field label="E-mail" error={errors.email?.message}>
            {p => <Input {...p} type="email" {...register('email')} />}
          </Field>
          <Field label="Telefone" error={errors.phone?.message}>
            {p => <Input {...p} type="tel" {...register('phone')} />}
          </Field>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 font-display text-xl font-semibold text-ink">Vínculo</legend>
          <Field label="Matrícula" required error={errors.registration?.message}>
            {p => <Input {...p} {...register('registration')} />}
          </Field>
          <Field label="Data de admissão" required error={errors.hireDate?.message}>
            {p => <Input {...p} type="date" {...register('hireDate')} />}
          </Field>
          <Field label="Tipo de contrato" required error={errors.contractType?.message}>
            {p => (
              <Select {...p} {...register('contractType')}>
                {CONTRACT_TYPES.map(type => <option key={type} value={type}>{CONTRACT_TYPE_LABELS[type]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Jornada" error={errors.workSchedule?.message} hint="Ex.: 08:00–17:48, seg. a sex.">
            {p => <Input {...p} {...register('workSchedule')} />}
          </Field>
          <Field label="Departamento">
            {p => (
              <Select {...p} {...register('departmentId', optional)}>
                <option value="">Sem departamento</option>
                {departments.data?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Cargo">
            {p => (
              <Select {...p} {...register('positionId', optional)}>
                <option value="">Sem cargo</option>
                {positions.data?.map(x => <option key={x.id} value={x.id}>{x.title}{x.level ? ` (${x.level})` : ''}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Gestor direto">
            {p => (
              <Select {...p} {...register('managerId', optional)}>
                <option value="">Sem gestor</option>
                {managers.data?.items
                  .filter(m => m.id !== employee?.id)
                  .map(m => <option key={m.id} value={m.id}>{m.fullName}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Unidade">
            {p => (
              <Select {...p} {...register('unitId', optional)}>
                <option value="">Sem unidade</option>
                {units.data?.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Centro de custo">
            {p => (
              <Select {...p} {...register('costCenterId', optional)}>
                <option value="">Sem centro de custo</option>
                {costCenters.data?.map(c => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
              </Select>
            )}
          </Field>
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Drawer>
  )
}
