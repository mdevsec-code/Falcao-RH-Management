import { Link, useSearch } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { Button } from '../components/ui/button'
import { Field, Input } from '../components/ui/field'
import { authClient } from '../lib/auth-client'
import { AuthFrame } from './login'

export function SetPasswordPage() {
  const { token, error: linkError } = useSearch({ from: '/definir-senha' })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const mismatch = confirm.length > 0 && confirm !== password
  const tooShort = password.length > 0 && password.length < 10

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!token) return
    setBusy(true)
    setError(null)
    const { error } = await authClient.resetPassword({ newPassword: password, token })
    setBusy(false)
    if (error) return setError('Este link expirou ou já foi usado. Peça um novo na tela de login.')
    setDone(true)
  }

  if (!token || linkError)
    return (
      <AuthFrame>
        <h1 className="font-display text-[34px] leading-none font-semibold text-ink">Link inválido</h1>
        <p className="mt-3 text-steel">Este link expirou ou já foi usado. Peça um novo na tela de login.</p>
        <Link to="/entrar" className="mt-6 inline-block font-medium text-ink underline underline-offset-2">Ir para o login</Link>
      </AuthFrame>
    )

  if (done)
    return (
      <AuthFrame>
        <h1 className="font-display text-[34px] leading-none font-semibold text-ink">Senha definida</h1>
        <p className="mt-3 text-steel">Agora entre com seu e-mail e a nova senha.</p>
        <Link to="/entrar" className="mt-6 inline-flex h-11 items-center rounded-sm border border-brand-strong/70 bg-brand px-5 font-semibold text-night shadow-brand">
          Entrar
        </Link>
      </AuthFrame>
    )

  return (
    <AuthFrame>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="mb-2">
          <h1 className="font-display text-[34px] leading-none font-semibold text-ink">Defina sua senha</h1>
          <p className="mt-2 text-steel">Use pelo menos 10 caracteres. Uma frase curta é mais fácil de lembrar e difícil de adivinhar.</p>
        </div>
        <Field label="Nova senha" error={tooShort ? 'Use pelo menos 10 caracteres.' : undefined}>
          {props => <Input {...props} type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} autoFocus />}
        </Field>
        <Field label="Repita a senha" error={mismatch ? 'As senhas não são iguais.' : undefined}>
          {props => <Input {...props} type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} />}
        </Field>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={password.length < 10 || password !== confirm}>
          Salvar senha
        </Button>
      </form>
    </AuthFrame>
  )
}
