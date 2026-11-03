/**
 * Etapas do recrutamento personalizáveis por organização (spec 5.8): Novo é
 * fixa e sempre a primeira; as demais são renomeadas, reordenadas, criadas e
 * removidas pelo RH. Etapa com candidatura em andamento não sai.
 */
import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { withTenant } from '../src/db/client'
import { createTenant } from '../src/db/provision'
import { rowsOf } from '../src/db/rows'
import * as schema from '../src/db/schema'
import { createTestApp, type TestApp } from './harness'

type Stage = { id: string; name: string; position: number; isInitial: boolean; openApplications: number }

let t: TestApp
let a: Awaited<ReturnType<TestApp['seedTenant']>>
let b: Awaited<ReturnType<TestApp['seedTenant']>>

beforeAll(async () => {
  t = await createTestApp()
  a = await t.seedTenant('alfa', ['admin', 'hr', 'manager'])
  b = await t.seedTenant('beta', ['admin'])
})

afterAll(() => t.close())

const getStages = async (cookie: string) => {
  const response = await t.app.inject({ method: 'GET', url: '/api/v1/recruitment/stages', headers: { cookie } })
  expect(response.statusCode).toBe(200)
  return response.json<Stage[]>()
}

const putStages = (cookie: string, stages: { id?: string; name: string }[]) =>
  t.app.inject({ method: 'PUT', url: '/api/v1/recruitment/stages', headers: { cookie }, payload: { stages } })

/** Vaga, candidato e candidatura numa etapa, gravados como dono. */
const insertApplication = async (tenantId: string, stageId: string | null, status = 'open') => {
  const job = randomUUID()
  const candidate = randomUUID()
  const application = randomUUID()
  const email = `${randomUUID()}@exemplo.com`
  await t.db.execute(sql`
    insert into job_openings (id, tenant_id, title, contract_type, work_mode, description, status, share_token)
    values (${job}, ${tenantId}, 'Vaga', 'clt', 'site', 'Descrição longa o bastante.', 'published', ${randomUUID()})`)
  await t.db.execute(sql`
    insert into candidates (id, tenant_id, full_name, email, phone, city, state)
    values (${candidate}, ${tenantId}, 'Pessoa', ${email}, '71999990000', 'Salvador', 'BA')`)
  await t.db.execute(sql`
    insert into applications (id, tenant_id, job_id, candidate_id, email, privacy_token, status, stage_id)
    values (${application}, ${tenantId}, ${job}, ${candidate}, ${email}, ${randomUUID()}, ${status}, ${stageId})`)
  return application
}

const byName = (stages: Stage[], name: string) => stages.find(s => s.name === name)!

