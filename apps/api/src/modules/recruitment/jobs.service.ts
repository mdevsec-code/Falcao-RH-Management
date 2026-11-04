import { randomBytes } from 'node:crypto'
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm'

import { RECRUITMENT_DEFAULTS, type JobInput, type JobStatus, type TenantSettings } from '@falcao-rh/contracts'

import type { Tx } from '../../db/client'
import { applicationAnswers, applications, departments, jobOpenings, jobQuestions, memberships, tenants, user } from '../../db/schema'
import type { Ctx } from '../../http/context'
import { audit, changedKeys } from '../../lib/audit'
import { calendarDate } from '../../lib/dates'
import { AppError, badRequest, notFound } from '../../lib/errors'

/** Gestor só enxerga as vagas em que é o responsável; RH e administrador, todas. */
const scope = (ctx: Ctx) => (ctx.role === 'manager' ? eq(jobOpenings.managerUserId, ctx.userId) : undefined)

const shareUrl = (webOrigin: string, slug: string, token: string) => `${webOrigin}/vagas/${slug}/${token}`

const tenantSlug = async (tx: Tx, tenantId: string) => {
  const [tenant] = await tx.select({ slug: tenants.slug, settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId))
  if (!tenant) throw notFound('Organização')
  return tenant
}

/** O gestor responsável precisa ter acesso ativo à organização como gestor, RH ou administrador. */
const checkManager = async (tx: Tx, ctx: Ctx, managerUserId: string | null) => {
  if (!managerUserId) return
  const [member] = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.tenantId, ctx.tenantId),
        eq(memberships.userId, managerUserId),
        eq(memberships.status, 'active'),
        inArray(memberships.role, ['admin', 'hr', 'manager']),
      ),
    )
  if (!member) throw badRequest('O gestor responsável precisa ser gestor, RH ou administrador desta organização.')
}

const jobColumns = {
  id: jobOpenings.id,
  title: jobOpenings.title,
  departmentId: jobOpenings.departmentId,
  departmentName: departments.name,
  unitId: jobOpenings.unitId,
  positionId: jobOpenings.positionId,
  contractType: jobOpenings.contractType,
  city: jobOpenings.city,
  state: jobOpenings.state,
  workMode: jobOpenings.workMode,
  salaryMin: jobOpenings.salaryMin,
  salaryMax: jobOpenings.salaryMax,
  showSalary: jobOpenings.showSalary,
  description: jobOpenings.description,
  requirements: jobOpenings.requirements,
  benefits: jobOpenings.benefits,
  openings: jobOpenings.openings,
  hiredCount: jobOpenings.hiredCount,
  managerUserId: jobOpenings.managerUserId,
  managerName: user.name,
  visibility: jobOpenings.visibility,
  status: jobOpenings.status,
  shareToken: jobOpenings.shareToken,
  publishedAt: jobOpenings.publishedAt,
  closedAt: jobOpenings.closedAt,
  createdAt: jobOpenings.createdAt,
}

const toNumber = (value: string | null) => (value === null ? null : Number(value))

/** Contagem por etapa (candidaturas em andamento) e por desfecho, por vaga. */
const countsFor = async (tx: Tx, jobIds: string[]) => {
  const result = new Map<string, { stages: Record<string, number>; hired: number; rejected: number }>()
  for (const id of jobIds) result.set(id, { stages: {}, hired: 0, rejected: 0 })
  if (jobIds.length === 0) return result
  const rows = await tx
    .select({ jobId: applications.jobId, status: applications.status, stageId: applications.stageId, total: count() })
    .from(applications)
    .where(inArray(applications.jobId, jobIds))
    .groupBy(applications.jobId, applications.status, applications.stageId)
  for (const row of rows) {
    const entry = result.get(row.jobId)!
    if (row.status === 'open' && row.stageId) entry.stages[row.stageId] = row.total
    else if (row.status === 'hired') entry.hired += row.total
    else if (row.status === 'rejected') entry.rejected += row.total
  }
  return result
}

