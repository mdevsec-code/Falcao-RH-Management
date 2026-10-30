import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { auditLogs, memberships } from '../src/db/schema'
import { createTestApp, nextCpf, type TestApp } from './harness'

let t: TestApp
let org: Awaited<ReturnType<TestApp['seedTenant']>>
const ids: Record<string, string> = {}

const call = (
  role: 'admin' | 'hr' | 'manager' | 'employee',
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) =>
  t.app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { cookie: org.users[role]!.cookie },
    ...(payload ? { payload } : {}),
  })

const newEmployee = (extra: object = {}) => ({
  registration: `R${Math.random().toString(36).slice(2, 7)}`,
  fullName: 'Pessoa Qualquer',
  cpf: nextCpf(),
  hireDate: '2026-02-01',
  contractType: 'clt',
  ...extra,
})

beforeAll(async () => {
  t = await createTestApp()
  org = await t.seedTenant('gama', ['admin', 'hr', 'manager', 'employee'])

  const unit = await call('admin', 'POST', '/units', { name: 'Canteiro Central', state: 'sp' })
  const position = await call('admin', 'POST', '/positions', { title: 'Engenheiro Civil', level: 'Pleno' })
  const engineering = await call('admin', 'POST', '/departments', { name: 'Engenharia' })
  const finance = await call('admin', 'POST', '/departments', { name: 'Financeiro' })
  ids.unit = unit.json().id
  ids.position = position.json().id
  ids.engineering = engineering.json().id
  ids.finance = finance.json().id

  const manager = await call('hr', 'POST', '/employees', newEmployee({ fullName: 'Gestora Engenharia', hireDate: '2024-03-01', departmentId: ids.engineering }))
  ids.manager = manager.json().id
  const report = await call('hr', 'POST', '/employees', newEmployee({ fullName: 'Subordinado Direto', managerId: ids.manager, birthDate: '1990-05-20', phone: '11 99999-0000', departmentId: ids.finance }))
  ids.report = report.json().id
  const other = await call('hr', 'POST', '/employees', newEmployee({ fullName: 'Outra Área', departmentId: ids.finance }))
  ids.other = other.json().id

  // Vincula os acessos de gestor e colaborador às respectivas fichas.
  const members = (await call('admin', 'GET', '/members')).json() as { id: string; role: string }[]
  const byRole = Object.fromEntries(members.map(m => [m.role, m.id]))
  await call('admin', 'PATCH', `/members/${byRole.manager}`, { employeeId: ids.manager })
  await call('admin', 'PATCH', `/members/${byRole.employee}`, { employeeId: ids.report })
  ids.adminMembership = byRole.admin!
})

afterAll(() => t.close())

describe('estrutura organizacional', () => {
  it('cria unidade normalizando a UF', async () => {
    const units = (await call('hr', 'GET', '/units')).json()
    expect(units[0].state).toBe('SP')
  })

  it('impede ciclo na hierarquia de departamentos', async () => {
    await call('admin', 'PUT', `/departments/${ids.finance}`, { name: 'Financeiro', parentId: ids.engineering })
    const response = await call('admin', 'PUT', `/departments/${ids.engineering}`, { name: 'Engenharia', parentId: ids.finance })
    expect(response.statusCode).toBe(400)
  })

  it('não exclui departamento com colaboradores ativos', async () => {
    const response = await call('admin', 'DELETE', `/departments/${ids.finance}`)
    expect(response.statusCode).toBe(400)
  })

  it('lista departamentos com quadro de pessoal real', async () => {
    const list = (await call('manager', 'GET', '/departments')).json() as { name: string; headcount: number }[]
    expect(list.find(d => d.name === 'Financeiro')!.headcount).toBe(2)
  })

  it('gestor não altera a estrutura', async () => {
    expect((await call('manager', 'POST', '/units', { name: 'Nova' })).statusCode).toBe(403)
  })
})

