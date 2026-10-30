/**
 * Datas de calendário (AAAA-MM-DD) no fuso da operação. Às 22h em São Paulo
 * já é o dia seguinte em UTC: usar toISOString() aqui erraria a data.
 * TODO(ROADMAP): fuso por organização, nas configurações do tenant.
 */
export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo'

const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE })

export const calendarDate = (date: Date = new Date()) => formatter.format(date)

/** Soma dias a uma data de calendário, sem passar por fuso. */
export const addDays = (isoDate: string, days: number) => {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
