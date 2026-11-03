/**
 * Página pública de vagas e candidatura sem login. Tudo roda sob a role
 * `falcao_public` (ver `withPublic`): leitura só de vagas publicadas ou
 * pausadas, com colunas escolhidas aqui, e inclusão de candidaturas sem
 * nenhuma leitura de dados pessoais (os ids são gerados pela API).
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { and, asc, desc, eq, sql } from 'drizzle-orm'

import { applicationForm, RECRUITMENT_DEFAULTS, type ApplicationForm, type TenantSettings } from '@falcao-rh/contracts'

import { SYSTEM_USER } from '../../automations/automations'
import { withPublic, withTenant, type Database, type PublicTenant, type Tx } from '../../db/client'
import { rowsOf } from '../../db/rows'
import {
  applicationAnswers,
  applicationEvents,
  auditLogs,
  applications,
  candidateFiles,
  candidates,
  departments,
  jobOpenings,
  jobQuestions,
  recruitmentStages,
  tenants,
} from '../../db/schema'
import { calendarDate } from '../../lib/dates'
import { AppError, badRequest } from '../../lib/errors'
import { safeFilename, sniffMimeType } from '../../lib/file-type'
import type { Mailer } from '../../lib/mailer'
import { notify, Outbox, usersWithRoles } from '../../lib/notify'
import type { Storage } from '../../lib/storage'
import type { UploadedFile } from '../../lib/upload'

const pageNotFound = () => new AppError(404, 'not_found', 'Página de vagas não encontrada.')
const jobNotFound = () => new AppError(404, 'not_found', 'Vaga não encontrada.')

/** Menos que isso entre abrir e enviar o formulário é robô. */
const MIN_FILL_MS = 3000

// Colunas que a página pública pode ver. Nunca `select()` inteiro: a role
// pública enxerga o token e as vagas não listadas, e a lista não pode mostrá-los.
const publicColumns = {
  token: jobOpenings.shareToken,
  title: jobOpenings.title,
  city: jobOpenings.city,
  state: jobOpenings.state,
  workMode: jobOpenings.workMode,
  contractType: jobOpenings.contractType,
  departmentName: departments.name,
  salaryMin: jobOpenings.salaryMin,
  salaryMax: jobOpenings.salaryMax,
  showSalary: jobOpenings.showSalary,
  description: jobOpenings.description,
  requirements: jobOpenings.requirements,
  benefits: jobOpenings.benefits,
  publishedAt: jobOpenings.publishedAt,
}

type PublicRow = { [K in keyof typeof publicColumns]: (typeof publicColumns)[K]['_']['data'] | null }

const toPublicJob = ({ salaryMin, salaryMax, showSalary, ...job }: PublicRow) => ({
  ...job,
  salary: showSalary && (salaryMin !== null || salaryMax !== null) ? { min: salaryMin === null ? null : Number(salaryMin), max: salaryMax === null ? null : Number(salaryMax) } : null,
})

export type PublicJob = ReturnType<typeof toPublicJob>

const publicTx = async <T>(db: Database, slug: string, fn: (tx: Tx, tenant: PublicTenant) => Promise<T>) => {
  const result = await withPublic(db, slug, fn)
  if (result === null) throw pageNotFound()
  return result
}

export const listPublicJobs = (db: Database, slug: string) =>
  publicTx(db, slug, async (tx, tenant) => {
    const rows = await tx
      .select(publicColumns)
      .from(jobOpenings)
      .leftJoin(departments, eq(departments.id, jobOpenings.departmentId))
      .where(and(eq(jobOpenings.visibility, 'public'), eq(jobOpenings.status, 'published')))
      .orderBy(desc(jobOpenings.publishedAt))
    return { company: { name: tenant.name }, jobs: rows.map(toPublicJob) }
  })

export const getPublicJob = (db: Database, slug: string, token: string) =>
  publicTx(db, slug, async tx => {
    const [row] = await tx
      .select({ ...publicColumns, id: jobOpenings.id, status: jobOpenings.status })
      .from(jobOpenings)
      .leftJoin(departments, eq(departments.id, jobOpenings.departmentId))
      .where(eq(jobOpenings.shareToken, token))
    if (!row) throw jobNotFound()
    const { id, status, ...job } = row
    const questions = await tx
      .select({ id: jobQuestions.id, kind: jobQuestions.kind, label: jobQuestions.label, options: jobQuestions.options, required: jobQuestions.required })
      .from(jobQuestions)
      .where(eq(jobQuestions.jobId, id))
      .orderBy(asc(jobQuestions.position))
    return { ...toPublicJob(job), questions, accepting: status === 'published' }
  })

// ---------- candidatura ----------

const YES_NO = new Set(['sim', 'não'])

