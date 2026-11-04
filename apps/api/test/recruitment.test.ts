import { randomBytes, randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { addDaysIso } from '@falcao-rh/contracts'

import { applicationAnswers, applications, auditLogs, candidates, recruitmentStages } from '../src/db/schema'
import { calendarDate } from '../src/lib/dates'
import { createTestApp, type TestApp } from './harness'

type Role = 'admin' | 'hr' | 'manager' | 'employee'

let t: TestApp
let org: Awaited<ReturnType<TestApp['seedTenant']>>
let other: Awaited<ReturnType<TestApp['seedTenant']>>
let stages: { id: string; name: string }[]

const call = (role: Role, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object, who = org) =>
  t.app.inject({ method, url: `/api/v1${url}`, headers: { cookie: who.users[role]!.cookie }, ...(payload ? { payload } : {}) })

const jobBody = (extra: object = {}) => ({
  title: 'Mestre de obras',
  contractType: 'clt',
  city: 'Recife',
  state: 'PE',
  workMode: 'site',
  description: 'Coordenar equipes de obra residencial na região metropolitana.',
  openings: 1,
  questions: [{ kind: 'yes_no', label: 'Tem NR-35 válida?', required: true }],
  ...extra,
})

/** Candidatura criada direto no banco (como a página pública faria). */
const seedApplication = async (jobId: string, extra: Partial<typeof applications.$inferInsert> = {}, email = `${randomUUID()}@exemplo.com`) => {
  const candidateId = randomUUID()
  await t.db.insert(candidates).values({ id: candidateId, tenantId: org.tenant.id, fullName: 'Candidato Teste', email, phone: '81999998888', city: 'Recife', state: 'PE' })
  const [row] = await t.db
    .insert(applications)
    .values({
      tenantId: org.tenant.id,
      jobId,
      candidateId,
      email,
      status: 'open',
      stageId: stages[0]!.id,
      privacyToken: randomBytes(32).toString('base64url'),
      ...extra,
    })
    .returning()
  return row!
}

beforeAll(async () => {
  t = await createTestApp()
  org = await t.seedTenant('recrut', ['admin', 'hr', 'manager', 'employee'])
  other = await t.seedTenant('recrut-b', ['admin', 'hr', 'manager'])
  stages = await t.db
    .select({ id: recruitmentStages.id, name: recruitmentStages.name })
    .from(recruitmentStages)
    .where(eq(recruitmentStages.tenantId, org.tenant.id))
    .orderBy(recruitmentStages.position)
})

afterAll(() => t.close())

describe('vagas internas', () => {
  let jobId: string

  it('RH cria a vaga como rascunho, com token e link de divulgação', async () => {
    const response = await call('hr', 'POST', '/jobs', jobBody({ managerUserId: org.users.manager!.id }))
    expect(response.statusCode).toBe(201)
    const job = response.json()
    expect(job).toMatchObject({ title: 'Mestre de obras', status: 'draft', managerUserId: org.users.manager!.id })
    expect(job.shareUrl).toMatch(new RegExp(`^${t.env.WEB_ORIGIN}/vagas/recrut/[A-Za-z0-9_-]{40,}$`))
    expect(job.questions).toHaveLength(1)
    expect(job.questions[0].id).toEqual(expect.any(String))
    jobId = job.id
    const [log] = await t.db.select().from(auditLogs).where(and(eq(auditLogs.action, 'job.created'), eq(auditLogs.entityId, jobId)))
    expect(log).toBeDefined()
  })

  it('publica, pausa, volta a publicar e encerra; encerrar de novo é recusado', async () => {
    const published = await call('hr', 'POST', `/jobs/${jobId}/status`, { status: 'published' })
    expect(published.statusCode).toBe(200)
    expect(published.json().publishedAt).not.toBeNull()
    expect((await call('hr', 'POST', `/jobs/${jobId}/status`, { status: 'paused' })).json().status).toBe('paused')
    expect((await call('hr', 'POST', `/jobs/${jobId}/status`, { status: 'published' })).json().status).toBe('published')
    const closed = await call('hr', 'POST', `/jobs/${jobId}/status`, { status: 'closed' })
    expect(closed.json()).toMatchObject({ status: 'closed', closedAt: expect.any(String) })
    expect((await call('hr', 'POST', `/jobs/${jobId}/status`, { status: 'closed' })).statusCode).toBe(400)
    expect((await call('hr', 'POST', `/jobs/${jobId}/status`, { status: 'published' })).statusCode).toBe(400)
  })

  it('não publica rascunho sem cidade e UF', async () => {
    const draft = (await call('hr', 'POST', '/jobs', jobBody({ city: '', state: undefined }))).json()
    const response = await call('hr', 'POST', `/jobs/${draft.id}/status`, { status: 'published' })
    expect(response.statusCode).toBe(400)
    expect(response.json().message).toBe('Informe cidade e UF antes de publicar a vaga.')
  })

  it('recusa gestor responsável que não é da organização', async () => {
    const response = await call('hr', 'POST', '/jobs', jobBody({ managerUserId: other.users.manager!.id }))
    expect(response.statusCode).toBe(400)
  })

  it('gestor vê só as vagas em que é responsável; não cria; colaborador não lista', async () => {
    const mine = (await call('hr', 'POST', '/jobs', jobBody({ title: 'Vaga do gestor', managerUserId: org.users.manager!.id }))).json()
    const notMine = (await call('hr', 'POST', '/jobs', jobBody({ title: 'Vaga sem gestor' }))).json()
    const list = (await call('manager', 'GET', '/jobs')).json() as { id: string }[]
    expect(list.map(j => j.id)).toContain(mine.id)
    expect(list.map(j => j.id)).not.toContain(notMine.id)
    expect((await call('manager', 'GET', `/jobs/${notMine.id}`)).statusCode).toBe(404)
    expect((await call('manager', 'POST', '/jobs', jobBody())).statusCode).toBe(403)
    expect((await call('employee', 'GET', '/jobs')).statusCode).toBe(403)
  })

  it('RH de outra empresa não enxerga a vaga', async () => {
    expect((await call('hr', 'GET', `/jobs/${jobId}`, undefined, other)).statusCode).toBe(404)
  })

  it('edita a vaga mantendo perguntas pelo id; não remove pergunta já respondida', async () => {
    const job = (await call('hr', 'POST', '/jobs', jobBody({ title: 'Eletricista' }))).json()
    const question = job.questions[0]
    const kept = await call('hr', 'PUT', `/jobs/${job.id}`, jobBody({ title: 'Eletricista predial', questions: [{ ...question, label: 'Tem NR-10 válida?' }] }))
    expect(kept.statusCode).toBe(200)
    expect(kept.json().questions).toEqual([expect.objectContaining({ id: question.id, label: 'Tem NR-10 válida?' })])

    const application = await seedApplication(job.id)
    await t.db.insert(applicationAnswers).values({ tenantId: org.tenant.id, applicationId: application.id, questionId: question.id, value: 'sim' })
    const removed = await call('hr', 'PUT', `/jobs/${job.id}`, jobBody({ title: 'Eletricista predial', questions: [] }))
    expect(removed.statusCode).toBe(409)
    expect(removed.json().message).toBe('Esta pergunta já tem respostas.')
  })

  it('lista com contagem por etapa e por desfecho', async () => {
    const job = (await call('hr', 'POST', '/jobs', jobBody({ title: 'Armador' }))).json()
    await seedApplication(job.id)
    await seedApplication(job.id, { stageId: stages[1]!.id })
    await seedApplication(job.id, { status: 'rejected', stageId: null, rejectionReason: 'Sem experiência' })
    const item = ((await call('hr', 'GET', '/jobs')).json() as { id: string; counts: unknown; total: number }[]).find(j => j.id === job.id)!
    expect(item.counts).toEqual({ stages: { [stages[0]!.id]: 1, [stages[1]!.id]: 1 }, hired: 0, rejected: 1 })
    expect(item.total).toBe(3)
  })

  it('encerrar define o prazo de retenção só nas candidaturas sem consentimento', async () => {
    const job = (await call('hr', 'POST', '/jobs', jobBody({ title: 'Servente' }))).json()
    await call('hr', 'POST', `/jobs/${job.id}/status`, { status: 'published' })
    const without = await seedApplication(job.id, { status: 'rejected', stageId: null, rejectionReason: 'Perfil' })
    const consented = await seedApplication(job.id, { talentPoolConsent: true, consentAt: new Date(), retentionUntil: '2028-01-01' })
    await call('hr', 'POST', `/jobs/${job.id}/status`, { status: 'closed' })

    const [a] = await t.db.select().from(applications).where(eq(applications.id, without.id))
    const [b] = await t.db.select().from(applications).where(eq(applications.id, consented.id))
    const sixMonths = new Date()
    sixMonths.setMonth(sixMonths.getMonth() + 6)
    expect(a!.retentionUntil).toBe(calendarDate(sixMonths))
    expect(b!.retentionUntil).toBe('2028-01-01')
    expect(addDaysIso(a!.retentionUntil!, 0)).toBe(a!.retentionUntil)
  })
})
