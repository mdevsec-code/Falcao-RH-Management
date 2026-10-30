import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  ABSENCE_KIND_LABELS,
  calendarDays,
  can,
  REQUEST_TYPE_LABELS,
  SENSITIVE_ABSENCE_KINDS,
  type ApproverKind,
  type RequestCreate,
  type RequestDecision,
  type RequestFilters,
  type RequestType,
} from '@falcao-rh/contracts'

import type { Tx } from '../../db/client'
import { approvalFlows, departments, employees, requests, requestSteps, user } from '../../db/schema'
import type { Ctx } from '../../http/context'
import { audit } from '../../lib/audit'
import { calendarDate } from '../../lib/dates'
import { badRequest, forbidden, notFound } from '../../lib/errors'
import { notify, userOfEmployee, usersWithRoles, type Outbox } from '../../lib/notify'
import { scopeCondition } from '../employees/employees.service'
import { checkVacation, vacationPeriods } from './vacation'

type RequestRow = typeof requests.$inferSelect

/** Fluxo padrão quando a organização não configurou um. */
const DEFAULT_FLOWS: Record<RequestType, ApproverKind[]> = {
  vacation: ['manager', 'hr'],
  absence: ['manager'],
}

const isHr = (ctx: Ctx) => can(ctx.role, 'requests.manage')

const br = (iso: string) => iso.split('-').reverse().join('/')

const describe = (row: Pick<RequestRow, 'type' | 'absenceKind' | 'startDate' | 'endDate' | 'days'>, name: string) =>
  `${row.type === 'vacation' ? 'Férias' : ABSENCE_KIND_LABELS[row.absenceKind!]} de ${name}: ${br(row.startDate)} a ${br(row.endDate)} (${row.days} ${row.days === 1 ? 'dia' : 'dias'})`

/**
 * Atestado é dado de saúde: o tipo e as observações só aparecem para o RH e
 * para o titular. O gestor vê "Ausência justificada".
 */
const present = <T extends Pick<RequestRow, 'absenceKind' | 'notes' | 'employeeId'>>(row: T, ctx: Ctx) => {
  const hidden =
    row.absenceKind !== null &&
    SENSITIVE_ABSENCE_KINDS.includes(row.absenceKind) &&
    !isHr(ctx) &&
    row.employeeId !== ctx.employeeId
  return hidden ? { ...row, absenceKind: null, notes: null, isRestricted: true } : { ...row, isRestricted: false }
}

// ---------- consultas ----------

const requester = alias(employees, 'requester')

/** Escopo: RH vê todos; gestor, a equipe; colaborador, os próprios. */
const scopeOf = (ctx: Ctx): SQL | undefined => (isHr(ctx) ? undefined : scopeCondition(ctx))

/**
 * Fila de quem consulta: etapas de RH (para o RH) e etapas de gestor
 * atribuídas a ele. Os próprios pedidos nunca entram na fila.
 */
const awaitingCondition = (ctx: Ctx) => {
  const asManager = ctx.employeeId
    ? sql`(s.approver_kind = 'manager' and s.approver_employee_id = ${ctx.employeeId})`
    : sql`false`
  const asHr = isHr(ctx) ? sql`s.approver_kind = 'hr'` : sql`false`
  return and(
    sql`exists (select 1 from request_steps s where s.request_id = ${requests.id} and s.status = 'pending' and (${asHr} or ${asManager}))`,
    ctx.employeeId ? ne(requests.employeeId, ctx.employeeId) : undefined,
  )!
}

/** Pode decidir a etapa: o aprovador dela, ou o RH (inclusive no lugar do gestor). */
const mayDecide = (ctx: Ctx, request: RequestRow, step: { approverKind: ApproverKind; approverEmployeeId: string | null }) =>
  request.employeeId !== ctx.employeeId &&
  (step.approverKind === 'hr' ? isHr(ctx) : step.approverEmployeeId === ctx.employeeId || isHr(ctx))

