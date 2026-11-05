import { and, asc, desc, eq, ilike, inArray, ne, or, sql, type SQL } from 'drizzle-orm'

import type { CandidateFilters } from '@falcao-rh/contracts'

import type { Tx } from '../../db/client'
import {
  applicationAnswers,
  applicationNotes,
  applications,
  candidateFiles,
  candidates,
  jobOpenings,
  recruitmentStages,
  user,
} from '../../db/schema'
import type { Ctx } from '../../http/context'
import { audit } from '../../lib/audit'
import { calendarDate } from '../../lib/dates'
import { AppError, badRequest, notFound } from '../../lib/errors'
import type { Mail } from '../../lib/mailer'
import { tenantSlug } from './jobs.service'

const like = (value: string) => `%${value.replace(/[\\%_]/g, '\\$&')}%`

/** Consentimento ao banco de talentos ainda no prazo, em alguma candidatura da pessoa. */
const consentValid = (today: string) =>
  sql`exists (select 1 from applications a where a.candidate_id = candidates.id and a.talent_pool_consent and a.retention_until >= ${today})`

const findCandidate = async (tx: Tx, id: string) => {
  const [row] = await tx.select().from(candidates).where(eq(candidates.id, id))
  if (!row) throw new AppError(404, 'not_found', 'Ficha não encontrada.')
  return row
}

const sameEmailOrCpf = (email: string, cpf: string | null) => (cpf ? or(eq(candidates.email, email), eq(candidates.cpf, cpf)) : eq(candidates.email, email))

export const listCandidates = async (tx: Tx, filters: CandidateFilters) => {
  const conditions: (SQL | undefined)[] = []
  if (filters.q) {
    const term = like(filters.q)
    conditions.push(
      or(
        ilike(candidates.fullName, term),
        ilike(candidates.email, term),
        sql`exists (
          select 1 from application_answers aa
          join applications a on a.id = aa.application_id
          where a.candidate_id = candidates.id and aa.value ilike ${term}
        )`,
      ),
    )
  }
  if (filters.city) conditions.push(ilike(candidates.city, like(filters.city)))
  if (filters.state) conditions.push(eq(candidates.state, filters.state))
  if (filters.tag) conditions.push(sql`${filters.tag} = any(candidates.tags)`)
  if (filters.consent === 'yes') conditions.push(consentValid(calendarDate()))
  const where = and(...conditions)

  const lastApplication = sql<string | null>`(select max(a.created_at) from applications a where a.candidate_id = candidates.id)`
  const rows = await tx
    .select({
      id: candidates.id,
      fullName: candidates.fullName,
      email: candidates.email,
      cpf: candidates.cpf,
      city: candidates.city,
      state: candidates.state,
      tags: candidates.tags,
      invitedAt: candidates.invitedAt,
      lastApplicationAt: lastApplication,
      applications: sql<number>`(select count(*)::int from applications a where a.candidate_id = candidates.id)`,
      consentUntil: sql<string | null>`(select max(a.retention_until)::text from applications a where a.candidate_id = candidates.id and a.talent_pool_consent)`,
    })
    .from(candidates)
    .where(where)
    .orderBy(sql`${lastApplication} desc nulls last`, asc(candidates.fullName))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize)
  const [count] = await tx.select({ value: sql<number>`count(*)::int` }).from(candidates).where(where)

  // Duplicatas da página: mesma pessoa por e-mail ou CPF.
  const emails = rows.map(r => r.email)
  const cpfs = rows.flatMap(r => (r.cpf ? [r.cpf] : []))
  const twins = rows.length
    ? await tx
        .select({ id: candidates.id, email: candidates.email, cpf: candidates.cpf })
        .from(candidates)
        .where(cpfs.length ? or(inArray(candidates.email, emails), inArray(candidates.cpf, cpfs)) : inArray(candidates.email, emails))
    : []

  return {
    items: rows.map(({ email, cpf, ...row }) => ({
      ...row,
      duplicateOf: twins.filter(t => t.id !== row.id && (t.email === email || (cpf !== null && t.cpf === cpf))).map(t => t.id),
    })),
    total: count?.value ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
  }
}

export const getCandidate = async (tx: Tx, id: string) => {
  const candidate = await findCandidate(tx, id)
  const rows = await tx
    .select({
      id: applications.id,
      jobId: applications.jobId,
      jobTitle: jobOpenings.title,
      status: applications.status,
      stage: recruitmentStages.name,
      rating: applications.rating,
      rejectionReason: applications.rejectionReason,
      talentPoolConsent: applications.talentPoolConsent,
      retentionUntil: applications.retentionUntil,
      createdAt: applications.createdAt,
    })
    .from(applications)
    .innerJoin(jobOpenings, eq(jobOpenings.id, applications.jobId))
    .leftJoin(recruitmentStages, eq(recruitmentStages.id, applications.stageId))
    .where(eq(applications.candidateId, id))
    .orderBy(desc(applications.createdAt))
  const notes = rows.length
    ? await tx
        .select({ id: applicationNotes.id, applicationId: applicationNotes.applicationId, body: applicationNotes.body, authorName: user.name, createdAt: applicationNotes.createdAt })
        .from(applicationNotes)
        .leftJoin(user, eq(user.id, applicationNotes.authorUserId))
        .where(
          inArray(
            applicationNotes.applicationId,
            rows.map(r => r.id),
          ),
        )
        .orderBy(desc(applicationNotes.createdAt))
    : []
  const files = await tx
    .select({ id: candidateFiles.id, filename: candidateFiles.filename, sizeBytes: candidateFiles.sizeBytes, scanStatus: candidateFiles.scanStatus, createdAt: candidateFiles.createdAt })
    .from(candidateFiles)
    .where(eq(candidateFiles.candidateId, id))
    .orderBy(desc(candidateFiles.createdAt))
  const today = calendarDate()
  return {
    id: candidate.id,
    fullName: candidate.fullName,
    email: candidate.email,
    phone: candidate.phone,
    city: candidate.city,
    state: candidate.state,
    cpf: candidate.cpf,
    linkedin: candidate.linkedin,
    tags: candidate.tags,
    invitedAt: candidate.invitedAt,
    canInvite: rows.some(r => r.talentPoolConsent && r.retentionUntil !== null && r.retentionUntil >= today),
    applications: rows.map(row => ({ ...row, notes: notes.filter(n => n.applicationId === row.id) })),
    files,
  }
}