export const listJobs = async (tx: Tx, ctx: Ctx, webOrigin: string, status?: JobStatus) => {
  const { slug } = await tenantSlug(tx, ctx.tenantId)
  const rows = await tx
    .select(jobColumns)
    .from(jobOpenings)
    .leftJoin(departments, eq(departments.id, jobOpenings.departmentId))
    .leftJoin(user, eq(user.id, jobOpenings.managerUserId))
    .where(and(scope(ctx), status ? eq(jobOpenings.status, status) : undefined))
    .orderBy(desc(jobOpenings.createdAt))
  const counts = await countsFor(tx, rows.map(r => r.id))
  return rows.map(({ shareToken, salaryMin, salaryMax, ...job }) => {
    const c = counts.get(job.id)!
    const open = Object.values(c.stages).reduce((sum, n) => sum + n, 0)
    return {
      ...job,
      salaryMin: toNumber(salaryMin),
      salaryMax: toNumber(salaryMax),
      shareUrl: shareUrl(webOrigin, slug, shareToken),
      counts: c,
      total: open + c.hired + c.rejected,
    }
  })
}

export const getJob = async (tx: Tx, ctx: Ctx, webOrigin: string, id: string) => {
  const [row] = await tx
    .select(jobColumns)
    .from(jobOpenings)
    .leftJoin(departments, eq(departments.id, jobOpenings.departmentId))
    .leftJoin(user, eq(user.id, jobOpenings.managerUserId))
    .where(and(eq(jobOpenings.id, id), scope(ctx)))
  if (!row) throw notFound('Vaga')
  const { slug } = await tenantSlug(tx, ctx.tenantId)
  const questions = await tx
    .select({ id: jobQuestions.id, kind: jobQuestions.kind, label: jobQuestions.label, options: jobQuestions.options, required: jobQuestions.required })
    .from(jobQuestions)
    .where(eq(jobQuestions.jobId, id))
    .orderBy(asc(jobQuestions.position))
  const { shareToken, salaryMin, salaryMax, ...job } = row
  return {
    ...job,
    salaryMin: toNumber(salaryMin),
    salaryMax: toNumber(salaryMax),
    shareUrl: shareUrl(webOrigin, slug, shareToken),
    questions,
  }
}

const jobValues = (input: JobInput) => ({
  title: input.title,
  departmentId: input.departmentId,
  unitId: input.unitId,
  positionId: input.positionId,
  contractType: input.contractType,
  city: input.city,
  state: input.state ?? null,
  workMode: input.workMode,
  salaryMin: input.salaryMin === null ? null : String(input.salaryMin),
  salaryMax: input.salaryMax === null ? null : String(input.salaryMax),
  showSalary: input.showSalary,
  description: input.description,
  requirements: input.requirements,
  benefits: input.benefits,
  openings: input.openings,
  managerUserId: input.managerUserId,
  visibility: input.visibility,
})

/**
 * Perguntas: as que vêm com id são atualizadas, as sem id são criadas e as
 * que sumiram são apagadas, exceto se já tiverem respostas.
 */
const saveQuestions = async (tx: Tx, ctx: Ctx, jobId: string, questions: JobInput['questions']) => {
  const existing = await tx.select({ id: jobQuestions.id }).from(jobQuestions).where(eq(jobQuestions.jobId, jobId))
  const existingIds = new Set(existing.map(q => q.id))
  const keepIds = questions.map(q => q.id).filter((id): id is string => Boolean(id))
  for (const id of keepIds) if (!existingIds.has(id)) throw badRequest('Pergunta não pertence a esta vaga.')

  const removed = [...existingIds].filter(id => !keepIds.includes(id))
  if (removed.length) {
    const [answered] = await tx
      .select({ id: applicationAnswers.id })
      .from(applicationAnswers)
      .where(inArray(applicationAnswers.questionId, removed))
      .limit(1)
    if (answered) throw new AppError(409, 'question_answered', 'Esta pergunta já tem respostas.')
    await tx.delete(jobQuestions).where(inArray(jobQuestions.id, removed))
  }
  for (const [position, question] of questions.entries()) {
    const values = { kind: question.kind, label: question.label, options: question.options ?? null, required: question.required, position }
    if (question.id) await tx.update(jobQuestions).set(values).where(eq(jobQuestions.id, question.id))
    else await tx.insert(jobQuestions).values({ tenantId: ctx.tenantId, jobId, ...values })
  }
}

