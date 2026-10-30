/**
 * Sistema de movimento (GSAP). Uma curva da marca, durações curtas na
 * operação do dia a dia e um único momento cinematográfico: a entrada.
 * Quem pede menos movimento no sistema recebe o estado final, sem animar.
 */
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { CustomEase } from 'gsap/CustomEase'
import { Flip } from 'gsap/Flip'
import { SplitText } from 'gsap/SplitText'

gsap.registerPlugin(useGSAP, CustomEase, Flip, SplitText)

/** Curva da marca: arranque firme, assentamento longo. */
CustomEase.create('falcon', '0.16, 1, 0.3, 1')
gsap.defaults({ ease: 'falcon', duration: 0.8 })

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const canHover = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches

export { Flip, gsap, SplitText, useGSAP }