export const listRequests = async (tx: Tx, ctx: Ctx, filters: RequestFilters) => {
  const conditions = [
    scopeOf(ctx),
    filters.status ? eq(requests.status, filters.status) : undefined,
    filters.type ? eq(requests.type, filters.type) : undefined,
    filters.employeeId ? eq(requests.employeeId, filters.employeeId) : undefined,
    filters.from ? gte(requests.endDate, filters.from) : undefined,
    filters.to ? lte(requests.startDate, filters.to) : undefined,
    filters.awaitingMe ? awaitingCondition(ctx) : undefined,
  ].filter(Boolean) as SQL[]

  const rows = await tx
    .select({
      id: requests.id,
      employeeId: requests.employeeId,
      employeeName: sql<string>`coalesce(${employees.socialName}, ${employees.fullName})`,
      departmentName: departments.name,
      type: requests.type,
      absenceKind: requests.absenceKind,
      status: requests.status,
      startDate: requests.startDate,
      endDate: requests.endDate,
      days: requests.days,
      notes: requests.notes,
      createdAt: requests.createdAt,
      currentStep: sql<ApproverKind | null>`(select s.approver_kind from request_steps s where s.request_id = ${requests.id} and s.status = 'pending' limit 1)`,
    })
    .from(requests)
    .innerJoin(employees, eq(employees.id, requests.employeeId))
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(requests.startDate))
    .limit(300)
  return rows.map(row => present(row, ctx))
}

const loadInScope = async (tx: Tx, ctx: Ctx, id: string) => {
  const [row] = await tx
    .select({ request: requests })
    .from(requests)
    .innerJoin(employees, eq(employees.id, requests.employeeId))
    .where(and(eq(requests.id, id), scopeOf(ctx)))
  if (!row) throw notFound('Solicitação')
  return row.request
}

export const getRequest = async (tx: Tx, ctx: Ctx, id: string) => {
  const request = await loadInScope(tx, ctx, id)
  const approver = alias(employees, 'approver')
  const [person] = await tx
    .select({ name: sql<string>`coalesce(${employees.socialName}, ${employees.fullName})`, departmentName: departments.name })
    .from(employees)
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .where(eq(employees.id, request.employeeId))
  const steps = await tx
    .select({
      id: requestSteps.id,
      position: requestSteps.position,
      approverKind: requestSteps.approverKind,
      approverEmployeeId: requestSteps.approverEmployeeId,
      approverName: approver.fullName,
      status: requestSteps.status,
      decidedByName: user.name,
      decidedAt: requestSteps.decidedAt,
      comment: requestSteps.comment,
    })
    .from(requestSteps)
    .leftJoin(approver, eq(approver.id, requestSteps.approverEmployeeId))
    .leftJoin(user, eq(user.id, requestSteps.decidedBy))
    .where(eq(requestSteps.requestId, id))
    .orderBy(asc(requestSteps.position))
  const pending = steps.find(s => s.status === 'pending')
  return {
    ...present(request, ctx),
    employeeName: person?.name ?? '',
    departmentName: person?.departmentName ?? null,
    steps,
    canDecide: request.status === 'pending' && Boolean(pending && mayDecide(ctx, request, pending)),
    canCancel: canCancel(request, ctx),
  }
}

const canCancel = (request: RequestRow, ctx: Ctx) =>
  (request.status === 'pending' && (request.employeeId === ctx.employeeId || isHr(ctx))) ||
  (request.status === 'approved' && isHr(ctx) && request.startDate > calendarDate())

// ---------- férias ----------

const vacationInputs = async (tx: Tx, employeeId: string, ignoreRequestId?: string) => {
  const rows = await tx
    .select({
      id: requests.id,
      type: requests.type,
      absenceKind: requests.absenceKind,
      status: requests.status,
      startDate: requests.startDate,
      endDate: requests.endDate,
      days: requests.days,
    })
    .from(requests)
    .where(and(eq(requests.employeeId, employeeId), inArray(requests.status, ['pending', 'approved'])))
  const relevant = rows.filter(r => r.id !== ignoreRequestId)
  return {
    vacations: relevant
      .filter(r => r.type === 'vacation')
      .map(r => ({ startDate: r.startDate, days: r.days, status: r.status as 'pending' | 'approved' })),
    unjustified: relevant
      .filter(r => r.absenceKind === 'unjustified' && r.status === 'approved')
      .map(r => ({ startDate: r.startDate, endDate: r.endDate })),
  }
}

