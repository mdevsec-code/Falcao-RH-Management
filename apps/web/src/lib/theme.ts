/**
 * Tema claro/escuro. Começa pela escolha salva ou pela preferência do
 * sistema (o index.html aplica antes da primeira pintura) e fica num
 * atributo do <html>: os tokens de cor trocam por CSS, sem re-renderizar.
 */
import { useSyncExternalStore } from 'react'

import { reducedMotion } from './gsap'

export type Theme = 'light' | 'dark'

const KEY = 'falcao-rh:theme'
const listeners = new Set<() => void>()

const current = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')

const apply = (theme: Theme) => {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#09090a' : '#0b0b0c')
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Navegação privada: vale só nesta aba.
  }
  listeners.forEach(fn => fn())
}

/**
 * Troca o tema. Com suporte a View Transitions, o novo tema se abre num
 * círculo a partir de onde a pessoa clicou.
 */
export function toggleTheme(origin?: { x: number; y: number }) {
  const next: Theme = current() === 'dark' ? 'light' : 'dark'
  const doc = document as Document & { startViewTransition?: (fn: () => void) => { ready: Promise<void> } }
  if (!doc.startViewTransition || reducedMotion()) return apply(next)

  const x = origin?.x ?? window.innerWidth - 80
  const y = origin?.y ?? 32
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
  const transition = doc.startViewTransition(() => apply(next))
  void transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 620, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', pseudoElement: '::view-transition-new(root)' },
    )
  })
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const useTheme = () => useSyncExternalStore(subscribe, current, () => 'light' as Theme)
