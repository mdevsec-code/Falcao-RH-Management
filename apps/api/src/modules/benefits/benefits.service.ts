import ExcelJS from 'exceljs'
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm'

import {
  BENEFIT_KIND_LABELS,
  type BenefitItemUpdate,
  type BenefitPlanInput,
  type BenefitValueInput,
  type BenefitValueType,
  type EmployeeBenefitInput,
} from '@falcao-rh/contracts'

import type { Tx } from '../../db/client'
import {
  benefitPlans,
  benefitPlanValues,
  benefitRunItems,
  benefitRuns,
  departments,
  employeeBenefits,
  employees,
  requests,
} from '../../db/schema'
import type { Ctx } from '../../http/context'
import { audit } from '../../lib/audit'
import { calendarDate } from '../../lib/dates'
import { AppError, badRequest, notFound } from '../../lib/errors'

// ---------- datas ----------

const DAY = 86_400_000
const toTime = (iso: string) => Date.parse(`${iso}T12:00:00Z`)
const shift = (iso: string, days: number) => new Date(toTime(iso) + days * DAY).toISOString().slice(0, 10)
const maxDate = (...dates: (string | null | undefined)[]) => dates.filter(Boolean).sort().at(-1)!
const minDate = (...dates: (string | null | undefined)[]) => dates.filter(Boolean).sort()[0]!

/** Dias úteis (segunda a sexta) entre duas datas, inclusive. */
// shortcut: não considera feriados; quando houver calendário de feriados (ROADMAP), descontar aqui.
export const businessDays = (from: string, to: string) => {
  let count = 0
  for (let t = toTime(from); t <= toTime(to); t += DAY) {
    const weekday = new Date(t).getUTCDay()
    if (weekday !== 0 && weekday !== 6) count++
  }
  return count
}

export const monthBounds = (competence: string) => {
  const start = `${competence}-01`
  const [y, m] = competence.split('-').map(Number)
  const end = new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10)
  return { start, end }
}

/** Valor do benefício na competência: o vigente no 1º dia do mês; plano novo no mês usa o primeiro valor do mês. */
const valueAt = (values: { valueCents: number; effectiveFrom: string }[], start: string, end: string) =>
  values.filter(v => v.effectiveFrom <= start).at(-1) ?? values.find(v => v.effectiveFrom <= end)

export const amountFor = (valueType: BenefitValueType, unitCents: number, days: number, workdays: number) =>
  valueType === 'daily' ? unitCents * days : workdays ? Math.round((unitCents * days) / workdays) : 0

// ---------- planos e histórico de valores ----------

export const listPlans = async (tx: Tx) => {
  const plans = await tx.select().from(benefitPlans).orderBy(asc(benefitPlans.kind), asc(benefitPlans.name))
  const values = await tx
    .select({ planId: benefitPlanValues.planId, valueCents: benefitPlanValues.valueCents, effectiveFrom: benefitPlanValues.effectiveFrom, createdAt: benefitPlanValues.createdAt })
    .from(benefitPlanValues)
    .orderBy(desc(benefitPlanValues.effectiveFrom))
  const people = await tx
    .select({ planId: employeeBenefits.planId, total: sql<number>`count(*)::int` })
    .from(employeeBenefits)
    .where(isNull(employeeBenefits.endDate))
    .groupBy(employeeBenefits.planId)
  const today = calendarDate()
  return plans.map(plan => {
    const history = values.filter(v => v.planId === plan.id)
    return {
      ...plan,
      currentValueCents: history.find(v => v.effectiveFrom <= today)?.valueCents ?? null,
      scheduled: history.filter(v => v.effectiveFrom > today),
      history,
      employees: people.find(p => p.planId === plan.id)?.total ?? 0,
    }
  })
}

