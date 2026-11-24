/**
 * Idioma das telas internas (português, inglês, chinês simplificado).
 *
 * O código continua escrito em português. Um tradutor de tela troca, no DOM,
 * cada texto visível (e placeholder, title, aria-label) pela versão do
 * dicionário (`i18n/en.json`, `i18n/zh.json`, gerados dos textos do código).
 * Texto sem tradução, como nomes e dados digitados, fica como está.
 *
 * Só troca o valor do nó de texto (não o substitui): o React continua dono do
 * nó e, quando o atualiza, o novo texto é traduzido de novo.
 * shortcut: datas e números seguem no formato brasileiro, e mensagens de erro
 * da API seguem em português; mover para i18n completo se o uso crescer.
 */
import { useEffect, useSyncExternalStore } from 'react'

export type Lang = 'pt' | 'en' | 'zh'
export const LANGS: { key: Lang; label: string; short: string; html: string }[] = [
  { key: 'pt', label: 'Português', short: 'PT', html: 'pt-BR' },
  { key: 'en', label: 'English', short: 'EN', html: 'en' },
  { key: 'zh', label: '简体中文', short: '中文', html: 'zh-CN' },
]

type Dict = Record<string, string>
type Compiled = { exact: Map<string, string>; templates: { re: RegExp; out: string }[] }

const STORAGE_KEY = 'falcao-rh:lang'
const readLang = (): Lang => {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'en' || v === 'zh' ? v : 'pt'
  } catch {
    return 'pt'
  }
}

// Idioma escolhido e o dicionário dele já carregado (null em português ou enquanto carrega).
type State = { lang: Lang; dict: Compiled | null }
let state: State = { lang: readLang(), dict: null }
const listeners = new Set<() => void>()
const emit = (next: State) => {
  state = next
  listeners.forEach(l => l())
}
const useI18n = () =>
  useSyncExternalStore(
    l => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  )

const loadDict = async (lang: Lang) => {
  if (lang === 'pt') return
  const mod = lang === 'en' ? await import('../i18n/en.json') : await import('../i18n/zh.json')
  // Outra troca aconteceu enquanto carregava: descarta.
  if (state.lang === lang) emit({ lang, dict: compile(mod.default as Dict) })
}

export const setLang = (lang: Lang) => {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* modo privado: vale só nesta aba */
  }
  emit({ lang, dict: null })
  void loadDict(lang)
}
void loadDict(state.lang)

export const useLang = () => useI18n().lang

/** Texto traduzido para quem renderiza antes do tradutor de tela (ex.: títulos animados letra a letra). */
export const useT = (text: string) => {
  const { dict } = useI18n()
  return dict ? translateText(dict, text) ?? text : text
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Separa textos exatos e modelos com variáveis ({0}, {1}...). */
export const compile = (dict: Dict): Compiled => {
  const exact = new Map<string, string>()
  const templates: Compiled['templates'] = []
  for (const [pt, tr] of Object.entries(dict)) {
    if (!/\{\d+\}/.test(pt)) exact.set(pt, tr)
    // Modelos mais longos primeiro: o mais específico vence.
    else templates.push({ re: new RegExp('^' + escape(pt).replace(/\\\{(\d+)\\\}/g, '(?<v$1>.+?)') + '$', 's'), out: tr })
  }
  templates.sort((a, b) => b.re.source.length - a.re.source.length)
  return { exact, templates }
}

/** Traduz um texto: exato, ou por modelo (as variáveis também passam pelo dicionário). */
export const translateText = (c: Compiled, text: string): string | null => {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (!trimmed || !/\p{L}/u.test(trimmed)) return null
  const lead = text.match(/^\s*/)![0]
  const tail = text.match(/\s*$/)![0]
  const direct = c.exact.get(trimmed)
  if (direct !== undefined) return lead + direct + tail
  for (const t of c.templates) {
    const m = t.re.exec(trimmed)
    if (!m) continue
    let translatedPart = false
    const out = t.out.replace(/\{(\d+)\}/g, (_, i) => {
      const v = m.groups?.[`v${i}`] ?? ''
      const tr = c.exact.get(v)
      if (tr !== undefined) translatedPart = true
      return tr ?? v
    })
    // Modelo só de pontuação ("{0}, {1}") em dado digitado (endereço, nome): deixa como está.
    if (!translatedPart && !/\p{L}/u.test(t.out.replace(/\{\d+\}/g, ''))) return null
    return lead + out + tail
  }
  return null
}

const ATTRS = ['placeholder', 'title', 'aria-label'] as const
const SKIP = 'script,style,code,pre,[translate="no"],[data-no-translate],[contenteditable="true"]'

/** Liga o tradutor de tela enquanto o app interno estiver montado. */
export function useScreenTranslator() {
  const { lang, dict: loaded } = useI18n()
  useEffect(() => {
    // Ainda carregando o dicionário: espera (o português continua na tela).
    if (lang !== 'pt' && !loaded) return
    const html = LANGS.find(l => l.key === lang)!.html
    document.documentElement.lang = html
    // Texto original de cada nó e o último texto que escrevemos nele.
    const original = new WeakMap<Node, string>()
    const written = new WeakMap<Node, string>()
    const attrOriginal = new WeakMap<Element, Map<string, string>>()
    let dict: Compiled | null = loaded

    const textNode = (node: Text) => {
      if (node.parentElement?.closest(SKIP)) return
      const value = node.nodeValue ?? ''
      // React trocou o texto (não fomos nós): esse é o novo original.
      if (written.get(node) !== value) original.set(node, value)
      const source = original.get(node) ?? value
      const next = dict ? translateText(dict, source) ?? source : source
      if (next !== value) {
        written.set(node, next)
        node.nodeValue = next
      } else written.set(node, value)
    }
    const element = (el: Element) => {
      if (el.closest(SKIP)) return
      let saved = attrOriginal.get(el)
      for (const name of ATTRS) {
        const value = el.getAttribute(name)
        if (value === null) continue
        if (!saved) attrOriginal.set(el, (saved = new Map()))
        const last = saved.get(`w:${name}`)
        if (last !== value) saved.set(name, value)
        const source = saved.get(name)!
        const next = dict ? translateText(dict, source) ?? source : source
        saved.set(`w:${name}`, next)
        if (next !== value) el.setAttribute(name, next)
      }
    }
    const walk = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) return textNode(root as Text)
      if (root.nodeType !== Node.ELEMENT_NODE) return
      element(root as Element)
      const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
      for (let n = it.nextNode(); n; n = it.nextNode()) n.nodeType === Node.TEXT_NODE ? textNode(n as Text) : element(n as Element)
    }

    const observer = new MutationObserver(records => {
      for (const r of records) {
        if (r.type === 'characterData') textNode(r.target as Text)
        else if (r.type === 'attributes') element(r.target as Element)
        else r.addedNodes.forEach(walk)
      }
    })

    walk(document.body)
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] })
    return () => {
      observer.disconnect()
      // Volta ao português ao sair (troca de idioma ou página pública).
      dict = null
      walk(document.body)
    }
  }, [lang, loaded])
}