/** O formulário chega como texto (multipart); converte para o formato do contrato. */
const parseForm = (fields: Record<string, string>): ApplicationForm => {
  let answers: unknown = {}
  try {
    answers = fields.answers ? JSON.parse(fields.answers) : {}
  } catch {
    throw badRequest('Respostas inválidas.')
  }
  const parsed = applicationForm.safeParse({
    ...fields,
    answers,
    privacyConsent: fields.privacyConsent === 'true',
    talentPoolConsent: fields.talentPoolConsent === 'true',
    website: fields.website ?? '',
    startedAt: Number(fields.startedAt),
  })
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Confira os dados do formulário.')
  return parsed.data
}

const checkAnswers = (
  questions: { id: string; kind: string; label: string; options: string[] | null; required: boolean }[],
  answers: Record<string, string>,
) => {
  const byId = new Map(questions.map(q => [q.id, q]))
  for (const id of Object.keys(answers)) if (!byId.has(id)) throw badRequest('Resposta para uma pergunta que esta vaga não tem.')
  for (const question of questions) {
    const value = answers[question.id]?.trim() ?? ''
    if (!value) {
      if (question.required) throw badRequest(`Responda: ${question.label}`)
      continue
    }
    if (question.kind === 'yes_no' && !YES_NO.has(value.toLowerCase())) throw badRequest(`Responda sim ou não: ${question.label}`)
    if (question.kind === 'choice' && !question.options?.includes(value)) throw badRequest(`Escolha uma das opções: ${question.label}`)
  }
}

const addMonths = (months: number, from = new Date()) => {
  const date = new Date(from)
  date.setMonth(date.getMonth() + months)
  return calendarDate(date)
}

export type ApplyDeps = { db: Database; storage: Storage; mailer: Mailer; webOrigin: string; log: (error: unknown) => void }

/**
 * Grava a candidatura. Robô (campo-armadilha ou envio rápido demais) recebe
 * a mesma resposta de sucesso, sem nada gravado.
 */
export const submitApplication = async (deps: ApplyDeps, slug: string, token: string, fields: Record<string, string>, file: UploadedFile) => {
  if ((fields.website ?? '') !== '' || Date.now() - Number(fields.startedAt) < MIN_FILL_MS) return
  const form = parseForm(fields)
  if (sniffMimeType(file.buffer, file.filename) !== 'application/pdf') throw badRequest('Envie o currículo em PDF.')

  // Prazo do banco de talentos: configuração da organização, lida como
  // operação de sistema (a role pública não lê `tenants`).
  const [settingsRow] = await deps.db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.slug, slug))
  const talentPoolMonths = (settingsRow?.settings as TenantSettings | undefined)?.recruitment?.talentPoolMonths ?? RECRUITMENT_DEFAULTS.talentPoolMonths

  const saved = await publicTx(deps.db, slug, async (tx, tenant) => {
    const [job] = await tx
      .select({ id: jobOpenings.id, title: jobOpenings.title, status: jobOpenings.status, managerUserId: jobOpenings.managerUserId })
      .from(jobOpenings)
      .where(eq(jobOpenings.shareToken, token))
    if (!job) throw jobNotFound()
    if (job.status !== 'published') throw new AppError(409, 'not_accepting', 'Esta vaga não está recebendo candidaturas.')

    const questions = await tx
      .select({ id: jobQuestions.id, kind: jobQuestions.kind, label: jobQuestions.label, options: jobQuestions.options, required: jobQuestions.required })
      .from(jobQuestions)
      .where(eq(jobQuestions.jobId, job.id))
    checkAnswers(questions, form.answers)

    const [duplicate] = rowsOf<{ exists: boolean }>(
      await tx.execute(sql`select public_application_exists(${tenant.id}::uuid, ${job.id}::uuid, ${form.email}) as exists`),
    )
    if (duplicate?.exists) throw new AppError(409, 'already_applied', 'Você já se candidatou a esta vaga.')

    // A role pública só enxerga a etapa inicial.
    const [initial] = await tx.select({ id: recruitmentStages.id }).from(recruitmentStages)
    if (!initial) throw new AppError(500, 'no_initial_stage', 'Organização sem etapa inicial de recrutamento.')

    const candidateId = randomUUID()
    const applicationId = randomUUID()
    const privacyToken = randomBytes(32).toString('base64url')
    const storageKey = `recruitment/${tenant.id}/${randomUUID()}.pdf`
    const now = new Date()

    await tx.insert(candidates).values({
      id: candidateId,
      tenantId: tenant.id,
      fullName: form.fullName,
      email: form.email,
      phone: form.phone,
      city: form.city,
      state: form.state,
      cpf: form.cpf ?? null,
      linkedin: form.linkedin ?? null,
    })
    await tx.insert(applications).values({
      id: applicationId,
      tenantId: tenant.id,
      jobId: job.id,
      candidateId,
      email: form.email,
      status: 'open',
      stageId: initial.id,
      talentPoolConsent: form.talentPoolConsent,
      consentAt: form.talentPoolConsent ? now : null,
      retentionUntil: form.talentPoolConsent ? addMonths(talentPoolMonths, now) : null,
      privacyToken,
    })
    const answered = Object.entries(form.answers).filter(([, value]) => value.trim())
    if (answered.length)
      await tx
        .insert(applicationAnswers)
        .values(answered.map(([questionId, value]) => ({ id: randomUUID(), tenantId: tenant.id, applicationId, questionId, value: value.trim() })))
    // Rótulo da etapa preenchido pelo banco a partir do id.
    await tx.insert(applicationEvents).values({ id: randomUUID(), tenantId: tenant.id, applicationId, toStageId: initial.id })
    await tx.insert(candidateFiles).values({
      id: randomUUID(),
      tenantId: tenant.id,
      candidateId,
      applicationId,
      storageKey,
      filename: safeFilename(file.filename),
      sizeBytes: file.buffer.length,
      scanStatus: 'pending',
    })
    // Por último: se gravar o arquivo falhar, a transação desfaz tudo.
    await deps.storage.put(storageKey, file.buffer, 'application/pdf')
    return { tenantId: tenant.id, job, privacyToken }
  })

  await deps.mailer
    .send({
      to: form.email,
      subject: `Recebemos sua candidatura: ${saved.job.title}`,
      text: [
        `Olá, ${form.fullName.split(' ')[0]}.`,
        `Recebemos sua candidatura para a vaga ${saved.job.title}. O RH da Falcão vai analisar e você será avisado por e-mail.`,
        `Para pedir a exclusão dos seus dados a qualquer momento: ${deps.webOrigin}/vagas/privacidade/${saved.privacyToken}`,
      ].join('\n\n'),
    })
    .catch(deps.log)

  // Avisos internos numa transação à parte, como sistema: a role pública não
  // cria notificações. Falhar aqui não desfaz a candidatura.
  try {
    const outbox = new Outbox(deps.webOrigin)
    await withTenant(deps.db, { tenantId: saved.tenantId, userId: SYSTEM_USER }, async tx => {
      const hr = await usersWithRoles(tx, saved.tenantId, ['hr'])
      await notify(tx, saved.tenantId, outbox, {
        userIds: [...hr, ...(saved.job.managerUserId ? [saved.job.managerUserId] : [])],
        kind: 'application_received',
        title: `Nova candidatura: ${saved.job.title}`,
        body: `${form.fullName}, de ${form.city}/${form.state}.`,
        link: `/recrutamento/${saved.job.id}`,
      })
    })
    await outbox.flush(deps.mailer, deps.log)
  } catch (error) {
    deps.log(error)
  }
}

