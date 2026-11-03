import { randomUUID } from 'node:crypto'
import { sql, type SQL } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { withTenant } from '../src/db/client'
import { rowsOf } from '../src/db/rows'
import { auditLogs, departments, employees } from '../src/db/schema'
import { createTestApp, nextCpf, type TestApp } from './harness'

let t: TestApp
let a: Awaited<ReturnType<TestApp['seedTenant']>>
let b: Awaited<ReturnType<TestApp['seedTenant']>>
let deptB: string

const employee = (tenantId: string, extra: Partial<typeof employees.$inferInsert> = {}) => ({
  tenantId,
  registration: `M-${Math.random().toString(36).slice(2, 8)}`,
  fullName: 'Pessoa Teste',
  cpf: nextCpf(),
  hireDate: '2025-01-10',
  contractType: 'clt' as const,
  ...extra,
})

beforeAll(async () => {
  t = await createTestApp()
  a = await t.seedTenant('alfa', ['admin'])
  b = await t.seedTenant('beta', ['admin'])
  // Dados da empresa B, criados por operação de sistema.
  const [dept] = await t.db.insert(departments).values({ tenantId: b.tenant.id, name: 'Obras B' }).returning()
  deptB = dept!.id
  await t.db.insert(employees).values(employee(b.tenant.id, { fullName: 'Colaborador da Beta', departmentId: deptB }))
})

afterAll(() => t.close())

const asA = <T>(fn: Parameters<typeof withTenant<T>>[2]) =>
  withTenant(t.db, { tenantId: a.tenant.id, userId: a.users.admin!.id }, fn)

describe('isolamento no banco (RLS)', () => {
  it('a role da aplicação sem organização definida não enxerga nenhuma linha', async () => {
    const rows = await t.db.transaction(async tx => {
      await tx.execute(sql`set local role falcao_app`)
      return rowsOf<{ total: number }>(await tx.execute(sql`select count(*)::int as total from employees`))
    })
    expect(rows[0]!.total).toBe(0)
  })

  it('a empresa A não lê colaboradores nem departamentos da B', async () => {
    const result = await asA(async tx => ({
      employees: await tx.select().from(employees),
      departments: await tx.select().from(departments),
    }))
    expect(result.employees).toHaveLength(0)
    expect(result.departments).toHaveLength(0)
  })

  it('a empresa A não grava linhas com o tenant da B', async () => {
    await expect(asA(tx => tx.insert(employees).values(employee(b.tenant.id)))).rejects.toThrow()
  })

  it('a empresa A não aponta para um departamento da B (chave composta)', async () => {
    await expect(
      asA(tx => tx.insert(employees).values(employee(a.tenant.id, { departmentId: deptB }))),
    ).rejects.toThrow()
  })

  it('a empresa A não altera nem apaga linhas da B', async () => {
    const updated = await asA(tx => tx.update(departments).set({ name: 'invadido' }).returning())
    const deleted = await asA(tx => tx.delete(employees).returning())
    expect(updated).toHaveLength(0)
    expect(deleted).toHaveLength(0)
    const [still] = await t.db.select().from(departments).where(sql`id = ${deptB}`)
    expect(still!.name).toBe('Obras B')
  })

  it('a auditoria é imutável, mesmo para o dono das tabelas', async () => {
    await asA(tx =>
      tx.insert(auditLogs).values({ tenantId: a.tenant.id, action: 'test', entity: 'test' }),
    )
    // O Drizzle embrulha o erro do PostgreSQL: o motivo fica em `cause`.
    const reason = (promise: Promise<unknown>) =>
      promise.then(
        () => 'aceito',
        (error: { cause?: { message?: string } }) => error.cause?.message ?? '',
      )
    expect(await reason(t.db.update(auditLogs).set({ action: 'adulterado' }))).toMatch(/imutáveis/)
    expect(await reason(t.db.delete(auditLogs))).toMatch(/imutáveis/)
  })
})