export const vacationBalance = async (tx: Tx, ctx: Ctx, employeeId: string) => {
  const [employee] = await tx
    .select({ hireDate: employees.hireDate })
    .from(employees)
    .where(and(eq(employees.id, employeeId), scopeOf(ctx)))
  if (!employee) throw notFound('Colaborador')
  const { vacations, unjustified } = await vacationInputs(tx, employeeId)
  const periods = vacationPeriods(employee.hireDate, calendarDate(), vacations, unjustified)
  return {
    periods: periods.reverse(),
    available: periods.filter(p => p.complete).reduce((sum, p) => sum + p.remaining, 0),
  }
}

// ---------- criação ----------

const resolveFlow = async (tx: Tx, type: RequestType, departmentId: string | null) => {
  const flows = await tx
    .select({ departmentId: approvalFlows.departmentId, steps: approvalFlows.steps })
    .from(approvalFlows)
    .where(
      and(
        eq(approvalFlows.requestType, type),
        departmentId ? or(eq(approvalFlows.departmentId, departmentId), isNull(approvalFlows.departmentId)) : isNull(approvalFlows.departmentId),
      ),
    )
  return (flows.find(f => f.departmentId === departmentId) ?? flows.find(f => f.departmentId === null))?.steps ?? DEFAULT_FLOWS[type]
}

/** Avisa quem decide a etapa pendente. */
const notifyApprovers = async (
  tx: Tx,
  ctx: Ctx,
  outbox: Outbox,
  request: RequestRow,
  step: { approverKind: ApproverKind; approverEmployeeId: string | null },
  name: string,
) => {
  const userIds =
    step.approverKind === 'hr'
      ? await usersWithRoles(tx, ctx.tenantId, ['hr', 'admin'])
      : [await userOfEmployee(tx, ctx.tenantId, step.approverEmployeeId)].filter((id): id is string => Boolean(id))
  // Atestado: o gestor recebe só "ausência", sem o tipo.
  const restricted = step.approverKind === 'manager' && request.absenceKind && SENSITIVE_ABSENCE_KINDS.includes(request.absenceKind)
  await notify(tx, ctx.tenantId, outbox, {
    userIds: userIds.filter(id => id !== ctx.userId),
    kind: 'request_submitted',
    title: `${REQUEST_TYPE_LABELS[request.type]} aguardando sua aprovação`,
    body: restricted
      ? `Ausência justificada de ${name}: ${br(request.startDate)} a ${br(request.endDate)}.`
      : describe(request, name),
    link: `/solicitacoes?id=${request.id}`,
  })
}

