import { describe, expect, it } from 'vitest'

import { cpfStatus, maskCpf } from './masks'

describe('máscara de CPF', () => {
  it('formata enquanto a pessoa digita', () => {
    expect(maskCpf('5')).toBe('5')
    expect(maskCpf('529')).toBe('529')
    expect(maskCpf('5299')).toBe('529.9')
    expect(maskCpf('5299822')).toBe('529.982.2')
    expect(maskCpf('529982247')).toBe('529.982.247')
    expect(maskCpf('5299822472')).toBe('529.982.247-2')
    expect(maskCpf('52998224725')).toBe('529.982.247-25')
  })

  it('ignora letras e símbolos e para em 11 dígitos', () => {
    expect(maskCpf('529.982.247-25')).toBe('529.982.247-25')
    expect(maskCpf('529a982b247c25')).toBe('529.982.247-25')
    expect(maskCpf('52998224725999')).toBe('529.982.247-25')
    expect(maskCpf('')).toBe('')
  })

  it('diz se o CPF está incompleto, inválido ou certo', () => {
    expect(cpfStatus('529.982.2')).toBe('incomplete')
    expect(cpfStatus('111.111.111-11')).toBe('invalid')
    expect(cpfStatus('529.982.247-24')).toBe('invalid')
    expect(cpfStatus('529.982.247-25')).toBe('valid')
  })
})
