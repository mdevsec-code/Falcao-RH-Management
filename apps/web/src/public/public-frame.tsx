import { Link } from '@tanstack/react-router'
import { Moon, ShieldCheck, Sun } from 'lucide-react'
import type { ReactNode } from 'react'

import falcon from '../assets/falcao-mark.svg'
import { toggleTheme, useTheme } from '../lib/theme'

/** Moldura das páginas públicas: marca, tema e rodapé de privacidade. */
export function PublicFrame({ slug, company, children }: { slug?: string; company?: string; children: ReactNode }) {
  const theme = useTheme()
  return (
    <div className="flex min-h-dvh flex-col bg-concrete">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-concrete/80 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          {slug ? (
            <Link to="/vagas/$empresa" params={{ empresa: slug }} className="group flex items-center gap-3">
              <Brand company={company} />
            </Link>
          ) : (
            <Brand company={company} />
          )}
          <span className="ml-auto" />
          <button
            type="button"
            onClick={event => toggleTheme({ x: event.clientX, y: event.clientY })}
            className="flex size-10 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
            aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
          >
            {theme === 'dark' ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
          </button>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-[12.5px] text-steel sm:px-6">
          <span>© {new Date().getFullYear()} {company ?? 'Falcão Construções e Engenharia'}</span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-ok" aria-hidden /> Seus dados são protegidos pela LGPD
          </span>
        </div>
      </footer>
    </div>
  )
}

function Brand({ company }: { company?: string }) {
  return (
    <>
      <img src={falcon} alt="" className="h-8 w-auto transition-transform duration-500 group-hover:-rotate-6" />
      <span className="leading-none">
        <span className="block font-display text-[22px] font-semibold tracking-[-0.01em] text-ink">
          Trabalhe na <span className="text-brand-strong">Falcão</span>
        </span>
        <span className="mt-0.5 hidden text-[10.5px] font-medium tracking-[0.16em] text-steel uppercase sm:block">{company ?? 'Carreiras'}</span>
      </span>
    </>
  )
}
