import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Laptop, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { Button } from '../components/ui/button'
import { Field, Input } from '../components/ui/field'
import { Badge, PageHeader, Panel, Skeleton } from '../components/ui/layout'
import { authClient } from '../lib/auth-client'
import { meQuery } from '../lib/queries'
import { useMe } from '../lib/session'

/** O Better Auth devolve `{ data, error }`; aqui erro vira exceção com mensagem em português. */
const unwrap = async <T,>(promise: Promise<{ data: T | null; error: { status?: number; message?: string } | null }>, fallback: string) => {
  const { data, error } = await promise
  if (error) throw new Error(error.status === 400 || error.status === 401 ? fallback : (error.message ?? fallback))
  return data as T
}

export function AccountPage() {
  return (
    <>
      <PageHeader title="Minha conta" description="Senha, verificação em duas etapas e os aparelhos conectados à sua conta." />
      <div className="grid gap-5 xl:grid-cols-2">
        <TwoFactorPanel />
        <PasswordPanel />
        <SessionsPanel />
      </div>
    </>
  )
}

function TwoFactorPanel() {
  const me = useMe()
  const queryClient = useQueryClient()
  const session = authClient.useSession()
  const enabled = Boolean((session.data?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled)
  const [password, setPassword] = useState('')
  const [setup, setSetup] = useState<{ uri: string; backupCodes: string[]; qr: string } | null>(null)
  const [code, setCode] = useState('')
  const [disabling, setDisabling] = useState(false)

  const start = useMutation({
    mutationFn: async () => {
      const data = await unwrap(authClient.twoFactor.enable({ password }), 'Senha incorreta.')
      if (data.method !== 'totp') throw new Error('O servidor não devolveu a configuração do aplicativo autenticador.')
      return { uri: data.totpURI, backupCodes: data.backupCodes, qr: await QRCode.toDataURL(data.totpURI, { margin: 1, width: 200 }) }
    },
    onSuccess: data => {
      setSetup(data)
      setPassword('')
    },
    onError: error => toast.error(error.message),
  })

  const confirm = useMutation({
    mutationFn: () => unwrap(authClient.twoFactor.verifyTotp({ code }), 'Código inválido. Use o código atual do aplicativo.'),
    onSuccess: async () => {
      toast.success('Verificação em duas etapas ativada.')
      setSetup(null)
      setCode('')
      await session.refetch()
      await queryClient.invalidateQueries({ queryKey: meQuery.queryKey })
    },
    onError: error => toast.error(error.message),
  })

  const disable = useMutation({
    mutationFn: () => unwrap(authClient.twoFactor.disable({ password }), 'Senha incorreta.'),
    onSuccess: async () => {
      toast.success('Verificação em duas etapas desativada.')
      setDisabling(false)
      setPassword('')
      await session.refetch()
      await queryClient.invalidateQueries({ queryKey: meQuery.queryKey })
    },
    onError: error => toast.error(error.message),
  })

  const submitStart = (event: FormEvent) => {
    event.preventDefault()
    start.mutate()
  }

  if (session.isPending) return <Skeleton className="h-64" />

  return (
    <Panel
      title="Verificação em duas etapas"
      aside={enabled ? <Badge tone="ok">Ativa</Badge> : <Badge tone={me.mfaPending ? 'danger' : 'neutral'}>{me.mfaPending ? 'Obrigatória' : 'Desativada'}</Badge>}
      className={me.mfaPending ? 'border-ink' : undefined}
    >
      {enabled && !disabling && (
        <div className="flex flex-col gap-4">
          <p className="flex items-start gap-3 text-sm text-ink-soft">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
            Ao entrar, além da senha, o sistema pede o código do seu aplicativo autenticador.
          </p>
          {!me.mfaPending && (
            <Button variant="danger" className="self-start" onClick={() => setDisabling(true)}>
              <ShieldOff className="size-4" aria-hidden /> Desativar
            </Button>
          )}
        </div>
      )}

      {enabled && disabling && (
        <form
          onSubmit={event => {
            event.preventDefault()
            disable.mutate()
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Confirme sua senha">{p => <Input {...p} type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus />}</Field>
          <div className="flex gap-2">
            <Button onClick={() => setDisabling(false)}>Cancelar</Button>
            <Button type="submit" variant="danger" loading={disable.isPending} disabled={!password}>Desativar verificação</Button>
          </div>
        </form>
      )}

      {!enabled && !setup && (
        <form onSubmit={submitStart} className="flex flex-col gap-4">
          <p className="text-sm text-ink-soft">
            Proteja sua conta com um código que muda a cada 30 segundos, gerado por um aplicativo como Google Authenticator,
            Microsoft Authenticator ou 1Password.
          </p>
          <Field label="Confirme sua senha para começar">
            {p => <Input {...p} type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />}
          </Field>
          <Button type="submit" variant="primary" className="self-start" loading={start.isPending} disabled={!password}>
            Ativar verificação em duas etapas
          </Button>
        </form>
      )}

      {!enabled && setup && (
        <div className="flex flex-col gap-5">
          <ol className="flex flex-col gap-4 text-sm text-ink-soft">
            <li>
              <p className="mb-2 font-medium text-ink">1. Escaneie o código com o aplicativo autenticador</p>
              <div className="flex flex-wrap items-start gap-4">
                <img src={setup.qr} alt="QR code para configurar o aplicativo autenticador" className="size-[200px] rounded-sm border border-line" />
                <details className="max-w-xs text-[13px] text-steel">
                  <summary className="cursor-pointer">Não consegue escanear?</summary>
                  <p className="mt-2">Digite esta chave no aplicativo:</p>
                  <code className="mt-1 block break-all rounded-sm bg-concrete px-2 py-1 text-ink">
                    {new URL(setup.uri).searchParams.get('secret')}
                  </code>
                </details>
              </div>
            </li>
            <li>
              <p className="mb-2 font-medium text-ink">2. Guarde os códigos de recuperação</p>
              <p className="mb-2 text-[13px] text-steel">Cada um vale uma vez, se você perder o celular. Guarde num lugar seguro.</p>
              <ul className="num grid grid-cols-2 gap-1 rounded-sm bg-concrete p-3 font-mono text-[13px] text-ink sm:grid-cols-3">
                {setup.backupCodes.map(c => <li key={c}>{c}</li>)}
              </ul>
            </li>
          </ol>
          <form
            onSubmit={event => {
              event.preventDefault()
              confirm.mutate()
            }}
            className="flex flex-col gap-3"
          >
            <Field label="3. Digite o código que aparece no aplicativo">
              {p => (
                <Input {...p} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} className="num max-w-40 font-display text-2xl tracking-[0.3em]" />
              )}
            </Field>
            <Button type="submit" variant="primary" className="self-start" loading={confirm.isPending} disabled={code.length !== 6}>
              Confirmar e ativar
            </Button>
          </form>
        </div>
      )}
    </Panel>
  )
}

function PasswordPanel() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const change = useMutation({
    mutationFn: () =>
      unwrap(authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true }), 'Senha atual incorreta.'),
    onSuccess: () => {
      toast.success('Senha alterada. Os outros aparelhos foram desconectados.')
      setCurrent('')
      setNext('')
      setConfirm('')
    },
    onError: error => toast.error(error.message),
  })
  const valid = current && next.length >= 10 && next === confirm
  return (
    <Panel title="Trocar senha">
      <form
        onSubmit={event => {
          event.preventDefault()
          if (valid) change.mutate()
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Senha atual">{p => <Input {...p} type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} />}</Field>
        <Field label="Nova senha" hint="Pelo menos 10 caracteres." error={next && next.length < 10 ? 'Use pelo menos 10 caracteres.' : undefined}>
          {p => <Input {...p} type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} />}
        </Field>
        <Field label="Repita a nova senha" error={confirm && confirm !== next ? 'As senhas não são iguais.' : undefined}>
          {p => <Input {...p} type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" className="self-start" loading={change.isPending} disabled={!valid}>
          Trocar senha
        </Button>
      </form>
    </Panel>
  )
}

type SessionItem = { id: string; token: string; userAgent?: string | null; ipAddress?: string | null; createdAt: string | Date; updatedAt: string | Date }

const deviceOf = (agent?: string | null) => {
  const ua = agent ?? ''
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua)
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador'
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|Mac OS/.test(ua) ? 'Apple' : /Linux/.test(ua) ? 'Linux' : ''
  return { mobile, label: [browser, os].filter(Boolean).join(' no ') }
}

