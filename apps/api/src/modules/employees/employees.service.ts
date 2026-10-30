import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  can,
  maskCpf,
  type EmployeeFilters,
  type EmployeeInput,
  type EmployeeStatusChange,
  type EmployeeUpdate,
} from '@falcao-rh/contracts'

import type { Tx } from '../../db/client'
import { costCenters, departments, employeeEvents, employees, positions, units, user } from '../../db/schema'
import type { Ctx } from '../../http/context'
import { audit, changedKeys } from '../../lib/audit'
import { calendarDate } from '../../lib/dates'
import { badRequest, forbidden, notFound } from '../../lib/errors'

type EmployeeRow = typeof employees.$inferSelect

// ---------- escopo e privacidade ----------

/**
 * Condição de escopo de dados do perfil (ADR-0006):
 * gestores veem subordinados diretos e quem está nos departamentos que
 * gerenciam; colaboradores, apenas a si mesmos.
 */
export const scopeCondition = (ctx: Ctx): SQL | undefined => {
  if (ctx.scope === 'all') return undefined
  if (!ctx.employeeId) return sql`false`
  if (ctx.scope === 'self') return eq(employees.id, ctx.employeeId)
  return or(
    eq(employees.id, ctx.employeeId),
    eq(employees.managerId, ctx.employeeId),
    sql`${employees.departmentId} in (select id from departments where manager_employee_id = ${ctx.employeeId})`,
  )
}

/** Dados pessoais só aparecem por inteiro para quem tem permissão, ou para o próprio titular. */
const present = (row: EmployeeRow, ctx: Ctx) => {
  const full = can(ctx.role, 'employees.read_sensitive') || row.id === ctx.employeeId
  return {
    ...row,
    cpf: full ? row.cpf : maskCpf(row.cpf),
    birthDate: full ? row.birthDate : null,
    address: full ? row.address : null,
    phone: full ? row.phone : null,
    isMasked: !full,
  }
}

// ---------- consultas ----------

const manager = alias(employees, 'manager')

const listColumns = {
  id: employees.id,
  registration: employees.registration,
  fullName: employees.fullName,
  socialName: employees.socialName,
  email: employees.email,
  status: employees.status,
  contractType: employees.contractType,
  hireDate: employees.hireDate,
  departmentId: employees.departmentId,
  departmentName: departments.name,
  positionTitle: positions.title,
  unitName: units.name,
  managerName: manager.fullName,
}

export const listEmployees = async (tx: Tx, ctx: Ctx, filters: EmployeeFilters) => {
  const conditions = [
    scopeCondition(ctx),
    filters.status ? eq(employees.status, filters.status) : undefined,
    filters.departmentId ? eq(employees.departmentId, filters.departmentId) : undefined,
    filters.unitId ? eq(employees.unitId, filters.unitId) : undefined,
    filters.q
      ? or(
          ilike(employees.fullName, `%${filters.q}%`),
          ilike(employees.socialName, `%${filters.q}%`),
          ilike(employees.registration, `%${filters.q}%`),
          ilike(employees.email, `%${filters.q}%`),
          // Busca por CPF só para quem pode ver CPF.
          can(ctx.role, 'employees.read_sensitive') && /^\d{11}$/.test(filters.q.replace(/\D/g, ''))
            ? eq(employees.cpf, filters.q.replace(/\D/g, ''))
            : undefined,
        )
      : undefined,
  ].filter(Boolean) as SQL[]
  const where = conditions.length ? and(...conditions) : undefined

  const order = {
    name: asc(employees.fullName),
    hireDate: desc(employees.hireDate),
    registration: asc(employees.registration),
  }[filters.sort]

  const [items, [total]] = await Promise.all([
    tx
      .select(listColumns)
      .from(employees)
      .leftJoin(departments, eq(departments.id, employees.departmentId))
      .leftJoin(positions, eq(positions.id, employees.positionId))
      .leftJoin(units, eq(units.id, employees.unitId))
      .leftJoin(manager, eq(manager.id, employees.managerId))
      .where(where)
      .orderBy(order, asc(employees.id))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    tx.select({ value: count() }).from(employees).where(where),
  ])

  return { items, total: total?.value ?? 0, page: filters.page, pageSize: filters.pageSize }
}

const findInScope = async (tx: Tx, ctx: Ctx, id: string) => {
  const [row] = await tx
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), scopeCondition(ctx)))
  if (!row) throw notFound('Colaborador')
  return row
}

