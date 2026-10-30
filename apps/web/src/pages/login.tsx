import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'

import falcon from '../assets/falcao-mark.svg'
import { Magnetic } from '../components/motion'
import { Button } from '../components/ui/button'
import { Field, Input } from '../components/ui/field'
import { authClient } from '../lib/auth-client'
import { canHover, gsap, reducedMotion, SplitText, useGSAP } from '../lib/gsap'

type Step = 'password' | 'totp' | 'forgot' | 'forgot-sent'

const CAPABILITIES = ['Férias calculadas pelas regras da CLT', 'Documentos com validade e versões', 'Aprovações do canteiro ao RH']

/** Sinaliza para o sistema tocar a abertura depois do login. */
export const INTRO_FLAG = 'falcao-rh:intro'

const ease = [0.16, 1, 0.3, 1] as const

/**
 * Painel da marca: uma linha do tempo única (máscara do falcão, título
 * montado por caractere, capacidades, linha de prumo) e um holofote que
 * acompanha o mouse sobre a grade técnica.
 */
function BrandPanel() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    (_ctx, contextSafe) => {
      if (reducedMotion()) return
      const split = SplitText.create('[data-headline]', { type: 'lines,chars', mask: 'lines', aria: 'auto' })
      const tl = gsap.timeline({ defaults: { ease: 'falcon' } })
      tl.from('[data-falcon]', { clipPath: 'inset(100% 0% 0% 0%)', duration: 1.6, ease: 'expo.inOut' })
        .from('[data-falcon] img', { scale: 1.18, yPercent: 6, duration: 2.2 }, '<')
        .from('[data-brand]', { y: -16, autoAlpha: 0, duration: 0.8 }, 0.3)
        .from(split.chars, { yPercent: 115, duration: 1, stagger: 0.016 }, 0.55)
        .from('[data-capability]', { y: 18, autoAlpha: 0, stagger: 0.08, duration: 0.8 }, '-=0.55')
        .from('[data-rule]', { scaleX: 0, transformOrigin: 'left', duration: 1.2, ease: 'expo.out' }, '-=0.6')

      // Holofote e profundidade: só com mouse.
      if (!canHover()) return () => split.revert()
      const el = root.current!
      const spotX = gsap.quickTo(el, '--spot-x', { duration: 0.6, ease: 'power3.out' })
      const spotY = gsap.quickTo(el, '--spot-y', { duration: 0.6, ease: 'power3.out' })
      const art = gsap.quickTo('[data-falcon]', 'x', { duration: 1.2, ease: 'power3.out' })
      const artY = gsap.quickTo('[data-falcon]', 'y', { duration: 1.2, ease: 'power3.out' })
      const move = contextSafe!((event: PointerEvent) => {
        const box = el.getBoundingClientRect()
        const px = event.clientX - box.left
        const py = event.clientY - box.top
        spotX(px)
        spotY(py)
        art((px / box.width - 0.5) * -26)
        artY((py / box.height - 0.5) * -18)
      })
      el.addEventListener('pointermove', move)
      return () => {
        el.removeEventListener('pointermove', move)
        split.revert()
      }
    },
    { scope: root },
  )

  return (
    <aside
      ref={root}
      style={{ ['--spot-x' as string]: '70%', ['--spot-y' as string]: '40%' }}
      className="relative hidden overflow-hidden bg-ink lg:flex lg:flex-col lg:justify-between lg:p-14"
    >
      {/* Grade técnica revelada pelo holofote. */}
      <div className="blueprint pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div
        className="blueprint-bright pointer-events-none absolute inset-0"
        style={{ maskImage: 'radial-gradient(260px circle at var(--spot-x) var(--spot-y), black, transparent 70%)' }}
        aria-hidden
      />

      <div data-falcon className="pointer-events-none absolute -right-[22%] -bottom-[4%] h-[104%] will-change-transform">
        <img src={falcon} alt="" className="h-full w-auto max-w-none select-none" draggable={false} />
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[58%] bg-gradient-to-r from-ink from-60% to-transparent" aria-hidden />

      <div data-brand className="relative">
        <p className="font-display text-[28px] leading-none font-semibold text-paper">
          Falcão <span className="text-brand">RH</span>
        </p>
        <p className="mt-1.5 text-[13px] text-steel-soft">Falcão Construções e Engenharia</p>
      </div>

      <div className="relative max-w-[30rem]">
        <h2 data-headline className="font-display text-[clamp(52px,5.4vw,84px)] leading-[0.92] font-semibold tracking-[-0.01em] text-paper">
          Gente, obra e escritório no mesmo cadastro.
        </h2>
        <ul className="mt-10 grid gap-3">
          {CAPABILITIES.map(text => (
            <li data-capability key={text} className="flex items-center gap-4 text-[15px] text-paper/85">
              <span className="size-1.5 shrink-0 bg-brand" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
        <div data-rule className="mt-10 h-px w-full bg-paper/25" aria-hidden />
      </div>
    </aside>
  )
}

export function AuthFrame({ children }: { children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      if (reducedMotion()) return
      gsap.from(panel.current!, { y: 24, autoAlpha: 0, duration: 1, delay: 0.35 })
    },
    { scope: panel },
  )
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <BrandPanel />
      <main className="relative flex items-center justify-center bg-concrete px-5 py-12">
        <div ref={panel} className="w-full max-w-sm">
          <div className="mb-12 flex items-center gap-3 lg:hidden">
            <img src={falcon} alt="" className="h-12 w-auto" />
            <span className="font-display text-[30px] leading-none font-semibold text-ink">
              Falcão <span className="bg-brand px-1">RH</span>
            </span>
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}

/** Troca de etapa: a nova entra pela direita, a anterior sai pela esquerda. */
function StepPanel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.32, ease }}
    >
      {children}
    </motion.div>
  )
}

function StepTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-[48px] leading-[0.95] font-semibold text-ink">{title}</h1>
      {children && <p className="mt-2.5 text-steel">{children}</p>}
    </div>
  )
}

/** Erro com tremor curto: chama atenção sem assustar. */
function FormError({ error, attempt }: { error: string | null; attempt: number }) {
  return (
    <AnimatePresence initial={false}>
      {error && (
        <motion.p
          key={attempt}
          role="alert"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto', x: [0, -7, 6, -4, 3, 0] }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.42 }}
          className="overflow-hidden text-sm text-danger"
        >
          {error}
        </motion.p>
      )}
    </AnimatePresence>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)

  const fail = (message: string) => {
    setError(message)
    setAttempt(n => n + 1)
  }

  const enter = async () => {
    try {
      sessionStorage.setItem(INTRO_FLAG, '1')
    } catch {
      // Sem armazenamento de sessão: só não toca a abertura.
    }
    queryClient.clear()
    await navigate({ to: '/' })
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const go = (next: Step) => {
    setError(null)
    setStep(next)
  }

  const signIn = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const { data, error } = await authClient.signIn.email({ email, password })
      if (error)
        return fail(error.status === 429 ? 'Muitas tentativas. Aguarde um minuto e tente de novo.' : 'E-mail ou senha incorretos.')
      if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) return go('totp')
      await enter()
    })
  }

  const verify = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const { error } = await authClient.twoFactor.verifyTotp({ code })
      if (error) return fail('Código inválido ou expirado. Confira o relógio do celular e tente o próximo código.')
      await enter()
    })
  }

  const forgot = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/definir-senha` })
      // Mesma resposta exista ou não a conta: não revela quem está cadastrado.
      go('forgot-sent')
    })
  }

  return (
    <AuthFrame>
      <AnimatePresence mode="wait" initial={false}>
        {step === 'password' && (
          <StepPanel id="password">
            <form onSubmit={signIn} className="flex flex-col gap-4" noValidate>
              <StepTitle title="Entrar">Use o e-mail do convite que você recebeu.</StepTitle>
              <Field label="E-mail">
                {props => <Input {...props} type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />}
              </Field>
              <Field label="Senha">
                {props => <Input {...props} type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />}
              </Field>
              <FormError error={error} attempt={attempt} />
              <Magnetic strength={0.12} className="flex w-full">
                <Button type="submit" variant="primary" loading={busy} disabled={!email || !password} className="mt-1 h-12 w-full text-base">
                  Entrar
                </Button>
              </Magnetic>
              <button type="button" onClick={() => go('forgot')} className="self-start text-sm text-steel underline underline-offset-2 hover:text-ink">
                Esqueci minha senha
              </button>
            </form>
          </StepPanel>
        )}

        {step === 'totp' && (
          <StepPanel id="totp">
            <form onSubmit={verify} className="flex flex-col gap-4">
              <StepTitle title="Verificação em duas etapas">Digite o código de 6 dígitos do seu aplicativo autenticador.</StepTitle>
              <Field label="Código">
                {props => (
                  <Input {...props} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} className="num h-14 text-center font-display text-3xl tracking-[0.4em]" autoFocus />
                )}
              </Field>
              <FormError error={error} attempt={attempt} />
              <Button type="submit" variant="primary" loading={busy} disabled={code.length !== 6} className="h-11">
                Verificar
              </Button>
            </form>
          </StepPanel>
        )}

        {step === 'forgot' && (
          <StepPanel id="forgot">
            <form onSubmit={forgot} className="flex flex-col gap-4">
              <StepTitle title="Redefinir senha">Enviaremos um link para você criar uma nova senha.</StepTitle>
              <Field label="E-mail">
                {props => <Input {...props} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />}
              </Field>
              <Button type="submit" variant="primary" loading={busy} disabled={!email} className="h-11">
                Enviar link
              </Button>
              <button type="button" onClick={() => go('password')} className="self-start text-sm text-steel underline underline-offset-2 hover:text-ink">
                Voltar para o login
              </button>
            </form>
          </StepPanel>
        )}

        {step === 'forgot-sent' && (
          <StepPanel id="forgot-sent">
            <div className="flex flex-col gap-4">
              <StepTitle title="Confira seu e-mail">Se houver uma conta para {email}, você vai receber um link válido por 24 horas.</StepTitle>
              <Button onClick={() => go('password')}>Voltar para o login</Button>
            </div>
          </StepPanel>
        )}
      </AnimatePresence>
    </AuthFrame>
  )
}