export const createRequest = async (tx: Tx, ctx: Ctx, outbox: Outbox, input: RequestCreate) => {
  const employeeId = input.employeeId ?? ctx.employeeId
  if (!employeeId) throw forbidden('Seu acesso não está vinculado a uma ficha de colaborador.')
  const onBehalf = employeeId !== ctx.employeeId
  if (onBehalf && !isHr(ctx)) throw forbidden('Só o RH registra solicitações em nome de outra pessoa.')
  if (!onBehalf && !can(ctx.role, 'self.request')) throw forbidden()
  if (input.type === 'absence' && input.kind === 'unjustified' && !isHr(ctx))
    throw badRequest('Faltas não justificadas são registradas pelo RH.')

  const [employee] = await tx
    .select({
      id: employees.id,
      name: sql<string>`coalesce(${employees.socialName}, ${employees.fullName})`,
      status: employees.status,
      hireDate: employees.hireDate,
      departmentId: employees.departmentId,
      managerId: employees.managerId,
    })
    .from(employees)
    .where(and(eq(employees.id, employeeId), scopeOf(ctx)))
  if (!employee) throw notFound('Colaborador')
  if (employee.status === 'terminated') throw badRequest('Colaborador desligado não tem novas solicitações.')

  const today = calendarDate()
  if (!onBehalf && input.startDate < today) throw badRequest('A data inicial já passou. Para registros retroativos, fale com o RH.')

  const [overlap] = await tx
    .select({ id: requests.id })
    .from(requests)
    .where(
      and(
        eq(requests.employeeId, employeeId),
        inArray(requests.status, ['pending', 'approved']),
        lte(requests.startDate, input.endDate),
        gte(requests.endDate, input.startDate),
      ),
    )
  if (overlap) throw badRequest('Já existe uma solicitação neste período.')

  const days = calendarDays(input.startDate, input.endDate)
  if (input.type === 'vacation') {
    const { vacations, unjustified } = await vacationInputs(tx, employeeId)
    const check = checkVacation(vacationPeriods(employee.hireDate, today, vacations, unjustified), {
      startDate: input.startDate,
      days,
    })
    if (!check.ok) throw badRequest(check.message)
  }

  const [request] = await tx
    .insert(requests)
    .values({
      tenantId: ctx.tenantId,
      employeeId,
      type: input.type,
      absenceKind: input.type === 'absence' ? input.kind : null,
      status: onBehalf ? 'approved' : 'pending',
      startDate: input.startDate,
      endDate: input.endDate,
      days,
      notes: input.notes ?? null,
      documentId: input.type === 'absence' ? (input.documentId ?? null) : null,
      createdBy: ctx.userId,
      decidedAt: onBehalf ? new Date() : null,
    })
    .returning()

  if (onBehalf) {
    // Registro feito pelo próprio RH: já nasce aprovado, com a decisão registrada.
    await tx.insert(requestSteps).values({
      tenantId: ctx.tenantId,
      requestId: request!.id,
      position: 0,
      approverKind: 'hr',
      status: 'approved',
      decidedBy: ctx.userId,
      decidedAt: new Date(),
      comment: 'Registrado pelo RH.',
    })
    await audit(tx, ctx, { action: 'register', entity: 'request', entityId: request!.id, metadata: { type: input.type } })
    const requesterUser = await userOfEmployee(tx, ctx.tenantId, employeeId)
    if (requesterUser)
      await notify(tx, ctx.tenantId, outbox, {
        userIds: [requesterUser],
        kind: 'request_decided',
        title: `${REQUEST_TYPE_LABELS[input.type]} registrada pelo RH`,
        body: describe(request!, employee.name),
        link: '/minhas-solicitacoes',
      })
    return request!
  }

  // Fluxo de aprovação: etapas sem aprovador (ex.: sem gestor) são puladas.
  // Nunca há aprovação automática: se nenhuma etapa sobrar, o RH decide.
  const kinds = await resolveFlow(tx, input.type, employee.departmentId)
  const steps = kinds.map((kind, position) => ({
    position,
    approverKind: kind,
    approverEmployeeId: kind === 'manager' ? employee.managerId : null,
    status: (kind === 'manager' && !employee.managerId ? 'skipped' : 'waiting') as 'skipped' | 'waiting' | 'pending',
  }))
  if (steps.every(s => s.status === 'skipped'))
    steps.push({ position: steps.length, approverKind: 'hr', approverEmployeeId: null, status: 'waiting' })
  const first = steps.find(s => s.status === 'waiting')!
  first.status = 'pending'

  await tx.insert(requestSteps).values(steps.map(s => ({ ...s, tenantId: ctx.tenantId, requestId: request!.id })))
  await audit(tx, ctx, { action: 'create', entity: 'request', entityId: request!.id, metadata: { type: input.type } })
  await notifyApprovers(tx, ctx, outbox, request!, first, employee.name)
  return request!
}

// ---------- decisão ----------

