import { describe, expect, it } from 'vitest'

import { displayCpf, formatDate, formatMonth, initials, statusLabel, statusTone, tenure } from './format'

describe('formatação para a interface', () => {
  it('data ISO vira DD/MM/AAAA sem passar por fuso horário', () => {
    expect(formatDate('2026-03-01')).toBe('01/03/2026')
    expect(formatDate('2026-12-31T23:30:00Z')).toBe('31/12/2026')
    expect(formatDate(null)).toBeNull()
  })

  it('mês curto em português', () => {
    expect(formatMonth('2026-10')).toBe('out/26')
  })

  it('tempo de casa por extenso', () => {
    expect(tenure('2023-08-15', '2026-10-20')).toBe('3 anos e 2 meses')
    expect(tenure('2026-10-01', '2026-10-20')).toBe('menos de 1 mês')
    expect(tenure('2025-10-20', '2026-10-20')).toBe('1 ano')
  })

  it('CPF completo formatado; mascarado fica como veio', () => {
    expect(displayCpf('52998224725')).toBe('529.982.247-25')
    expect(displayCpf('***.***.***-25')).toBe('***.***.***-25')
  })

  it('iniciais e situação', () => {
    expect(initials('Ana Rezende Barbosa')).toBe('AR')
    expect(statusLabel('on_leave')).toBe('Afastado')
    expect(statusTone('terminated')).toBe('neutral')
  })
})
