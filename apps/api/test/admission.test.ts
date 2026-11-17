import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestApp, nextCpf, type TestApp } from './harness'

let t: TestApp
let org: Awaited<ReturnType<TestApp['seedTenant']>>
let employeeId: string

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')

const call = (role: 'hr' | 'manager', method: 'GET' | 'POST', url: string, payload?: object) =>
  t.app.inject({ method, url: `/api/v1${url}`, headers: { cookie: org.users[role]!.cookie }, ...(payload ? { payload } : {}) })
const pub = (method: 'GET' | 'POST', token: string, suffix = '', payload?: object) =>
  t.app.inject({ method, url: `/api/public/v1/admission/${token}${suffix}`, ...(payload ? { payload } : {}) })
const upload = (token: string, title: string) => {
  const form = new FormData()
  form.append('title', title)
  form.append('file', new Blob([new Uint8Array(PDF)], { type: 'application/pdf' }), `${title}.pdf`)
  return t.app.inject({ method: 'POST', url: `/api/public/v1/admission/${token}/documents`, payload: form as never })
}
const newLink = async () => ((await call('hr', 'POST', `/employees/${employeeId}/admission-link`)).json().path as string).replace('/admissao/', '')

const data = {
  birthDate: '1994-03-12',
  phone: '71999990000',
  email: 'novo@exemplo.com',
  address: { street: 'Rua A', number: '10', district: 'Centro', city: 'Camaçari', state: 'BA' },
}

beforeAll(async () => {
  t = await createTestApp()
  org = await t.seedTenant('admissao', ['admin', 'hr', 'manager'])
  employeeId = (
    await call('hr', 'POST', '/employees', { registration: 'A-1', fullName: 'Novo Colaborador', cpf: nextCpf(), hireDate: '2026-11-20', contractType: 'clt' })
  ).json().id
})

afterAll(() => t.close())

describe('admissão digital', () => {
  it('gestor não gera link; token inválido não abre nada', async () => {
    expect((await call('manager', 'POST', `/employees/${employeeId}/admission-link`)).statusCode).toBe(403)
    expect((await pub('GET', 'x'.repeat(43))).statusCode).toBe(404)
  })

  it('gerar outro link invalida o anterior', async () => {
    const first = await newLink()
    const second = await newLink()
    expect((await pub('GET', first)).statusCode).toBe(404)
    expect((await pub('GET', second)).statusCode).toBe(200)
  })

  it('o colaborador envia documentos e dados; o RH recebe tudo na ficha', async () => {
    const token = await newLink()
    const view = (await pub('GET', token)).json()
    expect(view.employee.fullName).toBe('Novo Colaborador')

    expect((await upload(token, 'RG')).statusCode).toBe(201)
    expect((await upload(token, 'Comprovante de residência')).statusCode).toBe(201)
    expect((await pub('GET', token)).json().documents.map((d: { title: string }) => d.title)).toEqual(['RG', 'Comprovante de residência'])

    expect((await pub('POST', token, '', { ...data, address: { city: '' } })).statusCode).toBe(400)
    expect((await pub('POST', token, '', data)).statusCode).toBe(204)
    // Enviado, o link fecha.
    expect((await pub('GET', token)).statusCode).toBe(404)

    const employee = (await call('hr', 'GET', `/employees/${employeeId}`)).json()
    expect(employee).toMatchObject({ birthDate: '1994-03-12', phone: '71999990000', address: { city: 'Camaçari', state: 'BA' } })
    const docs = (await call('hr', 'GET', `/documents?employeeId=${employeeId}`)).json()
    expect((docs.items ?? docs).length).toBe(2)
    expect((await call('hr', 'GET', `/employees/${employeeId}/admission-link`)).json().submittedAt).not.toBeNull()
  })
})