export const createJob = async (tx: Tx, ctx: Ctx, webOrigin: string, input: JobInput) => {
  await checkManager(tx, ctx, input.managerUserId)
  const [job] = await tx
    .insert(jobOpenings)
    .values({
      tenantId: ctx.tenantId,
      ...jobValues(input),
      status: 'draft',
      shareToken: randomBytes(32).toString('base64url'),
      createdBy: ctx.userId,
    })
    .returning({ id: jobOpenings.id })
  await saveQuestions(tx, ctx, job!.id, input.questions)
  await audit(tx, ctx, { action: 'job.created', entity: 'job_opening', entityId: job!.id })
  return getJob(tx, ctx, webOrigin, job!.id)
}

export const updateJob = async (tx: Tx, ctx: Ctx, webOrigin: string, id: string, input: JobInput) => {
  const before = await getJob(tx, ctx, webOrigin, id)
  if (before.status === 'closed') throw badRequest('Vaga encerrada não pode ser editada.')
  await checkManager(tx, ctx, input.managerUserId)
  const values = jobValues(input)
  await tx.update(jobOpenings).set(values).where(eq(jobOpenings.id, id))
  await saveQuestions(tx, ctx, id, input.questions)
  await audit(tx, ctx, {
    action: 'job.updated',
    entity: 'job_opening',
    entityId: id,
    changedFields: changedKeys(before as unknown as Record<string, unknown>, values),
  })
  return getJob(tx, ctx, webOrigin, id)
}

const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  draft: ['published'],
  published: ['paused', 'closed'],
  paused: ['published', 'closed'],
  closed: [],
}

const addMonths = (date: Date, months: number) => {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return calendarDate(result)
}

export const changeJobStatus = async (tx: Tx, ctx: Ctx, webOrigin: string, id: string, status: JobStatus) => {
  const job = await getJob(tx, ctx, webOrigin, id)
  if (!TRANSITIONS[job.status].includes(status)) throw badRequest('Esta mudança de situação não é permitida para a vaga.')
  if (status === 'published' && (!job.city || !job.state)) throw badRequest('Informe cidade e UF antes de publicar a vaga.')

  const now = new Date()
  await tx
    .update(jobOpenings)
    .set({
      status,
      ...(status === 'published' && !job.publishedAt ? { publishedAt: now } : {}),
      ...(status === 'closed' ? { closedAt: now } : {}),
    })
    .where(eq(jobOpenings.id, id))

  // Encerrada: candidaturas sem consentimento ao banco de talentos passam a
  // ter prazo de exclusão (a vaga fechada encerra o processo de todas elas).
  if (status === 'closed') {
    const { settings } = await tenantSlug(tx, ctx.tenantId)
    const months =
      (settings as TenantSettings).recruitment?.retentionMonthsWithoutConsent ?? RECRUITMENT_DEFAULTS.retentionMonthsWithoutConsent
    await tx
      .update(applications)
      .set({ retentionUntil: addMonths(now, months) })
      .where(and(eq(applications.jobId, id), eq(applications.talentPoolConsent, false)))
  }
  await audit(tx, ctx, { action: 'job.status_changed', entity: 'job_opening', entityId: id, metadata: { from: job.status, to: status } })
  return getJob(tx, ctx, webOrigin, id)
}
