import { describe, expect, it } from 'vitest'

import { foreignCandidate, foreignProcess } from './index'

const base = (extra: object = {}) => foreignCandidate.parse({ nationality: 'Chinesa', ...extra })

describe('triagem de estrangeiros', () => {
  it('ficha antiga (sem etapas) continua válida e começa pelos documentos', () => {
    const f = base({ passport: 'E12345678' })
    const p = foreignProcess(f, '2026-11-18')
    expect(p.steps.some(s => s.key === 'crea')).toBe(false)
    expect(p.done).toBe(0)
    expect(p.next?.key).toBe('passport')
    expect(p.phase).toBe('documentos')
    expect(p.alerts).toEqual([])
  })

  it('profissão regulamentada inclui o CREA', () => {
    expect(foreignProcess(base({ regulatedProfession: true }), '2026-11-18').steps.some(s => s.key === 'crea')).toBe(true)
  })

  it('prazo do RNM: 90 dias da entrada, alerta sem agendamento e depois do prazo', () => {
    const steps = { published: { status: 'done' } }
    const near = foreignProcess(base({ arrivalDate: '2026-09-01', steps }), '2026-11-18')
    expect(near.rnmDeadline).toBe('2026-11-30')
    expect(near.rnmDaysLeft).toBe(12)
    expect(near.alerts.some(a => a.tone === 'danger' && a.message.includes('não há atendimento agendado'))).toBe(true)

    const late = foreignProcess(base({ arrivalDate: '2026-08-01', steps }), '2026-11-18')
    expect(late.rnmDaysLeft).toBeLessThan(0)
    expect(late.alerts[0]?.message).toMatch(/fora do prazo/)

    const ok = foreignProcess(base({ arrivalDate: '2026-08-01', steps: { ...steps, rnm_appointment: { status: 'done' } } }), '2026-11-18')
    expect(ok.rnmDaysLeft).toBeNull()
  })

  it('chegada sem autorização publicada é alerta grave', () => {
    const p = foreignProcess(base({ arrivalDate: '2026-11-10' }), '2026-11-18')
    expect(p.alerts.some(a => a.message.includes('sem a autorização de trabalho publicada'))).toBe(true)
  })

  it('não se aplica sai da conta; pronto quando o fluxo acaba', () => {
    const all = Object.fromEntries(
      ['passport', 'criminal', 'qualification', 'translation', 'contract', 'company_docs', 'migranteweb', 'published', 'visa_application', 'visa_issued', 'arrival', 'cpf', 'rnm_precadastro', 'rnm_appointment', 'rnm_issued', 'ctps', 'aso', 'esocial'].map(k => [k, { status: 'done' }]),
    )
    const p = foreignProcess(base({ steps: { ...all, lodging: { status: 'na' } } }), '2026-11-18')
    expect(p.ready).toBe(true)
    expect(p.total).toBe(20)
    expect(p.done).toBe(18)
  })
})
