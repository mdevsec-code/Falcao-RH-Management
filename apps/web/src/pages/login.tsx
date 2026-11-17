import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Eye, EyeOff, Lock, Mail, Moon, ShieldCheck, Sun } from 'lucide-react'
import { useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'

import falcon from '../assets/falcao-mark.svg'
import { Magnetic } from '../components/motion'
import { Button } from '../components/ui/button'
import { Field, Input } from '../components/ui/field'
import { authClient } from '../lib/auth-client'
import { cn } from '../lib/cn'
import { toggleTheme, useTheme } from '../lib/theme'
import { gsap, reducedMotion, useGSAP } from '../lib/gsap'

type Step = 'password' | 'totp' | 'forgot' | 'forgot-sent'

/** Sinaliza para o sistema tocar a abertura depois do login. */
export const INTRO_FLAG = 'falcao-rh:intro'

const ease = [0.16, 1, 0.3, 1] as const

/** O que o portal cobre, escrito como as frentes de serviço de uma placa de obra. */
const FRENTES = 'Recrutamento e seleção, admissão digital, benefícios VA/VR, mobilidade, férias e documentos'

function SignRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('border-t-2 border-night px-6 py-3.5', className)}>
      <dt className="text-[12px] font-semibold text-night/70">{label}</dt>
      <dd className="mt-0.5 text-[17px] leading-snug font-semibold text-night">{children}</dd>
    </div>
  )
}

/**
 * A placa de obra, que todo canteiro tem na entrada: identifica a obra, as
 * frentes de serviço e o responsável. Aqui ela apresenta o portal. Um único
 * movimento: a placa é içada e assenta nos postes.
 */
function SitePlaque() {
  const root = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      if (reducedMotion()) return
      gsap
        .timeline({ defaults: { ease: 'expo.out' } })
        .from('[data-post]', { scaleY: 0, transformOrigin: 'bottom', duration: 0.9, stagger: 0.08 })
        .from('[data-plaque]', { yPercent: -18, rotate: -2.5, autoAlpha: 0, duration: 1.1, ease: 'back.out(1.6)' }, '-=0.45')
    },
    { scope: root },
  )
  return (
    <div ref={root} className="relative flex w-full max-w-[34rem] flex-1 flex-col">
      <dl data-plaque className="relative z-10 border-[3px] border-night bg-brand shadow-[0_24px_48px_-24px_rgb(0_0_0/0.45)]">
        <div className="flex items-center gap-4 px-6 py-5">
          <span className="flex size-16 shrink-0 items-center justify-center bg-night">
            <img src={falcon} alt="" className="h-12 w-auto" draggable={false} />
          </span>
          <span>
            <span className="block font-display text-[clamp(40px,3.6vw,56px)] leading-[0.9] font-semibold text-night">Falcão RH</span>
            <span className="mt-1 block text-[14px] font-medium text-night/80">Falcão Construções e Engenharia</span>
          </span>
        </div>
        <SignRow label="Obra">Portal do RH</SignRow>
        <SignRow label="Frentes de serviço">{FRENTES}</SignRow>
        <div className="grid grid-cols-2">
          <SignRow label="Responsável">Recursos Humanos</SignRow>
          <SignRow label="Acesso" className="border-l-2">
            Só com convite
          </SignRow>
        </div>
      </dl>
      {/* Postes de sustentação até o chão. */}
      <div className="flex flex-1 justify-between px-[16%]" aria-hidden>
        <span data-post className="w-3 bg-[linear-gradient(90deg,#6b6e73,#b9bcc0_45%,#6b6e73)]" />
        <span data-post className="w-3 bg-[linear-gradient(90deg,#6b6e73,#b9bcc0_45%,#6b6e73)]" />
      </div>
      <span className="block h-[3px] w-full bg-night/80 dark:bg-snow/30" aria-hidden />
    </div>
  )
}

function AuthThemeToggle() {
  const theme = useTheme()
  return (
    <button
      type="button"
      onClick={event => toggleTheme({ x: event.clientX, y: event.clientY })}
      className="absolute top-5 right-5 z-10 flex size-10 items-center justify-center rounded-full border border-line bg-paper text-ink-soft transition-colors hover:text-ink"
      aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
    >
      {theme === 'dark' ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
    </button>
  )
}

/** Campo com ícone à esquerda e, para senha, o botão de mostrar/ocultar. */
function IconInput({ icon: Icon, type, ...props }: InputHTMLAttributes<HTMLInputElement> & { icon: typeof Mail }) {
  const [visible, setVisible] = useState(false)
  const secret = type === 'password'
  return (
    <span className="relative block">
      <Icon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-steel" aria-hidden />
      <Input {...props} type={secret && visible ? 'text' : type} className={cn('h-12 pl-10', secret && 'pr-11')} />
      {secret && (
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-steel transition-colors hover:bg-ink/5 hover:text-ink"
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      )}
    </span>
  )
}

/** Moldura das telas de acesso: a placa à esquerda (no celular, uma faixa no topo), o formulário à direita. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-paper lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
      <aside className="relative hidden flex-col items-center overflow-hidden bg-concrete px-14 pt-[16vh] lg:flex">
        <SitePlaque />
      </aside>
      <main className="relative flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-16">
        <AuthThemeToggle />
        {/* No celular, a placa vira uma faixa: mesma identidade, sem ocupar a tela. */}
        <div className="mb-10 flex items-center gap-3 self-start border-[3px] border-night bg-brand py-2 pr-4 pl-2 lg:hidden">
          <span className="flex size-10 items-center justify-center bg-night">
            <img src={falcon} alt="" className="h-7 w-auto" />
          </span>
          <span className="font-display text-[26px] leading-none font-semibold text-night">Falcão RH</span>
        </div>
        <div className="w-full max-w-[400px]">{children}</div>
        <p className="mt-10 flex items-start gap-2 text-[13px] text-steel">
          <ShieldCheck className="mt-px size-4 shrink-0 text-ok" aria-hidden /> Conexão segura. Seus dados são protegidos pela LGPD.
        </p>
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
      <h1 className="font-display text-[44px] leading-[0.95] font-semibold tracking-[-0.01em] text-ink">{title}</h1>
      {children && <p className="mt-2.5 text-[14.5px] text-steel">{children}</p>}
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
    if (!email.trim() || !password) return fail('Informe o e-mail e a senha.')
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
              <StepTitle title="Entrar">Use o e-mail e a senha do convite que você recebeu do RH.</StepTitle>
              <Field label="E-mail">
                {props => <IconInput {...props} icon={Mail} type="email" autoComplete="username" placeholder="voce@empresa.com.br" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />}
              </Field>
              <Field label="Senha">
                {props => <IconInput {...props} icon={Lock} type="password" autoComplete="current-password" placeholder="Sua senha" value={password} onChange={e => setPassword(e.target.value)} required />}
              </Field>
              <FormError error={error} attempt={attempt} />
              <Magnetic strength={0.12} className="flex w-full">
                <Button type="submit" variant="primary" loading={busy} size="lg" className="mt-1 w-full">
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
              <Button type="submit" variant="primary" size="lg" loading={busy} disabled={code.length !== 6}>
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
                {props => <IconInput {...props} icon={Mail} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />}
              </Field>
              <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!email}>
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
