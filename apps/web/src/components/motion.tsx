import { ArrowUp } from 'lucide-react'
import { useEffect, useRef, useState, type ElementType, type ReactNode, type RefObject } from 'react'

import { cn } from '../lib/cn'
import { Flip, gsap, MOTION, reducedMotion, ScrollTrigger, SplitText, useGSAP } from '../lib/gsap'

/** Número que conta até o valor; anima de novo quando o valor muda. */
export function CountUp({
  value,
  format = n => Math.round(n).toLocaleString('pt-BR'),
  duration = 1.2,
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
        ease: 'expo.out',
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
      const mm = gsap.matchMedia()
      mm.add(MOTION.ok, () => {
        const split = SplitText.create(ref.current!, { type: 'lines,chars', mask: 'lines', aria: 'auto' })
        gsap.from(split.chars, { yPercent: 115, rotate: 4, duration: 1, stagger: 0.016, delay })
        return () => split.revert()
      })
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
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION.pointer, (_context, contextSafe) => {
        const el = ref.current!
        const x = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' })
        const y = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' })
        const move = contextSafe!((event: PointerEvent) => {
          const box = el.getBoundingClientRect()
          x((event.clientX - box.left - box.width / 2) * strength)
          y((event.clientY - box.top - box.height / 2) * strength)
        }) as (event: PointerEvent) => void
        const leave = contextSafe!(() => {
          x(0)
          y(0)
        }) as () => void
        el.addEventListener('pointermove', move)
        el.addEventListener('pointerleave', leave)
        return () => {
          el.removeEventListener('pointermove', move)
          el.removeEventListener('pointerleave', leave)
        }
      })
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
 * Inclinação 3D leve seguindo o mouse, com a luz (`--mx`, `--my`) indo
 * junto. Para cartões de destaque, nunca para listas.
 */
export function useTilt(ref: RefObject<HTMLElement | null>, max = 5) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION.pointer, (_context, contextSafe) => {
        const el = ref.current!
        gsap.set(el, { transformPerspective: 900 })
        const rx = gsap.quickTo(el, 'rotationX', { duration: 0.7, ease: 'power3.out' })
        const ry = gsap.quickTo(el, 'rotationY', { duration: 0.7, ease: 'power3.out' })
        const mx = gsap.quickTo(el, '--mx', { duration: 0.5, ease: 'power3.out' })
        const my = gsap.quickTo(el, '--my', { duration: 0.5, ease: 'power3.out' })
        const toX = gsap.utils.mapRange(0, 1, -max, max)
        const toY = gsap.utils.mapRange(0, 1, max, -max)
        const move = contextSafe!((event: PointerEvent) => {
          const box = el.getBoundingClientRect()
          const px = gsap.utils.clamp(0, 1, (event.clientX - box.left) / box.width)
          const py = gsap.utils.clamp(0, 1, (event.clientY - box.top) / box.height)
          ry(toX(px))
          rx(toY(py))
          mx(px * 100)
          my(py * 100)
        }) as (event: PointerEvent) => void
        const leave = contextSafe!(() => {
          rx(0)
          ry(0)
        }) as () => void
        el.addEventListener('pointermove', move)
        el.addEventListener('pointerleave', leave)
        return () => {
          el.removeEventListener('pointermove', move)
          el.removeEventListener('pointerleave', leave)
        }
      })
    },
    { scope: ref },
  )
}

/**
 * Luz que segue o mouse sobre um grupo de cartões: cada `[data-spotlight]`
 * recebe `--mx`/`--my` em pixels, e o CSS desenha o brilho.
 */
export function useSpotlight(ref: RefObject<HTMLElement | null>) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION.pointer, (_context, contextSafe) => {
        const root = ref.current!
        const move = contextSafe!((event: PointerEvent) => {
          for (const card of root.querySelectorAll<HTMLElement>('[data-spotlight]')) {
            const box = card.getBoundingClientRect()
            card.style.setProperty('--mx', `${event.clientX - box.left}px`)
            card.style.setProperty('--my', `${event.clientY - box.top}px`)
          }
        }) as (event: PointerEvent) => void
        root.addEventListener('pointermove', move)
        return () => root.removeEventListener('pointermove', move)
      })
    },
    { scope: ref },
  )
}