export const getEmployee = async (tx: Tx, ctx: Ctx, id: string) => {
  const row = await findInScope(tx, ctx, id)
  const [refs] = await tx
    .select({
      departmentName: departments.name,
      positionTitle: positions.title,
      unitName: units.name,
      costCenterName: costCenters.name,
      managerName: manager.fullName,
    })
    .from(employees)
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(positions, eq(positions.id, employees.positionId))
    .leftJoin(units, eq(units.id, employees.unitId))
    .leftJoin(costCenters, eq(costCenters.id, employees.costCenterId))
    .leftJoin(manager, eq(manager.id, employees.managerId))
    .where(eq(employees.id, id))

  const history = await tx
    .select({
      id: employeeEvents.id,
      type: employeeEvents.type,
      effectiveDate: employeeEvents.effectiveDate,
      reason: employeeEvents.reason,
      fields: sql<string[]>`coalesce(array(select jsonb_object_keys(${employeeEvents.after})), '{}')`,
      actorName: user.name,
      createdAt: employeeEvents.createdAt,
    })
    .from(employeeEvents)
    .leftJoin(user, eq(user.id, employeeEvents.actorUserId))
    .where(eq(employeeEvents.employeeId, id))
    .orderBy(desc(employeeEvents.effectiveDate), desc(employeeEvents.createdAt))

  await audit(tx, ctx, { action: 'view', entity: 'employee', entityId: id })
  return { ...present(row, ctx), ...refs, history }
}

// ---------- escrita ----------

const today = () => calendarDate()

/** Movimentações que viram eventos próprios no histórico funcional. */
const MOVEMENTS = [
  ['departmentId', 'department_changed'],
  ['positionId', 'position_changed'],
  ['managerId', 'manager_changed'],
] as const

const event = (
  ctx: Ctx,
  employeeId: string,
  type: (typeof employeeEvents.$inferInsert)['type'],
  data: Partial<typeof employeeEvents.$inferInsert> = {},
) => ({
  tenantId: ctx.tenantId,
  employeeId,
  type,
  effectiveDate: today(),
  actorUserId: ctx.userId,
  ...data,
})

export const createEmployee = async (tx: Tx, ctx: Ctx, input: EmployeeInput) => {
  const [row] = await tx
    .insert(employees)
    .values({ ...input, tenantId: ctx.tenantId })
    .returning()
  await tx.insert(employeeEvents).values(
    event(ctx, row!.id, 'hired', {
      effectiveDate: input.hireDate,
      after: { departmentId: input.departmentId ?? null, positionId: input.positionId ?? null },
    }),
  )
  await audit(tx, ctx, { action: 'create', entity: 'employee', entityId: row!.id })
  return present(row!, ctx)
}

export const updateEmployee = async (tx: Tx, ctx: Ctx, id: string, input: EmployeeUpdate) => {
  const before = await findInScope(tx, ctx, id)
  if (input.managerId === id) throw badRequest('Um colaborador não pode ser gestor de si mesmo.')
  const changed = changedKeys(before, input)
  if (changed.length === 0) return present(before, ctx)

  const [row] = await tx.update(employees).set(input).where(eq(employees.id, id)).returning()

  const events = MOVEMENTS.filter(([field]) => changed.includes(field)).map(([field, type]) =>
    event(ctx, id, type, { before: { [field]: before[field] }, after: { [field]: input[field] ?? null } }),
  )
  const other = changed.filter(field => !MOVEMENTS.some(([moved]) => moved === field))
  if (other.length > 0)
    // Guarda só quais campos mudaram: o histórico não replica dados pessoais.
    events.push(event(ctx, id, 'data_updated', { after: Object.fromEntries(other.map(f => [f, true])) }))
  if (events.length) await tx.insert(employeeEvents).values(events)

  await audit(tx, ctx, { action: 'update', entity: 'employee', entityId: id, changedFields: changed })
  return present(row!, ctx)
}

export const changeEmployeeStatus = async (tx: Tx, ctx: Ctx, id: string, input: EmployeeStatusChange) => {
  const before = await findInScope(tx, ctx, id)
  if (before.status === input.status) throw badRequest('O colaborador já está nesta situação.')
  if (input.status === 'terminated' && input.effectiveDate < before.hireDate)
    throw badRequest('A data de desligamento não pode ser anterior à admissão.')

  const [row] = await tx
    .update(employees)
    .set({
      status: input.status,
      terminationDate: input.status === 'terminated' ? input.effectiveDate : null,
    })
    .where(eq(employees.id, id))
    .returning()
  await tx.insert(employeeEvents).values(
    event(ctx, id, 'status_changed', {
      effectiveDate: input.effectiveDate,
      before: { status: before.status },
      after: { status: input.status },
      reason: input.reason,
    }),
  )
  await audit(tx, ctx, {
    action: 'status_change',
    entity: 'employee',
    entityId: id,
    metadata: { from: before.status, to: input.status },
  })
  return present(row!, ctx)
}

// ---------- portal do colaborador ----------

export const getMyEmployee = async (tx: Tx, ctx: Ctx) => {
  if (!ctx.employeeId) throw forbidden('Seu acesso não está vinculado a uma ficha de colaborador.')
  return getEmployee(tx, { ...ctx, scope: 'self' }, ctx.employeeId)
}

/** O titular atualiza apenas dados de contato; o resto passa pelo RH. */
export type SelfUpdate = Pick<EmployeeUpdate, 'socialName' | 'phone' | 'email' | 'address'>

export const updateMyEmployee = async (tx: Tx, ctx: Ctx, input: SelfUpdate) => {
  if (!ctx.employeeId) throw forbidden('Seu acesso não está vinculado a uma ficha de colaborador.')
  return updateEmployee(tx, { ...ctx, scope: 'self' }, ctx.employeeId, input)
}
