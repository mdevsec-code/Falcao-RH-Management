import ExcelJS from 'exceljs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestApp, nextCpf, type TestApp } from './harness'

type Role = 'admin' | 'hr' | 'manager' | 'employee'

let t: TestApp
let org: Awaited<ReturnType<TestApp['seedTenant']>>
let other: Awaited<ReturnType<TestApp['seedTenant']>>
const ids: Record<string, string> = {}

const call = (role: Role, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
  t.app.inject({ method, url: `/api/v1${url}`, headers: { cookie: org.users[role]!.cookie }, ...(payload ? { payload } : {}) })

const multipart = (url: string, fields: Record<string, string>, bytes: Buffer, name: string, headers: Record<string, string> = {}) => {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  form.append('file', new Blob([new Uint8Array(bytes)]), name)
  return t.app.inject({ method: 'POST', url, headers, payload: form as never })
}

beforeAll(async () => {
  t = await createTestApp()
  org = await t.seedTenant('teta', ['admin', 'hr', 'employee'])
  other = await t.seedTenant('iota', ['admin'])
})

afterAll(async () => {
  await t.close()
})

describe('mobilidade e transporte', () => {
  it('cadastra rota, vincula colaborador e calcula ocupação', async () => {
    const route = await call('hr', 'POST', '/transport/routes', { name: 'Rota Norte', capacity: 20 })
    expect(route.statusCode).toBe(201)
    ids.route = route.json().id
    ids.worker = (
      await call('hr', 'POST', '/employees', {
        registration: 'T-100',
        fullName: 'Passageiro Teste',
        cpf: nextCpf(),
        hireDate: '2024-01-08',
        contractType: 'clt',
      })
    ).json().id

    expect((await call('hr', 'PUT', `/transport/employees/${ids.worker}`, { mode: 'chartered' })).statusCode).toBe(400)
    const set = await call('hr', 'PUT', `/transport/employees/${ids.worker}`, { mode: 'chartered', routeId: ids.route, pickupCity: 'Sumaré' })
    expect(set.statusCode).toBe(200)

    const routes = (await call('hr', 'GET', '/transport/routes')).json()
    expect(routes[0].riders).toBe(1)
    const board = (await call('hr', 'GET', '/transport/board')).json() as { employeeId: string; mode: string | null }[]
    expect(board.find(r => r.employeeId === ids.worker)?.mode).toBe('chartered')
    expect((await call('employee', 'GET', '/transport/board')).statusCode).toBe(403)
  })

  it('importa a planilha: prévia com erros não grava nada', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Transporte')
    sheet.addRow(['Matrícula', 'Modalidade', 'Fornecedor', 'Custo mensal (R$)'])
    sheet.addRow(['T-100', 'Mobilidade', 'Cartão X', '250,50'])
    sheet.addRow(['NAO-EXISTE', 'Fretado', '', ''])
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer())
    const cookie = org.users.hr!.cookie

    const preview = await multipart('/api/v1/transport/import?commit=true', {}, bytes, 'transporte.xlsx', { cookie })
    expect(preview.json().failed).toBe(1)
    expect(preview.json().imported).toBe(0)

    sheet.spliceRows(3, 1)
    const ok = await multipart('/api/v1/transport/import?commit=true', {}, Buffer.from(await workbook.xlsx.writeBuffer()), 't.xlsx', { cookie })
    expect(ok.json().imported).toBe(1)
    const board = (await call('hr', 'GET', '/transport/board')).json() as { employeeId: string; mode: string; monthlyCostCents: number; routeId: string | null }[]
    const row = board.find(r => r.employeeId === ids.worker)!
    expect(row.mode).toBe('mobility')
    expect(row.monthlyCostCents).toBe(25050)
    expect(row.routeId).toBeNull()
  })

  it('isolamento: outra empresa não vê nem altera rotas e cadastros', async () => {
    const as = (method: 'GET' | 'PUT', url: string, payload?: object) =>
      t.app.inject({ method, url: `/api/v1${url}`, headers: { cookie: other.users.admin!.cookie }, ...(payload ? { payload } : {}) })
    expect((await as('GET', '/transport/routes')).json()).toEqual([])
    expect((await as('GET', '/transport/board')).json()).toEqual([])
    expect((await as('PUT', `/transport/employees/${ids.worker}`, { mode: 'own' })).statusCode).toBe(404)
  })
})
