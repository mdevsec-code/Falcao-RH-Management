import { and, asc, between, count, desc, eq, gte, isNull, lte, ne, sql, type SQL } from 'drizzle-orm'

import { addDaysIso, can, type DashboardFilters } from '@falcao-rh/contracts'

import type { Tx } from '../../db/client'
import { rowsOf } from '../../db/rows'
import { addDays, calendarDate } from '../../lib/dates'
import { costCenters, departments, documents, employeeEvents, employees, positions, requests, units } from '../../db/schema'
import type { Ctx } from '../../http/context'
import { scopeCondition } from '../employees/employees.service'
import { listRequests } from '../requests/requests.service'
import { vacationsDue } from '../requests/vacation-due'

/** Período padrão: os últimos 12 meses até hoje. */
export const resolvePeriod = (filters: DashboardFilters, now = new Date()) => {
  const to = filters.to ?? calendarDate(now)
  const from = filters.from ?? addDays(`${Number(to.slice(0, 4)) - 1}${to.slice(4)}`, 1)
  return { from, to }
}

/** Quadro em uma data: admitido até ela e não desligado até ela. */
const activeAt = (date: string | SQL) =>
  sql`${employees.hireDate} <= ${date} and (${employees.terminationDate} is null or ${employees.terminationDate} > ${date})`

