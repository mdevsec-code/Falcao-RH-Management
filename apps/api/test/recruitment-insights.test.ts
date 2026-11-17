import { randomBytes, randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applications, candidates, recruitmentStages } from '../src/db/schema'
import { createTestApp, type TestApp } from './harness'

let t: TestApp
let org: Awaited<ReturnType<TestApp['seedTenant']>>
let stages: { id: string; name: string }[]

const call = (role: 'hr' | 'manager', method: 'GET' | 'POST', url: string, payload?: object) =>
  t.app.inject({ method, url: `/api/v1${url}`, headers: { cookie: org.users[role]!.cookie }, ...(payload ? { payload } : {}) })

const seedApplication = async (jobId: string) => {
  const candidateId = randomUUID()
  const email = `${candidateId}@exemplo.com`
  await t.db.insert(candidates).values({ id: candidateId, tenantId: org.tenant.id, fullName: 'Pessoa Teste', email, phone: '81999998888', city: 'Recife', state: 'PE' })
  const [row] = await t.db
    .insert(applications)
    .values({ tenantId: org.tenant.id, jobId, candidateId, email, status: 'open', stageId: stages[0]!.id, privacyToken: randomBytes(32).toString('base64url') })
    .returning()
  return row!.id
}

beforeAll(async () => {
  t = await createTestApp()
  org = await t.seedTenant('insights', ['admin', 'hr', 'manager'])
  stages = await t.db
    .select({ id: recruitmentStages.id, name: recruitmentStages.name })
    .from(recruitmentStages)
    .where(eq(recruitmentStages.tenantId, org.tenant.id))
    .orderBy(recruitmentStages.position)
})

afterAll(() => t.close())

describe('painel de R&S', () => {
  it('funil e recusa na etapa em que aconteceu; só RH e administração', async () => {
    const jobId = (
      await call('hr', 'POST', '/jobs', {
        title: 'Armador',
        contractType: 'clt',
        city: 'Recife',
        state: 'PE',
        workMode: 'site',
        description: 'Armação de ferragens em obra residencial.',
        openings: 2,
      })
    ).json().id
    const [a, b] = [await seedApplication(jobId), await seedApplication(jobId)]
    await call('hr', 'POST', `/applications/${a}/stage`, { stageId: stages[3]!.id })
    await call('hr', 'POST', `/applications/${b}/stage`, { stageId: stages[3]!.id })
    expect((await call('hr', 'POST', `/applications/${b}/stage`, { outcome: 'rejected', reason: 'Sem experiência' })).statusCode).toBe(200)

    const res = await call('hr', 'GET', '/recruitment/insights')
    expect(res.statusCode).toBe(200)
    const data = res.json()
    expect(data.totals).toMatchObject({ applications: 2, open: 1, rejected: 1, hired: 0, conversionRate: 0 })
    expect(data.stages[3]).toMatchObject({ name: 'Agendar entrevista', current: 1, rejected: 1, reached: 2 })
    expect(data.stages[4]).toMatchObject({ reached: 0 })
    expect(data.recent[0]).toMatchObject({ outcome: 'rejected', candidateName: 'Pessoa Teste', jobTitle: 'Armador' })

    expect((await call('manager', 'GET', '/recruitment/insights')).statusCode).toBe(403)
  })
})
