import { describe, expect, it } from 'vitest'

import en from '../i18n/en.json'
import zh from '../i18n/zh.json'
import { compile, translateText } from './i18n'

const dict = compile({ Salvar: 'Save', 'Faltam {0} dias para o prazo do RNM e não há atendimento agendado.': '{0} days left until the RNM deadline and no appointment is scheduled.', 'Ficha de {0}': 'Record of {0}', Chinesa: 'Chinese' })

describe('tradutor de tela', () => {
  it('traduz texto exato e preserva os espaços em volta', () => {
    expect(translateText(dict, '  Salvar ')).toBe('  Save ')
  })

  it('traduz modelos com variáveis; a variável também passa pelo dicionário', () => {
    expect(translateText(dict, 'Faltam 12 dias para o prazo do RNM e não há atendimento agendado.')).toBe('12 days left until the RNM deadline and no appointment is scheduled.')
    expect(translateText(dict, 'Ficha de Chinesa')).toBe('Record of Chinese')
  })

  it('não mexe em dados (nomes, números) nem em texto sem tradução', () => {
    expect(translateText(dict, 'Wang Lei')).toBeNull()
    expect(translateText(dict, '42')).toBeNull()
    // Modelo só de pontuação não altera endereço digitado; traduz quando a parte é conhecida.
    const punct = compile({ '{0}, {1}': '{0}，{1}', Admissão: '入职' })
    expect(translateText(punct, 'Rua das Flores, 120')).toBeNull()
    expect(translateText(punct, 'Admissão, 05/11/2026')).toBe('入职，05/11/2026')
  })

  it('dicionários reais: mesmas chaves e variáveis em inglês e chinês', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    const vars = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join()
    for (const [pt, tr] of Object.entries(en)) expect(vars(tr), pt).toBe(vars(pt))
    for (const [pt, tr] of Object.entries(zh)) expect(vars(tr), pt).toBe(vars(pt))
    expect(translateText(compile(zh), 'Prontos para trabalhar')).toBe('可上岗人员')
  })
})
