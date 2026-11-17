import { and, asc, desc, eq, gte, inArray, isNotNull, lte, type SQL } from 'drizzle-orm'

import type { Tx } from '../../db/client'
import { applicationEvents, applications, candidates, jobOpenings, recruitmentStages } from '../../db/schema'

const DAY = 86_400_000
const monthKey = (date: Date) => date.toISOString().slice(0, 7)

export type InsightFilters = { from?: string; to?: string; jobId?: string }

/**
 * Painel executivo de R&S: funil por etapa, onde os candidatos saem,
 * conversão e tempo até contratar.
 */
export const recruitmentInsights = async (tx: Tx, filters: InsightFilters) => {
  const conditions: SQL[] = []
  if (filters.from) conditions.push(gte(applications.createdAt, new Date(`${filters.from}T00:00:00Z`)))
  if (filters.to) conditions.push(lte(applications.createdAt, new Date(`${filters.to}T23:59:59Z`)))
  if (filters.jobId) conditions.push(eq(applications.jobId, filters.jobId))

  const stages = await tx
    .select({ id: recruitmentStages.id, name: recruitmentStages.name, position: recruitmentStages.position })
    .from(recruitmentStages)
    .orderBy(asc(recruitmentStages.position))
  // shortcut: agrega em memória; com dezenas de milhares de candidaturas, mover para GROUP BY.
  const rows = await tx
    .select({ id: applications.id, status: applications.status, stageId: applications.stageId, jobId: applications.jobId, createdAt: applications.createdAt })
    .from(applications)
    .where(and(...conditions))

  const ids = rows.map(r => r.id)
  const outcomes = ids.length
    ? await tx
        .select({
          applicationId: applicationEvents.applicationId,
          outcome: applicationEvents.outcome,
          fromStageId: applicationEvents.fromStageId,
          createdAt: applicationEvents.createdAt,
        })
        .from(applicationEvents)
        .where(and(isNotNull(applicationEvents.outcome), inArray(applicationEvents.applicationId, ids)))
        .orderBy(asc(applicationEvents.createdAt))
    : []
  // Último desfecho de cada candidatura (reabrir e recusar de novo conta a última vez).
  const endedAt = new Map<string, Date>()
  // Recusar limpa a stage_id da candidatura; a etapa da recusa fica no evento.
  const rejectedAt = new Map<string, string | null>()
  for (const o of outcomes) {
    if (o.outcome !== 'reopened') endedAt.set(o.applicationId, o.createdAt)
    if (o.outcome === 'rejected') rejectedAt.set(o.applicationId, o.fromStageId)
  }
  const stageOf = (r: (typeof rows)[number]) => (r.status === 'rejected' ? (rejectedAt.get(r.id) ?? null) : r.stageId)

  const position = new Map(stages.map((s, i) => [s.id, i]))
  const last = stages.length - 1
  const reached = rows.map(r => {
    if (r.status === 'hired') return last
    const stage = stageOf(r)
    return stage ? (position.get(stage) ?? -1) : -1
  })
  const hired = rows.filter(r => r.status === 'hired')
  const rejected = rows.filter(r => r.status === 'rejected')

  const days = hired.flatMap(r => {
    const end = endedAt.get(r.id)
    return end ? [(end.getTime() - r.createdAt.getTime()) / DAY] : []
  })

  const months: string[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) months.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))))
  const endedIn = (list: typeof rows, month: string) => list.filter(r => endedAt.has(r.id) && monthKey(endedAt.get(r.id)!) === month).length

  const jobs = await tx
    .select({ id: jobOpenings.id, title: jobOpenings.title, status: jobOpenings.status, openings: jobOpenings.openings, hiredCount: jobOpenings.hiredCount })
    .from(jobOpenings)
    .where(inArray(jobOpenings.status, ['published', 'paused']))
    .orderBy(asc(jobOpenings.title))

  const recent = await tx
    .select({
      id: applicationEvents.id,
      outcome: applicationEvents.outcome,
      fromLabel: applicationEvents.fromLabel,
      toLabel: applicationEvents.toLabel,
      applicationId: applicationEvents.applicationId,
      candidateName: candidates.fullName,
      jobTitle: jobOpenings.title,
      createdAt: applicationEvents.createdAt,
    })
    .from(applicationEvents)
    .innerJoin(applications, eq(applications.id, applicationEvents.applicationId))
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(jobOpenings, eq(jobOpenings.id, applications.jobId))
    .where(filters.jobId ? eq(applications.jobId, filters.jobId) : undefined)
    .orderBy(desc(applicationEvents.createdAt))
    .limit(12)

  return {
    totals: {
      applications: rows.length,
      open: rows.filter(r => r.status === 'open').length,
      hired: hired.length,
      rejected: rejected.length,
      openJobs: jobs.filter(j => j.status === 'published').length,
      openings: jobs.filter(j => j.status === 'published').reduce((sum, j) => sum + Math.max(0, j.openings - j.hiredCount), 0),
      conversionRate: rows.length ? hired.length / rows.length : null,
      avgDaysToHire: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null,
    },
    stages: stages.map((s, i) => ({
      id: s.id,
      name: s.name,
      current: rows.filter(r => r.status === 'open' && r.stageId === s.id).length,
      reached: reached.filter(p => p >= i).length,
      rejected: rejected.filter(r => stageOf(r) === s.id).length,
    })),
    monthly: months.map(month => ({
      month,
      received: rows.filter(r => monthKey(r.createdAt) === month).length,
      hired: endedIn(hired, month),
      rejected: endedIn(rejected, month),
    })),
    byJob: jobs.map(job => {
      const of = rows.filter(r => r.jobId === job.id)
      return {
        ...job,
        open: of.filter(r => r.status === 'open').length,
        rejected: of.filter(r => r.status === 'rejected').length,
      }
    }),
    recent,
  }
}
