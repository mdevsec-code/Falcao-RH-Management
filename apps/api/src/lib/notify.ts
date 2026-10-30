import { and, eq, inArray } from 'drizzle-orm'

import type { NotificationKind, Role } from '@falcao-rh/contracts'

import type { Tx } from '../db/client'
import { memberships, notifications, user } from '../db/schema'
import type { Mail, Mailer } from './mailer'

/**
 * E-mails gerados dentro de uma transação só saem depois do commit: se a
 * operação desfizer, ninguém é avisado de algo que não aconteceu.
 */
export class Outbox {
  private readonly mails: Mail[] = []

  constructor(readonly webOrigin: string) {}

  add(mail: Mail) {
    this.mails.push(mail)
  }

  /** Melhor esforço: falha de e-mail não desfaz a operação, só é registrada. */
  async flush(mailer: Mailer, log: (error: unknown) => void) {
    const pending = this.mails.splice(0)
    await Promise.all(pending.map(mail => mailer.send(mail).catch(log)))
  }
}

export type NotificationInput = {
  userIds: string[]
  kind: NotificationKind
  title: string
  body?: string
  /** Caminho dentro do sistema, ex.: /solicitacoes/123 */
  link?: string
}

/** Grava a notificação no sistema e agenda o e-mail para cada pessoa. */
export const notify = async (tx: Tx, tenantId: string, outbox: Outbox, input: NotificationInput) => {
  const userIds = [...new Set(input.userIds)]
  if (userIds.length === 0) return
  await tx.insert(notifications).values(
    userIds.map(userId => ({
      tenantId,
      userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    })),
  )
  const recipients = await tx.select({ email: user.email }).from(user).where(inArray(user.id, userIds))
  for (const { email } of recipients)
    outbox.add({
      to: email,
      subject: `Falcão RH: ${input.title}`,
      text: [input.body, input.link ? `Abrir no Falcão RH: ${outbox.webOrigin}${input.link}` : null]
        .filter(Boolean)
        .join('\n\n'),
    })
}

/** Usuários ativos da organização com algum dos perfis. */
export const usersWithRoles = async (tx: Tx, tenantId: string, roles: Role[]) =>
  (
    await tx
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(
        and(eq(memberships.tenantId, tenantId), eq(memberships.status, 'active'), inArray(memberships.role, roles)),
      )
  ).map(row => row.userId)

/** Usuário ligado a uma ficha de colaborador, se houver acesso ativo. */
export const userOfEmployee = async (tx: Tx, tenantId: string, employeeId: string | null) => {
  if (!employeeId) return null
  const [row] = await tx
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.tenantId, tenantId),
        eq(memberships.employeeId, employeeId),
        eq(memberships.status, 'active'),
      ),
    )
  return row?.userId ?? null
}