/** Brilho do holofote para usar dentro de um `[data-spotlight]` com `group`. */
export function SpotlightGlow({ tone = 'brand' }: { tone?: 'brand' | 'ink' }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
      style={{
        background: `radial-gradient(420px circle at var(--mx, 50%) var(--my, 50%), ${
          tone === 'brand' ? 'rgb(254 190 2 / 0.13)' : 'color-mix(in oklab, var(--color-ink) 6%, transparent)'
        }, transparent 45%)`,
      }}
    />
  )
}

/**
 * Motor de revelação da área de conteúdo. Todo bloco marcado com
 * `data-reveal` (painéis, tabelas, cartões) sobe e aparece quando entra na
 * tela, em cascata com os vizinhos que chegaram junto (ScrollTrigger.batch).
 * Linhas de tabela (`data-reveal-row`) entram com deslocamento menor.
 *
 * Um MutationObserver percebe blocos que chegam depois (dados carregados,
 * troca de aba), então nada precisa se registrar manualmente. Trocar de
 * rota (`routeKey`) reverte tudo e recomeça.
 */
export function RevealScope({ routeKey, className, children }: { routeKey: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const root = ref.current!
      // Toda rota nova começa do topo (fora do contexto: reverter não pode rolar de volta).
      window.scrollTo(0, 0)

      const mm = gsap.matchMedia()
      mm.add(MOTION.ok, (_context, contextSafe) => {
        gsap.fromTo(root, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.6, clearProps: 'transform,opacity,visibility' })

        const seen = new WeakSet<Element>()
        let frame = 0

        const batch = (selector: string, from: gsap.TweenVars, to: gsap.TweenVars, batchMax: number) => {
          const fresh = gsap.utils.toArray<HTMLElement>(selector, root).filter(el => !seen.has(el))
          if (fresh.length === 0) return false
          fresh.forEach(el => seen.add(el))
          gsap.set(fresh, from)
          ScrollTrigger.batch(fresh, {
            start: 'top 96%',
            once: true,
            batchMax,
            onEnter: targets => gsap.to(targets, { ...to, overwrite: true, clearProps: 'transform,opacity,visibility' }),
          })
          return true
        }

        const scan = contextSafe!(() => {
          frame = 0
          const blocks = batch('[data-reveal]', { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.85, stagger: 0.075 }, 6)
          const rows = batch('[data-reveal-row]', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.55, stagger: 0.028 }, 30)
          // Conteúdo novo empurra o que está abaixo: posições recalculadas.
          if (blocks || rows) ScrollTrigger.refresh()
        }) as () => void

        scan()
        const observer = new MutationObserver(() => {
          if (!frame) frame = requestAnimationFrame(scan)
        })
        observer.observe(root, { childList: true, subtree: true })
        return () => {
          observer.disconnect()
          cancelAnimationFrame(frame)
        }
      })
    },
    { scope: ref, dependencies: [routeKey], revertOnUpdate: true },
  )

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

/**
 * Indicador que desliza até o item ativo (menu, abas). Flip.fit encaixa o
 * `[data-indicator]` sobre o item com `[data-active="true"]`; ao redimensionar,
 * reencaixa sem animar.
 */
export function useIndicator(container: RefObject<HTMLElement | null>, active: unknown) {
  const first = useRef(true)
  useGSAP(
    () => {
      const root = container.current
      const indicator = root?.querySelector<HTMLElement>('[data-indicator]')
      if (!root || !indicator) return
      const fit = (animate: boolean) => {
        const target = root.querySelector<HTMLElement>('[data-active="true"]')
        if (!target) return gsap.to(indicator, { autoAlpha: 0, duration: animate ? 0.2 : 0 })
        gsap.set(indicator, { autoAlpha: 1 })
        const duration = animate && !reducedMotion() ? 0.55 : 0
        Flip.fit(indicator, target, { duration, ease: 'falcon', absolute: true })
      }
      fit(!first.current)
      first.current = false
      const resize = new ResizeObserver(() => fit(false))
      resize.observe(root)
      return () => resize.disconnect()
    },
    { scope: container, dependencies: [active] },
  )
}

