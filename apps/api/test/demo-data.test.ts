import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { seedDemoActivity } from '../src/db/demo-activity'
import { seedDemo, seedDemoProfiles } from '../src/db/demo-data'
import { createTestApp, type TestApp } from './harness'

let t: TestApp
beforeAll(async () => {
  t = await createTestApp()
})
afterAll(() => t.close())

describe('massa de demonstração', () => {
  it('cria a organização DEMO, é idempotente e alimenta o dashboard', async () => {
    const credentials = { email: 'demo@exemplo.invalid', password: 'senha-demo-123' }
    const first = await seedDemo(t.db, t.auth, credentials)
    expect(first?.employees).toBe(39)
    expect(await seedDemo(t.db, t.auth, credentials)).toBeNull()

    expect(await seedDemoProfiles(t.db, t.auth, credentials.password)).toHaveLength(3)
    const activity = await seedDemoActivity(t.db, t.storage)
    expect(activity?.documents).toBeGreaterThan(10)
    expect(activity?.pending).toBeGreaterThan(0)
    expect(await seedDemoActivity(t.db, t.storage)).toBeNull()

    // O gestor DEMO tem pedidos da equipe esperando por ele.
    const manager = await t.login('gestor@demo.falcao.invalid', credentials.password)
    const queue = await t.app.inject({ method: 'GET', url: '/api/v1/requests?awaitingMe=true', headers: { cookie: manager } })
    expect(queue.json().length).toBe(activity!.pending)

    const cookie = await t.login(credentials.email, credentials.password)
    const response = await t.app.inject({ method: 'GET', url: '/api/v1/dashboard', headers: { cookie } })
    expect(response.statusCode).toBe(200)
    const data = response.json()
    expect(data.headcount.total).toBeGreaterThan(30)
    expect(data.distribution.byDepartment.map((d: { label: string }) => d.label)).toContain('Obras')

    const me = (await t.app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } })).json()
    expect(me.tenant.name).toMatch(/\(DEMO\)/)
  })
})
