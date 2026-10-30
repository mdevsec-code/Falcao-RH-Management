import { sql } from 'drizzle-orm'
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