describe('etapas do recrutamento', () => {
  it('organização nova tem as 4 etapas iniciais, na ordem, com Novo fixa', async () => {
    const stages = await getStages(a.users.admin!.cookie)
    expect(stages.map(s => [s.name, s.position, s.isInitial, s.openApplications])).toEqual([
      ['Novo', 0, true, 0],
      ['Triagem', 1, false, 0],
      ['Entrevista', 2, false, 0],
      ['Proposta', 3, false, 0],
    ])
  })

  it('o gestor lê as etapas, mas não altera', async () => {
    const stages = await getStages(a.users.manager!.cookie)
    expect(stages).toHaveLength(4)
    const response = await putStages(a.users.manager!.cookie, stages)
    expect(response.statusCode).toBe(403)
  })

  it('reordena e acrescenta "Exame admissional (ASO)", mantendo os ids', async () => {
    const before = await getStages(a.users.hr!.cookie)
    const [novo, triagem, entrevista, proposta] = before
    const response = await putStages(a.users.hr!.cookie, [
      novo!,
      entrevista!,
      triagem!,
      { name: 'Exame admissional (ASO)' },
      proposta!,
    ])
    expect(response.statusCode).toBe(200)
    const after = response.json<Stage[]>()
    expect(after.map(s => s.name)).toEqual(['Novo', 'Entrevista', 'Triagem', 'Exame admissional (ASO)', 'Proposta'])
    expect(after.map(s => s.position)).toEqual([0, 1, 2, 3, 4])
    expect(after[1]!.id).toBe(entrevista!.id)
    expect(after[2]!.id).toBe(triagem!.id)
    expect(await getStages(a.users.hr!.cookie)).toEqual(after)

    const [log] = rowsOf<{ action: string; metadata: { stages: string[] } }>(
      await t.db.execute(sql`
        select action, metadata from audit_logs
        where tenant_id = ${a.tenant.id} and entity = 'recruitment_stages' order by created_at desc limit 1`),
    )
    expect(log!.action).toBe('update')
    expect(log!.metadata.stages).toContain('Exame admissional (ASO)')
  })

  it('renomeia uma etapa', async () => {
    const stages = await getStages(a.users.hr!.cookie)
    const renamed = stages.map(s => (s.name === 'Triagem' ? { id: s.id, name: 'Triagem de currículos' } : s))
    const response = await putStages(a.users.hr!.cookie, renamed)
    expect(response.statusCode).toBe(200)
    expect(byName(response.json<Stage[]>(), 'Triagem de currículos').id).toBe(byName(stages, 'Triagem').id)
  })

  it('nome repetido → 400', async () => {
    const stages = await getStages(a.users.hr!.cookie)
    const response = await putStages(a.users.hr!.cookie, [...stages, { name: ' proposta ' }])
    expect(response.statusCode).toBe(400)
  })

  it('renomear a etapa inicial não muda o nome dela', async () => {
    const stages = await getStages(a.users.hr!.cookie)
    const response = await putStages(a.users.hr!.cookie, [{ id: stages[0]!.id, name: 'Recebidos' }, ...stages.slice(1)])
    expect(response.statusCode).toBe(200)
    const [first] = response.json<Stage[]>()
    expect(first).toMatchObject({ id: stages[0]!.id, name: 'Novo', position: 0, isInitial: true })
  })

  it('a etapa inicial não sai da primeira posição', async () => {
    const stages = await getStages(a.users.hr!.cookie)
    const response = await putStages(a.users.hr!.cookie, [...stages.slice(1), stages[0]!])
    expect(response.statusCode).toBe(400)
  })

  it('remover etapa com candidatura em andamento → 409', async () => {
    const stages = await getStages(a.users.hr!.cookie)
    const proposta = byName(stages, 'Proposta')
    await insertApplication(a.tenant.id, proposta.id)
    expect(byName(await getStages(a.users.hr!.cookie), 'Proposta').openApplications).toBe(1)

    const response = await putStages(
      a.users.hr!.cookie,
      stages.filter(s => s.id !== proposta.id),
    )
    expect(response.statusCode).toBe(409)
    expect(response.json().message).toBe('Mova os candidatos antes de remover a etapa Proposta.')
    expect((await getStages(a.users.hr!.cookie)).map(s => s.name)).toContain('Proposta')
  })

  it('remove etapa vazia, e a que só tem candidaturas encerradas, preservando o histórico', async () => {
    const stages = await getStages(a.users.hr!.cookie)
    const aso = byName(stages, 'Exame admissional (ASO)')
    const entrevista = byName(stages, 'Entrevista')
    // Candidatura recusada que estava na Entrevista, com o evento da mudança.
    const application = await insertApplication(a.tenant.id, entrevista.id, 'rejected')
    await t.db.execute(sql`
      insert into application_events (tenant_id, application_id, from_stage_id, to_stage_id)
      values (${a.tenant.id}, ${application}, ${stages[0]!.id}, ${entrevista.id})`)

    const response = await putStages(
      a.users.hr!.cookie,
      stages.filter(s => s.id !== aso.id && s.id !== entrevista.id),
    )
    expect(response.statusCode).toBe(200)
    expect(response.json<Stage[]>().map(s => s.name)).toEqual(['Novo', 'Triagem de currículos', 'Proposta'])
    expect(response.json<Stage[]>().map(s => s.position)).toEqual([0, 1, 2])

    const [app] = rowsOf<{ status: string; stage_id: string | null }>(
      await t.db.execute(sql`select status, stage_id from applications where id = ${application}`),
    )
    expect(app).toEqual({ status: 'rejected', stage_id: null })
    const [event] = rowsOf<Record<string, unknown>>(
      await t.db.execute(sql`
        select from_stage_id, from_label, to_stage_id, to_label from application_events where application_id = ${application}`),
    )
    expect(event).toEqual({ from_stage_id: stages[0]!.id, from_label: 'Novo', to_stage_id: null, to_label: 'Entrevista' })
  })

  it('isolamento: a empresa A não lê nem usa as etapas da B', async () => {
    const stagesA = await getStages(a.users.admin!.cookie)
    const stagesB = await getStages(b.users.admin!.cookie)
    expect(stagesB.map(s => s.name)).toEqual(['Novo', 'Triagem', 'Entrevista', 'Proposta'])
    const idsB = new Set(stagesB.map(s => s.id))
    expect(stagesA.some(s => idsB.has(s.id))).toBe(false)

    const response = await putStages(a.users.admin!.cookie, [...stagesA, { id: stagesB[1]!.id, name: 'Roubada' }])
    expect(response.statusCode).toBe(400)
    expect((await getStages(b.users.admin!.cookie)).map(s => s.name)).toEqual(['Novo', 'Triagem', 'Entrevista', 'Proposta'])
  })
})