export const createPlan = async (tx: Tx, ctx: Ctx, input: BenefitPlanInput & BenefitValueInput) => {
  const { valueCents, effectiveFrom, ...plan } = input
  const [row] = await tx.insert(benefitPlans).values({ ...plan, tenantId: ctx.tenantId }).returning()
  await tx.insert(benefitPlanValues).values({ tenantId: ctx.tenantId, planId: row!.id, valueCents, effectiveFrom, createdBy: ctx.userId })
  await audit(tx, ctx, { action: 'benefit_plan.created', entity: 'benefit_plan', entityId: row!.id })
  return row!
}

export const updatePlan = async (tx: Tx, ctx: Ctx, id: string, input: BenefitPlanInput) => {
  const [row] = await tx.update(benefitPlans).set(input).where(eq(benefitPlans.id, id)).returning()
  if (!row) throw notFound('Plano')
  await audit(tx, ctx, { action: 'benefit_plan.updated', entity: 'benefit_plan', entityId: id, changedFields: Object.keys(input) })
  return row
}

export const addPlanValue = async (tx: Tx, ctx: Ctx, planId: string, input: BenefitValueInput) => {
  const [plan] = await tx.select({ id: benefitPlans.id }).from(benefitPlans).where(eq(benefitPlans.id, planId))
  if (!plan) throw notFound('Plano')
  await tx.insert(benefitPlanValues).values({ tenantId: ctx.tenantId, planId, ...input, createdBy: ctx.userId })
  await audit(tx, ctx, { action: 'benefit_plan.value_added', entity: 'benefit_plan', entityId: planId, metadata: { effectiveFrom: input.effectiveFrom } })
  return { planId, ...input }
}

// ---------- escolha de cada colaborador ----------

export const listEmployeeBenefits = (tx: Tx) =>
  tx
    .select({
      employeeId: employees.id,
      registration: employees.registration,
      fullName: employees.fullName,
      status: employees.status,
      departmentName: departments.name,
      planId: employeeBenefits.planId,
      planName: benefitPlans.name,
      kind: benefitPlans.kind,
      startDate: employeeBenefits.startDate,
    })
    .from(employees)
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(employeeBenefits, and(eq(employeeBenefits.employeeId, employees.id), isNull(employeeBenefits.endDate)))
    .leftJoin(benefitPlans, eq(benefitPlans.id, employeeBenefits.planId))
    .where(ne(employees.status, 'terminated'))
    .orderBy(asc(employees.fullName))

export const employeeBenefitHistory = (tx: Tx, employeeId: string) =>
  tx
    .select({ id: employeeBenefits.id, planName: benefitPlans.name, kind: benefitPlans.kind, startDate: employeeBenefits.startDate, endDate: employeeBenefits.endDate })
    .from(employeeBenefits)
    .innerJoin(benefitPlans, eq(benefitPlans.id, employeeBenefits.planId))
    .where(eq(employeeBenefits.employeeId, employeeId))
    .orderBy(desc(employeeBenefits.startDate))

const currentChoice = async (tx: Tx, employeeId: string) => {
  const [row] = await tx
    .select()
    .from(employeeBenefits)
    .where(and(eq(employeeBenefits.employeeId, employeeId), isNull(employeeBenefits.endDate)))
  return row
}

/** Trocar de benefício encerra o anterior na véspera; o histórico fica. */
export const setEmployeeBenefit = async (tx: Tx, ctx: Ctx, employeeId: string, input: EmployeeBenefitInput) => {
  const [employee] = await tx.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId))
  if (!employee) throw notFound('Colaborador')
  const [plan] = await tx.select({ active: benefitPlans.active }).from(benefitPlans).where(eq(benefitPlans.id, input.planId))
  if (!plan) throw notFound('Plano')
  if (!plan.active) throw badRequest('Este plano está inativo.')

  const current = await currentChoice(tx, employeeId)
  if (current?.planId === input.planId) return { employeeId, ...input }
  if (current) {
    if (input.startDate <= current.startDate) throw badRequest('A troca precisa começar depois do início do benefício atual.')
    await tx.update(employeeBenefits).set({ endDate: shift(input.startDate, -1) }).where(eq(employeeBenefits.id, current.id))
  }
  await tx.insert(employeeBenefits).values({ tenantId: ctx.tenantId, employeeId, ...input, createdBy: ctx.userId })
  await audit(tx, ctx, { action: 'employee_benefit.set', entity: 'employee', entityId: employeeId, metadata: { planId: input.planId, startDate: input.startDate } })
  return { employeeId, ...input }
}

