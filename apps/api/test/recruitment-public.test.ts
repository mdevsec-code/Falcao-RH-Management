import { randomBytes, randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applicationAnswers, applicationEvents, applications, auditLogs, candidateFiles, candidates, departments, jobOpenings, jobQuestions, notifications } from '../src/db/schema'
import { createTestApp, type TestApp } from './harness'

let t: TestApp
let org: Awaited<ReturnType<TestApp['seedTenant']>>
let other: Awaited<ReturnType<TestApp['seedTenant']>>
const jobs: Record<string, { id: string; token: string }> = {}
let requiredQuestion: string

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')
const EXE = Buffer.from('MZ\x90\x00\x03\x00\x00\x00 programa executável disfarçado')

/** Vaga criada direto no banco (operação de sistema), como o RH faria pela API interna. */
const createJob = async (tenantId: string, extra: Partial<typeof jobOpenings.$inferInsert> = {}) => {
  const token = randomBytes(32).toString('base64url')
  const [row] = await t.db
    .insert(jobOpenings)
    .values({
      tenantId,
      title: 'Pedreiro de acabamento',
      contractType: 'clt',
      city: 'Recife',
      state: 'PE',
      workMode: 'site',
      description: 'Obra residencial na zona norte, acabamento fino em apartamentos.',
      visibility: 'public',
      status: 'published',
      shareToken: token,
      publishedAt: new Date(),
      ...extra,
    })
    .returning({ id: jobOpenings.id })
  return { id: row!.id, token }
}

const get = (url: string) => t.app.inject({ method: 'GET', url: `/api/public/v1${url}` })

type Form = Record<string, string>
const validForm = (extra: Form = {}): Form => ({
  fullName: 'Maria das Dores Silva',
  email: 'maria.silva@exemplo.com',
  phone: '(81) 99876-5432',
  city: 'Recife',
  state: 'PE',
  privacyConsent: 'true',
  talentPoolConsent: 'true',
  website: '',
  startedAt: String(Date.now() - 60_000),
  answers: JSON.stringify({ [requiredQuestion]: 'sim' }),
  ...extra,
})

/** Envio como o navegador faz: campos antes do arquivo. */
const apply = (slug: string, token: string, fields: Form, file: { name: string; bytes: Buffer } = { name: 'curriculo.pdf', bytes: PDF }) => {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  form.append('file', new Blob([new Uint8Array(file.bytes)], { type: 'application/pdf' }), file.name)
  return t.app.inject({ method: 'POST', url: `/api/public/v1/${slug}/jobs/${token}/applications`, payload: form as never })
}

const count = async (table: typeof candidates | typeof applications | typeof candidateFiles, tenantId: string) =>
  (await t.db.select({ id: table.id }).from(table).where(eq(table.tenantId, tenantId))).length

beforeAll(async () => {
  t = await createTestApp()
  org = await t.seedTenant('vagas', ['admin', 'hr', 'manager'])
  other = await t.seedTenant('outra', ['admin'])

  const [dept] = await t.db.insert(departments).values({ tenantId: org.tenant.id, name: 'Obras' }).returning()
  jobs.main = await createJob(org.tenant.id, { departmentId: dept!.id, managerUserId: org.users.manager!.id, salaryMin: '2500', salaryMax: '3200', showSalary: true })
  jobs.unlisted = await createJob(org.tenant.id, { title: 'Engenheiro residente', visibility: 'unlisted' })
  jobs.draft = await createJob(org.tenant.id, { title: 'Rascunho', status: 'draft', publishedAt: null })
  jobs.paused = await createJob(org.tenant.id, { title: 'Armador', status: 'paused' })
  jobs.foreign = await createJob(other.tenant.id, { title: 'Vaga da outra empresa' })

  const [question] = await t.db
    .insert(jobQuestions)
    .values({ tenantId: org.tenant.id, jobId: jobs.main.id, position: 0, kind: 'yes_no', label: 'Tem NR-35 válida?', required: true })
    .returning()
  requiredQuestion = question!.id
})

afterAll(() => t.close())

