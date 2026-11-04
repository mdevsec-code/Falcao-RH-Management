import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm'

import { APPLICATION_STATUS_LABELS, RECRUITMENT_DEFAULTS, type StageMove, type TenantSettings } from '@falcao-rh/contracts'

import type { Tx } from '../../db/client'
import {
  applicationAnswers,
  applicationEvents,
  applicationNotes,
  applications,
  candidateFiles,
  candidates,
  jobOpenings,
  jobQuestions,
  recruitmentStages,
  tenants,
  user,
} from '../../db/schema'
import type { Ctx } from '../../http/context'
import { AppError, notFound } from '../../lib/errors'
import type { Mail } from '../../lib/mailer'
import type { Storage } from '../../lib/storage'

/** Gestor só enxerga candidaturas das vagas em que é o responsável. */
const jobScope = (ctx: Ctx) => (ctx.role === 'manager' ? eq(jobOpenings.managerUserId, ctx.userId) : undefined)

const jobInScope = async (tx: Tx, ctx: Ctx, jobId: string) => {
  const [job] = await tx
    .select({ id: jobOpenings.id, title: jobOpenings.title })
    .from(jobOpenings)
    .where(and(eq(jobOpenings.id, jobId), jobScope(ctx)))
  if (!job) throw notFound('Vaga')
  return job
}

/** Candidatura visível para quem pede; fora do escopo é "não encontrada", nunca "proibida". */
const applicationInScope = async (tx: Tx, ctx: Ctx, id: string) => {
  const [row] = await tx
    .select({
      id: applications.id,
      jobId: applications.jobId,
      jobTitle: jobOpenings.title,
      candidateId: applications.candidateId,
      email: applications.email,
      status: applications.status,
      stageId: applications.stageId,
    })
    .from(applications)
    .innerJoin(jobOpenings, eq(jobOpenings.id, applications.jobId))
    .where(and(eq(applications.id, id), jobScope(ctx)))
  if (!row) throw new AppError(404, 'not_found', 'Candidatura não encontrada.')
  return row
}

const fileStatusByApplication = async (tx: Tx, applicationIds: string[]) => {
  if (applicationIds.length === 0) return new Map<string, 'pending' | 'clean' | 'infected'>()
  const files = await tx
    .select({ applicationId: candidateFiles.applicationId, scanStatus: candidateFiles.scanStatus })
    .from(candidateFiles)
    .where(inArray(candidateFiles.applicationId, applicationIds))
    .orderBy(asc(candidateFiles.createdAt))
  // O arquivo mais recente da candidatura vale.
  return new Map(files.map(f => [f.applicationId!, f.scanStatus]))
}

export const listStagesForBoard = (tx: Tx) =>
  tx
    .select({ id: recruitmentStages.id, name: recruitmentStages.name, position: recruitmentStages.position })
    .from(recruitmentStages)
    .orderBy(asc(recruitmentStages.position))