export const endEmployeeBenefit = async (tx: Tx, ctx: Ctx, employeeId: string, endDate: string) => {
  const current = await currentChoice(tx, employeeId)
  if (!current) throw notFound('Benefício vigente')
  if (endDate < current.startDate) throw badRequest('O fim não pode ser antes do início do benefício.')
  await tx.update(employeeBenefits).set({ endDate }).where(eq(employeeBenefits.id, current.id))
  await audit(tx, ctx, { action: 'employee_benefit.ended', entity: 'employee', entityId: employeeId, metadata: { endDate } })
}

// ---------- apuração mensal ----------

/**
 * Calcula as linhas da competência. Regra padrão (o RH ajusta os dias de cada
 * pessoa antes de fechar): dias úteis no período de vínculo e de escolha do
 * benefício, menos os dias úteis de férias e ausências aprovadas.
 */
const computeItems = async (tx: Tx, competence: string) => {
  const { start, end } = monthBounds(competence)
  const workdays = businessDays(start, end)

  const choices = await tx
    .select({
      employeeId: employeeBenefits.employeeId,
      startDate: employeeBenefits.startDate,
      endDate: employeeBenefits.endDate,
      planId: benefitPlans.id,
      planName: benefitPlans.name,
      kind: benefitPlans.kind,
      valueType: benefitPlans.valueType,
      hireDate: employees.hireDate,
      terminationDate: employees.terminationDate,
    })
    .from(employeeBenefits)
    .innerJoin(benefitPlans, eq(benefitPlans.id, employeeBenefits.planId))
    .innerJoin(employees, eq(employees.id, employeeBenefits.employeeId))
    .where(
      and(
        lte(employeeBenefits.startDate, end),
        or(isNull(employeeBenefits.endDate), gte(employeeBenefits.endDate, start)),
        lte(employees.hireDate, end),
        or(isNull(employees.terminationDate), gte(employees.terminationDate, start)),
      ),
    )
    .orderBy(asc(employeeBenefits.startDate))
  // shortcut: troca de benefício no meio do mês paga só o plano vigente no fim do mês; ratear se a Falcão pedir.
  const byEmployee = new Map(choices.map(c => [c.employeeId, c]))
  if (!byEmployee.size) return { workdays, items: [] }

  const ids = [...byEmployee.keys()]
  const planIds = [...new Set(choices.map(c => c.planId))]
  const values = await tx
    .select({ planId: benefitPlanValues.planId, valueCents: benefitPlanValues.valueCents, effectiveFrom: benefitPlanValues.effectiveFrom })
    .from(benefitPlanValues)
    .where(inArray(benefitPlanValues.planId, planIds))
    .orderBy(asc(benefitPlanValues.effectiveFrom))
  const absences = await tx
    .select({ employeeId: requests.employeeId, startDate: requests.startDate, endDate: requests.endDate })
    .from(requests)
    .where(and(inArray(requests.employeeId, ids), eq(requests.status, 'approved'), lte(requests.startDate, end), gte(requests.endDate, start)))

  const items = [...byEmployee.values()].flatMap(c => {
    const value = valueAt(values.filter(v => v.planId === c.planId), start, end)
    if (!value) return []
    const from = maxDate(start, c.hireDate, c.startDate)
    const to = minDate(end, c.terminationDate, c.endDate)
    const eligibleDays = from <= to ? businessDays(from, to) : 0
    const deductedDays = absences
      .filter(a => a.employeeId === c.employeeId)
      .reduce((sum, a) => {
        const a1 = maxDate(a.startDate, from)
        const a2 = minDate(a.endDate, to)
        return a1 <= a2 ? sum + businessDays(a1, a2) : sum
      }, 0)
    const days = Math.max(0, eligibleDays - deductedDays)
    return [
      {
        employeeId: c.employeeId,
        planId: c.planId,
        planName: c.planName,
        kind: c.kind,
        valueType: c.valueType,
        unitValueCents: value.valueCents,
        eligibleDays,
        deductedDays,
        days,
        amountCents: amountFor(c.valueType, value.valueCents, days, workdays),
      },
    ]
  })
  return { workdays, items }
}

