/**
 * Automações agendadas (ADR-0011). Rodam por organização, dentro do RLS,
 * como um ator de sistema. Cada aviso é marcado em `automation_marks`, então
 * rodar de novo (ou em duas instâncias) nunca duplica notificações.
 */
import { and, eq, isNotNull, lte, sql } from 'drizzle-orm'

import { addDaysIso } from '@falcao-rh/contracts'

import { withTenant, type Database, type Tx } from '../db/client'
import { automationMarks, documentCategories, documents, employees, requests, requestSteps, tenants } from '../db/schema'
import { calendarDate } from '../lib/dates'
import type { Mailer } from '../lib/mailer'
import { notify, Outbox, userOfEmployee, usersWithRoles } from '../lib/notify'
import { vacationsDue } from '../modules/requests/vacation-due'

const SYSTEM_USER = 'system'

/** Registra a marca; devolve `false` se o aviso já tinha sido dado. */
const firstTime = async (tx: Tx, tenantId: string, kind: string, ref: string, bucket: string) => {
  const inserted = await tx
    .insert(automationMarks)
    .values({ tenantId, kind, ref, bucket })
    .onConflictDoNothing()
    .returning({ id: automationMarks.id })
  return inserted.length > 0
}

const br = (iso: string) => iso.split('-').reverse().join('/')
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)

/** Documentos que vencem em 30 dias, em 7 dias e no dia do vencimento. */
const documentExpiry = async (tx: Tx, tenantId: string, outbox: Outbox, today: string) => {
  const rows = await tx
    .select({
      id: documents.id,
      title: documents.title,
      expiresAt: documents.expiresAt,
      employeeId: documents.employeeId,
      employeeName: employees.fullName,
      visible: documentCategories.employeeVisible,
    })
    .from(documents)
    .innerJoin(documentCategories, eq(documentCategories.id, documents.categoryId))
    .leftJoin(employees, eq(employees.id, documents.employeeId))
    .where(and(eq(documents.status, 'active'), isNotNull(documents.expiresAt), lte(documents.expiresAt, addDaysIso(today, 30))))
  const hr = await usersWithRoles(tx, tenantId, ['hr', 'admin'])
  let sent = 0
  for (const doc of rows) {
    const left = daysBetween(today, doc.expiresAt!)
    const bucket = left <= 0 ? 'expired' : left <= 7 ? '7d' : '30d'
    if (!(await firstTime(tx, tenantId, 'document_expiring', doc.id, bucket))) continue
    const owner = doc.visible ? await userOfEmployee(tx, tenantId, doc.employeeId) : null
    const when = left <= 0 ? `venceu em ${br(doc.expiresAt!)}` : `vence em ${br(doc.expiresAt!)} (${left} dias)`
    await notify(tx, tenantId, outbox, {
      userIds: [...hr, ...(owner ? [owner] : [])],
      kind: 'document_expiring',
      title: `Documento ${left <= 0 ? 'vencido' : 'vencendo'}: ${doc.title}`,
      body: `${doc.title}${doc.employeeName ? ` de ${doc.employeeName}` : ''} ${when}.`,
      link: `/documentos?id=${doc.id}`,
    })
    sent++
  }
  return sent
}

/** Aprovações paradas há mais de 2 dias: lembra quem precisa decidir, a cada 2 dias. */
const pendingReminders = async (tx: Tx, tenantId: string, outbox: Outbox, now: Date) => {
  const rows = await tx
    .select({
      stepId: requestSteps.id,
      approverKind: requestSteps.approverKind,
      approverEmployeeId: requestSteps.approverEmployeeId,
      since: sql<string>`coalesce((select max(s2.decided_at) from request_steps s2 where s2.request_id = ${requestSteps.requestId}), ${requests.createdAt})`,
      requestId: requests.id,
      employeeName: employees.fullName,
    })
    .from(requestSteps)
    .innerJoin(requests, eq(requests.id, requestSteps.requestId))
    .innerJoin(employees, eq(employees.id, requests.employeeId))
    .where(and(eq(requestSteps.status, 'pending'), eq(requests.status, 'pending')))
  let sent = 0
  for (const row of rows) {
    const waitingDays = Math.floor((now.getTime() - new Date(row.since).getTime()) / 86_400_000)
    if (waitingDays < 2) continue
    if (!(await firstTime(tx, tenantId, 'request_reminder', row.stepId, String(Math.floor(waitingDays / 2))))) continue
    const userIds =
      row.approverKind === 'hr'
        ? await usersWithRoles(tx, tenantId, ['hr', 'admin'])
        : [await userOfEmployee(tx, tenantId, row.approverEmployeeId)].filter((id): id is string => Boolean(id))
    await notify(tx, tenantId, outbox, {
      userIds,
      kind: 'request_reminder',
      title: 'Solicitação aguardando sua decisão',
      body: `A solicitação de ${row.employeeName} espera há ${waitingDays} dias.`,
      link: `/solicitacoes?id=${row.requestId}`,
    })
    sent++
  }
  return sent
}

/** Férias com prazo de concessão (CLT art. 134) a 60 e a 30 dias, ainda com saldo. */
const vacationDeadlines = async (tx: Tx, tenantId: string, outbox: Outbox, today: string) => {
  const due = await vacationsDue(tx, today, 60)
  const hr = await usersWithRoles(tx, tenantId, ['hr', 'admin'])
  let sent = 0
  for (const { employeeId, name, period, daysLeft } of due) {
    const bucket = daysLeft <= 30 ? '30d' : '60d'
    if (!(await firstTime(tx, tenantId, 'vacation_deadline', `${employeeId}:${period.start}`, bucket))) continue
    const owner = await userOfEmployee(tx, tenantId, employeeId)
    await notify(tx, tenantId, outbox, {
      userIds: [...hr, ...(owner ? [owner] : [])],
      kind: 'vacation_deadline',
      title: `Férias a vencer: ${name}`,
      body: `${name} tem ${period.remaining} dias do período ${br(period.start)} a ${br(period.end)}, que precisam começar até ${br(period.deadline)}. Depois disso a empresa paga em dobro (CLT art. 137).`,
      link: `/colaboradores/${employeeId}`,
    })
    sent++
  }
  return sent
}

export type AutomationResult = Record<string, { documents: number; reminders: number; vacations: number }>

export const runAutomations = async (db: Database, mailer: Mailer, webOrigin: string, now = new Date()) => {
  const today = calendarDate(now)
  // Lista de organizações: operação de sistema, fora do RLS.
  const all = await db.select({ id: tenants.id }).from(tenants)
  const result: AutomationResult = {}
  for (const { id: tenantId } of all) {
    const outbox = new Outbox(webOrigin)
    result[tenantId] = await withTenant(db, { tenantId, userId: SYSTEM_USER }, async tx => ({
      documents: await documentExpiry(tx, tenantId, outbox, today),
      reminders: await pendingReminders(tx, tenantId, outbox, now),
      vacations: await vacationDeadlines(tx, tenantId, outbox, today),
    }))
    await outbox.flush(mailer, error => console.error('falha ao enviar e-mail', error))
  }
  return result
}
