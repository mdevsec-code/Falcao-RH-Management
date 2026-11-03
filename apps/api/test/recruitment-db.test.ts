/**
 * Banco do recrutamento: a role pública (`falcao_public`) só lê vagas
 * publicadas/pausadas da própria empresa e só insere candidaturas; as funções
 * `SECURITY DEFINER` cobrem o que ela precisa sem ganhar leitura de dados
 * pessoais.
 */
import { randomUUID } from 'node:crypto'
import { sql, type SQL } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Database, Tx } from '../src/db/client'
import { createTenant } from '../src/db/provision'
import { rowsOf } from '../src/db/rows'
import { createTestDb } from './harness'

let db: Database
let close: () => Promise<void>
let tenantA: string
let tenantB: string
let deptA: string
let deptB: string
const jobs = { draft: '', published: '', paused: '', closed: '', otherTenant: '' }
/** Etapa inicial (Novo) de cada empresa e uma etapa de A que não é a inicial. */
const stages = { initialA: '', initialB: '', screeningA: '' }
/** Candidato, candidatura e pergunta da empresa B, para os testes de inclusão cruzada. */
const ofB = { candidate: '', application: '', question: '' }
let questionPublished: string

type Row = Record<string, unknown>
const rows = async <T = Row>(tx: Database | Tx, query: SQL) => rowsOf<T>(await tx.execute(query))