const findRun = async (tx: Tx, id: string) => {
  const [run] = await tx.select().from(benefitRuns).where(eq(benefitRuns.id, id))
  if (!run) throw notFound('Apuração')
  return run
}
const draftRun = async (tx: Tx, id: string) => {
  const run = await findRun(tx, id)
  if (run.status === 'closed') throw new AppError(409, 'run_closed', 'Apuração fechada não pode ser alterada.')
  return run
}

export const listRuns = async (tx: Tx) => {
  const runs = await tx.select().from(benefitRuns).orderBy(desc(benefitRuns.competence))
  const totals = await tx
    .select({ runId: benefitRunItems.runId, kind: benefitRunItems.kind, people: sql<number>`count(*)::int`, amount: sql<number>`sum(${benefitRunItems.amountCents})::int` })
    .from(benefitRunItems)
    .groupBy(benefitRunItems.runId, benefitRunItems.kind)
  return runs.map(run => {
    const of = totals.filter(t => t.runId === run.id)
    return { ...run, people: of.reduce((s, t) => s + t.people, 0), amountCents: of.reduce((s, t) => s + t.amount, 0), byKind: of.map(({ kind, people, amount }) => ({ kind, people, amountCents: amount })) }
  })
}

const insertItems = async (tx: Tx, tenantId: string, runId: string, items: Awaited<ReturnType<typeof computeItems>>['items']) => {
  if (items.length) await tx.insert(benefitRunItems).values(items.map(item => ({ ...item, tenantId, runId })))
}

export const createRun = async (tx: Tx, ctx: Ctx, competence: string) => {
  const [exists] = await tx.select({ id: benefitRuns.id }).from(benefitRuns).where(eq(benefitRuns.competence, competence))
  if (exists) throw new AppError(409, 'run_exists', `A apuração de ${competence} já existe.`)
  const { workdays, items } = await computeItems(tx, competence)
  const [run] = await tx.insert(benefitRuns).values({ tenantId: ctx.tenantId, competence, workdays }).returning()
  await insertItems(tx, ctx.tenantId, run!.id, items)
  await audit(tx, ctx, { action: 'benefit_run.created', entity: 'benefit_run', entityId: run!.id, metadata: { competence, people: items.length } })
  return run!
}

/** Refaz o cálculo; ajustes manuais são descartados (o RH é avisado na tela). */
export const recalculateRun = async (tx: Tx, ctx: Ctx, id: string) => {
  const run = await draftRun(tx, id)
  const { workdays, items } = await computeItems(tx, run.competence)
  await tx.delete(benefitRunItems).where(eq(benefitRunItems.runId, id))
  await tx.update(benefitRuns).set({ workdays }).where(eq(benefitRuns.id, id))
  await insertItems(tx, ctx.tenantId, id, items)
  await audit(tx, ctx, { action: 'benefit_run.recalculated', entity: 'benefit_run', entityId: id })
  return { id }
}

