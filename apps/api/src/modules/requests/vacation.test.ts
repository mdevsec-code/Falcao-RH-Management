import { describe, expect, it } from 'vitest'

import { checkVacation, entitlementFor, vacationPeriods } from './vacation'

describe('direito a férias (CLT art. 130)', () => {
  it('reduz conforme faltas injustificadas', () => {
    expect([5, 6, 14, 15, 23, 24, 32, 33].map(entitlementFor)).toEqual([30, 24, 24, 18, 18, 12, 12, 0])
  })
})

describe('períodos aquisitivos', () => {
  it('libera 30 dias a cada 12 meses completos e calcula o prazo de concessão', () => {
    const periods = vacationPeriods('2024-03-01', '2026-03-15', [])
    expect(periods.map(p => [p.start, p.end, p.complete, p.entitled])).toEqual([
      ['2024-03-01', '2025-02-28', true, 30],
      ['2025-03-01', '2026-02-28', true, 30],
      ['2026-03-01', '2027-02-28', false, 0],
    ])
    expect(periods[0]!.deadline).toBe('2026-02-28')
  })

  it('consome primeiro o período mais antigo e separa aprovado de pendente', () => {
    const periods = vacationPeriods('2024-03-01', '2026-03-15', [
      { startDate: '2025-07-07', days: 20, status: 'approved' },
      { startDate: '2026-01-05', days: 10, status: 'approved' },
      { startDate: '2026-04-06', days: 15, status: 'pending' },
    ])
    expect(periods[0]).toMatchObject({ remaining: 0, approved: 30, fractions: [20, 10] })
    expect(periods[1]).toMatchObject({ remaining: 15, pending: 15 })
  })

  it('desconta faltas injustificadas do período em que ocorreram', () => {
    const periods = vacationPeriods('2024-03-01', '2025-04-01', [], [{ startDate: '2024-06-03', endDate: '2024-06-12' }])
    expect(periods[0]).toMatchObject({ unjustifiedAbsences: 10, entitled: 24 })
  })
})

describe('validação do pedido', () => {
  const fresh = () => vacationPeriods('2024-03-01', '2026-03-15', [])

  it('aceita 30 dias de uma vez ou 14 + 16', () => {
    expect(checkVacation(fresh(), { startDate: '2026-04-06', days: 30 }).ok).toBe(true)
    expect(checkVacation(fresh(), { startDate: '2026-04-06', days: 14 }).ok).toBe(true)
  })

  it('recusa menos de 5 dias', () => {
    expect(checkVacation(fresh(), { startDate: '2026-04-06', days: 4 })).toMatchObject({ ok: false })
  })

  it('recusa início na sexta ou no sábado', () => {
    expect(checkVacation(fresh(), { startDate: '2026-04-10', days: 10 })).toMatchObject({ ok: false })
    expect(checkVacation(fresh(), { startDate: '2026-04-11', days: 10 })).toMatchObject({ ok: false })
  })

  it('exige que sobre espaço para a parte de 14 dias', () => {
    // Já tirou 10. Mais 10 deixaria 10 para a terceira parte: nenhuma das
    // três teria 14 dias. Mais 14 resolve.
    const periods = vacationPeriods('2024-03-01', '2026-03-15', [{ startDate: '2025-05-05', days: 10, status: 'approved' }])
    expect(checkVacation(periods, { startDate: '2026-04-06', days: 10 })).toMatchObject({ ok: false })
    expect(checkVacation(periods, { startDate: '2026-04-06', days: 14 }).ok).toBe(true)
  })

  it('a terceira parte usa todo o saldo', () => {
    const periods = vacationPeriods('2024-03-01', '2026-03-15', [
      { startDate: '2025-05-05', days: 14, status: 'approved' },
      { startDate: '2025-08-04', days: 6, status: 'approved' },
    ])
    expect(checkVacation(periods, { startDate: '2026-04-06', days: 5 })).toMatchObject({ ok: false })
    expect(checkVacation(periods, { startDate: '2026-04-06', days: 10 }).ok).toBe(true)
  })

  it('não deixa sobra menor que 5 dias', () => {
    expect(checkVacation(fresh(), { startDate: '2026-04-06', days: 27 })).toMatchObject({ ok: false })
  })

  it('sem período completo, não há saldo', () => {
    const periods = vacationPeriods('2026-01-05', '2026-10-29', [])
    expect(checkVacation(periods, { startDate: '2026-11-02', days: 10 })).toMatchObject({ ok: false })
  })
})
