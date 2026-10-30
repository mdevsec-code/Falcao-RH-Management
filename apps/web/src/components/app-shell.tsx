import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { Bell, BellOff, ChevronRight, ChevronsUpDown, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Search, Sun, UserCog, X } from 'lucide-react'
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'

import { can, ROLE_LABELS } from '@falcao-rh/contracts'

import falcon from '../assets/falcao-mark.svg'
import { api, tenantStore } from '../lib/api'
import { authClient } from '../lib/auth-client'
import { cn } from '../lib/cn'
import { gsap, MOTION, reducedMotion, useGSAP } from '../lib/gsap'
import { useMe } from '../lib/session'
import { toggleTheme, useTheme } from '../lib/theme'
import type { AppNotification } from '../lib/types'
import { INTRO_FLAG } from '../pages/login'
import { CommandPalette } from './command-palette'
import { BackToTop, RevealScope, useIndicator } from './motion'
import { NAV, type NavItem } from './navigation'
import { Avatar } from './ui/layout'

const COLLAPSE_KEY = 'falcao-rh:sidebar'

// ---------- marca e navegação ----------

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link to="/" className={cn('group flex items-center gap-3 pt-7 pb-7', collapsed ? 'justify-center px-0' : 'px-6')} aria-label="Falcão RH, início">
      <span className="relative flex size-10 shrink-0 items-center justify-center">
        <span className="absolute inset-0 rounded-[11px] bg-brand/10 opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-100" />
        <img src={falcon} alt="" className="relative h-9 w-auto transition-transform duration-500 ease-[var(--ease-falcon)] group-hover:-rotate-6 group-hover:scale-105" />
      </span>
      {!collapsed && (
        <span className="leading-none">
          <span className="block font-display text-[26px] font-semibold tracking-[-0.01em] text-snow">
            Falcão <span className="text-brand">RH</span>
          </span>
          <span className="mt-1 block text-[10.5px] font-medium tracking-[0.18em] text-fog/70 uppercase">Gestão de pessoas</span>
        </span>
      )}
    </Link>
  )
}

const usePath = () => useRouterState({ select: state => state.location.pathname })
const isActive = (path: string, item: NavItem) => path === item.to || path.startsWith(`${item.to}/`)

