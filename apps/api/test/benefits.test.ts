import ExcelJS from 'exceljs'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { benefitPlanValues, benefitRunItems, requests } from '../src/db/schema'
import { amountFor, businessDays, monthBounds } from '../src/modules/benefits/benefits.service'
import { createTestApp, nextCpf, type TestApp } from './harness'

let t: TestApp
let org: Awaited<ReturnType<TestApp['seedTenant']>>
let other: Awaited<ReturnType<TestApp['seedTenant']>>
const ids: Record<string, string> = {}

const call = (role: 'hr' | 'manager', method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object, who = org) =>
  t.app.inject({ method, url: `/api/v1${url}`, headers: { cookie: who.users[role]!.cookie }, ...(payload ? { payload } : {}) })
const employee = async (name: string, hireDate: string) =>
  (await call('hr', 'POST', '/employees', { registration: name, fullName: `Pessoa ${name}`, cpf: nextCpf(), hireDate, contractType: 'clt' })).json().id as string

describe('regras de calendário', () => {
  it('conta dias úteis e o valor proporcional', () => {
    expect(monthBounds('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(businessDays('2026-03-01', '2026-03-31')).toBe(22)
    expect(businessDays('2026-03-07', '2026-03-08')).toBe(0)
    expect(amountFor('daily', 3000, 17, 22)).toBe(51000)
    expect(amountFor('monthly', 60000, 12, 22)).toBe(32727)
    expect(amountFor('monthly', 60000, 22, 22)).toBe(60000)
  })
})

describe('benefícios VA/VR', () => {
  beforeAll(async () => {
    t = await createTestApp()
    org = await t.seedTenant('beneficios', ['admin', 'hr', 'manager'])
    other = await t.seedTenant('beneficios-b', ['hr'])
    ids.vr = (await call('hr', 'POST', '/benefits/plans', { kind: 'vr', name: 'VR diário', valueType: 'daily', valueCents: 3000, effectiveFrom: '2026-01-01' })).json().id
    ids.va = (await call('hr', 'POST', '/benefits/plans', { kind: 'va', name: 'VA mensal', valueType: 'monthly', valueCents: 60000, effectiveFrom: '2026-01-01' })).json().id
    ids.a = await employee('A', '2025-01-10')
    ids.b = await employee('B', '2026-03-16')
    ids.c = await employee('C', '2025-06-01')
  })

  afterAll(() => t.close())

  it('histórico de valores: reajuste programado não muda o valor atual nem o histórico', async () => {
    expect((await call('hr', 'POST', `/benefits/plans/${ids.vr}/values`, { valueCents: 3500, effectiveFrom: '2026-04-01' })).statusCode).toBe(201)
    const vr = (await call('hr', 'GET', '/benefits/plans')).json().find((p: { id: string }) => p.id === ids.vr)
    expect(vr.history.map((h: { valueCents: number }) => h.valueCents)).toEqual([3500, 3000])
    await expect(t.db.update(benefitPlanValues).set({ valueCents: 1 }).where(eq(benefitPlanValues.planId, ids.vr))).rejects.toThrow()
  })

  it('escolha do benefício: trocar fecha o anterior na véspera', async () => {
    await call('hr', 'PUT', `/benefits/employees/${ids.a}`, { planId: ids.vr, startDate: '2026-01-01' })
    await call('hr', 'PUT', `/benefits/employees/${ids.b}`, { planId: ids.va, startDate: '2026-03-16' })
    await call('hr', 'PUT', `/benefits/employees/${ids.c}`, { planId: ids.vr, startDate: '2026-01-01' })
    expect((await call('hr', 'PUT', `/benefits/employees/${ids.c}`, { planId: ids.va, startDate: '2026-01-01' })).statusCode).toBe(400)
    expect((await call('hr', 'PUT', `/benefits/employees/${ids.c}`, { planId: ids.va, startDate: '2026-03-20' })).statusCode).toBe(200)
    const history = (await call('hr', 'GET', `/benefits/employees/${ids.c}`)).json()
    expect(history.map((h: { planName: string; endDate: string | null }) => [h.planName, h.endDate])).toEqual([
      ['VA mensal', null],
      ['VR diário', '2026-03-19'],
    ])
  })

  it('apuração de março: dias úteis, ausências aprovadas, admissão e troca no meio do mês', async () => {
    await t.db.insert(requests).values({
      tenantId: org.tenant.id,
      employeeId: ids.a,
      type: 'absence',
      absenceKind: 'justified',
      status: 'approved',
      startDate: '2026-03-09',
      endDate: '2026-03-13',
      days: 5,
    })
    const created = await call('hr', 'POST', '/benefits/runs', { competence: '2026-03' })
    expect(created.statusCode).toBe(201)
    ids.run = created.json().id
    expect((await call('hr', 'POST', '/benefits/runs', { competence: '2026-03' })).statusCode).toBe(409)

    const run = (await call('hr', 'GET', `/benefits/runs/${ids.run}`)).json()
    expect(run.workdays).toBe(22)
    const of = (id: string) => run.items.find((i: { employeeId: string }) => i.employeeId === id)
    expect(of(ids.a)).toMatchObject({ kind: 'vr', unitValueCents: 3000, eligibleDays: 22, deductedDays: 5, days: 17, amountCents: 51000 })
    expect(of(ids.b)).toMatchObject({ kind: 'va', eligibleDays: 12, days: 12, amountCents: 32727 })
    expect(of(ids.c)).toMatchObject({ kind: 'va', eligibleDays: 8, amountCents: 21818 })
  })

  it('RH ajusta os dias antes de fechar; fechada não muda nem no banco', async () => {
    const item = (await call('hr', 'GET', `/benefits/runs/${ids.run}`)).json().items.find((i: { employeeId: string }) => i.employeeId === ids.a)
    const adjusted = await call('hr', 'PATCH', `/benefits/runs/${ids.run}/items/${item.id}`, { days: 20, note: 'Ausência compensada' })
    expect(adjusted.json()).toMatchObject({ days: 20, amountCents: 60000 })

    const file = await call('hr', 'GET', `/benefits/runs/${ids.run}/export`)
    expect(file.headers['content-type']).toContain('spreadsheetml')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(file.rawPayload as never)
    expect(workbook.worksheets[0]!.rowCount).toBe(5) // cabeçalho + 3 pessoas + total

    expect((await call('hr', 'POST', `/benefits/runs/${ids.run}/close`)).statusCode).toBe(200)
    expect((await call('hr', 'PATCH', `/benefits/runs/${ids.run}/items/${item.id}`, { days: 1 })).statusCode).toBe(409)
    expect((await call('hr', 'POST', `/benefits/runs/${ids.run}/recalculate`)).statusCode).toBe(409)
    await expect(t.db.update(benefitRunItems).set({ days: 1 }).where(eq(benefitRunItems.id, item.id))).rejects.toThrow()
  })

  it('gestor não acessa; outra empresa não vê a apuração', async () => {
    expect((await call('manager', 'GET', '/benefits/runs')).statusCode).toBe(403)
    expect((await call('hr', 'GET', `/benefits/runs/${ids.run}`, undefined, other)).statusCode).toBe(404)
    expect((await call('hr', 'GET', '/benefits/plans', undefined, other)).json()).toEqual([])
  })
})