export const getDashboard = async (tx: Tx, ctx: Ctx, filters: DashboardFilters) => {
  const { from, to } = resolvePeriod(filters)
  const base = [
    scopeCondition(ctx),
    filters.departmentId ? eq(employees.departmentId, filters.departmentId) : undefined,
    filters.unitId ? eq(employees.unitId, filters.unitId) : undefined,
  ].filter(Boolean) as SQL[]
  const where = (...extra: (SQL | undefined)[]) => and(...base, ...extra)
  const current = ne(employees.status, 'terminated')

  const countWhere = async (condition: SQL | undefined) => {
    const [row] = await tx.select({ value: count() }).from(employees).where(condition)
    return row?.value ?? 0
  }

  const groupBy = async (
    label: SQL<string | null>,
    join: (q: ReturnType<typeof selectBase>) => ReturnType<typeof selectBase>,
  ) => {
    const rows = await join(selectBase(label)).where(where(current)).groupBy(label)
    return rows
      .map(row => ({ label: row.label ?? 'Não informado', total: row.total }))
      .sort((a, b) => b.total - a.total)
  }
  const selectBase = (label: SQL<string | null>) =>
    tx.select({ label, total: count() }).from(employees).$dynamic()

  const [
    active,
    onLeave,
    hires,
    terminations,
    startHeadcount,
    endHeadcount,
    byDepartment,
    byUnit,
    byCostCenter,
  ] = await Promise.all([
    countWhere(where(eq(employees.status, 'active'))),
    countWhere(where(eq(employees.status, 'on_leave'))),
    countWhere(where(between(employees.hireDate, from, to))),
    countWhere(where(between(employees.terminationDate, from, to))),
    countWhere(where(activeAt(from))),
    countWhere(where(activeAt(to))),
    groupBy(sql<string | null>`${departments.name}`, q =>
      q.leftJoin(departments, eq(departments.id, employees.departmentId)),
    ),
    groupBy(sql<string | null>`${units.name}`, q => q.leftJoin(units, eq(units.id, employees.unitId))),
    groupBy(sql<string | null>`${costCenters.name}`, q =>
      q.leftJoin(costCenters, eq(costCenters.id, employees.costCenterId)),
    ),
  ])

  // Rotatividade no período: média de admissões e desligamentos sobre o quadro médio.
  const averageHeadcount = (startHeadcount + endHeadcount) / 2
  const turnover = averageHeadcount > 0 ? ((hires + terminations) / 2 / averageHeadcount) * 100 : null

  const trend = await tx.execute(sql`
    select to_char(m, 'YYYY-MM') as month,
      (select count(*) from employees where ${where(activeAt(sql`(m + interval '1 month - 1 day')::date`))})::int as headcount,
      (select count(*) from employees where ${where(sql`date_trunc('month', ${employees.hireDate}) = m`)})::int as hires,
      (select count(*) from employees where ${where(sql`date_trunc('month', ${employees.terminationDate}) = m`)})::int as terminations
    from generate_series(date_trunc('month', ${from}::date), date_trunc('month', ${to}::date), interval '1 month') as m
    order by m
  `)

  // Aniversariantes: só nome e dia, nunca o ano (LGPD: minimização).
  const birthdays = await tx
    .select({
      id: employees.id,
      name: sql<string>`coalesce(${employees.socialName}, ${employees.fullName})`,
      day: sql<number>`extract(day from ${employees.birthDate})::int`,
      departmentName: departments.name,
    })
    .from(employees)
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .where(where(current, sql`extract(month from ${employees.birthDate}) = extract(month from current_date)`))
    .orderBy(sql`extract(day from ${employees.birthDate})`)

  const recentHires = await tx
    .select({
      id: employees.id,
      name: employees.fullName,
      hireDate: employees.hireDate,
      departmentName: departments.name,
      positionTitle: positions.title,
    })
    .from(employees)
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(positions, eq(positions.id, employees.positionId))
    .where(where(between(employees.hireDate, from, to)))
    .orderBy(desc(employees.hireDate))
    .limit(6)

  const activity = await tx
    .select({
      id: employeeEvents.id,
      type: employeeEvents.type,
      effectiveDate: employeeEvents.effectiveDate,
      createdAt: employeeEvents.createdAt,
      employeeId: employees.id,
      employeeName: employees.fullName,
    })
    .from(employeeEvents)
    .innerJoin(employees, eq(employees.id, employeeEvents.employeeId))
    .where(where())
    .orderBy(desc(employeeEvents.createdAt))
    .limit(8)

  // Alertas de qualidade cadastral: pendências reais que o RH precisa resolver.
  const [noDepartment, noPosition, noManager] = await Promise.all([
    countWhere(where(current, isNull(employees.departmentId))),
    countWhere(where(current, isNull(employees.positionId))),
    countWhere(where(current, isNull(employees.managerId))),
  ])
  const today = calendarDate()

  // Absenteísmo: dias úteis perdidos em ausências aprovadas (férias não
  // contam) sobre os dias úteis disponíveis do quadro médio no período.
  const [lost] = rowsOf<{ days: number }>(
    await tx.execute(sql`
      select coalesce(sum((
        select count(*) from generate_series(greatest(${requests.startDate}, ${from}::date), least(${requests.endDate}, ${to}::date), interval '1 day') d
        where extract(isodow from d) < 6
      )), 0)::int as days
      from ${requests} join ${employees} on ${employees.id} = ${requests.employeeId}
      where ${requests.type} = 'absence' and ${requests.status} = 'approved'
        and ${requests.startDate} <= ${to} and ${requests.endDate} >= ${from} and ${where() ?? sql`true`}
    `),
  )
  const [workdays] = rowsOf<{ days: number }>(
    await tx.execute(sql`select count(*)::int as days from generate_series(${from}::date, ${to}::date, interval '1 day') d where extract(isodow from d) < 6`),
  )
  const available = averageHeadcount * (workdays?.days ?? 0)
  const absenteeism = available > 0 ? Math.round(((lost?.days ?? 0) / available) * 1000) / 10 : null

  // Solicitações: o RH vê todas as pendentes; o gestor, as que esperam por ele.
  const pendingRequests = can(ctx.role, 'requests.read')
    ? (await listRequests(tx, ctx, can(ctx.role, 'requests.manage') ? { status: 'pending' } : { awaitingMe: true })).length
    : 0

  const upcomingVacations = await tx
    .select({
      id: requests.id,
      employeeId: employees.id,
      name: sql<string>`coalesce(${employees.socialName}, ${employees.fullName})`,
      startDate: requests.startDate,
      endDate: requests.endDate,
      days: requests.days,
    })
    .from(requests)
    .innerJoin(employees, eq(employees.id, requests.employeeId))
    .where(
      where(
        eq(requests.type, 'vacation'),
        eq(requests.status, 'approved'),
        gte(requests.endDate, today),
        lte(requests.startDate, addDaysIso(today, 60)),
      ),
    )
    .orderBy(asc(requests.startDate))
    .limit(8)

  const [expiringDocuments] = can(ctx.role, 'documents.read')
    ? await tx
        .select({ value: count() })
        .from(documents)
        .where(and(eq(documents.status, 'active'), lte(documents.expiresAt, addDaysIso(today, 30))))
    : [{ value: 0 }]
  const due = await vacationsDue(tx, today, 60, where())

  const alerts = [
    { key: 'vacation_deadline', label: 'com férias perto do prazo legal (60 dias)', total: new Set(due.map(d => d.employeeId)).size, href: '/solicitacoes' },
    { key: 'documents_expiring', label: 'documentos vencidos ou vencendo em 30 dias', total: expiringDocuments?.value ?? 0, href: '/documentos?expiring=1' },
    { key: 'no_department', label: 'sem departamento', total: noDepartment, href: '/colaboradores' },
    { key: 'no_position', label: 'sem cargo', total: noPosition, href: '/colaboradores' },
    { key: 'no_manager', label: 'sem gestor definido', total: noManager, href: '/colaboradores' },
  ].filter(alert => alert.total > 0)

  return {
    period: { from, to },
    headcount: { active, onLeave, total: active + onLeave },
    movement: { hires, terminations, turnover: turnover === null ? null : Math.round(turnover * 10) / 10 },
    distribution: { byDepartment, byUnit, byCostCenter },
    trend: rowsOf<{ month: string; headcount: number; hires: number; terminations: number }>(trend),
    birthdays,
    recentHires,
    activity,
    alerts,
    absence: { absenteeism, lostDays: lost?.days ?? 0, workdays: workdays?.days ?? 0 },
    requests: { pending: pendingRequests, upcomingVacations },
  }
}