export const getRun = async (tx: Tx, id: string) => {
  const run = await findRun(tx, id)
  const items = await tx
    .select({
      id: benefitRunItems.id,
      employeeId: benefitRunItems.employeeId,
      registration: employees.registration,
      fullName: employees.fullName,
      planName: benefitRunItems.planName,
      kind: benefitRunItems.kind,
      valueType: benefitRunItems.valueType,
      unitValueCents: benefitRunItems.unitValueCents,
      eligibleDays: benefitRunItems.eligibleDays,
      deductedDays: benefitRunItems.deductedDays,
      days: benefitRunItems.days,
      amountCents: benefitRunItems.amountCents,
      adjusted: benefitRunItems.adjusted,
      note: benefitRunItems.note,
    })
    .from(benefitRunItems)
    .innerJoin(employees, eq(employees.id, benefitRunItems.employeeId))
    .where(eq(benefitRunItems.runId, id))
    .orderBy(asc(employees.fullName))
  return { ...run, items }
}

export const updateItem = async (tx: Tx, ctx: Ctx, runId: string, itemId: string, input: BenefitItemUpdate) => {
  const run = await draftRun(tx, runId)
  const [item] = await tx.select().from(benefitRunItems).where(and(eq(benefitRunItems.id, itemId), eq(benefitRunItems.runId, runId)))
  if (!item) throw notFound('Linha da apuração')
  const amountCents = amountFor(item.valueType, item.unitValueCents, input.days, run.workdays)
  await tx.update(benefitRunItems).set({ days: input.days, note: input.note, amountCents, adjusted: true }).where(eq(benefitRunItems.id, itemId))
  await audit(tx, ctx, { action: 'benefit_run.item_adjusted', entity: 'benefit_run', entityId: runId, metadata: { employeeId: item.employeeId, days: input.days } })
  return { id: itemId, days: input.days, amountCents }
}

export const closeRun = async (tx: Tx, ctx: Ctx, id: string) => {
  await draftRun(tx, id)
  await tx.update(benefitRuns).set({ status: 'closed', closedAt: new Date(), closedBy: ctx.userId }).where(eq(benefitRuns.id, id))
  await audit(tx, ctx, { action: 'benefit_run.closed', entity: 'benefit_run', entityId: id })
  return { id }
}

export const deleteRun = async (tx: Tx, ctx: Ctx, id: string) => {
  await draftRun(tx, id)
  await tx.delete(benefitRuns).where(eq(benefitRuns.id, id))
  await audit(tx, ctx, { action: 'benefit_run.deleted', entity: 'benefit_run', entityId: id })
}

export const exportRun = async (tx: Tx, id: string) => {
  const run = await getRun(tx, id)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Falcão RH'
  const sheet = workbook.addWorksheet(`Benefícios ${run.competence}`, { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = [
    { header: 'Matrícula', key: 'registration', width: 12 },
    { header: 'Nome', key: 'fullName', width: 34 },
    { header: 'Benefício', key: 'kind', width: 18 },
    { header: 'Plano', key: 'planName', width: 24 },
    { header: 'Valor unitário (R$)', key: 'unit', width: 18 },
    { header: 'Dias úteis elegíveis', key: 'eligibleDays', width: 18 },
    { header: 'Dias descontados', key: 'deductedDays', width: 16 },
    { header: 'Dias pagos', key: 'days', width: 12 },
    { header: 'Valor (R$)', key: 'amount', width: 14 },
    { header: 'Ajuste manual', key: 'adjusted', width: 14 },
    { header: 'Observação', key: 'note', width: 30 },
  ]
  sheet.getRow(1).font = { bold: true }
  for (const item of run.items)
    sheet.addRow({
      ...item,
      kind: BENEFIT_KIND_LABELS[item.kind],
      unit: item.unitValueCents / 100,
      amount: item.amountCents / 100,
      adjusted: item.adjusted ? 'Sim' : '',
    })
  const total = sheet.addRow({ fullName: 'Total', amount: run.items.reduce((s, i) => s + i.amountCents, 0) / 100 })
  total.font = { bold: true }
  for (const key of ['unit', 'amount']) sheet.getColumn(key).numFmt = '#,##0.00'
  return { competence: run.competence, file: Buffer.from(await workbook.xlsx.writeBuffer()) }
}
