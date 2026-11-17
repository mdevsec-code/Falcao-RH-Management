import ExcelJS from 'exceljs'
import { and, asc, eq, ne, sql } from 'drizzle-orm'

import {
  employeeTransportInput,
  TRANSPORT_MODE_LABELS,
  TRANSPORT_MODES,
  type EmployeeTransportInput,
  type TransportMode,
  type TransportRouteInput,
} from '@falcao-rh/contracts'

import type { Tx } from '../../db/client'
import { departments, employees, employeeTransport, transportRoutes } from '../../db/schema'
import type { Ctx } from '../../http/context'
import { audit } from '../../lib/audit'
import { badRequest, notFound } from '../../lib/errors'
import { normalize, readSheet, type Cell } from '../employees/transfer.service'

// ---------- rotas do fretado ----------

export const listRoutes = async (tx: Tx) => {
  const routes = await tx.select().from(transportRoutes).orderBy(asc(transportRoutes.name))
  const riders = await tx
    .select({ routeId: employeeTransport.routeId, total: sql<number>`count(*)::int` })
    .from(employeeTransport)
    .innerJoin(employees, eq(employees.id, employeeTransport.employeeId))
    .where(and(eq(employeeTransport.mode, 'chartered'), ne(employees.status, 'terminated')))
    .groupBy(employeeTransport.routeId)
  return routes.map(route => ({ ...route, riders: riders.find(r => r.routeId === route.id)?.total ?? 0 }))
}

export const saveRoute = async (tx: Tx, ctx: Ctx, input: TransportRouteInput, id?: string) => {
  if (id) {
    const [row] = await tx.update(transportRoutes).set(input).where(eq(transportRoutes.id, id)).returning()
    if (!row) throw notFound('Rota')
    await audit(tx, ctx, { action: 'update', entity: 'transport_route', entityId: id })
    return row
  }
  const [row] = await tx.insert(transportRoutes).values({ ...input, tenantId: ctx.tenantId }).returning()
  await audit(tx, ctx, { action: 'create', entity: 'transport_route', entityId: row!.id })
  return row!
}

export const deleteRoute = async (tx: Tx, ctx: Ctx, id: string) => {
  const [row] = await tx.delete(transportRoutes).where(eq(transportRoutes.id, id)).returning({ id: transportRoutes.id })
  if (!row) throw notFound('Rota')
  await audit(tx, ctx, { action: 'delete', entity: 'transport_route', entityId: id })
}

// ---------- quadro de mobilidade ----------

/** Todo colaborador não desligado, com o transporte cadastrado (ou nenhum). */
export const transportBoard = (tx: Tx) =>
  tx
    .select({
      employeeId: employees.id,
      registration: employees.registration,
      fullName: employees.fullName,
      status: employees.status,
      departmentName: departments.name,
      homeCity: sql<string | null>`${employees.address}->>'city'`,
      homeDistrict: sql<string | null>`${employees.address}->>'district'`,
      mode: employeeTransport.mode,
      provider: employeeTransport.provider,
      routeId: employeeTransport.routeId,
      routeName: transportRoutes.name,
      pickupPoint: employeeTransport.pickupPoint,
      pickupDistrict: employeeTransport.pickupDistrict,
      pickupCity: employeeTransport.pickupCity,
      monthlyCostCents: employeeTransport.monthlyCostCents,
      notes: employeeTransport.notes,
      updatedAt: employeeTransport.updatedAt,
    })
    .from(employees)
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(employeeTransport, eq(employeeTransport.employeeId, employees.id))
    .leftJoin(transportRoutes, eq(transportRoutes.id, employeeTransport.routeId))
    .where(ne(employees.status, 'terminated'))
    .orderBy(asc(employees.fullName))

const checkEmployee = async (tx: Tx, employeeId: string) => {
  const [row] = await tx.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId))
  if (!row) throw notFound('Colaborador')
}

const upsert = (tx: Tx, tenantId: string, employeeId: string, input: EmployeeTransportInput) => {
  // Só o fretado usa rota.
  const values = { ...input, routeId: input.mode === 'chartered' ? (input.routeId ?? null) : null }
  return tx
    .insert(employeeTransport)
    .values({ ...values, tenantId, employeeId })
    .onConflictDoUpdate({ target: [employeeTransport.tenantId, employeeTransport.employeeId], set: values })
}

export const setEmployeeTransport = async (tx: Tx, ctx: Ctx, employeeId: string, input: EmployeeTransportInput) => {
  await checkEmployee(tx, employeeId)
  await upsert(tx, ctx.tenantId, employeeId, input)
  await audit(tx, ctx, { action: 'update', entity: 'employee_transport', entityId: employeeId, changedFields: Object.keys(input) })
  return { employeeId }
}

export const clearEmployeeTransport = async (tx: Tx, ctx: Ctx, employeeId: string) => {
  await tx.delete(employeeTransport).where(eq(employeeTransport.employeeId, employeeId))
  await audit(tx, ctx, { action: 'delete', entity: 'employee_transport', entityId: employeeId })
}

// ---------- planilha ----------