/** Transação na role pública, com a organização fixada (como fará `withPublic`). */
const asPublic = <T>(tenantId: string, fn: (tx: Tx) => Promise<T>) =>
  db.transaction(async tx => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`)
    await tx.execute(sql`set local role falcao_public`)
    return fn(tx)
  })

/** O Drizzle embrulha o erro do PostgreSQL: o motivo fica em `cause`. */
const reason = (promise: Promise<unknown>) =>
  promise.then(
    () => 'aceito',
    (error: { message?: string; cause?: { message?: string } }) => error.cause?.message ?? error.message ?? '',
  )

const insertJob = async (tenantId: string, status: string, departmentId: string | null = null) => {
  const id = randomUUID()
  await db.execute(sql`
    insert into job_openings (id, tenant_id, title, department_id, contract_type, work_mode, description, status, share_token)
    values (${id}, ${tenantId}, ${`Vaga ${status}`}, ${departmentId}, 'clt', 'site',
            'Descrição longa o bastante da vaga.', ${status}, ${randomUUID()})`)
  return id
}

/** Candidato + candidatura + arquivo, gravados como dono. */
const insertApplicant = async (
  tenantId: string,
  jobId: string,
  opts: { email: string; consent?: boolean; storageKey?: string },
) => {
  const candidateId = randomUUID()
  const applicationId = randomUUID()
  const token = randomUUID()
  await db.execute(sql`
    insert into candidates (id, tenant_id, full_name, email, phone, city, state)
    values (${candidateId}, ${tenantId}, 'Pessoa Candidata', ${opts.email}, '71999990000', 'Salvador', 'BA')`)
  await db.execute(sql`
    insert into applications (id, tenant_id, job_id, candidate_id, email, talent_pool_consent, consent_at, privacy_token, stage_id)
    values (${applicationId}, ${tenantId}, ${jobId}, ${candidateId}, ${opts.email}, ${opts.consent ?? false},
            ${opts.consent ? sql`now() - interval '1 year'` : null}, ${token},
            ${tenantId === tenantB ? stages.initialB : stages.initialA})`)
  if (opts.storageKey) {
    await db.execute(sql`
      insert into candidate_files (tenant_id, candidate_id, application_id, storage_key, filename, size_bytes)
      values (${tenantId}, ${candidateId}, ${applicationId}, ${opts.storageKey}, 'cv.pdf', 1234)`)
  }
  return { candidateId, applicationId, token }
}

beforeAll(async () => {
  const test = await createTestDb()
  db = test.db
  close = () => test.client.close()
  tenantA = (await createTenant(db, { name: 'Empresa Alfa', slug: 'alfa' })).id
  tenantB = (await createTenant(db, { name: 'Empresa Beta', slug: 'beta' })).id
  deptA = (await rows<{ id: string }>(db, sql`insert into departments (tenant_id, name) values (${tenantA}, 'Obras A') returning id`))[0]!.id
  deptB = (await rows<{ id: string }>(db, sql`insert into departments (tenant_id, name) values (${tenantB}, 'Obras B') returning id`))[0]!.id
  await db.execute(sql`insert into departments (tenant_id, name) values (${tenantA}, 'Sem vaga')`)

  jobs.draft = await insertJob(tenantA, 'draft', deptA)
  jobs.published = await insertJob(tenantA, 'published', deptA)
  jobs.paused = await insertJob(tenantA, 'paused')
  jobs.closed = await insertJob(tenantA, 'closed')
  jobs.otherTenant = await insertJob(tenantB, 'published', deptB)

  questionPublished = randomUUID()
  await db.execute(sql`
    insert into job_questions (id, tenant_id, job_id, position, kind, label)
    values (${questionPublished}, ${tenantA}, ${jobs.published}, 0, 'text', 'Tem NR-35?'),
           (${randomUUID()}, ${tenantA}, ${jobs.draft}, 0, 'text', 'Pergunta do rascunho')`)

  const stageOf = async (tenantId: string, position: number) =>
    (await rows<{ id: string }>(db, sql`
      select id from recruitment_stages where tenant_id = ${tenantId} and position = ${position}`))[0]!.id
  stages.initialA = await stageOf(tenantA, 0)
  stages.screeningA = await stageOf(tenantA, 1)
  stages.initialB = await stageOf(tenantB, 0)

  ofB.question = randomUUID()
  await db.execute(sql`
    insert into job_questions (id, tenant_id, job_id, position, kind, label)
    values (${ofB.question}, ${tenantB}, ${jobs.otherTenant}, 0, 'text', 'Pergunta B')`)
  const applicantB = await insertApplicant(tenantB, jobs.otherTenant, { email: 'b@exemplo.com' })
  ofB.candidate = applicantB.candidateId
  ofB.application = applicantB.applicationId
})

afterAll(() => close())

describe('role pública (falcao_public)', () => {
  it.each(['candidates', 'applications', 'application_answers', 'application_events', 'application_notes', 'candidate_files', 'employees'])(
    'não lê %s',
    async table => {
      expect(await reason(asPublic(tenantA, tx => tx.execute(sql`select count(*) from ${sql.identifier(table)}`)))).toMatch(
        /permission denied/,
      )
    },
  )

  it('lê só vagas publicadas ou pausadas da própria empresa', async () => {
    const visible = await asPublic(tenantA, tx => rows<{ id: string }>(tx, sql`select id from job_openings`))
    expect(visible.map(r => r.id).sort()).toEqual([jobs.published, jobs.paused].sort())
  })

  it('lê só perguntas das vagas visíveis', async () => {
    const visible = await asPublic(tenantA, tx => rows<{ id: string }>(tx, sql`select id from job_questions`))
    expect(visible.map(r => r.id)).toEqual([questionPublished])
  })

  it('lê só id e nome dos departamentos das vagas visíveis da própria empresa', async () => {
    const visible = await asPublic(tenantA, tx => rows<{ id: string; name: string }>(tx, sql`select id, name from departments`))
    expect(visible).toEqual([{ id: deptA, name: 'Obras A' }])
    expect(await reason(asPublic(tenantA, tx => tx.execute(sql`select manager_employee_id from departments`)))).toMatch(
      /permission denied/,
    )
  })

  it('não altera nem apaga vagas', async () => {
    expect(await reason(asPublic(tenantA, tx => tx.execute(sql`update job_openings set hired_count = 9`)))).toMatch(
      /permission denied/,
    )
    expect(await reason(asPublic(tenantA, tx => tx.execute(sql`delete from job_questions`)))).toMatch(/permission denied/)
  })

  it('insere a candidatura completa na própria empresa, sem poder lê-la', async () => {
    const candidateId = randomUUID()
    const applicationId = randomUUID()
    await asPublic(tenantA, async tx => {
      // A etapa inicial é a única que a role pública enxerga.
      const [initial] = await rows<{ id: string }>(tx, sql`select id from recruitment_stages`)
      await tx.execute(sql`
        insert into candidates (id, tenant_id, full_name, email, phone, city, state)
        values (${candidateId}, ${tenantA}, 'Nova Pessoa', 'nova@exemplo.com', '71999990000', 'Salvador', 'BA')`)
      await tx.execute(sql`
        insert into applications (id, tenant_id, job_id, candidate_id, email, privacy_token, stage_id)
        values (${applicationId}, ${tenantA}, ${jobs.published}, ${candidateId}, 'nova@exemplo.com', ${randomUUID()}, ${initial!.id})`)
      await tx.execute(sql`
        insert into application_answers (tenant_id, application_id, question_id, value)
        values (${tenantA}, ${applicationId}, ${questionPublished}, 'Sim')`)
      await tx.execute(sql`
        insert into application_events (tenant_id, application_id, to_stage_id)
        values (${tenantA}, ${applicationId}, ${initial!.id})`)
      await tx.execute(sql`
        insert into candidate_files (tenant_id, candidate_id, application_id, storage_key, filename, size_bytes)
        values (${tenantA}, ${candidateId}, ${applicationId}, ${`recruitment/${tenantA}/${randomUUID()}.pdf`}, 'cv.pdf', 10)`)
    })
    const [saved] = await rows<{ status: string; stage_id: string }>(
      db,
      sql`select status, stage_id from applications where id = ${applicationId}`,
    )
    expect(saved).toEqual({ status: 'open', stage_id: stages.initialA })
    // O rótulo do evento vem do banco, não de quem grava.
    const [event] = await rows(db, sql`
      select from_stage_id, from_label, to_stage_id, to_label, outcome from application_events where application_id = ${applicationId}`)
    expect(event).toEqual({ from_stage_id: null, from_label: null, to_stage_id: stages.initialA, to_label: 'Novo', outcome: null })
    // Mesmo e-mail na mesma vaga: a unicidade (job_id, email) barra.
    expect(
      await reason(
        asPublic(tenantA, tx =>
          tx.execute(sql`
            insert into applications (tenant_id, job_id, candidate_id, email, privacy_token, stage_id)
            values (${tenantA}, ${jobs.published}, ${candidateId}, 'nova@exemplo.com', ${randomUUID()}, ${stages.initialA})`),
        ),
      ),
    ).toMatch(/applications_job_email_uq/)
  })

  it('lê só o id da etapa inicial da própria empresa', async () => {
    const visible = await asPublic(tenantA, tx => rows<{ id: string }>(tx, sql`select id from recruitment_stages`))
    expect(visible).toEqual([{ id: stages.initialA }])
    expect(await reason(asPublic(tenantA, tx => tx.execute(sql`select name from recruitment_stages`)))).toMatch(
      /permission denied/,
    )
    expect(await reason(asPublic(tenantA, tx => tx.execute(sql`update recruitment_stages set position = 9`)))).toMatch(
      /permission denied/,
    )
  })

  /** Candidatura pública em A com os campos dados, numa ficha nova. */
  const publicApplication = (fields: SQL) =>
    reason(
      asPublic(tenantA, async tx => {
        const candidateId = randomUUID()
        await tx.execute(sql`
          insert into candidates (id, tenant_id, full_name, email, phone, city, state)
          values (${candidateId}, ${tenantA}, 'Pessoa', 'p@exemplo.com', '71999990000', 'Salvador', 'BA')`)
        await tx.execute(sql`
          insert into applications (tenant_id, candidate_id, email, privacy_token, job_id, stage_id, status, rating)
          values (${tenantA}, ${candidateId}, 'p@exemplo.com', ${randomUUID()}, ${fields})`)
      }),
    )

  it('não insere candidatura fora da etapa inicial, já encerrada ou com nota', async () => {
    expect(await publicApplication(sql`${jobs.published}, ${stages.initialA}, 'open', null`)).toBe('aceito')
    expect(await publicApplication(sql`${jobs.published}, ${stages.screeningA}, 'open', null`)).toMatch(/row-level security/)
    expect(await publicApplication(sql`${jobs.published}, ${stages.initialA}, 'hired', null`)).toMatch(/row-level security/)
    expect(await publicApplication(sql`${jobs.published}, ${stages.initialA}, 'open', 5`)).toMatch(/row-level security/)
    expect(await publicApplication(sql`${jobs.published}, ${stages.initialB}, 'open', null`)).toMatch(
      /row-level security|applications_stage_same_tenant_fk/,
    )
  })

  it('não insere candidatura em vaga que não está publicada', async () => {
    expect(await publicApplication(sql`${jobs.draft}, ${stages.initialA}, 'open', null`)).toMatch(/row-level security/)
  })

  it('não insere candidato com o tenant de outra empresa', async () => {
    expect(
      await reason(
        asPublic(tenantA, tx =>
          tx.execute(sql`
            insert into candidates (tenant_id, full_name, email, phone, city, state)
            values (${tenantB}, 'Intrusa', 'x@exemplo.com', '71999990000', 'Salvador', 'BA')`),
        ),
      ),
    ).toMatch(/row-level security/)
  })

  it.each([
    [
      'applications',
      () => sql`
        insert into applications (tenant_id, job_id, candidate_id, email, privacy_token, stage_id)
        values (${tenantB}, ${jobs.otherTenant}, ${ofB.candidate}, ${`${randomUUID()}@exemplo.com`}, ${randomUUID()}, ${stages.initialB})`,
    ],
    [
      'application_answers',
      () => sql`
        insert into application_answers (tenant_id, application_id, question_id, value)
        values (${tenantB}, ${ofB.application}, ${ofB.question}, 'Sim')`,
    ],
    [
      'application_events',
      () => sql`
        insert into application_events (tenant_id, application_id, to_stage_id)
        values (${tenantB}, ${ofB.application}, ${stages.initialB})`,
    ],
    [
      'candidate_files',
      () => sql`
        insert into candidate_files (tenant_id, candidate_id, storage_key, filename, size_bytes)
        values (${tenantB}, ${ofB.candidate}, ${randomUUID()}, 'cv.pdf', 10)`,
    ],
  ])('não insere em %s com o tenant de outra empresa', async (_table, query) => {
    expect(await reason(asPublic(tenantA, tx => tx.execute(query())))).toMatch(/row-level security/)
  })

  it('evento público só registra a entrada na etapa inicial, sem autor nem desfecho', async () => {
    const { applicationId } = await insertApplicant(tenantA, jobs.published, { email: 'evento@exemplo.com' })
    const [actor] = await rows<{ id: string }>(db, sql`
      insert into "user" (id, name, email) values (${randomUUID()}, 'RH', ${`${randomUUID()}@rh.test`}) returning id`)
    const event = (columns: SQL, values: SQL) =>
      reason(
        asPublic(tenantA, tx =>
          tx.execute(sql`insert into application_events (tenant_id, application_id, ${columns})
                         values (${tenantA}, ${applicationId}, ${values})`),
        ),
      )
    expect(await event(sql`to_stage_id`, sql`${stages.initialA}`)).toBe('aceito')
    expect(await event(sql`to_stage_id, actor_user_id`, sql`${stages.initialA}, ${actor!.id}`)).toMatch(/row-level security/)
    expect(await event(sql`to_stage_id`, sql`${stages.screeningA}`)).toMatch(/row-level security/)
    expect(await event(sql`from_stage_id, to_stage_id`, sql`${stages.initialA}, ${stages.initialA}`)).toMatch(
      /row-level security/,
    )
    expect(await event(sql`to_stage_id, outcome`, sql`${stages.initialA}, 'hired'`)).toMatch(/row-level security/)
    expect(await event(sql`note`, sql`'Só uma nota'`)).toMatch(/row-level security/)
  })

  it('não insere arquivo já marcado como limpo', async () => {
    const { candidateId } = await insertApplicant(tenantA, jobs.published, { email: 'limpo@exemplo.com' })
    expect(
      await reason(
        asPublic(tenantA, tx =>
          tx.execute(sql`
            insert into candidate_files (tenant_id, candidate_id, storage_key, filename, size_bytes, scan_status)
            values (${tenantA}, ${candidateId}, 'k', 'cv.pdf', 10, 'clean')`),
        ),
      ),
    ).toMatch(/row-level security/)
  })
})

describe('funções públicas (SECURITY DEFINER)', () => {
  it('public_tenant_id resolve o slug, ou devolve nulo', async () => {
    const result = await asPublic(tenantA, tx =>
      rows<{ a: string | null; none: string | null }>(
        tx,
        sql`select public_tenant_id('alfa') as a, public_tenant_id('nao-existe') as none`,
      ),
    )
    expect(result[0]).toEqual({ a: tenantA, none: null })
  })

  it('public_tenant devolve id e nome da empresa', async () => {
    const found = await asPublic(tenantA, tx => rows(tx, sql`select * from public_tenant('beta')`))
    expect(found).toEqual([{ id: tenantB, name: 'Empresa Beta' }])
    const missing = await asPublic(tenantA, tx => rows(tx, sql`select * from public_tenant('nao-existe')`))
    expect(missing).toEqual([])
  })

  it('public_application_exists detecta duplicata sem diferenciar maiúsculas', async () => {
    await insertApplicant(tenantA, jobs.published, { email: 'dup@exemplo.com' })
    const [result] = await asPublic(tenantA, tx =>
      rows<{ yes: boolean; no: boolean; other: boolean }>(
        tx,
        sql`select public_application_exists(${tenantA}, ${jobs.published}, ' DUP@Exemplo.com ') as yes,
                   public_application_exists(${tenantA}, ${jobs.paused}, 'dup@exemplo.com') as no,
                   public_application_exists(${tenantB}, ${jobs.otherTenant}, 'b@exemplo.com') as other`,
      ),
    )
    // Outra empresa: falso mesmo com a candidatura existindo (o tenant tem de ser o da transação).
    expect(result).toEqual({ yes: true, no: false, other: false })
  })

  it('public_erase_by_token com token inexistente devolve lista vazia', async () => {
    const [result] = await asPublic(tenantA, tx =>
      rows<{ keys: string[] }>(tx, sql`select public_erase_by_token('invalido') as keys`),
    )
    expect(result!.keys).toEqual([])
  })

  it('public_erase_by_token apaga o candidato em cascata e devolve as chaves dos arquivos', async () => {
    const key = `recruitment/${tenantA}/${randomUUID()}.pdf`
    const { candidateId, applicationId, token } = await insertApplicant(tenantA, jobs.published, {
      email: 'apagar@exemplo.com',
      storageKey: key,
    })
    await db.execute(sql`
      insert into application_events (tenant_id, application_id, to_stage_id) values (${tenantA}, ${applicationId}, ${stages.initialA})`)
    // Segunda candidatura da mesma pessoa, em outra vaga.
    await db.execute(sql`
      insert into applications (tenant_id, job_id, candidate_id, email, privacy_token, stage_id)
      values (${tenantA}, ${jobs.paused}, ${candidateId}, 'apagar@exemplo.com', ${randomUUID()}, ${stages.initialA})`)

    const [result] = await asPublic(tenantA, tx =>
      rows<{ keys: string[] }>(tx, sql`select public_erase_by_token(${token}) as keys`),
    )
    expect(result!.keys).toEqual([key])
    const left = await rows<{ c: number; a: number; e: number; f: number }>(
      db,
      sql`select (select count(*)::int from candidates where id = ${candidateId}) as c,
                 (select count(*)::int from applications where candidate_id = ${candidateId}) as a,
                 (select count(*)::int from application_events where application_id = ${applicationId}) as e,
                 (select count(*)::int from candidate_files where candidate_id = ${candidateId}) as f`,
    )
    expect(left[0]).toEqual({ c: 0, a: 0, e: 0, f: 0 })
    // De novo, com o mesmo token: nada mais a apagar.
    const [again] = await asPublic(tenantA, tx =>
      rows<{ keys: string[] }>(tx, sql`select public_erase_by_token(${token}) as keys`),
    )
    expect(again!.keys).toEqual([])
  })

  it('public_renew_consent renova só as candidaturas que tinham consentimento', async () => {
    const { candidateId, token } = await insertApplicant(tenantA, jobs.published, {
      email: 'renovar@exemplo.com',
      consent: true,
    })
    await db.execute(sql`
      insert into applications (tenant_id, job_id, candidate_id, email, privacy_token, stage_id)
      values (${tenantA}, ${jobs.paused}, ${candidateId}, 'renovar@exemplo.com', ${randomUUID()}, ${stages.initialA})`)

    const [result] = await asPublic(tenantA, tx =>
      rows<{ ok: boolean; none: boolean }>(
        tx,
        sql`select public_renew_consent(${token}) as ok, public_renew_consent('invalido') as none`,
      ),
    )
    expect(result).toEqual({ ok: true, none: false })
    const apps = await rows<{ consent: boolean; recent: boolean | null }>(
      db,
      sql`select talent_pool_consent as consent, consent_at > now() - interval '1 minute' as recent
          from applications where candidate_id = ${candidateId} order by talent_pool_consent desc`,
    )
    expect(apps).toEqual([
      { consent: true, recent: true },
      { consent: false, recent: null },
    ])
  })

  it('as funções públicas não ficam disponíveis à role da aplicação', async () => {
    const result = await reason(
      db.transaction(async tx => {
        await tx.execute(sql`set local role falcao_app`)
        await tx.execute(sql`select public_erase_by_token('x')`)
      }),
    )
    expect(result).toMatch(/permission denied/)
  })
})