describe('página pública de vagas', () => {
  it('lista só as vagas públicas e publicadas da organização, com o nome da empresa', async () => {
    const response = await get('/vagas/jobs')
    expect(response.statusCode).toBe(200)
    const body = response.json() as { company: { name: string }; jobs: { title: string; token: string; departmentName: string | null; salary: unknown }[] }
    expect(body.company.name).toBe('Empresa vagas')
    expect(body.jobs.map(j => j.title)).toEqual(['Pedreiro de acabamento'])
    expect(body.jobs[0]!.departmentName).toBe('Obras')
    expect(body.jobs[0]!.salary).toEqual({ min: 2500, max: 3200 })
  })

  it('abre a vaga não listada pelo token, mas não pelo id', async () => {
    const byToken = await get(`/vagas/jobs/${jobs.unlisted!.token}`)
    expect(byToken.statusCode).toBe(200)
    expect(byToken.json()).toMatchObject({ title: 'Engenheiro residente', accepting: true })
    expect((await get(`/vagas/jobs/${jobs.unlisted!.id}`)).statusCode).toBe(404)
  })

  it('não abre rascunho, vaga de outra empresa nem página inexistente', async () => {
    expect((await get(`/vagas/jobs/${jobs.draft!.token}`)).statusCode).toBe(404)
    expect((await get(`/vagas/jobs/${jobs.foreign!.token}`)).statusCode).toBe(404)
    const missing = await get('/nao-existe/jobs')
    expect(missing.statusCode).toBe(404)
    expect(missing.json().message).toBe('Página de vagas não encontrada.')
  })

  it('mostra as perguntas da vaga no detalhe', async () => {
    const body = (await get(`/vagas/jobs/${jobs.main!.token}`)).json()
    expect(body.questions).toEqual([{ id: requiredQuestion, kind: 'yes_no', label: 'Tem NR-35 válida?', options: null, required: true }])
  })

  it('vaga pausada aparece com o aviso e recusa candidaturas', async () => {
    const detail = await get(`/vagas/jobs/${jobs.paused!.token}`)
    expect(detail.json()).toMatchObject({ title: 'Armador', accepting: false })
    const response = await apply('vagas', jobs.paused!.token, validForm({ answers: '{}' }))
    expect(response.statusCode).toBe(409)
    expect(response.json().message).toBe('Esta vaga não está recebendo candidaturas.')
  })

  it('nenhuma resposta pública traz dados de candidatos', async () => {
    for (const url of ['/vagas/jobs', `/vagas/jobs/${jobs.main!.token}`]) {
      const text = (await get(url)).body
      expect(text).not.toMatch(/"(email|phone|cpf|privacyToken)"/)
      expect(text).not.toContain(jobs.main!.id)
    }
  })
})

describe('candidatura pública', () => {
  it('grava candidato, candidatura na etapa inicial, arquivo pendente, avisa o candidato e o RH', async () => {
    const before = await count(applications, org.tenant.id)
    const response = await apply('vagas', jobs.main!.token, validForm())
    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({ ok: true })

    expect(await count(applications, org.tenant.id)).toBe(before + 1)
    const [application] = await t.db.select().from(applications).where(eq(applications.jobId, jobs.main!.id))
    expect(application).toMatchObject({ status: 'open', email: 'maria.silva@exemplo.com', talentPoolConsent: true })
    expect(application!.consentAt).not.toBeNull()
    expect(application!.retentionUntil).not.toBeNull()

    const [event] = await t.db.select().from(applicationEvents).where(eq(applicationEvents.applicationId, application!.id))
    expect(event).toMatchObject({ toLabel: 'Novo', actorUserId: null, fromStageId: null })

    const [file] = await t.db.select().from(candidateFiles).where(eq(candidateFiles.applicationId, application!.id))
    expect(file).toMatchObject({ scanStatus: 'pending', filename: 'curriculo.pdf' })
    expect(file!.storageKey).toMatch(new RegExp(`^recruitment/${org.tenant.id}/[0-9a-f-]+\\.pdf$`))

    const mail = t.mailer.sent.find(m => m.to === 'maria.silva@exemplo.com')
    expect(mail?.subject).toBe('Recebemos sua candidatura: Pedreiro de acabamento')
    expect(mail?.text).toContain(`${t.env.WEB_ORIGIN}/vagas/privacidade/${application!.privacyToken}`)

    const notified = await t.db.select({ userId: notifications.userId }).from(notifications).where(eq(notifications.kind, 'application_received'))
    expect(notified.map(n => n.userId).sort()).toEqual([org.users.hr!.id, org.users.manager!.id].sort())
  })

  it('recusa a mesma pessoa na mesma vaga, mesmo com maiúsculas diferentes', async () => {
    const response = await apply('vagas', jobs.main!.token, validForm({ email: 'MARIA.Silva@Exemplo.com' }))
    expect(response.statusCode).toBe(409)
    expect(response.json().message).toBe('Você já se candidatou a esta vaga.')
  })

  it('sem consentimento ao banco de talentos não define prazo de retenção', async () => {
    const response = await apply('vagas', jobs.unlisted!.token, validForm({ email: 'sem.consentimento@exemplo.com', talentPoolConsent: 'false', answers: '{}' }))
    expect(response.statusCode).toBe(201)
    const [application] = await t.db.select().from(applications).where(eq(applications.email, 'sem.consentimento@exemplo.com'))
    expect(application).toMatchObject({ talentPoolConsent: false, consentAt: null, retentionUntil: null })
  })

  it('campo-armadilha preenchido ou envio rápido demais: responde 201 sem gravar', async () => {
    const before = await count(candidates, org.tenant.id)
    expect((await apply('vagas', jobs.main!.token, validForm({ email: 'robo1@exemplo.com', website: 'http://spam' }))).statusCode).toBe(201)
    expect((await apply('vagas', jobs.main!.token, validForm({ email: 'robo2@exemplo.com', startedAt: String(Date.now() - 1000) }))).statusCode).toBe(201)
    expect(await count(candidates, org.tenant.id)).toBe(before)
  })

  it('exige as respostas obrigatórias e recusa perguntas que a vaga não tem', async () => {
    const missing = await apply('vagas', jobs.main!.token, validForm({ email: 'faltou@exemplo.com', answers: '{}' }))
    expect(missing.statusCode).toBe(400)
    const unknown = await apply('vagas', jobs.main!.token, validForm({ email: 'estranha@exemplo.com', answers: JSON.stringify({ [requiredQuestion]: 'sim', [randomUUID()]: 'x' }) }))
    expect(unknown.statusCode).toBe(400)
  })

  it('recusa arquivo que não é PDF, mesmo com extensão .pdf', async () => {
    const before = await count(candidates, org.tenant.id)
    const response = await apply('vagas', jobs.main!.token, validForm({ email: 'exe@exemplo.com' }), { name: 'curriculo.pdf', bytes: EXE })
    expect(response.statusCode).toBe(400)
    expect(response.json().message).toBe('Envie o currículo em PDF.')
    expect(await count(candidates, org.tenant.id)).toBe(before)
  })

  it('valida o formulário (consentimento obrigatório)', async () => {
    const response = await apply('vagas', jobs.main!.token, validForm({ email: 'semaceite@exemplo.com', privacyConsent: 'false' }))
    expect(response.statusCode).toBe(400)
  })

  it('não aceita candidatura em vaga de outra empresa pelo endereço desta', async () => {
    const response = await apply('vagas', jobs.foreign!.token, validForm({ email: 'cruzada@exemplo.com', answers: '{}' }))
    expect(response.statusCode).toBe(404)
  })
})