export const decideRequest = async (tx: Tx, ctx: Ctx, outbox: Outbox, id: string, input: RequestDecision) => {
  const request = await loadInScope(tx, ctx, id)
  if (request.status !== 'pending') throw badRequest('Esta solicitação já foi decidida.')
  // Segregação de função: ninguém decide o próprio pedido, nem o RH.
  if (request.employeeId === ctx.employeeId) throw forbidden('Você não pode decidir a própria solicitação.')

  const steps = await tx.select().from(requestSteps).where(eq(requestSteps.requestId, id)).orderBy(asc(requestSteps.position))
  const current = steps.find(s => s.status === 'pending')
  if (!current) throw badRequest('Não há etapa aguardando decisão.')
  // O RH pode decidir no lugar do gestor; a auditoria registra que foi assim.
  if (!mayDecide(ctx, request, current)) throw forbidden('Esta etapa aguarda outra pessoa.')

  const approved = input.decision === 'approve'
  await tx
    .update(requestSteps)
    .set({ status: approved ? 'approved' : 'rejected', decidedBy: ctx.userId, decidedAt: new Date(), comment: input.comment ?? null })
    .where(eq(requestSteps.id, current.id))

  const [person] = await tx
    .select({ name: sql<string>`coalesce(${employees.socialName}, ${employees.fullName})` })
    .from(employees)
    .where(eq(employees.id, request.employeeId))
  const name = person?.name ?? ''

  const next = approved ? steps.find(s => s.position > current.position && s.status === 'waiting') : undefined
  if (next) {
    await tx.update(requestSteps).set({ status: 'pending' }).where(eq(requestSteps.id, next.id))
    await notifyApprovers(tx, ctx, outbox, request, next, name)
  } else {
    if (!approved)
      await tx
        .update(requestSteps)
        .set({ status: 'skipped' })
        .where(and(eq(requestSteps.requestId, id), eq(requestSteps.status, 'waiting')))
    await tx
      .update(requests)
      .set({ status: approved ? 'approved' : 'rejected', decidedAt: new Date() })
      .where(eq(requests.id, id))
    const requesterUser = await userOfEmployee(tx, ctx.tenantId, request.employeeId)
    if (requesterUser)
      await notify(tx, ctx.tenantId, outbox, {
        userIds: [requesterUser],
        kind: 'request_decided',
        title: `${REQUEST_TYPE_LABELS[request.type]} ${approved ? 'aprovada' : 'recusada'}`,
        body: `${describe(request, name)}.${input.comment ? `\nComentário: ${input.comment}` : ''}`,
        link: '/minhas-solicitacoes',
      })
  }

  await audit(tx, ctx, {
    action: approved ? 'approve' : 'reject',
    entity: 'request',
    entityId: id,
    metadata: { step: current.approverKind, onBehalfOfManager: current.approverKind === 'manager' && current.approverEmployeeId !== ctx.employeeId },
  })
  return getRequest(tx, ctx, id)
}

export const cancelRequest = async (tx: Tx, ctx: Ctx, outbox: Outbox, id: string) => {
  const request = await loadInScope(tx, ctx, id)
  if (!canCancel(request, ctx)) throw forbidden('Esta solicitação não pode mais ser cancelada por você.')
  await tx.update(requests).set({ status: 'cancelled', decidedAt: new Date() }).where(eq(requests.id, id))
  await tx
    .update(requestSteps)
    .set({ status: 'skipped' })
    .where(and(eq(requestSteps.requestId, id), inArray(requestSteps.status, ['pending', 'waiting'])))
  await audit(tx, ctx, { action: 'cancel', entity: 'request', entityId: id })
  if (request.employeeId !== ctx.employeeId) {
    const requesterUser = await userOfEmployee(tx, ctx.tenantId, request.employeeId)
    if (requesterUser)
      await notify(tx, ctx.tenantId, outbox, {
        userIds: [requesterUser],
        kind: 'request_decided',
        title: `${REQUEST_TYPE_LABELS[request.type]} cancelada pelo RH`,
        body: `Período de ${br(request.startDate)} a ${br(request.endDate)}.`,
        link: '/minhas-solicitacoes',
      })
  }
}

// ---------- calendário ----------

export const calendar = async (tx: Tx, ctx: Ctx, range: { from: string; to: string; departmentId?: string }) => {
  const rows = await tx
    .select({
      id: requests.id,
      employeeId: requests.employeeId,
      employeeName: sql<string>`coalesce(${requester.socialName}, ${requester.fullName})`,
      departmentName: departments.name,
      type: requests.type,
      absenceKind: requests.absenceKind,
      notes: requests.notes,
      status: requests.status,
      startDate: requests.startDate,
      endDate: requests.endDate,
      days: requests.days,
    })
    .from(requests)
    .innerJoin(requester, eq(requester.id, requests.employeeId))
    .innerJoin(employees, eq(employees.id, requests.employeeId))
    .leftJoin(departments, eq(departments.id, requester.departmentId))
    .where(
      and(
        scopeOf(ctx),
        inArray(requests.status, ['pending', 'approved']),
        lte(requests.startDate, range.to),
        gte(requests.endDate, range.from),
        range.departmentId ? eq(requester.departmentId, range.departmentId) : undefined,
        ne(requester.status, 'terminated'),
      ),
    )
    .orderBy(asc(requests.startDate))
  return rows.map(row => present(row, ctx))
}