describe('colaboradores e permissões', () => {
  it('recusa CPF inválido e CPF duplicado', async () => {
    expect((await call('hr', 'POST', '/employees', newEmployee({ cpf: '123.456.789-00' }))).statusCode).toBe(400)
    const cpf = nextCpf()
    expect((await call('hr', 'POST', '/employees', newEmployee({ cpf }))).statusCode).toBe(201)
    const duplicate = await call('hr', 'POST', '/employees', newEmployee({ cpf }))
    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json().message).toMatch(/CPF/)
  })

  it('gestor e colaborador não cadastram colaboradores', async () => {
    expect((await call('manager', 'POST', '/employees', newEmployee())).statusCode).toBe(403)
    expect((await call('employee', 'POST', '/employees', newEmployee())).statusCode).toBe(403)
  })

  it('colaborador não lista o quadro de pessoal', async () => {
    expect((await call('employee', 'GET', '/employees')).statusCode).toBe(403)
  })

  it('gestor vê apenas a si e à própria equipe', async () => {
    const list = (await call('manager', 'GET', '/employees')).json()
    const names = list.items.map((e: { fullName: string }) => e.fullName).sort()
    expect(names).toEqual(['Gestora Engenharia', 'Subordinado Direto'])
    expect((await call('manager', 'GET', `/employees/${ids.other}`)).statusCode).toBe(404)
  })

  it('gestor vê dados pessoais da equipe mascarados', async () => {
    const detail = (await call('manager', 'GET', `/employees/${ids.report}`)).json()
    expect(detail.cpf).toMatch(/^\*\*\*\.\*\*\*\.\*\*\*-\d{2}$/)
    expect(detail.birthDate).toBeNull()
    expect(detail.phone).toBeNull()
    expect(detail.isMasked).toBe(true)
  })

  it('RH vê dados pessoais completos', async () => {
    const detail = (await call('hr', 'GET', `/employees/${ids.report}`)).json()
    expect(detail.cpf).toMatch(/^\d{11}$/)
    expect(detail.birthDate).toBe('1990-05-20')
  })

  it('busca por nome e filtra por departamento com paginação', async () => {
    const found = (await call('hr', 'GET', '/employees?q=subordinado')).json()
    expect(found.total).toBe(1)
    const page = (await call('hr', 'GET', `/employees?departmentId=${ids.finance}&pageSize=1&page=2`)).json()
    expect(page.total).toBe(2)
    expect(page.items).toHaveLength(1)
  })

  it('registra movimentação de departamento no histórico', async () => {
    const response = await call('hr', 'PATCH', `/employees/${ids.other}`, { departmentId: ids.engineering, positionId: ids.position })
    expect(response.statusCode).toBe(200)
    const detail = (await call('hr', 'GET', `/employees/${ids.other}`)).json()
    const types = detail.history.map((h: { type: string }) => h.type)
    expect(types).toEqual(expect.arrayContaining(['hired', 'department_changed', 'position_changed']))
    expect(detail.departmentName).toBe('Engenharia')
  })

  it('desligamento exige motivo, grava a data e entra no histórico', async () => {
    expect((await call('hr', 'POST', `/employees/${ids.other}/status`, { status: 'terminated', effectiveDate: '2026-09-30' })).statusCode).toBe(400)
    const response = await call('hr', 'POST', `/employees/${ids.other}/status`, {
      status: 'terminated',
      effectiveDate: '2026-09-30',
      reason: 'Pedido de demissão',
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().terminationDate).toBe('2026-09-30')
    const detail = (await call('hr', 'GET', `/employees/${ids.other}`)).json()
    // O histórico segue a data de vigência, não a data de digitação.
    const termination = detail.history.find((h: { type: string }) => h.type === 'status_changed')
    expect(termination).toMatchObject({ effectiveDate: '2026-09-30', reason: 'Pedido de demissão' })
  })

  it('audita alterações sem gravar valores pessoais', async () => {
    const logs = await t.db.select().from(auditLogs).where(eq(auditLogs.entityId, ids.other!))
    const update = logs.find(l => l.action === 'update')!
    expect(update.changedFields).toEqual(expect.arrayContaining(['departmentId']))
    expect(JSON.stringify(logs)).not.toContain('Pessoa Qualquer')
  })
})

