import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { candidates } from '../src/db/schema'
import { createTestApp, type TestApp } from './harness'

let t: TestApp
let org: Awaited<ReturnType<TestApp['seedTenant']>>
let other: Awaited<ReturnType<TestApp['seedTenant']>>
const id = randomUUID()

const put = (cookie: string, body: object) =>
  t.app.inject({ method: 'PUT', url: `/api/v1/candidates/${id}/foreign`, headers: { cookie }, payload: body })

beforeAll(async () => {
  t = await createTestApp()
  org = await t.seedTenant('estrangeiro', ['hr', 'manager'])
  other = await t.seedTenant('estrangeiro-b', ['hr'])
  await t.db.insert(candidates).values({ id, tenantId: org.tenant.id, fullName: 'Pessoa Estrangeira', email: `${id}@exemplo.com`, phone: '71999990000', city: 'Camaçari', state: 'BA' })
})

afterAll(() => t.close())

describe('candidato estrangeiro', () => {
  it('RH registra e remove os dados de migração; gestor e outra empresa não', async () => {
    const hr = org.users.hr!.cookie
    expect((await put(hr, { foreign: { nationality: '' } })).statusCode).toBe(400)
    const saved = await put(hr, { foreign: { nationality: 'Venezuelana', rnm: 'V123456-7', visaExpiresAt: '2027-05-01' } })
    expect(saved.statusCode).toBe(200)

    const detail = (await t.app.inject({ method: 'GET', url: `/api/v1/candidates/${id}`, headers: { cookie: hr } })).json()
    expect(detail.foreign).toMatchObject({ nationality: 'Venezuelana', rnm: 'V123456-7', passport: '', visaExpiresAt: '2027-05-01' })

    expect((await put(org.users.manager!.cookie, { foreign: null })).statusCode).toBe(403)
    expect((await put(other.users.hr!.cookie, { foreign: null })).statusCode).toBe(404)

    expect((await put(hr, { foreign: null })).json().foreign).toBeNull()
  })

  it('aba Estrangeiros: grava etapas e datas e lista só quem tem dados de migração', async () => {
    const hr = org.users.hr!.cookie
    const list = () => t.app.inject({ method: 'GET', url: '/api/v1/candidates/foreign', headers: { cookie: hr } })
    expect((await list()).json()).toEqual([])

    const saved = await put(hr, {
      foreign: {
        nationality: 'Chinesa',
        arrivalDate: '2026-09-01',
        regulatedProfession: true,
        steps: { passport: { status: 'done' }, migranteweb: { status: 'in_progress', date: '2026-08-10', note: 'Protocolo 08228.000001/2026-00' } },
      },
    })
    expect(saved.statusCode).toBe(200)
    // Etapa desconhecida ou status inválido: recusado.
    expect((await put(hr, { foreign: { nationality: 'Chinesa', steps: { inventada: { status: 'done' } } } })).statusCode).toBe(400)
    expect((await put(hr, { foreign: { nationality: 'Chinesa', steps: { cpf: { status: 'talvez' } } } })).statusCode).toBe(400)

    const rows = (await list()).json()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id,
      fullName: 'Pessoa Estrangeira',
      foreign: { nationality: 'Chinesa', arrivalDate: '2026-09-01', regulatedProfession: true, steps: { migranteweb: { status: 'in_progress', note: 'Protocolo 08228.000001/2026-00' } } },
    })

    expect((await t.app.inject({ method: 'GET', url: '/api/v1/candidates/foreign', headers: { cookie: org.users.manager!.cookie } })).statusCode).toBe(403)
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/candidates/foreign', headers: { cookie: other.users.hr!.cookie } })).json()).toEqual([])
  })
})
