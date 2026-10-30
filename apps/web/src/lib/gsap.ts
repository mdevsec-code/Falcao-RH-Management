/**
 * Sistema de movimento (GSAP). Uma curva da marca, durações curtas na
 * operação do dia a dia e um único momento cinematográfico: a entrada.
 * Quem pede menos movimento no sistema recebe o estado final, sem animar.
 *
 * Todos os plugins são registrados aqui, uma vez, antes de qualquer uso.
 */
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { CustomEase } from 'gsap/CustomEase'
import { Draggable } from 'gsap/Draggable'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'
import { Flip } from 'gsap/Flip'
import { InertiaPlugin } from 'gsap/InertiaPlugin'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'

gsap.registerPlugin(useGSAP, CustomEase, Draggable, DrawSVGPlugin, Flip, InertiaPlugin, ScrambleTextPlugin, ScrollToPlugin, ScrollTrigger, SplitText)

/** Curva da marca: arranque firme, assentamento longo. */
CustomEase.create('falcon', '0.16, 1, 0.3, 1')
/** Saída: acelera e some, para o que está indo embora. */
CustomEase.create('falcon-in', '0.7, 0, 0.84, 0')
gsap.defaults({ ease: 'falcon', duration: 0.8 })

/** Condições de gsap.matchMedia(): o movimento só existe para quem não pediu menos. */
export const MOTION = {
  ok: '(prefers-reduced-motion: no-preference)',
  pointer: '(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)',
} as const

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const canHover = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches

export { Draggable, Flip, gsap, ScrollTrigger, SplitText, useGSAP }