describe('portal do colaborador', () => {
  it('o colaborador vê a própria ficha completa', async () => {
    const me = (await call('employee', 'GET', '/me/employee')).json()
    expect(me.fullName).toBe('Subordinado Direto')
    expect(me.cpf).toMatch(/^\d{11}$/)
  })

  it('atualiza o próprio contato, mas não campos funcionais', async () => {
    const before = (await call('employee', 'GET', '/me/employee')).json()
    const response = await call('employee', 'PATCH', '/me/employee', { phone: '11 98888-7777', registration: 'HACK' })
    expect(response.statusCode).toBe(200)
    const after = (await call('employee', 'GET', '/me/employee')).json()
    expect(after.phone).toBe('11 98888-7777')
    expect(after.registration).toBe(before.registration)
  })
})

describe('usuários e acessos', () => {
  it('/me informa perfil, permissões e organização', async () => {
    const me = (await call('manager', 'GET', '/me')).json()
    expect(me.role).toBe('manager')
    expect(me.scope).toBe('team')
    expect(me.permissions).toContain('employees.read')
    expect(me.tenant.slug).toBe('gama')
  })

  it('convite cria o acesso e envia o link de definição de senha', async () => {
    const response = await call('admin', 'POST', '/members', { name: 'Nova Analista', email: 'Nova@Gama.test', role: 'hr' })
    expect(response.statusCode).toBe(201)
    const mail = t.mailer.sent.at(-1)!
    expect(mail.to).toBe('nova@gama.test')
    expect(mail.text).toMatch(/reset-password/)
    expect((await call('admin', 'POST', '/members', { name: 'Nova Analista', email: 'nova@gama.test', role: 'hr' })).statusCode).toBe(409)
  })

  it('só o administrador gerencia acessos', async () => {
    expect((await call('hr', 'GET', '/members')).statusCode).toBe(403)
  })

  it('o administrador não rebaixa a si mesmo', async () => {
    const response = await call('admin', 'PATCH', `/members/${ids.adminMembership}`, { role: 'hr' })
    expect(response.statusCode).toBe(400)
  })

  it('acesso desativado deixa de entrar na organização', async () => {
    const [membership] = await t.db.select().from(memberships).where(eq(memberships.userId, org.users.employee!.id))
    await call('admin', 'PATCH', `/members/${membership!.id}`, { status: 'disabled' })
    expect((await call('employee', 'GET', '/me')).statusCode).toBe(403)
  })
})

describe('dashboard', () => {
  it('calcula indicadores a partir do banco', async () => {
    const response = await call('hr', 'GET', '/dashboard?from=2026-01-01&to=2026-12-31')
    expect(response.statusCode).toBe(200)
    const data = response.json()
    // 5 cadastrados (gestora + subordinado + outra área + 1 do teste de CPF), 1 desligado.
    expect(data.headcount.active).toBe(3)
    expect(data.movement.terminations).toBe(1)
    expect(data.movement.hires).toBe(3)
    expect(data.trend).toHaveLength(12)
    expect(data.distribution.byDepartment.length).toBeGreaterThan(0)
    expect(data.absence.absenteeism).toBe(0)
    expect(data.requests.pending).toBe(0)
  })

  it('aniversariantes não expõem o ano de nascimento', async () => {
    const data = (await call('hr', 'GET', '/dashboard')).json()
    expect(JSON.stringify(data.birthdays)).not.toContain('1990')
  })

  it('gestor vê o dashboard restrito à equipe; colaborador não vê', async () => {
    const data = (await call('manager', 'GET', '/dashboard')).json()
    expect(data.headcount.total).toBe(2)
    expect((await call('employee', 'GET', '/dashboard')).statusCode).toBe(403)
  })
})