const COLUMNS = [
  { header: 'Matrícula', key: 'registration', width: 14 },
  { header: 'Nome', key: 'fullName', width: 34 },
  { header: 'Modalidade', key: 'mode', width: 24 },
  { header: 'Fornecedor', key: 'provider', width: 18 },
  { header: 'Rota do fretado', key: 'routeName', width: 20 },
  { header: 'Ponto de embarque', key: 'pickupPoint', width: 30 },
  { header: 'Bairro de embarque', key: 'pickupDistrict', width: 20 },
  { header: 'Cidade de embarque', key: 'pickupCity', width: 20 },
  { header: 'Custo mensal (R$)', key: 'monthlyCost', width: 16 },
  { header: 'Observações', key: 'notes', width: 30 },
] as const

export const exportTransport = async (tx: Tx) => {
  const rows = await transportBoard(tx)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Falcão RH'
  const sheet = workbook.addWorksheet('Transporte', { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = COLUMNS.map(c => ({ ...c }))
  sheet.getRow(1).font = { bold: true }
  for (const row of rows)
    sheet.addRow({
      ...row,
      mode: row.mode ? TRANSPORT_MODE_LABELS[row.mode] : '',
      monthlyCost: row.monthlyCostCents === null ? null : row.monthlyCostCents / 100,
    })
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

const modeFrom = (value: Cell): TransportMode | null => {
  const text = normalize(String(value ?? ''))
  if (!text) return null
  const exact = TRANSPORT_MODES.find(mode => mode === text || normalize(TRANSPORT_MODE_LABELS[mode]) === text)
  if (exact) return exact
  if (/fretad/.test(text)) return 'chartered'
  if (/mobilidade|cartao|app|vale/.test(text)) return 'mobility'
  if (/propri/.test(text)) return 'own'
  if (/sem|nenhum|nao usa/.test(text)) return 'none'
  return null
}

const text = (value: Cell) => (value === null || value === undefined ? '' : String(value).trim())

const costFrom = (value: Cell): number | null | 'invalid' => {
  if (value === null || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[R$\s.]/g, '').replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 'invalid'
}

export type TransportImportRow = { line: number; registration: string; fullName: string; errors: string[] }

/** Importa a planilha no formato da exportação. Com erro em qualquer linha, nada é gravado. */
export const importTransport = async (tx: Tx, ctx: Ctx, file: { buffer: Buffer; filename: string }, commit: boolean) => {
  const rows = await readSheet(file.buffer, file.filename)
  const header = (rows[0] ?? []).map(cell => normalize(text(cell)))
  const col = (label: string) => header.indexOf(normalize(label))
  const at = (row: Cell[], label: string) => {
    const i = col(label)
    return i < 0 ? null : (row[i] ?? null)
  }
  if (col('Matrícula') < 0 || col('Modalidade') < 0)
    throw badRequest('A planilha precisa das colunas "Matrícula" e "Modalidade". Use a exportação como modelo.')

  const people = await tx.select({ id: employees.id, registration: employees.registration, fullName: employees.fullName }).from(employees)
  const routes = await tx.select({ id: transportRoutes.id, name: transportRoutes.name }).from(transportRoutes)
  const report: TransportImportRow[] = []
  const valid: { employeeId: string; input: EmployeeTransportInput }[] = []

  rows.slice(1).forEach((row, index) => {
    const registration = text(at(row, 'Matrícula'))
    if (!registration && row.every(cell => text(cell) === '')) return
    const errors: string[] = []
    const person = people.find(p => p.registration === registration)
    if (!person) errors.push('Matrícula não encontrada.')
    const mode = modeFrom(at(row, 'Modalidade'))
    if (!mode) errors.push('Modalidade inválida (Mobilidade, Fretado, Condução própria ou Sem transporte).')
    const routeName = text(at(row, 'Rota do fretado'))
    const route = routeName ? routes.find(r => normalize(r.name) === normalize(routeName)) : undefined
    if (routeName && !route) errors.push(`Rota "${routeName}" não cadastrada.`)
    const cost = costFrom(at(row, 'Custo mensal (R$)'))
    if (cost === 'invalid') errors.push('Custo mensal inválido.')

    if (!errors.length) {
      const parsed = employeeTransportInput.safeParse({
        mode,
        provider: text(at(row, 'Fornecedor')),
        routeId: route?.id ?? null,
        pickupPoint: text(at(row, 'Ponto de embarque')),
        pickupDistrict: text(at(row, 'Bairro de embarque')),
        pickupCity: text(at(row, 'Cidade de embarque')),
        monthlyCostCents: cost,
        notes: text(at(row, 'Observações')),
      })
      if (parsed.success) valid.push({ employeeId: person!.id, input: parsed.data })
      else errors.push(...parsed.error.issues.map(issue => issue.message))
    }
    report.push({ line: index + 2, registration, fullName: person?.fullName ?? text(at(row, 'Nome')), errors })
  })

  const failed = report.filter(r => r.errors.length).length
  if (commit && !failed) {
    for (const item of valid) await upsert(tx, ctx.tenantId, item.employeeId, item.input)
    await audit(tx, ctx, { action: 'import', entity: 'employee_transport', metadata: { rows: valid.length } })
  }
  return { rows: report, total: report.length, failed, imported: commit && !failed ? valid.length : 0 }
}
