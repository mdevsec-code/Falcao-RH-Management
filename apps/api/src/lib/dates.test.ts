import { describe, expect, it } from 'vitest'

import { addDays, calendarDate } from './dates'

describe('datas de calendário', () => {
  it('usa o dia de São Paulo, não o de UTC', () => {
    // 29/10/2026 às 22h30 em São Paulo = 30/10/2026 01h30 UTC.
    expect(calendarDate(new Date('2026-10-30T01:30:00Z'))).toBe('2026-10-29')
  })
  it('soma dias atravessando meses e anos', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})
