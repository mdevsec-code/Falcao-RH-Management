import { useRef, type ElementType, type ReactNode, type RefObject } from 'react'

import { canHover, gsap, reducedMotion, SplitText, useGSAP } from '../lib/gsap'

/** Número que conta até o valor; anima de novo quando o valor muda. */
export function CountUp({
  value,
  format = n => Math.round(n).toLocaleString('pt-BR'),
  duration = 1.1,
}: {
  value: number
  format?: (n: number) => string
  duration?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const state = useRef({ n: 0 })
  useGSAP(
    () => {
      const el = ref.current!
      if (reducedMotion()) {
        state.current.n = value
        el.textContent = format(value)
        return
      }
      gsap.to(state.current, {
        n: value,
        duration,
        ease: 'power3.out',
        onUpdate: () => {
          el.textContent = format(state.current.n)
        },
      })
    },
    { dependencies: [value] },
  )
  return (
    <span aria-label={format(value)}>
      <span ref={ref} aria-hidden>
        {format(0)}
      </span>
    </span>
  )
}

/**
 * Título com revelação por caractere atrás de uma máscara, como uma placa
 * sendo montada. O texto real fica acessível (SplitText preserva aria).
 */
export function SplitTitle({
  as: Tag = 'h1',
  children,
  className,
  delay = 0,
}: {
  as?: ElementType
  children: string
  className?: string
  delay?: number
}) {
  const ref = useRef<HTMLElement>(null)
  useGSAP(
    () => {
      if (reducedMotion()) return
      const split = SplitText.create(ref.current!, { type: 'lines,chars', mask: 'lines', aria: 'auto' })
      gsap.from(split.chars, { yPercent: 110, duration: 0.9, stagger: 0.018, delay })
      return () => split.revert()
    },
    { dependencies: [children], scope: ref },
  )
  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  )
}

/** Atração magnética sutil para ações principais (só com mouse). */
export function Magnetic({ children, strength = 0.22, className = 'inline-flex' }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useGSAP(
    (_ctx, contextSafe) => {
      const el = ref.current!
      if (reducedMotion() || !canHover()) return
      const x = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' })
      const y = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' })
      const move = contextSafe!((event: PointerEvent) => {
        const box = el.getBoundingClientRect()
        x((event.clientX - box.left - box.width / 2) * strength)
        y((event.clientY - box.top - box.height / 2) * strength)
      })
      const leave = contextSafe!(() => {
        x(0)
        y(0)
      })
      el.addEventListener('pointermove', move)
      el.addEventListener('pointerleave', leave)
      return () => {
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerleave', leave)
      }
    },
    { scope: ref },
  )
  return (
    <span ref={ref} className={`${className} will-change-transform`}>
      {children}
    </span>
  )
}

/**
 * Entrada da tela: o cabeçalho e os blocos seguintes sobem em cascata quando
 * a tela aparece de fato (as telas carregam sob demanda).
 */
export function usePageReveal(ref: RefObject<HTMLElement | null>) {
  useGSAP(() => {
    const el = ref.current
    if (!el || reducedMotion()) return
    const siblings: Element[] = []
    for (let next = el.nextElementSibling; next; next = next.nextElementSibling) siblings.push(next)
    gsap.fromTo(
      siblings,
      { y: 26, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 0.8, stagger: 0.07, delay: 0.12, clearProps: 'transform,opacity,visibility' },
    )
  })
}
