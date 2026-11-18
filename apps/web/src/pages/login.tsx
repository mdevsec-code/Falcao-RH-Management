import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowBigUp, Bus, Eye, EyeOff, FileCheck2, Lock, Mail, Moon, Palmtree, ShieldCheck, Sun, UserCheck, Wallet } from 'lucide-react'
import { useEffect, useState, type FormEvent, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react'

import falcon from '../assets/falcao-mark.svg'
import { Magnetic } from '../components/motion'
import { Button } from '../components/ui/button'
import { Field, Input } from '../components/ui/field'
import { authClient } from '../lib/auth-client'
import { cn } from '../lib/cn'
import { toggleTheme, useTheme } from '../lib/theme'
import { reducedMotion } from '../lib/gsap'

type Step = 'password' | 'totp' | 'forgot' | 'forgot-sent'

/** Sinaliza para o sistema tocar a abertura depois do login. */
export const INTRO_FLAG = 'falcao-rh:intro'

const ease = [0.16, 1, 0.3, 1] as const

/** Prévia do produto: o tipo de aviso que o RH recebe no dia a dia. Ilustrativa, sem dados de pessoas. */
const FEED = [
  { icon: FileCheck2, tone: 'bg-ok-soft text-ok', title: 'Admissão digital recebida', detail: 'Dados e 9 documentos enviados pelo celular' },
  { icon: Wallet, tone: 'bg-brand-soft text-brand-ink', title: 'Apuração de VA/VR fechada', detail: 'Planilha pronta para a operadora do cartão' },
  { icon: UserCheck, tone: 'bg-info-soft text-info', title: 'Candidato aprovado pelos supervisores', detail: 'Seguiu para a tratativa interna do RH' },
  { icon: Palmtree, tone: 'bg-ok-soft text-ok', title: 'Férias aprovadas', detail: '20 dias, conferidos pelas regras da CLT' },
  { icon: Bus, tone: 'bg-sunken text-ink', title: 'Rota do fretado atualizada', detail: 'Novo ponto de embarque cadastrado' },
] as const
const AGO = ['agora', 'há 2 min', 'há 9 min']

const greeting = () => {
  const hour = new Date().getHours()
  return hour >= 5 && hour < 12 ? 'Bom dia.' : hour >= 12 && hour < 18 ? 'Boa tarde.' : 'Boa noite.'
}

/** Feed vivo: um aviso novo chega a cada poucos segundos. Parado para quem prefere menos movimento. */
function ProductPreview() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (reducedMotion()) return
    const timer = window.setInterval(() => setTick(t => t + 1), 3800)
    return () => window.clearInterval(timer)
  }, [])
  const items = [0, 1, 2].map(i => ({ ...FEED[(tick + FEED.length - i) % FEED.length]!, key: tick - i }))

  return (
    <div className="w-full max-w-[30rem]">
      <p className="font-serif text-[clamp(30px,2.8vw,42px)] leading-[1.12] tracking-[-0.015em] text-ink">
        Do currículo à apuração dos benefícios, a vida de cada colaborador da Falcão num só lugar.
      </p>
      <p className="mt-10 mb-3 flex items-center gap-2 text-[13px] text-steel">
        <span className="relative flex size-2" aria-hidden>
          <span className="absolute inset-0 animate-ping rounded-full bg-ok/60" />
          <span className="relative size-2 rounded-full bg-ok" />
        </span>
        Acontecendo agora no portal
      </p>
      <ul className="relative flex flex-col gap-3" aria-hidden>
        <AnimatePresence initial={false} mode="popLayout">
          {items.map(({ icon: Icon, tone, title, detail, key }, i) => (
            <motion.li
              key={key}
              layout
              initial={{ opacity: 0, y: -24, scale: 0.96 }}
              animate={{ opacity: 1 - i * 0.22, y: 0, scale: 1 - i * 0.02 }}
              exit={{ opacity: 0, y: 16, scale: 0.94 }}
              transition={{ duration: 0.6, ease }}
              className="flex items-start gap-3.5 rounded-xl border border-line bg-paper p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_32px_-16px_rgb(0_0_0/0.18)]"
            >
              <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', tone)}>
                <Icon className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-ink">{title}</span>
                <span className="block text-[13px] text-steel">{detail}</span>
              </span>
              <span className="text-[12px] whitespace-nowrap text-steel-soft">{AGO[i]}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  )
}

function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-lg bg-night">
        <img src={falcon} alt="" className="h-6 w-auto" draggable={false} />
      </span>
      <span className="text-[17px] font-semibold tracking-[-0.01em] text-ink">Falcão RH</span>
    </span>
  )
}

