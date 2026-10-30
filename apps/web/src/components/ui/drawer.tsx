import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useRef, type ReactNode } from 'react'

import { gsap, MOTION, useGSAP } from '../../lib/gsap'

/** Conteúdo da gaveta: os campos entram em cascata logo depois do painel. */
function DrawerBody({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION.ok, () => {
        const items = ref.current!.querySelectorAll(':scope > * > *')
        gsap.from(items, { x: 18, autoAlpha: 0, duration: 0.7, stagger: 0.04, delay: 0.12, clearProps: 'transform,opacity,visibility' })
      })
    },
    { scope: ref },
  )
  return (
    <div ref={ref} className="flex-1 overflow-y-auto px-6 py-6">
      {children}
    </div>
  )
}

/**
 * Painel lateral para formulários: mantém a lista à vista por trás, foco
 * preso dentro, Esc fecha (Radix cuida da acessibilidade).
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay fixed inset-0 z-40 bg-night/40 backdrop-blur-[3px]" />
        <Dialog.Content className="drawer-panel fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-paper shadow-pop focus:outline-none sm:inset-y-2 sm:right-2 sm:rounded-lg sm:border sm:border-line">
          <div className="relative flex items-start justify-between gap-4 border-b border-line px-6 pt-6 pb-5">
            <span className="absolute top-0 left-6 h-[3px] w-12 rounded-b-full bg-brand" aria-hidden />
            <div className="min-w-0">
              <Dialog.Title className="font-display text-[30px] leading-none font-semibold tracking-[-0.01em] text-ink">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-2 text-sm text-steel">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="-mt-1 -mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-steel transition-all duration-300 hover:rotate-90 hover:bg-ink/5 hover:text-ink"
              aria-label="Fechar"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <DrawerBody>{children}</DrawerBody>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-sunken/60 px-6 py-4 sm:rounded-b-lg">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