export const updateCandidateTags = async (tx: Tx, ctx: Ctx, id: string, tags: string[]) => {
  await findCandidate(tx, id)
  const unique = [...new Set(tags)]
  await tx.update(candidates).set({ tags: unique }).where(eq(candidates.id, id))
  await audit(tx, ctx, { action: 'candidate.tags_updated', entity: 'candidate', entityId: id })
  return { id, tags: unique }
}

export const candidateDuplicates = async (tx: Tx, id: string) => {
  const candidate = await findCandidate(tx, id)
  return tx
    .select({ id: candidates.id, fullName: candidates.fullName, email: candidates.email, city: candidates.city, state: candidates.state, createdAt: candidates.createdAt })
    .from(candidates)
    .where(and(ne(candidates.id, id), sameEmailOrCpf(candidate.email, candidate.cpf)))
    .orderBy(desc(candidates.createdAt))
}

const lastApplicationAt = async (tx: Tx, candidateId: string) => {
  const [row] = await tx
    .select({ createdAt: applications.createdAt })
    .from(applications)
    .where(eq(applications.candidateId, candidateId))
    .orderBy(desc(applications.createdAt))
    .limit(1)
  return row?.createdAt.getTime() ?? 0
}

/**
 * Junta duas fichas da mesma pessoa (decisão do RH, nunca automática). Só
 * aceita fichas com e-mail ou CPF em comum: juntar pessoas diferentes
 * misturaria dados pessoais sem volta.
 */
export const mergeCandidates = async (tx: Tx, ctx: Ctx, id: string, sourceId: string) => {
  if (id === sourceId) throw badRequest('Escolha outra ficha para juntar.')
  const target = await findCandidate(tx, id)
  const source = await findCandidate(tx, sourceId)
  const sameEmail = target.email === source.email
  const sameCpf = target.cpf !== null && target.cpf === source.cpf
  if (!sameEmail && !sameCpf) throw badRequest('Só é possível juntar fichas com o mesmo e-mail ou CPF.')

  const sourceIsNewer = (await lastApplicationAt(tx, sourceId)) > (await lastApplicationAt(tx, id))
  const contact = sourceIsNewer ? source : target
  await tx.update(applications).set({ candidateId: id }).where(eq(applications.candidateId, sourceId))
  await tx.update(candidateFiles).set({ candidateId: id }).where(eq(candidateFiles.candidateId, sourceId))
  await tx
    .update(candidates)
    .set({
      fullName: contact.fullName,
      email: contact.email,
      phone: contact.phone,
      city: contact.city,
      state: contact.state,
      cpf: contact.cpf ?? target.cpf ?? source.cpf,
      linkedin: contact.linkedin ?? target.linkedin ?? source.linkedin,
      tags: [...new Set([...target.tags, ...source.tags])],
      invitedAt: target.invitedAt ?? source.invitedAt,
    })
    .where(eq(candidates.id, id))
  await tx.delete(candidates).where(eq(candidates.id, sourceId))
  await audit(tx, ctx, { action: 'candidate.merged', entity: 'candidate', entityId: id, metadata: { sourceId } })
  return { id }
}

/** Convite por e-mail: só para quem autorizou o banco de talentos (LGPD) e para vaga publicada. */
export const inviteCandidate = async (tx: Tx, ctx: Ctx, webOrigin: string, id: string, jobId: string): Promise<Mail> => {
  const candidate = await findCandidate(tx, id)
  const [job] = await tx
    .select({ title: jobOpenings.title, status: jobOpenings.status, shareToken: jobOpenings.shareToken })
    .from(jobOpenings)
    .where(eq(jobOpenings.id, jobId))
  if (!job) throw notFound('Vaga')
  if (job.status !== 'published') throw badRequest('Só é possível convidar para uma vaga publicada.')

  const [consent] = await tx
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.candidateId, id), eq(applications.talentPoolConsent, true), sql`${applications.retentionUntil} >= ${calendarDate()}`))
    .limit(1)
  if (!consent) throw new AppError(409, 'no_consent', 'Esta pessoa não autorizou contato pelo banco de talentos.')

  await tx.update(candidates).set({ invitedAt: new Date() }).where(eq(candidates.id, id))
  await audit(tx, ctx, { action: 'candidate.invited', entity: 'candidate', entityId: id, metadata: { jobId } })
  const { slug } = await tenantSlug(tx, ctx.tenantId)
  const link = `${webOrigin}/vagas/${slug}/${job.shareToken}`
  return {
    to: candidate.email,
    subject: `A Falcão tem uma vaga para você: ${job.title}`,
    text: `Olá, ${candidate.fullName}!\n\nVocê está no banco de talentos da Falcão e achamos que esta vaga combina com o seu perfil: ${job.title}.\n\nVeja os detalhes e candidate-se: ${link}`,
  }
}
