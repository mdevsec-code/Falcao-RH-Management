import { and, inArray, ne, type SQL } from 'drizzle-orm'

import type { Tx } from '../../db/client'
import { employees, requests } from '../../db/schema'
import { vacationPeriods, type VacationPeriod } from './vacation'

export type VacationDue = { employeeId: string; name: string; period: VacationPeriod; daysLeft: number }

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)

/**
 * Períodos com saldo cujo prazo de concessão (CLT art. 134) termina em até
 * `withinDays`. Usado pelo painel e pelas automações.
 */
export const vacationsDue = async (tx: Tx, today: string, withinDays: number, scope?: SQL): Promise<VacationDue[]> => {
  const people = await tx
    .select({ id: employees.id, name: employees.fullName, hireDate: employees.hireDate })
    .from(employees)
    .where(and(ne(employees.status, 'terminated'), scope))
  if (people.length === 0) return []
  const taken = await tx
    .select({
      employeeId: requests.employeeId,
      type: requests.type,
      absenceKind: requests.absenceKind,
      status: requests.status,
      startDate: requests.startDate,
      endDate: requests.endDate,
      days: requests.days,
    })
    .from(requests)
    .where(and(inArray(requests.status, ['pending', 'approved']), inArray(requests.employeeId, people.map(p => p.id))))

  const due: VacationDue[] = []
  for (const person of people) {
    const mine = taken.filter(t => t.employeeId === person.id)
    const periods = vacationPeriods(
      person.hireDate,
      today,
      mine
        .filter(t => t.type === 'vacation')
        .map(t => ({ startDate: t.startDate, days: t.days, status: t.status as 'pending' | 'approved' })),
      mine.filter(t => t.absenceKind === 'unjustified' && t.status === 'approved'),
    )
    for (const period of periods.filter(p => p.complete && p.remaining > 0)) {
      const daysLeft = daysBetween(today, period.deadline)
      if (daysLeft <= withinDays) due.push({ employeeId: person.id, name: person.name, period, daysLeft })
    }
  }
  return due.sort((a, b) => a.daysLeft - b.daysLeft)
}