/** Quadro da vaga: etapas da organização, cartões em andamento e recusados à parte. */
export const board = async (tx: Tx, ctx: Ctx, jobId: string) => {
  await jobInScope(tx, ctx, jobId)
  const stages = await listStagesForBoard(tx)
  const rows = await tx
    .select({
      id: applications.id,
      stageId: applications.stageId,
      status: applications.status,
      rating: applications.rating,
      createdAt: applications.createdAt,
      candidateId: candidates.id,
      fullName: candidates.fullName,
      city: candidates.city,
      state: candidates.state,
      tags: candidates.tags,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .where(and(eq(applications.jobId, jobId), ne(applications.status, 'hired')))
    .orderBy(desc(applications.createdAt))
  const files = await fileStatusByApplication(tx, rows.map(r => r.id))
  const cards = rows.map(({ candidateId, fullName, city, state, tags, ...card }) => ({
    ...card,
    candidate: { id: candidateId, fullName, city, state },
    tags,
    fileStatus: files.get(card.id) ?? null,
  }))
  return { stages, cards: cards.filter(c => c.status === 'open'), rejected: cards.filter(c => c.status === 'rejected') }
}

export const applicationDetail = async (tx: Tx, ctx: Ctx, id: string) => {
  const base = await applicationInScope(tx, ctx, id)
  const [row] = await tx
    .select({
      rating: applications.rating,
      rejectionReason: applications.rejectionReason,
      talentPoolConsent: applications.talentPoolConsent,
      createdAt: applications.createdAt,
      fullName: candidates.fullName,
      email: candidates.email,
      phone: candidates.phone,
      city: candidates.city,
      state: candidates.state,
      cpf: candidates.cpf,
      linkedin: candidates.linkedin,
      tags: candidates.tags,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .where(eq(applications.id, id))
  const answers = await tx
    .select({ questionId: jobQuestions.id, label: jobQuestions.label, value: applicationAnswers.value })
    .from(applicationAnswers)
    .innerJoin(jobQuestions, eq(jobQuestions.id, applicationAnswers.questionId))
    .where(eq(applicationAnswers.applicationId, id))
    .orderBy(asc(jobQuestions.position))
  const events = await tx
    .select({
      id: applicationEvents.id,
      fromLabel: applicationEvents.fromLabel,
      toLabel: applicationEvents.toLabel,
      outcome: applicationEvents.outcome,
      note: applicationEvents.note,
      actorName: user.name,
      createdAt: applicationEvents.createdAt,
    })
    .from(applicationEvents)
    .leftJoin(user, eq(user.id, applicationEvents.actorUserId))
    .where(eq(applicationEvents.applicationId, id))
    .orderBy(asc(applicationEvents.createdAt))
  const notes = await tx
    .select({ id: applicationNotes.id, body: applicationNotes.body, authorName: user.name, createdAt: applicationNotes.createdAt })
    .from(applicationNotes)
    .leftJoin(user, eq(user.id, applicationNotes.authorUserId))
    .where(eq(applicationNotes.applicationId, id))
    .orderBy(desc(applicationNotes.createdAt))
  const files = await tx
    .select({ id: candidateFiles.id, filename: candidateFiles.filename, sizeBytes: candidateFiles.sizeBytes, scanStatus: candidateFiles.scanStatus, createdAt: candidateFiles.createdAt })
    .from(candidateFiles)
    .where(eq(candidateFiles.applicationId, id))
    .orderBy(desc(candidateFiles.createdAt))

  const { cpf, ...contact } = row!
  const fullAccess = ctx.role === 'admin' || ctx.role === 'hr'
  const candidate = {
    id: base.candidateId,
    fullName: contact.fullName,
    email: contact.email,
    phone: contact.phone,
    city: contact.city,
    state: contact.state,
    linkedin: contact.linkedin,
    tags: contact.tags,
    ...(fullAccess ? { cpf } : {}),
  }
  const result = {
    id,
    jobId: base.jobId,
    jobTitle: base.jobTitle,
    status: base.status,
    stageId: base.stageId,
    rating: contact.rating,
    rejectionReason: contact.rejectionReason,
    talentPoolConsent: contact.talentPoolConsent,
    createdAt: contact.createdAt,
    candidate,
    answers,
    events,
    notes,
    file: files[0] ?? null,
  }
  if (!fullAccess) return result

  // Só RH e administrador: a trajetória da pessoa em outras vagas.
  const others = await tx
    .select({
      id: applications.id,
      jobTitle: jobOpenings.title,
      status: applications.status,
      stageName: recruitmentStages.name,
      createdAt: applications.createdAt,
    })
    .from(applications)
    .innerJoin(jobOpenings, eq(jobOpenings.id, applications.jobId))
    .leftJoin(recruitmentStages, eq(recruitmentStages.id, applications.stageId))
    .where(and(eq(applications.candidateId, base.candidateId), ne(applications.id, id)))
    .orderBy(desc(applications.createdAt))
  return {
    ...result,
    otherApplications: others.map(({ status, stageName, ...o }) => ({ ...o, stage: status === 'open' ? (stageName ?? '') : APPLICATION_STATUS_LABELS[status] })),
  }
}

/**
 * Move a candidatura: para uma etapa (reabre se estava recusada) ou recusa
 * com motivo. Contratar não passa por aqui. Devolve o e-mail ao candidato,
 * se houver, para sair depois do commit.
 */
export const moveApplication = async (tx: Tx, ctx: Ctx, id: string, input: StageMove): Promise<Mail | null> => {
  const current = await applicationInScope(tx, ctx, id)
  if (current.status === 'hired') throw new AppError(409, 'already_hired', 'Candidato já contratado: a candidatura não muda mais de etapa.')

  if ('stageId' in input) {
    const [stage] = await tx.select({ id: recruitmentStages.id }).from(recruitmentStages).where(eq(recruitmentStages.id, input.stageId))
    if (!stage) throw notFound('Etapa')
    if (current.status === 'open' && current.stageId === input.stageId) return null
    const reopening = current.status === 'rejected'
    await tx
      .update(applications)
      .set({ status: 'open', stageId: input.stageId, ...(reopening ? { rejectionReason: null } : {}) })
      .where(eq(applications.id, id))
    // Rótulos das etapas preenchidos pelo banco a partir dos ids.
    await tx.insert(applicationEvents).values({
      tenantId: ctx.tenantId,
      applicationId: id,
      fromStageId: reopening ? null : current.stageId,
      toStageId: input.stageId,
      outcome: reopening ? 'reopened' : null,
      actorUserId: ctx.userId,
    })
    return null
  }

  if (current.status === 'rejected') return null
  await tx.update(applications).set({ status: 'rejected', stageId: null, rejectionReason: input.reason }).where(eq(applications.id, id))
  await tx.insert(applicationEvents).values({
    tenantId: ctx.tenantId,
    applicationId: id,
    fromStageId: current.stageId,
    outcome: 'rejected',
    note: input.reason,
    actorUserId: ctx.userId,
  })
  const [tenant] = await tx.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, ctx.tenantId))
  const message = (tenant?.settings as TenantSettings | undefined)?.recruitment?.rejectionMessage ?? RECRUITMENT_DEFAULTS.rejectionMessage
  return { to: current.email, subject: `Sobre sua candidatura: ${current.jobTitle}`, text: message }
}

export const rateApplication = async (tx: Tx, ctx: Ctx, id: string, rating: number | null) => {
  await applicationInScope(tx, ctx, id)
  await tx.update(applications).set({ rating }).where(eq(applications.id, id))
  return { id, rating }
}

export const addNote = async (tx: Tx, ctx: Ctx, id: string, body: string) => {
  await applicationInScope(tx, ctx, id)
  const [note] = await tx
    .insert(applicationNotes)
    .values({ tenantId: ctx.tenantId, applicationId: id, authorUserId: ctx.userId, body })
    .returning({ id: applicationNotes.id, body: applicationNotes.body, createdAt: applicationNotes.createdAt })
  return { ...note!, authorName: ctx.userName }
}

/** Link temporário do currículo, só depois da verificação de segurança. */
export const candidateFileUrl = async (tx: Tx, ctx: Ctx, storage: Storage, fileId: string) => {
  const [file] = await tx
    .select({ storageKey: candidateFiles.storageKey, filename: candidateFiles.filename, scanStatus: candidateFiles.scanStatus, applicationId: candidateFiles.applicationId })
    .from(candidateFiles)
    .where(eq(candidateFiles.id, fileId))
  if (!file) throw notFound('Arquivo')
  // Gestor: só arquivos de candidaturas das suas vagas.
  if (file.applicationId) await applicationInScope(tx, ctx, file.applicationId)
  else if (ctx.role === 'manager') throw notFound('Arquivo')
  if (file.scanStatus === 'pending') throw new AppError(409, 'scan_pending', 'O currículo ainda está em verificação de segurança.')
  if (file.scanStatus === 'infected') throw new AppError(410, 'infected', 'O arquivo foi removido: não passou na verificação de segurança.')
  return { url: await storage.downloadUrl({ key: file.storageKey, filename: file.filename, mimeType: 'application/pdf', tenantId: ctx.tenantId }) }
}