describe('isolamento das tabelas do recrutamento', () => {
  // Uma linha da empresa B em cada tabela nova, gravada como dono.
  const B = {
    job: randomUUID(),
    question: randomUUID(),
    candidate: randomUUID(),
    application: randomUUID(),
  }

  /** Linha nova de cada tabela, com o tenant e as referências da empresa B. */
  const rowOfB: Record<string, () => SQL> = {
    job_openings: () => sql`
      insert into job_openings (tenant_id, title, contract_type, work_mode, description, status, share_token)
      values (${b.tenant.id}, 'Vaga B', 'clt', 'site', 'Descrição longa o bastante.', 'published', ${randomUUID()})`,
    job_questions: () => sql`
      insert into job_questions (tenant_id, job_id, position, kind, label)
      values (${b.tenant.id}, ${B.job}, ${Math.floor(Math.random() * 1e6) + 1}, 'text', 'Pergunta B')`,
    candidates: () => sql`
      insert into candidates (tenant_id, full_name, email, phone, city, state)
      values (${b.tenant.id}, 'Candidata B', 'b@exemplo.com', '71999990000', 'Salvador', 'BA')`,
    applications: () => sql`
      insert into applications (tenant_id, job_id, candidate_id, email, privacy_token)
      values (${b.tenant.id}, ${B.job}, ${B.candidate}, ${`${randomUUID()}@exemplo.com`}, ${randomUUID()})`,
    application_answers: () => sql`
      insert into application_answers (tenant_id, application_id, question_id, value)
      values (${b.tenant.id}, ${B.application}, ${B.question}, 'Sim')`,
    application_events: () => sql`
      insert into application_events (tenant_id, application_id, from_stage, to_stage)
      values (${b.tenant.id}, ${B.application}, null, 'new')`,
    application_notes: () => sql`
      insert into application_notes (tenant_id, application_id, body)
      values (${b.tenant.id}, ${B.application}, 'Nota B')`,
    candidate_files: () => sql`
      insert into candidate_files (tenant_id, candidate_id, application_id, storage_key, filename, size_bytes)
      values (${b.tenant.id}, ${B.candidate}, ${B.application}, ${randomUUID()}, 'cv.pdf', 10)`,
  }
  const tables = Object.keys(rowOfB)

  const failure = (promise: Promise<unknown>) =>
    promise.then(
      () => 'aceito',
      (error: { cause?: { message?: string } }) => error.cause?.message ?? '',
    )

  beforeAll(async () => {
    await t.db.execute(sql`
      insert into job_openings (id, tenant_id, title, contract_type, work_mode, description, status, share_token)
      values (${B.job}, ${b.tenant.id}, 'Vaga B', 'clt', 'site', 'Descrição longa o bastante.', 'published', ${randomUUID()})`)
    await t.db.execute(sql`
      insert into job_questions (id, tenant_id, job_id, position, kind, label)
      values (${B.question}, ${b.tenant.id}, ${B.job}, 0, 'text', 'Pergunta B')`)
    await t.db.execute(sql`
      insert into candidates (id, tenant_id, full_name, email, phone, city, state)
      values (${B.candidate}, ${b.tenant.id}, 'Candidata B', 'b@exemplo.com', '71999990000', 'Salvador', 'BA')`)
    await t.db.execute(sql`
      insert into applications (id, tenant_id, job_id, candidate_id, email, privacy_token)
      values (${B.application}, ${b.tenant.id}, ${B.job}, ${B.candidate}, 'b@exemplo.com', ${randomUUID()})`)
    for (const table of ['application_answers', 'application_events', 'application_notes', 'candidate_files']) {
      await t.db.execute(rowOfB[table]!())
    }
  })

  it.each(tables)('a empresa A não lê %s da B', async table => {
    const rows = await asA(async tx =>
      rowsOf<{ total: number }>(await tx.execute(sql`select count(*)::int as total from ${sql.identifier(table)}`)),
    )
    expect(rows[0]!.total).toBe(0)
    const [owner] = rowsOf<{ total: number }>(
      await t.db.execute(sql`select count(*)::int as total from ${sql.identifier(table)}`),
    )
    expect(owner!.total).toBeGreaterThan(0)
  })

  it.each(tables)('a empresa A não grava em %s com o tenant da B', async table => {
    expect(await failure(asA(tx => tx.execute(rowOfB[table]!())))).toMatch(/row-level security/)
  })

  it('a empresa A não altera nem apaga linhas do recrutamento da B', async () => {
    const changed = await asA(async tx => [
      ...rowsOf(await tx.execute(sql`update applications set stage = 'rejected' returning id`)),
      ...rowsOf(await tx.execute(sql`delete from candidates returning id`)),
    ])
    expect(changed).toHaveLength(0)
  })

  it('a empresa A não candidata ninguém a uma vaga da B (chave composta)', async () => {
    const candidate = randomUUID()
    const result = await failure(
      asA(async tx => {
        await tx.execute(sql`
          insert into candidates (id, tenant_id, full_name, email, phone, city, state)
          values (${candidate}, ${a.tenant.id}, 'Candidata A', 'a@exemplo.com', '71999990000', 'Salvador', 'BA')`)
        await tx.execute(sql`
          insert into applications (tenant_id, job_id, candidate_id, email, privacy_token)
          values (${a.tenant.id}, ${B.job}, ${candidate}, 'a@exemplo.com', ${randomUUID()})`)
      }),
    )
    expect(result).toMatch(/applications_job_same_tenant_fk/)
  })
})

describe('isolamento na API', () => {
  it('lista apenas colaboradores da própria empresa', async () => {
    const response = await t.app.inject({
      method: 'GET',
      url: '/api/v1/employees',
      headers: { cookie: a.users.admin!.cookie },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().total).toBe(0)
  })

  it('recusa trocar para uma organização da qual o usuário não participa', async () => {
    const response = await t.app.inject({
      method: 'GET',
      url: '/api/v1/employees',
      headers: { cookie: a.users.admin!.cookie, 'x-tenant-id': b.tenant.id },
    })
    expect(response.statusCode).toBe(403)
  })

  it('não encontra pelo id um colaborador da outra empresa', async () => {
    const [other] = await t.db.select({ id: employees.id }).from(employees).where(sql`tenant_id = ${b.tenant.id}`)
    const response = await t.app.inject({
      method: 'GET',
      url: `/api/v1/employees/${other!.id}`,
      headers: { cookie: a.users.admin!.cookie },
    })
    expect(response.statusCode).toBe(404)
  })

  it('recusa cadastrar colaborador em departamento de outra empresa', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/v1/employees',
      headers: { cookie: a.users.admin!.cookie },
      payload: {
        registration: 'X1',
        fullName: 'Tentativa Cruzada',
        cpf: nextCpf(),
        hireDate: '2026-01-05',
        contractType: 'clt',
        departmentId: deptB,
      },
    })
    expect(response.statusCode).toBe(422)
  })

  it('a lista de membros não mostra vínculos de outras organizações', async () => {
    const response = await t.app.inject({
      method: 'GET',
      url: '/api/v1/members',
      headers: { cookie: a.users.admin!.cookie },
    })
    expect(response.statusCode).toBe(200)
    const emails = response.json().map((m: { email: string }) => m.email)
    expect(emails).toEqual(['admin@alfa.test'])
  })

  it('exige sessão nas rotas de domínio', async () => {
    const response = await t.app.inject({ method: 'GET', url: '/api/v1/employees' })
    expect(response.statusCode).toBe(401)
  })
})
