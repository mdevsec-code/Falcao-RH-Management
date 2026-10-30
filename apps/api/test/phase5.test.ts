import ExcelJS from 'exceljs'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { addDaysIso } from '@falcao-rh/contracts'

import { runAutomations } from '../src/automations/automations'
import { documents, memberships, notifications } from '../src/db/schema'
import { calendarDate } from '../src/lib/dates'
import { createTestApp, nextCpf, type TestApp } from './harness'

type Role = 'admin' | 'hr' | 'manager' | 'employee'

let t: TestApp
let org: Awaited<ReturnType<TestApp['seedTenant']>>
let other: Awaited<ReturnType<TestApp['seedTenant']>>
const ids: Record<string, string> = {}

const call = (role: Role, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
  t.app.inject({ method, url: `/api/v1${url}`, headers: { cookie: org.users[role]!.cookie }, ...(payload ? { payload } : {}) })

/** Envio multipart como o navegador faz: campos antes do arquivo. */
const upload = (cookie: string, url: string, fields: Record<string, string>, file: { name: string; bytes: Buffer; type?: string }) => {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  form.append('file', new Blob([new Uint8Array(file.bytes)], { type: file.type ?? 'application/pdf' }), file.name)
  return t.app.inject({ method: 'POST', url: `/api/v1${url}`, headers: { cookie }, payload: form as never })
}

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')
const EXE = Buffer.from('MZ\x90\x00\x03\x00\x00\x00 programa executável disfarçado')

/** Próxima segunda-feira a pelo menos `minDays` de hoje (início de férias válido). */
const nextMonday = (minDays = 7) => {
  let date = addDaysIso(calendarDate(), minDays)
  while (new Date(`${date}T12:00:00Z`).getUTCDay() !== 1) date = addDaysIso(date, 1)
  return date
}

const employeeBody = (extra: object = {}) => ({
  registration: `F${Math.random().toString(36).slice(2, 7)}`,
  fullName: 'Pessoa Fase Cinco',
  cpf: nextCpf(),
  hireDate: '2024-01-08',
  contractType: 'clt',
  ...extra,
})

beforeAll(async () => {
  t = await createTestApp()
  org = await t.seedTenant('delta', ['admin', 'hr', 'manager', 'employee'])
  other = await t.seedTenant('epsilon', ['admin'])

  ids.dept = (await call('admin', 'POST', '/departments', { name: 'Obras' })).json().id
  ids.manager = (await call('hr', 'POST', '/employees', employeeBody({ fullName: 'Gestora de Obras', departmentId: ids.dept }))).json().id
  ids.worker = (await call('hr', 'POST', '/employees', employeeBody({ fullName: 'Pedreiro Teste', departmentId: ids.dept, managerId: ids.manager }))).json().id
  const members = (await call('admin', 'GET', '/members')).json() as { id: string; role: Role }[]
  const byRole = Object.fromEntries(members.map(m => [m.role, m.id]))
  await call('admin', 'PATCH', `/members/${byRole.manager}`, { employeeId: ids.manager })
  await call('admin', 'PATCH', `/members/${byRole.employee}`, { employeeId: ids.worker })
  const categories = (await call('hr', 'GET', '/document-categories')).json() as { id: string; name: string }[]
  for (const c of categories) ids[c.name] = c.id
})

afterAll(() => t.close())

describe('férias: fluxo de aprovação gestor → RH', () => {
  let requestId: string

  it('o colaborador vê o saldo e pede férias', async () => {
    const balance = (await call('employee', 'GET', '/me/vacation-balance')).json()
    expect(balance.available).toBeGreaterThanOrEqual(30)

    const start = nextMonday()
    const response = await call('employee', 'POST', '/requests', { type: 'vacation', startDate: start, endDate: addDaysIso(start, 19) })
    expect(response.statusCode).toBe(201)
    requestId = response.json().id
  })

  it('o gestor é avisado no sistema e por e-mail', async () => {
    const list = (await call('manager', 'GET', '/notifications')).json()
    expect(list.unread).toBeGreaterThan(0)
    expect(list.items[0].title).toMatch(/aguardando sua aprovação/)
    expect(t.mailer.sent.some(m => m.to === 'manager@delta.test' && /Pedreiro Teste/.test(m.text))).toBe(true)
  })

  it('ninguém decide o próprio pedido nem pula a vez', async () => {
    expect((await call('employee', 'POST', `/requests/${requestId}/decision`, { decision: 'approve' })).statusCode).toBe(403)
    const queue = (await call('manager', 'GET', '/requests?awaitingMe=true')).json()
    expect(queue.map((r: { id: string }) => r.id)).toContain(requestId)
  })

  it('recusar exige motivo', async () => {
    expect((await call('manager', 'POST', `/requests/${requestId}/decision`, { decision: 'reject' })).statusCode).toBe(400)
  })

  it('gestor aprova, segue para o RH, RH aprova e o colaborador é avisado', async () => {
    const afterManager = (await call('manager', 'POST', `/requests/${requestId}/decision`, { decision: 'approve' })).json()
    expect(afterManager.status).toBe('pending')
    expect(afterManager.steps.map((s: { status: string }) => s.status)).toEqual(['approved', 'pending'])
    expect((await call('manager', 'POST', `/requests/${requestId}/decision`, { decision: 'approve' })).statusCode).toBe(403)

    const final = (await call('hr', 'POST', `/requests/${requestId}/decision`, { decision: 'approve', comment: 'Boas férias' })).json()
    expect(final.status).toBe('approved')
    const mine = (await call('employee', 'GET', '/notifications')).json()
    expect(mine.items[0].title).toBe('Férias aprovada')
  })

  it('o saldo cai 20 dias e o período não pode ser pedido de novo', async () => {
    const balance = (await call('employee', 'GET', '/me/vacation-balance')).json()
    const period = balance.periods.find((p: { approved: number }) => p.approved === 20)
    expect(period.remaining).toBe(10)
    const start = nextMonday()
    const overlap = await call('employee', 'POST', '/requests', { type: 'vacation', startDate: start, endDate: addDaysIso(start, 9) })
    expect(overlap.statusCode).toBe(400)
  })

  it('regras da CLT voltam com mensagem clara', async () => {
    const start = nextMonday(60)
    const short = await call('employee', 'POST', '/requests', { type: 'vacation', startDate: start, endDate: addDaysIso(start, 2) })
    expect(short.json().message).toMatch(/5 dias/)
  })
})

describe('ausências e privacidade de atestado', () => {
  it('o gestor não vê que a ausência é atestado médico; o RH vê', async () => {
    const start = nextMonday(90)
    const created = await call('employee', 'POST', '/requests', { type: 'absence', kind: 'medical', startDate: start, endDate: start, notes: 'Consulta' })
    expect(created.statusCode).toBe(201)
    const id = created.json().id
    const asManager = (await call('manager', 'GET', `/requests/${id}`)).json()
    expect(asManager).toMatchObject({ absenceKind: null, notes: null, isRestricted: true })
    const asHr = (await call('hr', 'GET', `/requests/${id}`)).json()
    expect(asHr).toMatchObject({ absenceKind: 'medical', notes: 'Consulta' })
    const managerMail = t.mailer.sent.filter(m => m.to === 'manager@delta.test').at(-1)!
    expect(managerMail.text).not.toMatch(/Atestado|Consulta/)
  })

  it('falta não justificada só pelo RH, que registra já aprovada', async () => {
    const day = addDaysIso(calendarDate(), -3)
    expect((await call('employee', 'POST', '/requests', { type: 'absence', kind: 'unjustified', startDate: day, endDate: day })).statusCode).toBe(400)
    const registered = await call('hr', 'POST', '/requests', { type: 'absence', kind: 'unjustified', employeeId: ids.worker, startDate: day, endDate: day })
    expect(registered.statusCode).toBe(201)
    expect(registered.json().status).toBe('approved')
  })

  it('o colaborador cancela o próprio pedido pendente', async () => {
    const start = nextMonday(120)
    const id = (await call('employee', 'POST', '/requests', { type: 'absence', kind: 'justified', startDate: start, endDate: start })).json().id
    expect((await call('employee', 'POST', `/requests/${id}/cancel`)).statusCode).toBe(204)
    expect((await call('employee', 'GET', `/requests/${id}`)).json().status).toBe('cancelled')
  })

  it('fluxo configurado por departamento vale para o pedido', async () => {
    expect((await call('admin', 'PUT', '/approval-flows', { requestType: 'absence', departmentId: ids.dept, steps: ['hr'] })).statusCode).toBe(200)
    const start = nextMonday(150)
    const id = (await call('employee', 'POST', '/requests', { type: 'absence', kind: 'justified', startDate: start, endDate: start })).json().id
    const detail = (await call('hr', 'GET', `/requests/${id}`)).json()
    expect(detail.steps.map((s: { approverKind: string }) => s.approverKind)).toEqual(['hr'])
  })

  it('o calendário mostra as ausências da equipe ao gestor', async () => {
    const from = calendarDate()
    const items = (await call('manager', 'GET', `/calendar?from=${from}&to=${addDaysIso(from, 200)}`)).json()
    expect(items.length).toBeGreaterThanOrEqual(2)
  })
})

describe('documentos', () => {
  let documentId: string

  it('aceita PDF verdadeiro e recusa executável disfarçado', async () => {
    const cookie = org.users.employee!.cookie
    const fake = await upload(cookie, '/me/documents', { title: 'Comprovante', categoryId: ids.Comprovantes! }, { name: 'comprovante.pdf', bytes: EXE })
    expect(fake.statusCode).toBe(400)
    const ok = await upload(cookie, '/me/documents', { title: 'Comprovante de residência', categoryId: ids.Comprovantes! }, { name: 'residencia.pdf', bytes: PDF })
    expect(ok.statusCode).toBe(201)
  })

  it('o colaborador não envia para categorias reservadas ao RH', async () => {
    const response = await upload(org.users.employee!.cookie, '/me/documents', { title: 'Contrato', categoryId: ids['Contrato de trabalho']! }, { name: 'c.pdf', bytes: PDF })
    expect(response.statusCode).toBe(403)
  })

  it('categoria com validade exige a data', async () => {
    const cookie = org.users.hr!.cookie
    const fields = { title: 'NR-35 Trabalho em altura', categoryId: ids['Certificados e treinamentos']!, employeeId: ids.worker! }
    expect((await upload(cookie, '/documents', fields, { name: 'nr35.pdf', bytes: PDF })).statusCode).toBe(400)
    const created = await upload(cookie, '/documents', { ...fields, expiresAt: addDaysIso(calendarDate(), 5) }, { name: 'nr35.pdf', bytes: PDF })
    expect(created.statusCode).toBe(201)
    documentId = created.json().id
  })

  it('o titular vê e baixa o próprio documento por link temporário', async () => {
    const mine = (await call('employee', 'GET', '/me/documents')).json()
    expect(mine.map((d: { title: string }) => d.title)).toEqual(expect.arrayContaining(['NR-35 Trabalho em altura', 'Comprovante de residência']))
    const { url } = (await call('employee', 'GET', `/documents/${documentId}/download`)).json()
    const file = await t.app.inject({ method: 'GET', url, headers: { cookie: org.users.employee!.cookie } })
    expect(file.statusCode).toBe(200)
    expect(file.headers['content-disposition']).toMatch(/attachment/)
    expect(file.rawPayload.equals(PDF)).toBe(true)
  })

  it('o link não serve para outra organização, e gestor não lista documentos', async () => {
    const { url } = (await call('hr', 'GET', `/documents/${documentId}/download`)).json()
    // A organização vem do token; quem não pertence a ela é recusado.
    const foreign = await t.app.inject({ method: 'GET', url, headers: { cookie: other.users.admin!.cookie } })
    expect(foreign.statusCode).toBe(403)
    expect(foreign.rawPayload.equals(PDF)).toBe(false)
    expect((await call('manager', 'GET', '/documents')).statusCode).toBe(403)
    expect((await call('manager', 'GET', `/documents/${documentId}`)).statusCode).toBe(404)
  })

  it('nova versão não apaga a anterior', async () => {
    const response = await upload(org.users.hr!.cookie, `/documents/${documentId}/versions`, {}, { name: 'nr35-v2.pdf', bytes: PDF })
    expect(response.statusCode).toBe(200)
    expect(response.json().versions.map((v: { version: number }) => v.version)).toEqual([2, 1])
  })
})

describe('automações', () => {
  it('avisa sobre documento vencendo uma única vez', async () => {
    const before = await t.db.select().from(notifications).where(eq(notifications.kind, 'document_expiring'))
    const first = await runAutomations(t.db, t.mailer, t.env.WEB_ORIGIN)
    expect(first[org.tenant.id]!.documents).toBe(1)
    const again = await runAutomations(t.db, t.mailer, t.env.WEB_ORIGIN)
    expect(again[org.tenant.id]!.documents).toBe(0)
    const after = await t.db.select().from(notifications).where(eq(notifications.kind, 'document_expiring'))
    // RH, administrador e o titular (categoria visível a ele).
    expect(after.length - before.length).toBe(3)
  })

  it('o painel mostra o documento vencendo e o absenteísmo', async () => {
    const data = (await call('hr', 'GET', '/dashboard')).json()
    expect(data.alerts.map((a: { key: string }) => a.key)).toContain('documents_expiring')
    expect(data.absence.lostDays).toBeGreaterThanOrEqual(1)
    expect(data.requests.upcomingVacations.length).toBe(1)
  })
})

describe('importação e exportação', () => {
  const sheet = async (rows: (string | Date | null)[][]) => {
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Colaboradores')
    ws.addRow(['Matrícula', 'Nome completo', 'CPF', 'Data de admissão', 'Tipo de contrato', 'Departamento'])
    for (const row of rows) ws.addRow(row)
    return Buffer.from(await workbook.xlsx.writeBuffer())
  }
  const send = (bytes: Buffer, query = '') =>
    upload(org.users.hr!.cookie, `/employees/import${query}`, {}, { name: 'lote.xlsx', bytes, type: 'application/octet-stream' })

  it('prévia aponta erros por linha sem gravar nada', async () => {
    const bytes = await sheet([
      ['I-001', 'Importado Um', nextCpf(), new Date(Date.UTC(2026, 0, 12)), 'CLT', 'Obras'],
      ['I-002', 'Importado Dois', '111.111.111-11', '12/01/2026', 'PJ', 'Elétrica'],
    ])
    const report = (await send(bytes)).json()
    expect(report).toMatchObject({ total: 2, valid: 1, invalid: 1, imported: 0 })
    expect(report.rows[1].errors.join(' ')).toMatch(/CPF inválido/)
    expect(report.rows[1].errors.join(' ')).toMatch(/Elétrica/)
    expect((await send(bytes, '?commit=true')).statusCode).toBe(422)
  })

  it('importa tudo de uma vez e cria departamentos que faltam, se pedido', async () => {
    const bytes = await sheet([
      ['I-003', 'Importado Três', nextCpf(), '12/01/2026', 'clt', 'Obras'],
      ['I-004', 'Importado Quatro', nextCpf(), '2026-02-02', 'Temporário', 'Elétrica'],
    ])
    const result = (await send(bytes, '?commit=true&createMissing=true')).json()
    expect(result.imported).toBe(2)
    expect(result.toCreate.departments).toEqual(['Elétrica'])
    const found = (await call('hr', 'GET', '/employees?q=Importado')).json()
    expect(found.total).toBe(2)
  })

  it('exporta planilha real; colaborador e gestor não exportam', async () => {
    const response = await call('hr', 'GET', '/employees/export')
    expect(response.statusCode).toBe(200)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(response.rawPayload as never)
    const ws = workbook.getWorksheet('Colaboradores')!
    expect(ws.getRow(1).getCell(1).value).toBe('Matrícula')
    expect(ws.rowCount).toBeGreaterThan(3)
    expect((await call('manager', 'GET', '/employees/export')).statusCode).toBe(403)
  })
})

describe('configurações e MFA obrigatório', () => {
  it('com MFA obrigatório para o RH, o RH só acessa a própria conta até ativar', async () => {
    const saved = await call('admin', 'PUT', '/settings', { name: 'Empresa delta', requireMfaFor: ['hr'] })
    expect(saved.statusCode).toBe(200)
    const blocked = await call('hr', 'GET', '/employees')
    expect(blocked.statusCode).toBe(403)
    expect(blocked.json().code).toBe('mfa_required')
    const me = (await call('hr', 'GET', '/me')).json()
    expect(me.mfaPending).toBe(true)
    expect((await call('admin', 'GET', '/employees')).statusCode).toBe(200)
    await call('admin', 'PUT', '/settings', { name: 'Empresa delta', requireMfaFor: [] })
    expect((await call('hr', 'GET', '/employees')).statusCode).toBe(200)
  })

  it('só o administrador altera configurações', async () => {
    expect((await call('hr', 'PUT', '/settings', { name: 'Nome válido', requireMfaFor: [] })).statusCode).toBe(403)
  })

  it('notificações: marcar como lidas zera o contador', async () => {
    expect((await call('manager', 'POST', '/notifications/read', {})).statusCode).toBe(204)
    expect((await call('manager', 'GET', '/notifications')).json().unread).toBe(0)
  })

  it('notificações de uma pessoa não aparecem para outra', async () => {
    const [membership] = await t.db.select().from(memberships).where(eq(memberships.userId, org.users.hr!.id))
    expect(membership).toBeDefined()
    const hrItems = (await call('hr', 'GET', '/notifications')).json().items as { userId: string }[]
    expect(hrItems.every(n => n.userId === org.users.hr!.id)).toBe(true)
  })

  it('documentos da empresa existem só na organização dela', async () => {
    const rows = await t.db.select({ tenantId: documents.tenantId }).from(documents)
    expect(rows.every(r => r.tenantId === org.tenant.id)).toBe(true)
  })
})