// ---------- privacidade do candidato (link do e-mail) ----------

/** Candidatura do token, lida como operação de sistema (dono do banco). */
const byPrivacyToken = async (tx: Tx, token: string) =>
  (
    await tx
      .select({ tenantId: applications.tenantId, candidateId: applications.candidateId })
      .from(applications)
      .where(eq(applications.privacyToken, token))
  )[0]

export type PrivacyDeps = { db: Database; storage: Storage; ip: string; log: (error: unknown) => void }

/**
 * Exclusão a pedido do candidato: apaga a ficha e tudo o que vem dela.
 * Token inexistente ou já usado não faz nada e não é revelado.
 */
export const eraseByToken = async (deps: PrivacyDeps, token: string) => {
  const keys = await deps.db.transaction(async tx => {
    const found = await byPrivacyToken(tx, token)
    if (!found) return []
    const [row] = rowsOf<{ keys: string[] }>(await tx.execute(sql`select public_erase_by_token(${token}) as keys`))
    await tx.insert(auditLogs).values({
      tenantId: found.tenantId,
      actorUserId: null,
      action: 'candidate.erased_by_request',
      entity: 'candidate',
      entityId: found.candidateId,
      ip: deps.ip,
    })
    return row?.keys ?? []
  })
  // Arquivos só saem depois do commit; falha aqui deixa um órfão no
  // armazenamento, nunca um registro apontando para arquivo apagado.
  for (const key of keys) await deps.storage.remove(key).catch(deps.log)
}

/** Renova o consentimento ao banco de talentos (só onde já havia) e o prazo. */
export const renewByToken = async (deps: PrivacyDeps, token: string) => {
  await deps.db.transaction(async tx => {
    const found = await byPrivacyToken(tx, token)
    if (!found) return
    const [tenant] = await tx.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, found.tenantId))
    const months = (tenant?.settings as TenantSettings | undefined)?.recruitment?.talentPoolMonths ?? RECRUITMENT_DEFAULTS.talentPoolMonths
    const [row] = rowsOf<{ renewed: boolean }>(await tx.execute(sql`select public_renew_consent(${token}) as renewed`))
    if (!row?.renewed) return
    await tx
      .update(applications)
      .set({ retentionUntil: addMonths(months) })
      .where(and(eq(applications.candidateId, found.candidateId), eq(applications.talentPoolConsent, true)))
  })
}