/** Linha de tendência desenhada da esquerda para a direita (DrawSVG). */
export function Sparkline({
  values,
  className,
  stroke = 'var(--color-brand)',
  fill = 'rgb(254 190 2 / 0.18)',
  delay = 0.3,
}: {
  values: number[]
  className?: string
  stroke?: string
  fill?: string
  delay?: number
}) {
  const ref = useRef<SVGSVGElement>(null)
  // O viewBox acompanha a largura real: traço sem distorção e DrawSVG medindo certo.
  const [width, setWidth] = useState(240)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const resize = new ResizeObserver(([entry]) => setWidth(Math.max(40, Math.round(entry!.contentRect.width))))
    resize.observe(el)
    return () => resize.disconnect()
  }, [])
  const height = 64
  const min = Math.min(...values)
  const max = Math.max(...values)
  const toY = gsap.utils.mapRange(min, max === min ? min + 1 : max, height - 6, 8)
  const step = values.length > 1 ? width / (values.length - 1) : width
  const points = values.map((v, i) => [i * step, toY(v)] as const)
  // Curva suave: pontos de controle no meio de cada trecho.
  const line = points.reduce((path, [x, y], i) => {
    if (i === 0) return `M${x},${y}`
    const [px, py] = points[i - 1]!
    const cx = (px + x) / 2
    return `${path} C${cx},${py} ${cx},${y} ${x},${y}`
  }, '')
  const area = `${line} L${width},${height} L0,${height} Z`
  const last = points[points.length - 1]

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION.ok, () => {
        gsap
          .timeline({ delay })
          .from('[data-line]', { drawSVG: 0, duration: 1.6, ease: 'power2.inOut' })
          .from('[data-area]', { autoAlpha: 0, duration: 1 }, 0.5)
          .from('[data-dot]', { scale: 0, transformOrigin: 'center', duration: 0.5, ease: 'back.out(3)' }, '-=0.3')
      })
    },
    { scope: ref, dependencies: [values.join(','), width], revertOnUpdate: true },
  )

  if (values.length < 2) return null
  return (
    <svg ref={ref} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={className} aria-hidden>
      <path data-area d={area} fill={fill} />
      <path data-line d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
      {last && <circle data-dot cx={last[0]} cy={last[1]} r={3.5} fill={stroke} />}
    </svg>
  )
}

/** Anel de progresso desenhado com DrawSVG (0 a 1). */
export function Ring({
  value,
  size = 120,
  thickness = 10,
  className,
  track = 'rgb(255 255 255 / 0.1)',
  color = 'var(--color-brand)',
  children,
}: {
  value: number
  size?: number
  thickness?: number
  className?: string
  track?: string
  color?: string
  children?: ReactNode
}) {
  const ref = useRef<SVGSVGElement>(null)
  const r = (size - thickness) / 2
  const clamped = gsap.utils.clamp(0, 1, value)
  useGSAP(
    () => {
      const arc = ref.current!.querySelector('[data-arc]')!
      if (reducedMotion()) return gsap.set(arc, { drawSVG: `0% ${clamped * 100}%` })
      gsap.fromTo(arc, { drawSVG: '0% 0%' }, { drawSVG: `0% ${clamped * 100}%`, duration: 1.6, ease: 'expo.out', delay: 0.2 })
    },
    { scope: ref, dependencies: [clamped] },
  )
  return (
    <div className={cn('relative grid place-items-center', className)} style={{ width: size, height: size }}>
      <svg ref={ref} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={thickness} />
        <circle data-arc cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

/** Volta ao topo: aparece depois de rolar um bocado, desliza com ScrollTo. */
export function BackToTop() {
  const ref = useRef<HTMLButtonElement>(null)
  const { contextSafe } = useGSAP(() => {
    const el = ref.current!
    gsap.set(el, { autoAlpha: 0, y: 16 })
    ScrollTrigger.create({
      start: 700,
      end: 'max',
      onToggle: self => gsap.to(el, { autoAlpha: self.isActive ? 1 : 0, y: self.isActive ? 0 : 16, duration: 0.4, overwrite: true }),
    })
  })
  const toTop = contextSafe(() => gsap.to(window, { scrollTo: 0, duration: reducedMotion() ? 0 : 1, ease: 'power3.inOut' }))
  return (
    <button
      ref={ref}
      type="button"
      onClick={toTop}
      aria-label="Voltar ao topo"
      className="fixed right-5 bottom-5 z-30 flex size-11 items-center justify-center rounded-full border border-line bg-paper/90 text-ink shadow-lift backdrop-blur-md transition-colors hover:border-ink"
    >
      <ArrowUp className="size-[18px]" aria-hidden />
    </button>
  )
}