describe('etapa inicial protegida no banco', () => {
  const asA = (query: ReturnType<typeof sql>) =>
    withTenant(t.db, { tenantId: a.tenant.id, userId: a.users.admin!.id }, tx => tx.execute(query)).then(
      () => 'aceito',
      (error: { cause?: { message?: string } }) => error.cause?.message ?? '',
    )

  it('a aplicação não apaga nem renomeia Novo', async () => {
    expect(await asA(sql`delete from recruitment_stages where is_initial`)).toMatch(/etapa inicial/)
    expect(await asA(sql`update recruitment_stages set name = 'Outro' where is_initial`)).toMatch(/etapa inicial/)
    expect(await asA(sql`update recruitment_stages set is_initial = false where is_initial`)).toMatch(/etapa inicial/)
  })

  it('apagar a organização leva as etapas junto', async () => {
    const gama = await createTenant(t.db, { name: 'Gama', slug: 'gama' })
    await t.db.execute(sql`delete from tenants where id = ${gama.id}`)
    const [left] = rowsOf<{ total: number }>(
      await t.db.execute(sql`select count(*)::int as total from recruitment_stages where tenant_id = ${gama.id}`),
    )
    expect(left!.total).toBe(0)
  })
})

describe('migração das etapas (0006/0007) com dados existentes', () => {
  it('converte stage em status + stage_id e o histórico em etapas com rótulo', async () => {
    const source = fileURLToPath(new URL('../migrations', import.meta.url))
    const before = await mkdtemp(join(tmpdir(), 'falcao-mig-'))
    await cp(source, before, { recursive: true })
    const journalPath = join(before, 'meta', '_journal.json')
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as { entries: { idx: number }[] }
    journal.entries = journal.entries.filter(e => e.idx <= 5)
    await writeFile(journalPath, JSON.stringify(journal))

    const client = new PGlite()
    const db = drizzle(client, { schema })
    try {
      await migrate(db, { migrationsFolder: before })
      const tenant = randomUUID()
      const job = randomUUID()
      const candidate = randomUUID()
      await db.execute(sql`insert into tenants (id, name, slug) values (${tenant}, 'Antiga', 'antiga')`)
      await db.execute(sql`
        insert into job_openings (id, tenant_id, title, contract_type, work_mode, description, status, share_token)
        values (${job}, ${tenant}, 'Vaga', 'clt', 'site', 'Descrição longa o bastante.', 'published', 'tok')`)
      await db.execute(sql`
        insert into candidates (id, tenant_id, full_name, email, phone, city, state)
        values (${candidate}, ${tenant}, 'Pessoa', 'p@exemplo.com', '71999990000', 'Salvador', 'BA')`)
      const apps: Record<string, string> = {}
      for (const stage of ['new', 'interview', 'offer', 'hired', 'rejected']) {
        apps[stage] = randomUUID()
        await db.execute(sql`
          insert into applications (id, tenant_id, job_id, candidate_id, email, privacy_token, stage)
          values (${apps[stage]}, ${tenant}, ${job}, ${candidate}, ${`${stage}@exemplo.com`}, ${randomUUID()}, ${stage})`)
      }
      await db.execute(sql`
        insert into application_events (tenant_id, application_id, from_stage, to_stage, note) values
          (${tenant}, ${apps.interview}, null, 'new', null),
          (${tenant}, ${apps.interview}, 'new', 'interview', null),
          (${tenant}, ${apps.rejected}, 'screening', 'rejected', 'Sem NR-35'),
          (${tenant}, ${apps.offer}, 'rejected', 'offer', null),
          (${tenant}, ${apps.offer}, null, null, 'Currículo removido')`)

      await migrate(db, { migrationsFolder: source })

      const stages = rowsOf<{ id: string; name: string; position: number; is_initial: boolean }>(
        await db.execute(sql`select id, name, position, is_initial from recruitment_stages where tenant_id = ${tenant} order by position`),
      )
      expect(stages.map(s => [s.name, s.position, s.is_initial])).toEqual([
        ['Novo', 0, true],
        ['Triagem', 1, false],
        ['Entrevista', 2, false],
        ['Proposta', 3, false],
      ])
      const stageId = Object.fromEntries(stages.map(s => [s.name, s.id]))

      const migrated = rowsOf<{ id: string; status: string; stage_id: string | null }>(
        await db.execute(sql`select id, status, stage_id from applications where tenant_id = ${tenant}`),
      )
      const of = (id: string) => migrated.find(r => r.id === id)
      expect(of(apps.new!)).toMatchObject({ status: 'open', stage_id: stageId.Novo })
      expect(of(apps.interview!)).toMatchObject({ status: 'open', stage_id: stageId.Entrevista })
      expect(of(apps.offer!)).toMatchObject({ status: 'open', stage_id: stageId.Proposta })
      expect(of(apps.hired!)).toMatchObject({ status: 'hired', stage_id: null })
      expect(of(apps.rejected!)).toMatchObject({ status: 'rejected', stage_id: null })

      const events = rowsOf<Record<string, unknown>>(
        await db.execute(sql`
          select from_stage_id, from_label, to_stage_id, to_label, outcome, note
          from application_events where tenant_id = ${tenant} order by created_at, to_label nulls last`),
      )
      expect(events).toEqual(
        expect.arrayContaining([
          { from_stage_id: null, from_label: null, to_stage_id: stageId.Novo, to_label: 'Novo', outcome: null, note: null },
          {
            from_stage_id: stageId.Novo,
            from_label: 'Novo',
            to_stage_id: stageId.Entrevista,
            to_label: 'Entrevista',
            outcome: null,
            note: null,
          },
          {
            from_stage_id: stageId.Triagem,
            from_label: 'Triagem',
            to_stage_id: null,
            to_label: null,
            outcome: 'rejected',
            note: 'Sem NR-35',
          },
          { from_stage_id: null, from_label: null, to_stage_id: stageId.Proposta, to_label: 'Proposta', outcome: 'reopened', note: null },
          { from_stage_id: null, from_label: null, to_stage_id: null, to_label: null, outcome: null, note: 'Currículo removido' },
        ]),
      )
      expect(events).toHaveLength(5)
    } finally {
      await client.close()
    }
  })
})