function Navigation({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const me = useMe()
  const path = usePath()
  const ref = useRef<HTMLElement>(null)
  const visible = (item: NavItem) => can(me.role, item.permission) && (!item.needsEmployee || me.employeeId)
  const sections = (['Gestão', 'Pessoal', 'Administração'] as const)
    .map(section => ({ section, items: NAV.filter(item => item.section === section && visible(item)) }))
    .filter(group => group.items.length > 0)
  const active = NAV.find(item => isActive(path, item))?.to
  useIndicator(ref, `${active}-${collapsed}`)

  return (
    <nav ref={ref} aria-label="Principal" className={cn('relative flex flex-col gap-6', collapsed ? 'px-3' : 'px-4')}>
      {/* Pílula ativa: desliza entre os itens (Flip.fit). */}
      <span data-indicator className="pointer-events-none absolute top-0 left-0 rounded-sm" aria-hidden>
        <span className="absolute inset-0 rounded-sm bg-gradient-to-r from-white/[0.09] to-white/[0.04] ring-1 ring-white/[0.07] ring-inset" />
        <span className="absolute inset-y-2.5 -left-px w-[3px] rounded-r-full bg-brand shadow-[0_0_14px_2px_rgb(254_190_2/0.45)]" />
      </span>
      {sections.map(({ section, items }) => (
        <div key={section}>
          {sections.length > 1 &&
            (collapsed ? (
              <span className="mx-auto mb-2 block h-px w-6 bg-night-line" aria-hidden />
            ) : (
              <p className="mb-2 px-3 text-[10.5px] font-medium tracking-[0.16em] text-fog/55 uppercase">{section}</p>
            ))}
          <ul className="flex flex-col gap-0.5">
            {items.map(item => {
              const current = isActive(path, item)
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    data-active={current}
                    aria-current={current ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'group relative flex h-10 items-center gap-3 rounded-sm text-[14.5px] transition-colors duration-200',
                      collapsed ? 'justify-center' : 'px-3',
                      current ? 'text-snow' : 'text-fog hover:text-snow',
                    )}
                  >
                    <item.icon
                      className={cn(
                        'size-[18px] shrink-0 transition-all duration-300',
                        current ? 'text-brand' : 'group-hover:scale-110 group-hover:text-snow',
                      )}
                      aria-hidden
                    />
                    <span className={collapsed ? 'sr-only' : 'truncate'}>{item.label}</span>
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

function Sidebar({ onNavigate, collapsed, onToggle }: { onNavigate?: () => void; collapsed?: boolean; onToggle?: () => void }) {
  const me = useMe()
  return (
    <div className="night-glow grain relative flex h-full flex-col overflow-x-hidden overflow-y-auto border-r border-night-line">
      <div className="blueprint pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_45%)]" aria-hidden />
      <div className="relative flex flex-1 flex-col">
        <Brand collapsed={collapsed} />
        <Navigation onNavigate={onNavigate} collapsed={collapsed} />
        <div className={cn('mt-auto flex flex-col gap-3 p-3', !collapsed && 'p-4')}>
          {onToggle && (
            <button
              type="button"
              onClick={onToggle}
              className={cn(
                'flex h-9 items-center gap-2.5 rounded-sm text-[13px] text-fog transition-colors hover:bg-white/5 hover:text-snow',
                collapsed ? 'justify-center' : 'px-3',
              )}
              aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
              title={collapsed ? 'Expandir menu' : undefined}
            >
              {collapsed ? <PanelLeftOpen className="size-[18px]" aria-hidden /> : <PanelLeftClose className="size-[18px]" aria-hidden />}
              {!collapsed && 'Recolher menu'}
            </button>
          )}
          <div className={cn('flex items-center gap-3 rounded-md border border-night-line bg-white/[0.03]', collapsed ? 'justify-center p-1.5' : 'p-3')}>
            <span className="relative">
              <Avatar name={me.tenant.name} size="sm" className="bg-brand text-night [&>span:first-child]:hidden" />
              <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-ok ring-2 ring-night" aria-hidden />
            </span>
            {!collapsed && (
              <div className="min-w-0 text-[12.5px] leading-[1.35]">
                <p className="truncate font-medium text-snow/90">{me.tenant.name}</p>
                <p className="text-fog/70">{ROLE_LABELS[me.role]}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- barra superior ----------

function Breadcrumb() {
  const path = usePath()
  const item = NAV.find(entry => isActive(path, entry))
  if (!item) return null
  const nested = path !== item.to
  return (
    <nav aria-label="Você está em" className="hidden min-w-0 items-center gap-1.5 text-[13.5px] xl:flex">
      <span className="text-steel">{item.section}</span>
      <ChevronRight className="size-3.5 text-steel-soft" aria-hidden />
      {nested ? (
        <>
          <Link to={item.to} className="text-steel transition-colors hover:text-ink">
            {item.label}
          </Link>
          <ChevronRight className="size-3.5 text-steel-soft" aria-hidden />
          <span className="font-medium text-ink">Ficha</span>
        </>
      ) : (
        <span className="font-medium text-ink">{item.label}</span>
      )}
    </nav>
  )
}

function PaletteTrigger({ onOpen }: { onOpen: () => void }) {
  const mac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-10 min-w-0 max-w-sm flex-1 items-center gap-3 rounded-full border border-line bg-sunken/80 px-4 text-left text-sm text-steel transition-all duration-200 hover:border-line-strong hover:bg-paper hover:shadow-xs xl:ml-6"
    >
      <Search className="size-4 transition-transform duration-300 group-hover:scale-110" aria-hidden />
      <span className="flex-1 truncate">
        <span className="sm:hidden">Buscar</span>
        <span className="hidden sm:inline">Ir para ou buscar alguém…</span>
      </span>
      <kbd className="hidden items-center gap-0.5 rounded-[6px] border border-line bg-paper px-1.5 py-0.5 font-sans text-[11px] text-steel shadow-xs sm:inline-flex">
        {mac ? '⌘' : 'Ctrl'} K
      </kbd>
    </button>
  )
}

const iconButton = 'relative flex size-10 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink'

/** Sol e lua trocam girando; o tema novo se abre em círculo a partir do botão. */
function ThemeToggle() {
  const theme = useTheme()
  const ref = useRef<HTMLButtonElement>(null)
  const { contextSafe } = useGSAP({ scope: ref })
  const onClick = contextSafe((event: MouseEvent) => {
    if (!reducedMotion()) gsap.fromTo('[data-theme-icon]', { rotate: -90, scale: 0.4 }, { rotate: 0, scale: 1, duration: 0.6, ease: 'back.out(2)' })
    toggleTheme({ x: event.clientX, y: event.clientY })
  })
  return (
    <button ref={ref} type="button" onClick={onClick} className={iconButton} aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}>
      <span data-theme-icon className="block">
        {theme === 'dark' ? <Sun className="size-[19px]" aria-hidden /> : <Moon className="size-[19px]" aria-hidden />}
      </span>
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
          { keyframes: { rotate: [0, -18, 14, -10, 6, 0] }, duration: 0.9, ease: 'power2.out', transformOrigin: '50% 0%' },
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
      <DropdownMenu.Trigger className={iconButton} aria-label={unread ? `Notificações: ${unread} não lidas` : 'Notificações'}>
        <span ref={bell} className="block">
          <Bell className="size-[19px]" aria-hidden />
        </span>
        {unread > 0 && (
          <span className="num absolute top-1 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10.5px] font-bold text-night ring-2 ring-paper">
            <span className="absolute inset-0 animate-ping rounded-full bg-brand/50 [animation-iteration-count:2]" aria-hidden />
            <span className="relative">{unread > 9 ? '9+' : unread}</span>
          </span>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          className="pop z-50 w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-lg border border-line bg-paper text-sm shadow-pop"
        >
          <div className="night-glow relative flex items-center justify-between px-5 py-4">
            <div>
              <p className="font-display text-[22px] leading-none font-semibold text-snow">Notificações</p>
              <p className="mt-1 text-[12.5px] text-fog">{unread ? `${unread} não ${unread === 1 ? 'lida' : 'lidas'}` : 'Tudo em dia'}</p>
            </div>
            {unread > 0 && (
              <button type="button" onClick={() => markRead.mutate(undefined)} className="rounded-full border border-night-line px-3 py-1 text-[12.5px] text-fog transition-colors hover:border-brand/50 hover:text-brand">
                Marcar todas como lidas
              </button>
            )}
          </div>
          <div className="max-h-[440px] overflow-y-auto p-1.5">
            {(query.data?.items ?? []).length === 0 ? (
              <div className="flex flex-col items-center px-6 py-12 text-center text-steel">
                <BellOff className="mb-3 size-6 text-steel-soft" aria-hidden />
                Nada por aqui ainda. Avisos de aprovações e documentos aparecem aqui.
              </div>
            ) : (
              query.data!.items.map(item => (
                <DropdownMenu.Item
                  key={item.id}
                  onSelect={() => open(item)}
                  className="flex cursor-pointer gap-3 rounded-md px-3.5 py-3 outline-none transition-colors data-[highlighted]:bg-sunken"
                >
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', item.readAt ? 'bg-line-strong' : 'bg-brand shadow-[0_0_0_4px_rgb(254_190_2/0.18)]')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block', item.readAt ? 'text-ink-soft' : 'font-medium text-ink')}>{item.title}</span>
                    {item.body && <span className="mt-0.5 line-clamp-2 block text-[13px] text-steel">{item.body}</span>}
                    <span className="mt-1 block text-[11.5px] text-steel-soft">{timeAgo(item.createdAt)}</span>
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
  const item = 'flex cursor-pointer items-center gap-2.5 rounded-sm px-3 py-2 outline-none transition-colors data-[highlighted]:bg-sunken'
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-2.5 rounded-full py-1 pr-2.5 pl-1 transition-colors hover:bg-ink/5">
        <Avatar name={me.user.name} size="md" className="rounded-full" />
        <span className="hidden text-left text-sm leading-tight md:block">
          <span className="block max-w-40 truncate font-medium text-ink">{me.user.name}</span>
          <span className="block text-[12px] text-steel">{ROLE_LABELS[me.role]}</span>
        </span>
        <ChevronsUpDown className="hidden size-3.5 text-steel sm:block" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={10} className="pop z-50 min-w-72 rounded-lg border border-line bg-paper p-1.5 text-sm shadow-pop">
          <div className="flex items-center gap-3 px-3 py-3">
            <Avatar name={me.user.name} size="lg" className="rounded-full" />
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{me.user.name}</p>
              <p className="truncate text-[13px] text-steel">{me.user.email}</p>
            </div>
          </div>
          {me.organizations.length > 1 && (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Label className="eyebrow px-3 py-1.5">Trocar de organização</DropdownMenu.Label>
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
  const path = usePath()
  useEffect(() => {
    if (me.mfaPending && path !== '/minha-conta') void navigate({ to: '/minha-conta' })
  }, [me.mfaPending, path, navigate])
  if (!me.mfaPending) return null
  return (
    <div role="alert" className="relative overflow-hidden border-b border-night bg-brand px-4 py-2.5 text-sm font-medium text-night lg:px-10">
      <span className="hazard-stripe absolute inset-y-0 left-0 w-2" aria-hidden />
      Sua organização exige verificação em duas etapas para o seu perfil. Ative abaixo para liberar o sistema.
    </div>
  )
}

// ---------- movimento ----------

/**
 * Abertura depois do login: o falcão aparece, o nome se decifra
 * (ScrambleText), e duas lâminas (preta e amarela) sobem revelando o
 * sistema. Toca uma vez por login.
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
    (_ctx, contextSafe) => {
      if (!show) return
      gsap
        .timeline({ onComplete: contextSafe!(() => setDone(true)) })
        .from('[data-curtain-mark]', { scale: 0.5, rotate: -12, autoAlpha: 0, duration: 0.7, ease: 'back.out(1.7)' })
        .to('[data-curtain-name]', { duration: 0.9, scrambleText: { text: 'FALCÃO RH', chars: 'FALCÃORH01#/', speed: 0.6 } }, '-=0.35')
        .from('[data-curtain-rule]', { scaleX: 0, duration: 0.7, ease: 'expo.out' }, '<0.2')
        .to('[data-curtain-content]', { autoAlpha: 0, y: -28, duration: 0.45, ease: 'falcon-in' }, '+=0.25')
        .to('[data-curtain="ink"]', { yPercent: -100, duration: 1, ease: 'expo.inOut' }, '-=0.1')
        .to('[data-curtain="brand"]', { yPercent: -100, duration: 1, ease: 'expo.inOut' }, '-=0.86')
    },
    { scope: root },
  )
  if (done) return null
  return (
    <div ref={root} className="pointer-events-none fixed inset-0 z-[100]" aria-hidden>
      <div data-curtain="brand" className="absolute inset-0 bg-brand" />
      <div data-curtain="ink" className="night-glow grain absolute inset-0 flex items-center justify-center">
        <div className="blueprint absolute inset-0 opacity-60" />
        <div data-curtain-content className="relative flex flex-col items-center gap-5">
          <img data-curtain-mark src={falcon} alt="" className="h-28 w-auto drop-shadow-[0_0_40px_rgb(254_190_2/0.35)]" />
          <p data-curtain-name className="font-display text-[34px] font-semibold tracking-[0.2em] text-snow">
            &nbsp;
          </p>
          <span data-curtain-rule className="h-px w-40 origin-left bg-brand" />
        </div>
      </div>
    </div>
  )
}

/** Menu do celular: o painel desliza e os itens entram em cascata. */
function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      if (!open) return
      const mm = gsap.matchMedia()
      mm.add(MOTION.ok, () => {
        gsap
          .timeline()
          .from('[data-menu-overlay]', { autoAlpha: 0, duration: 0.3, ease: 'power1.out' })
          .from('[data-menu-panel]', { xPercent: -100, duration: 0.6 }, 0)
          .from('[data-menu-panel] li', { x: -16, autoAlpha: 0, stagger: 0.03, duration: 0.5 }, 0.2)
      })
    },
    { scope: ref, dependencies: [open] },
  )
  if (!open) return null
  return (
    <div ref={ref} className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div data-menu-overlay className="absolute inset-0 bg-night/55 backdrop-blur-[2px]" onClick={onClose} />
      <div data-menu-panel className="relative h-full w-[min(300px,85vw)] shadow-pop">
        <Sidebar onNavigate={onClose} />
        <button type="button" onClick={onClose} className="absolute top-8 right-3 rounded-full p-1.5 text-fog hover:bg-white/10 hover:text-snow" aria-label="Fechar menu">
          <X className="size-5" />
        </button>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePath()
  const [menuOpen, setMenuOpen] = useState(false)
  const [palette, setPalette] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })
  const toggleCollapsed = () =>
    setCollapsed(value => {
      try {
        localStorage.setItem(COLLAPSE_KEY, value ? '0' : '1')
      } catch {
        // Sem armazenamento: vale só nesta sessão.
      }
      return !value
    })

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
    <div
      className={cn(
        'min-h-dvh transition-[grid-template-columns] duration-500 ease-[var(--ease-falcon)] lg:grid',
        collapsed ? 'lg:grid-cols-[76px_1fr]' : 'lg:grid-cols-[272px_1fr]',
      )}
    >
      <Curtain />
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-paper focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>
      <aside className="sticky top-0 hidden h-dvh lg:block">
        <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      </aside>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="relative flex min-w-0 flex-col">
        <div className="canvas-grid pointer-events-none absolute inset-x-0 top-0 h-[520px]" aria-hidden />
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line/80 bg-concrete/75 px-4 backdrop-blur-xl backdrop-saturate-150 lg:px-10">
          <button type="button" onClick={() => setMenuOpen(true)} className={cn(iconButton, '-ml-2 lg:hidden')} aria-label="Abrir menu">
            <Menu className="size-5" />
          </button>
          <Breadcrumb />
          <PaletteTrigger onOpen={() => setPalette(true)} />
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            <ThemeToggle />
            <Notifications />
            <span className="mx-2 hidden h-6 w-px bg-line sm:block" aria-hidden />
            <UserMenu />
          </div>
        </header>
        <MfaGate />
        <main id="conteudo" className="relative mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-11">
          <RevealScope routeKey={path}>{children}</RevealScope>
        </main>
        <footer className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 pb-8 text-[12px] text-steel-soft sm:px-6 lg:px-10">
          <span>Falcão RH · Falcão Construções e Engenharia</span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-ok" aria-hidden /> Dados protegidos pela LGPD
          </span>
        </footer>
      </div>
      <BackToTop />
      <CommandPalette open={palette} onOpenChange={setPalette} />
    </div>
  )
}