function AuthThemeToggle() {
  const theme = useTheme()
  return (
    <button
      type="button"
      onClick={event => toggleTheme({ x: event.clientX, y: event.clientY })}
      className="flex size-9 items-center justify-center rounded-full text-steel transition-colors hover:bg-sunken hover:text-ink"
      aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
    >
      {theme === 'dark' ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
    </button>
  )
}

/** Campo com ícone à esquerda e, para senha, o botão de mostrar/ocultar. */
function IconInput({ icon: Icon, type, ...props }: InputHTMLAttributes<HTMLInputElement> & { icon: typeof Mail }) {
  const [visible, setVisible] = useState(false)
  const [caps, setCaps] = useState(false)
  const secret = type === 'password'
  const checkCaps = (event: KeyboardEvent<HTMLInputElement>) => secret && setCaps(event.getModifierState('CapsLock'))
  return (
    <span className="relative block">
      <Icon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-steel-soft" aria-hidden />
      <Input {...props} onKeyDown={checkCaps} onKeyUp={checkCaps} onBlur={() => setCaps(false)} type={secret && visible ? 'text' : type} className={cn('h-11 rounded-lg pl-10', secret && 'pr-11')} />
      {secret && (
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-steel transition-colors hover:bg-sunken hover:text-ink"
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      )}
      {caps && (
        <span role="status" className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-brand-ink">
          <ArrowBigUp className="size-3.5" aria-hidden /> Caps Lock ligado
        </span>
      )}
    </span>
  )
}

/** Moldura das telas de acesso: formulário à esquerda; no desktop, a prévia do produto à direita. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-paper lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <main className="flex flex-col px-6 py-6 sm:px-12 lg:px-16">
        <header className="flex items-center justify-between">
          <Wordmark />
          <AuthThemeToggle />
        </header>
        <div className="flex flex-1 items-center py-12">
          <div className="w-full max-w-[380px]">{children}</div>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[12.5px] text-steel">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-ok" aria-hidden /> Conexão segura, dados protegidos pela LGPD
          </span>
          <span>Falcão Construções e Engenharia</span>
        </footer>
      </main>
      <aside className="m-3 hidden items-center justify-center overflow-hidden rounded-2xl bg-[#eef0f3] px-12 lg:flex dark:bg-night-2">
        <ProductPreview />
      </aside>
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
    <div className="mb-8">
      <h1 className="font-serif text-[40px] leading-[1.05] font-normal tracking-[-0.02em] text-ink">{title}</h1>
      {children && <p className="mt-3 text-[15px] text-steel">{children}</p>}
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
              <StepTitle title={greeting()}>Entre no Portal do RH com os dados do seu convite.</StepTitle>
              <Field label="E-mail">
                {props => <IconInput {...props} icon={Mail} type="email" autoComplete="username" placeholder="voce@empresa.com.br" aria-invalid={error ? true : undefined} value={email} onChange={e => setEmail(e.target.value)} required autoFocus />}
              </Field>
              <Field label="Senha">
                {props => <IconInput {...props} icon={Lock} type="password" autoComplete="current-password" placeholder="Sua senha" aria-invalid={error ? true : undefined} value={password} onChange={e => setPassword(e.target.value)} required />}
              </Field>
              <FormError error={error} attempt={attempt} />
              <Magnetic strength={0.12} className="flex w-full">
                <Button type="submit" variant="primary" loading={busy} size="lg" className="mt-2 w-full rounded-lg border-ink bg-ink text-paper shadow-none hover:bg-ink/90">
                  Entrar
                </Button>
              </Magnetic>
              <button type="button" onClick={() => go('forgot')} className="self-center text-sm font-medium text-steel hover:text-ink">
                Esqueci minha senha
              </button>
              <p className="mt-4 border-t border-line pt-5 text-[13px] leading-relaxed text-steel">
                <span className="font-medium text-ink">Primeiro acesso?</span> Abra o link do convite que chegou no seu e-mail para criar a senha.
              </p>
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