function SessionsPanel() {
  const session = authClient.useSession()
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => unwrap<SessionItem[]>(authClient.listSessions() as never, 'Não foi possível listar as sessões.'),
  })
  const [list, setList] = useState<SessionItem[]>([])
  useEffect(() => setList(sessions.data ?? []), [sessions.data])

  const revoke = useMutation({
    mutationFn: (token: string) => unwrap(authClient.revokeSession({ token }), 'Não foi possível encerrar.'),
    onSuccess: () => {
      toast.success('Sessão encerrada.')
      void sessions.refetch()
    },
  })
  const revokeOthers = useMutation({
    mutationFn: () => unwrap(authClient.revokeOtherSessions(), 'Não foi possível encerrar.'),
    onSuccess: () => {
      toast.success('Outros aparelhos desconectados.')
      void sessions.refetch()
    },
  })
  const currentToken = session.data?.session.token

  return (
    <Panel
      title="Aparelhos conectados"
      aside={list.length > 1 && <Button size="sm" onClick={() => revokeOthers.mutate()} loading={revokeOthers.isPending}>Sair dos outros</Button>}
      className="xl:col-span-2"
      bodyClassName="p-0"
    >
      {sessions.isPending ? (
        <Skeleton className="m-5 h-24" />
      ) : (
        <ul className="divide-y divide-line">
          {list.map(item => {
            const device = deviceOf(item.userAgent)
            const isCurrent = item.token === currentToken
            const Icon = device.mobile ? Smartphone : Laptop
            return (
              <li key={item.id} className="flex items-center gap-4 px-5 py-3">
                <Icon className="size-5 text-steel" aria-hidden />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="text-ink">
                    {device.label} {isCurrent && <Badge tone="ok">Este aparelho</Badge>}
                  </p>
                  <p className="text-[13px] text-steel">
                    Entrou em {new Date(item.createdAt).toLocaleString('pt-BR')}
                    {item.ipAddress ? `, IP ${item.ipAddress}` : ''}
                  </p>
                </div>
                {!isCurrent && (
                  <Button size="sm" variant="ghost" onClick={() => revoke.mutate(item.token)}>
                    Encerrar
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
