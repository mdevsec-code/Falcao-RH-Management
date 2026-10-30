import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { Bell, ChevronsUpDown, LogOut, Menu, Search, UserCog, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { can, ROLE_LABELS } from '@falcao-rh/contracts'

import falcon from '../assets/falcao-mark.svg'
import { api, tenantStore } from '../lib/api'
import { authClient } from '../lib/auth-client'
import { cn } from '../lib/cn'
import { initials } from '../lib/format'
import { gsap, reducedMotion, useGSAP } from '../lib/gsap'
import { useMe } from '../lib/session'
import type { AppNotification } from '../lib/types'
import { INTRO_FLAG } from '../pages/login'
import { CommandPalette } from './command-palette'
import { NAV, type NavItem } from './navigation'

// ---------- marca e navegação ----------

function Brand() {
  return (
    <Link to="/" className="group flex items-center gap-3 px-6 pt-7 pb-6">
      <img src={falcon} alt="" className="h-9 w-auto transition-transform duration-500 group-hover:-rotate-6" />
      <span className="font-display text-[26px] leading-none font-semibold text-paper">
        Falcão <span className="text-brand">RH</span>
      </span>
    </Link>
  )
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const me = useMe()
  const path = useRouterState({ select: state => state.location.pathname })
  const visible = (item: NavItem) => can(me.role, item.permission) && (!item.needsEmployee || me.employeeId)
  const sections = (['Gestão', 'Pessoal', 'Administração'] as const)
    .map(section => ({ section, items: NAV.filter(item => item.section === section && visible(item)) }))
    .filter(group => group.items.length > 0)

  return (
    <nav aria-label="Principal" className="flex flex-col gap-6 px-3">
      {sections.map(({ section, items }) => (
        <div key={section}>
          {sections.length > 1 && <p className="mb-1.5 px-3 text-[12px] text-steel">{section}</p>}
          <ul className="flex flex-col gap-0.5">
            {items.map(item => {
              const active = path === item.to || path.startsWith(`${item.to}/`)
              return (
                <li key={item.to} className="relative">
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-sm bg-ink-soft"
                      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                    >
                      <span className="absolute inset-y-2 -left-3 w-[3px] rounded-r-sm bg-brand" />
                    </motion.span>
                  )}
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex items-center gap-3 rounded-sm px-3 py-2.5 text-[15px] transition-colors duration-200',
                      active ? 'text-paper' : 'text-steel-soft hover:text-paper',
                    )}
                  >
                    <item.icon className={cn('size-[18px] transition-colors', active && 'text-brand')} aria-hidden />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const me = useMe()
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-ink">
      <Brand />
      <Navigation onNavigate={onNavigate} />
      <div className="mt-auto border-t border-ink-soft px-6 py-5 text-[13px] leading-5">
        <p className="truncate text-paper/85">{me.tenant.name}</p>
        <p className="text-steel">{ROLE_LABELS[me.role]}</p>
      </div>
    </div>
  )
}

// ---------- barra superior ----------

function PaletteTrigger({ onOpen }: { onOpen: () => void }) {
  const mac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-10 min-w-0 max-w-md flex-1 items-center gap-3 rounded-sm border border-line bg-concrete px-3 text-left text-sm text-steel transition-colors hover:border-ink-soft hover:bg-paper"
    >
      <Search className="size-4" aria-hidden />
      <span className="flex-1 truncate">
        <span className="sm:hidden">Buscar</span>
        <span className="hidden sm:inline">Ir para ou buscar alguém</span>
      </span>
      <kbd className="hidden rounded-sm border border-line bg-paper px-1.5 py-0.5 text-[11px] text-steel sm:inline">{mac ? '⌘' : 'Ctrl'} K</kbd>
    </button>
  )
}

const timeAgo = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.round(hours / 24)
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`
}

/** Sino de notificações: contagem real, atualizada a cada minuto. */
function Notifications() {
  const navigate = useNavigate()
  const bell = useRef<HTMLSpanElement>(null)
  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ items: AppNotification[]; unread: number }>('/notifications'),
    refetchInterval: 60_000,
  })
  const markRead = useMutation({
    mutationFn: (ids?: string[]) => api('/notifications/read', { method: 'POST', body: { ids } }),
    onSuccess: () => query.refetch(),
  })
  const unread = query.data?.unread ?? 0

  // Chegou aviso novo: o sino balança uma vez.
  const seen = useRef(unread)
  useGSAP(
    () => {
      if (unread > seen.current && !reducedMotion())
        gsap.fromTo(
          bell.current,
          { rotate: 0 },
          { keyframes: { rotate: [0, -16, 13, -9, 6, 0] }, duration: 0.8, ease: 'power2.out', transformOrigin: '50% 0%' },
        )
      seen.current = unread
    },
    { dependencies: [unread] },
  )

  const open = (item: AppNotification) => {
    if (!item.readAt) markRead.mutate([item.id])
    if (item.link) void navigate({ to: item.link })
  }
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="relative rounded-sm p-2.5 text-ink-soft transition-colors hover:bg-concrete"
        aria-label={unread ? `Notificações: ${unread} não lidas` : 'Notificações'}
      >
        <span ref={bell} className="block">
          <Bell className="size-5" aria-hidden />
        </span>
        {unread > 0 && (
          <span className="num absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-semibold text-ink ring-2 ring-paper">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="pop z-50 w-[min(400px,calc(100vw-24px))] overflow-hidden rounded-md border border-line bg-paper text-sm shadow-xl"
        >
          <div className="flex items-center justify-between bg-ink px-4 py-3">
            <span className="font-display text-lg font-semibold text-paper">Notificações</span>
            {unread > 0 && (
              <button type="button" onClick={() => markRead.mutate(undefined)} className="text-[13px] text-paper/70 hover:text-brand">
                Marcar todas como lidas
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {(query.data?.items ?? []).length === 0 ? (
              <p className="px-4 py-10 text-center text-steel">Nada por aqui ainda. Avisos de aprovações e documentos aparecem aqui.</p>
            ) : (
              query.data!.items.map(item => (
                <DropdownMenu.Item
                  key={item.id}
                  onSelect={() => open(item)}
                  className="flex cursor-pointer gap-3 border-b border-line px-4 py-3 outline-none last:border-0 data-[highlighted]:bg-concrete"
                >
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', item.readAt ? 'bg-transparent' : 'bg-brand-strong')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-ink', !item.readAt && 'font-medium')}>{item.title}</span>
                    {item.body && <span className="mt-0.5 line-clamp-2 block text-[13px] text-steel">{item.body}</span>}
                    <span className="mt-1 block text-[12px] text-steel-soft">{timeAgo(item.createdAt)}</span>
                  </span>
                </DropdownMenu.Item>
              ))
            )}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function UserMenu() {
  const me = useMe()
  const queryClient = useQueryClient()
  const switchTo = (tenantId: string) => {
    tenantStore.set(tenantId)
    queryClient.clear()
    window.location.assign('/')
  }
  const signOut = async () => {
    await authClient.signOut()
    queryClient.clear()
    window.location.assign('/entrar')
  }
  const item = 'flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 outline-none data-[highlighted]:bg-concrete'
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-2.5 rounded-sm py-1 pr-2 pl-1 transition-colors hover:bg-concrete">
        <span className="flex size-9 items-center justify-center rounded-sm bg-ink font-display text-[16px] font-semibold text-brand">
          {initials(me.user.name)}
        </span>
        <span className="hidden text-left text-sm leading-tight md:block">
          <span className="block max-w-40 truncate font-medium text-ink">{me.user.name}</span>
          <span className="block text-[12.5px] text-steel">{ROLE_LABELS[me.role]}</span>
        </span>
        <ChevronsUpDown className="hidden size-4 text-steel sm:block" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="pop z-50 min-w-64 rounded-md border border-line bg-paper p-1 text-sm shadow-xl">
          <div className="px-3 py-2.5">
            <p className="font-medium text-ink">{me.user.name}</p>
            <p className="text-steel">{me.user.email}</p>
          </div>
          {me.organizations.length > 1 && (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Label className="px-3 py-1 text-[12.5px] text-steel">Trocar de organização</DropdownMenu.Label>
              {me.organizations.map(org => (
                <DropdownMenu.Item
                  key={org.tenantId}
                  disabled={org.tenantId === me.tenant.id}
                  onSelect={() => switchTo(org.tenantId)}
                  className={cn(item, 'data-[disabled]:cursor-default data-[disabled]:font-medium')}
                >
                  {org.tenantName}
                </DropdownMenu.Item>
              ))}
            </>
          )}
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item asChild>
            <Link to="/minha-conta" className={cn(item, 'text-ink-soft')}>
              <UserCog className="size-4" aria-hidden /> Minha conta e segurança
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={signOut} className={cn(item, 'text-danger data-[highlighted]:bg-danger-soft')}>
            <LogOut className="size-4" aria-hidden /> Sair
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/** MFA obrigatório e ainda não ativado: só a tela de conta fica acessível. */
function MfaGate() {
  const me = useMe()
  const navigate = useNavigate()
  const path = useRouterState({ select: state => state.location.pathname })
  useEffect(() => {
    if (me.mfaPending && path !== '/minha-conta') void navigate({ to: '/minha-conta' })
  }, [me.mfaPending, path, navigate])
  if (!me.mfaPending) return null
  return (
    <div role="alert" className="border-b border-ink bg-brand px-4 py-2.5 text-sm font-medium text-ink lg:px-10">
      Sua organização exige verificação em duas etapas para o seu perfil. Ative abaixo para liberar o sistema.
    </div>
  )
}

// ---------- movimento ----------

/**
 * Abertura depois do login: o falcão aparece, e duas lâminas (preta e
 * amarela) sobem revelando o sistema. Toca uma vez por login.
 */
function Curtain() {
  const root = useRef<HTMLDivElement>(null)
  const [show] = useState(() => {
    try {
      const flag = sessionStorage.getItem(INTRO_FLAG)
      sessionStorage.removeItem(INTRO_FLAG)
      return Boolean(flag) && !reducedMotion()
    } catch {
      return false
    }
  })
  const [done, setDone] = useState(!show)
  useGSAP(
    () => {
      if (!show) return
      gsap
        .timeline({ onComplete: () => setDone(true) })
        .from('[data-curtain-mark]', { scale: 0.6, autoAlpha: 0, duration: 0.6, ease: 'back.out(1.6)' })
        .to('[data-curtain-mark]', { autoAlpha: 0, y: -24, duration: 0.4, ease: 'power2.in' }, '+=0.25')
        .to('[data-curtain="ink"]', { yPercent: -100, duration: 0.9, ease: 'expo.inOut' }, '-=0.1')
        .to('[data-curtain="brand"]', { yPercent: -100, duration: 0.9, ease: 'expo.inOut' }, '-=0.78')
    },
    { scope: root },
  )
  if (done) return null
  return (
    <div ref={root} className="pointer-events-none fixed inset-0 z-[100]" aria-hidden>
      <div data-curtain="brand" className="absolute inset-0 bg-brand" />
      <div data-curtain="ink" className="absolute inset-0 flex items-center justify-center bg-ink">
        <img data-curtain-mark src={falcon} alt="" className="h-28 w-auto" />
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [palette, setPalette] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPalette(open => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <Curtain />
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-paper focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>
      <aside className="sticky top-0 hidden h-dvh lg:block">
        <Sidebar />
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="drawer-overlay absolute inset-0 bg-ink/50" data-state="open" onClick={() => setMenuOpen(false)} />
          <div className="relative h-full w-72 shadow-2xl">
            <Sidebar onNavigate={() => setMenuOpen(false)} />
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="absolute top-7 right-3 rounded-sm p-1 text-steel-soft hover:text-paper"
              aria-label="Fechar menu"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur-md lg:px-10">
          <button type="button" onClick={() => setMenuOpen(true)} className="rounded-sm p-1.5 text-ink hover:bg-concrete lg:hidden" aria-label="Abrir menu">
            <Menu className="size-5" />
          </button>
          <PaletteTrigger onOpen={() => setPalette(true)} />
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Notifications />
            <UserMenu />
          </div>
        </header>
        <MfaGate />
        <main id="conteudo" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
      <CommandPalette open={palette} onOpenChange={setPalette} />
    </div>
  )
}