describe('privacidade do candidato', () => {
  const privacy = (token: string, action: 'erase' | 'renew') =>
    t.app.inject({ method: 'POST', url: `/api/public/v1/privacy/${token}/${action}` })

  it('exclusão a pedido apaga ficha, candidaturas, respostas e o arquivo, e audita sem dados pessoais', async () => {
    expect((await apply('vagas', jobs.main!.token, validForm({ email: 'apagar@exemplo.com' }))).statusCode).toBe(201)
    const [application] = await t.db.select().from(applications).where(eq(applications.email, 'apagar@exemplo.com'))
    const [file] = await t.db.select().from(candidateFiles).where(eq(candidateFiles.applicationId, application!.id))

    const response = await privacy(application!.privacyToken, 'erase')
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })

    expect(await t.db.select().from(candidates).where(eq(candidates.id, application!.candidateId))).toHaveLength(0)
    expect(await t.db.select().from(applications).where(eq(applications.id, application!.id))).toHaveLength(0)
    expect(await t.db.select().from(applicationAnswers).where(eq(applicationAnswers.applicationId, application!.id))).toHaveLength(0)
    await expect(t.storage.read(file!.storageKey)).rejects.toThrow()

    const [log] = await t.db.select().from(auditLogs).where(eq(auditLogs.action, 'candidate.erased_by_request'))
    expect(log).toMatchObject({ tenantId: org.tenant.id, entityId: application!.candidateId })
    expect(JSON.stringify(log)).not.toContain('apagar@exemplo.com')
  })

  it('token já usado ou inventado recebe a mesma resposta, sem revelar nada', async () => {
    const used = await privacy('token-que-nao-existe-mais-aaaaaaaa', 'erase')
    const invented = await privacy(randomBytes(32).toString('base64url'), 'erase')
    expect(used.statusCode).toBe(200)
    expect(invented.statusCode).toBe(200)
    expect(used.body).toBe(invented.body)
    expect((await privacy(randomBytes(32).toString('base64url'), 'renew')).body).toBe(invented.body)
  })

  it('renovação atualiza o consentimento e o prazo só onde havia consentimento', async () => {
    const [withConsent] = await t.db.select().from(applications).where(eq(applications.email, 'maria.silva@exemplo.com'))
    const old = new Date('2025-01-01T12:00:00Z')
    await t.db.update(applications).set({ consentAt: old, retentionUntil: '2027-01-01' }).where(eq(applications.id, withConsent!.id))

    expect((await privacy(withConsent!.privacyToken, 'renew')).statusCode).toBe(200)
    const [renewed] = await t.db.select().from(applications).where(eq(applications.id, withConsent!.id))
    expect(renewed!.consentAt!.getTime()).toBeGreaterThan(old.getTime())
    expect(renewed!.retentionUntil! > '2027-01-01').toBe(true)

    const [without] = await t.db.select().from(applications).where(eq(applications.email, 'sem.consentimento@exemplo.com'))
    await privacy(without!.privacyToken, 'renew')
    const [unchanged] = await t.db.select().from(applications).where(eq(applications.id, without!.id))
    expect(unchanged).toMatchObject({ talentPoolConsent: false, consentAt: null, retentionUntil: null })
  })
})
