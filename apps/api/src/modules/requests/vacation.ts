/**
 * Férias segundo a CLT. Funções puras: o serviço busca os dados e estas
 * regras decidem. Premissas documentadas em docs/PRODUCT_REQUIREMENTS.md:
 * - repouso semanal no domingo (o início não pode ser sexta nem sábado);
 * - feriados ainda não são considerados (calendário de feriados no roadmap);
 * - abono pecuniário (venda de 1/3) e férias coletivas ainda não tratados.
 */
import { addDaysIso, calendarDays } from '@falcao-rh/contracts'

/** Art. 130: dias de direito conforme as faltas injustificadas no período aquisitivo. */
export const entitlementFor = (unjustifiedAbsenceDays: number) => {
  if (unjustifiedAbsenceDays <= 5) return 30
  if (unjustifiedAbsenceDays <= 14) return 24
  if (unjustifiedAbsenceDays <= 23) return 18
  if (unjustifiedAbsenceDays <= 32) return 12
  return 0
}

const addYears = (iso: string, years: number) => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y + years, m - 1, d))
  // 29/02 + 1 ano vira 01/03, como no calendário civil.
  return date.toISOString().slice(0, 10)
}

export type VacationEntry = { startDate: string; days: number; status: 'pending' | 'approved' }
export type AbsenceEntry = { startDate: string; endDate: string }

export type VacationPeriod = {
  /** Período aquisitivo. */
  start: string
  end: string
  /** Fim do período concessivo (art. 134): até quando as férias precisam ser gozadas. */
  deadline: string
  complete: boolean
  unjustifiedAbsences: number
  entitled: number
  approved: number
  pending: number
  remaining: number
  /** Dias de cada fração já marcada (aprovada ou pendente). */
  fractions: number[]
}

const overlapDays = (a: AbsenceEntry, start: string, end: string) => {
  const from = a.startDate > start ? a.startDate : start
  const to = a.endDate < end ? a.endDate : end
  return to >= from ? calendarDays(from, to) : 0
}

export const vacationPeriods = (
  hireDate: string,
  today: string,
  vacations: VacationEntry[],
  unjustifiedAbsences: AbsenceEntry[] = [],
): VacationPeriod[] => {
  const periods: VacationPeriod[] = []
  for (let k = 0; ; k++) {
    const start = addYears(hireDate, k)
    if (start > today) break
    const end = addDaysIso(addYears(hireDate, k + 1), -1)
    const complete = end < today
    const absences = unjustifiedAbsences.reduce((sum, a) => sum + overlapDays(a, start, end), 0)
    const entitled = complete ? entitlementFor(absences) : 0
    periods.push({
      start,
      end,
      deadline: addDaysIso(addYears(end, 1), 0),
      complete,
      unjustifiedAbsences: absences,
      entitled,
      approved: 0,
      pending: 0,
      remaining: entitled,
      fractions: [],
    })
  }

  // Cada férias consome o período aquisitivo mais antigo com saldo.
  for (const vacation of [...vacations].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    const period = periods.find(p => p.complete && p.remaining >= vacation.days) ?? periods.find(p => p.remaining > 0)
    if (!period) continue
    period.remaining -= vacation.days
    period.fractions.push(vacation.days)
    if (vacation.status === 'approved') period.approved += vacation.days
    else period.pending += vacation.days
  }
  return periods
}

export type VacationCheck = { ok: true; period: VacationPeriod } | { ok: false; message: string }

/** Valida um pedido de férias contra o saldo e as regras de fracionamento. */
export const checkVacation = (
  periods: VacationPeriod[],
  request: { startDate: string; days: number },
): VacationCheck => {
  if (request.days < 5) return { ok: false, message: 'Cada período de férias precisa ter pelo menos 5 dias corridos.' }

  const weekday = new Date(`${request.startDate}T12:00:00Z`).getUTCDay()
  if (weekday === 5 || weekday === 6)
    return { ok: false, message: 'As férias não podem começar nos dois dias que antecedem o repouso semanal (sexta ou sábado).' }

  const period = periods.find(p => p.complete && p.remaining > 0)
  if (!period) return { ok: false, message: 'Não há saldo de férias disponível: nenhum período aquisitivo completo com dias restantes.' }
  if (request.days > period.remaining)
    return {
      ok: false,
      message: `O saldo do período aquisitivo de ${br(period.start)} a ${br(period.end)} é de ${period.remaining} dias.`,
    }
  if (period.fractions.length >= 3)
    return { ok: false, message: 'As férias deste período já foram divididas em três partes, o máximo permitido.' }

  const after = period.remaining - request.days
  const fractionsAfter = period.fractions.length + 1
  const hasLong = request.days >= 14 || period.fractions.some(days => days >= 14)
  const needsLong = period.entitled >= 14

  if (after > 0 && fractionsAfter >= 3)
    return { ok: false, message: `Esta seria a terceira parte; ela precisa usar todo o saldo restante (${period.remaining} dias).` }
  if (needsLong && !hasLong && after < 14)
    return {
      ok: false,
      message: 'Uma das partes precisa ter pelo menos 14 dias corridos. Ajuste este período para sobrar saldo para ela.',
    }
  if (after > 0 && after < 5)
    return { ok: false, message: `Sobrariam ${after} dias, menos que o mínimo de 5 para outra parte.` }
  return { ok: true, period }
}

const br = (iso: string) => iso.split('-').reverse().join('/')
