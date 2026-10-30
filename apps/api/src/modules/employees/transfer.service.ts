import ExcelJS from 'exceljs'
import { asc, eq, inArray, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  can,
  CONTRACT_TYPE_LABELS,
  CONTRACT_TYPES,
  EMPLOYEE_STATUS_LABELS,
  employeeInput,
  formatCpf,
  IMPORT_COLUMNS,
  maskCpf,
  type EmployeeInput,
} from '@falcao-rh/contracts'

import type { Tx } from '../../db/client'
import { costCenters, departments, employees, positions, units } from '../../db/schema'
import type { Ctx } from '../../http/context'
import { audit } from '../../lib/audit'
import { AppError, badRequest } from '../../lib/errors'
import { createEmployee, scopeCondition } from './employees.service'

type ColumnKey = (typeof IMPORT_COLUMNS)[number][0]

/** "Data de Admissão" → "data de admissao": compara cabeçalhos sem acento nem caixa. */
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

// ---------- exportação ----------

const manager = alias(employees, 'manager')

export const exportEmployees = async (tx: Tx, ctx: Ctx) => {
  const rows = await tx
    .select({
      employee: employees,
      department: departments.name,
      position: positions.title,
      unit: units.name,
      costCenter: costCenters.name,
      manager: manager.fullName,
    })
    .from(employees)
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(positions, eq(positions.id, employees.positionId))
    .leftJoin(units, eq(units.id, employees.unitId))
    .leftJoin(costCenters, eq(costCenters.id, employees.costCenterId))
    .leftJoin(manager, eq(manager.id, employees.managerId))
    .where(scopeCondition(ctx))
    .orderBy(asc(employees.fullName))

  const sensitive = can(ctx.role, 'employees.read_sensitive')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Falcão RH'
  const sheet = workbook.addWorksheet('Colaboradores', { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = [
    ...IMPORT_COLUMNS.map(([key, label]) => ({ header: label, key, width: key === 'fullName' ? 36 : 18 })),
    { header: 'Gestor', key: 'manager', width: 30 },
    { header: 'Situação', key: 'status', width: 14 },
    { header: 'Data de desligamento', key: 'terminationDate', width: 18 },
  ]
  sheet.getRow(1).font = { bold: true }
  for (const row of rows) {
    const e = row.employee
    sheet.addRow({
      registration: e.registration,
      fullName: e.fullName,
      // Sem permissão de dados sensíveis, a planilha sai mascarada como a tela.
      cpf: sensitive ? formatCpf(e.cpf) : maskCpf(e.cpf),
      hireDate: e.hireDate,
      contractType: CONTRACT_TYPE_LABELS[e.contractType],
      socialName: e.socialName,
      birthDate: sensitive ? e.birthDate : null,
      email: e.email,
      phone: sensitive ? e.phone : null,
      department: row.department,
      position: row.position,
      unit: row.unit,
      costCenter: row.costCenter,
      workSchedule: e.workSchedule,
      manager: row.manager,
      status: EMPLOYEE_STATUS_LABELS[e.status],
      terminationDate: e.terminationDate,
    })
  }
  await audit(tx, ctx, { action: 'export', entity: 'employee', metadata: { rows: rows.length, masked: !sensitive } })
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export const importTemplate = async (tx: Tx) => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Colaboradores', { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = IMPORT_COLUMNS.map(([key, label]) => ({ header: label, key, width: 22 }))
  sheet.getRow(1).font = { bold: true }

  const help = workbook.addWorksheet('Instruções')
  help.columns = [
    { header: 'Coluna', key: 'label', width: 24 },
    { header: 'Obrigatória', key: 'required', width: 12 },
    { header: 'Formato', key: 'format', width: 70 },
  ]
  help.getRow(1).font = { bold: true }
  const formats: Partial<Record<ColumnKey, string>> = {
    cpf: '11 dígitos, com ou sem pontuação',
    hireDate: 'Data (célula de data, DD/MM/AAAA ou AAAA-MM-DD)',
    birthDate: 'Data (célula de data, DD/MM/AAAA ou AAAA-MM-DD)',
    contractType: CONTRACT_TYPES.map(type => CONTRACT_TYPE_LABELS[type]).join(', '),
    department: 'Nome exatamente como em Estrutura (ou marque "criar os que faltam")',
    position: 'Nome do cargo como em Estrutura',
    unit: 'Nome da unidade como em Estrutura',
    costCenter: 'Nome ou código do centro de custo',
  }
  for (const [key, label, required] of IMPORT_COLUMNS)
    help.addRow({ label, required: required ? 'Sim' : 'Não', format: formats[key] ?? 'Texto' })

  const names = await tx.select({ name: departments.name }).from(departments).orderBy(asc(departments.name))
  help.addRow({})
  help.addRow({ label: 'Departamentos atuais', format: names.map(n => n.name).join(', ') || 'nenhum ainda' })
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

// ---------- leitura da planilha ----------

type Cell = string | number | boolean | Date | null

const parseCsv = (text: string): Cell[][] => {
  const delimiter = (text.split('\n')[0] ?? '').split(';').length > (text.split('\n')[0] ?? '').split(',').length ? ';' : ','
  const rows: Cell[][] = []
  let row: Cell[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += char
  }
  if (field || row.length) rows.push([...row, field])
  return rows
}

const readSheet = async (buffer: Buffer, filename: string): Promise<Cell[][]> => {
  if (filename.toLowerCase().endsWith('.csv')) return parseCsv(buffer.toString('utf8').replace(/^﻿/, ''))
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer as never)
  } catch {
    throw badRequest('Não foi possível ler a planilha. Envie um arquivo .xlsx ou .csv.')
  }
  const sheet = workbook.worksheets[0]
  if (!sheet) throw badRequest('A planilha está vazia.')
  const rows: Cell[][] = []
  sheet.eachRow({ includeEmpty: true }, row => {
    const values = (row.values as Cell[]).slice(1)
    rows.push(values.map(v => (v && typeof v === 'object' && !(v instanceof Date) ? String((v as { text?: string }).text ?? (v as { result?: unknown }).result ?? '') : v)))
  })
  return rows
}

const toIsoDate = (value: Cell): string | null => {
  if (value === null || value === '') return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const text = String(value).trim()
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2]!.padStart(2, '0')}-${br[1]!.padStart(2, '0')}`
  return text
}

const contractFrom = (value: Cell) => {
  const text = normalize(String(value ?? ''))
  return CONTRACT_TYPES.find(type => type === text || normalize(CONTRACT_TYPE_LABELS[type]) === text) ?? text
}

// ---------- validação e gravação ----------

export type ImportRowReport = { line: number; fullName: string; registration: string; errors: string[] }

type Lookup = { id: string; name: string }

export const importEmployees = async (
  tx: Tx,
  ctx: Ctx,
  file: { buffer: Buffer; filename: string },
  options: { commit: boolean; createMissing: boolean },
) => {
  const rows = await readSheet(file.buffer, file.filename)
  const [header, ...data] = rows
  if (!header) throw badRequest('A planilha está vazia.')

  const index = new Map<ColumnKey, number>()
  header.forEach((cell, position) => {
    const label = normalize(String(cell ?? ''))
    const column = IMPORT_COLUMNS.find(([key, name]) => normalize(name) === label || normalize(key) === label)
    if (column) index.set(column[0], position)
  })
  const missing = IMPORT_COLUMNS.filter(([key, , required]) => required && !index.has(key)).map(([, label]) => label)
  if (missing.length) throw badRequest(`Faltam colunas obrigatórias: ${missing.join(', ')}. Use o modelo.`)

  const lookup = async () => ({
    department: await tx.select({ id: departments.id, name: departments.name }).from(departments),
    position: await tx.select({ id: positions.id, name: positions.title }).from(positions),
    unit: await tx.select({ id: units.id, name: units.name }).from(units),
    costCenter: (await tx.select({ id: costCenters.id, name: costCenters.name, code: costCenters.code }).from(costCenters)).flatMap(c => [
      { id: c.id, name: c.name },
      { id: c.id, name: c.code },
    ]),
  })
  const known = await lookup()
  const find = (list: Lookup[], name: string) => list.find(item => normalize(item.name) === normalize(name))

  const toCreate = { department: new Set<string>(), position: new Set<string>(), unit: new Set<string>(), costCenter: new Set<string>() }
  const seen = { registration: new Map<string, number>(), cpf: new Map<string, number>() }
  const parsed: { line: number; input: EmployeeInput; refs: Partial<Record<keyof typeof toCreate, string>> }[] = []
  const report: ImportRowReport[] = []

  data.forEach((cells, offset) => {
    const line = offset + 2
    const get = (key: ColumnKey) => {
      const position = index.get(key)
      const value = position === undefined ? null : (cells[position] ?? null)
      return typeof value === 'string' ? value.trim() : value
    }
    if (IMPORT_COLUMNS.every(([key]) => get(key) === null || get(key) === '')) return

    const errors: string[] = []
    const refs: Partial<Record<keyof typeof toCreate, string>> = {}
    for (const key of ['department', 'position', 'unit', 'costCenter'] as const) {
      const name = get(key)
      if (!name) continue
      refs[key] = String(name)
      if (!find(known[key], String(name))) {
        if (options.createMissing && key !== 'costCenter') toCreate[key].add(String(name))
        else errors.push(`${IMPORT_COLUMNS.find(c => c[0] === key)![1]} "${name}" não existe.`)
      }
    }

    const candidate = {
      registration: String(get('registration') ?? ''),
      fullName: String(get('fullName') ?? ''),
      cpf: String(get('cpf') ?? ''),
      hireDate: toIsoDate(get('hireDate')) ?? '',
      contractType: contractFrom(get('contractType')),
      socialName: get('socialName') ? String(get('socialName')) : null,
      birthDate: toIsoDate(get('birthDate')),
      email: get('email') ? String(get('email')) : null,
      phone: get('phone') ? String(get('phone')) : null,
      workSchedule: get('workSchedule') ? String(get('workSchedule')) : null,
    }
    const result = employeeInput.safeParse(candidate)
    if (!result.success)
      for (const issue of result.error.issues) {
        const label = IMPORT_COLUMNS.find(c => c[0] === issue.path[0])?.[1] ?? String(issue.path[0])
        errors.push(`${label}: ${issue.message === 'CPF inválido' ? 'CPF inválido' : 'valor inválido'}.`)
      }
    else {
      for (const key of ['registration', 'cpf'] as const) {
        const value = result.data[key]
        const first = seen[key].get(value)
        if (first) errors.push(`${key === 'cpf' ? 'CPF' : 'Matrícula'} repetida na linha ${first}.`)
        else seen[key].set(value, line)
      }
    }
    report.push({ line, fullName: candidate.fullName, registration: candidate.registration, errors })
    if (result.success && errors.length === 0) parsed.push({ line, input: result.data, refs })
  })

  if (report.length === 0) throw badRequest('Nenhuma linha preenchida na planilha.')

  // Conflitos com quem já está cadastrado na organização.
  if (parsed.length) {
    const existing = await tx
      .select({ registration: employees.registration, cpf: employees.cpf })
      .from(employees)
      .where(
        or(
          inArray(employees.registration, parsed.map(p => p.input.registration)),
          inArray(employees.cpf, parsed.map(p => p.input.cpf)),
        ),
      )
    for (const row of parsed) {
      const conflict = existing.find(e => e.registration === row.input.registration || e.cpf === row.input.cpf)
      if (!conflict) continue
      report.find(r => r.line === row.line)!.errors.push(
        conflict.registration === row.input.registration ? 'Matrícula já cadastrada.' : 'CPF já cadastrado.',
      )
    }
  }

  const invalid = report.filter(r => r.errors.length > 0)
  const summary = {
    total: report.length,
    valid: report.length - invalid.length,
    invalid: invalid.length,
    rows: report,
    toCreate: {
      departments: [...toCreate.department],
      positions: [...toCreate.position],
      units: [...toCreate.unit],
    },
    imported: 0,
  }
  if (!options.commit) return summary
  if (invalid.length) throw new AppError(422, 'import_invalid', `Corrija as ${invalid.length} linhas com erro antes de importar.`)

  // Tudo ou nada: estamos dentro da transação da organização.
  for (const name of toCreate.department) await tx.insert(departments).values({ tenantId: ctx.tenantId, name })
  for (const name of toCreate.position) await tx.insert(positions).values({ tenantId: ctx.tenantId, title: name })
  for (const name of toCreate.unit) await tx.insert(units).values({ tenantId: ctx.tenantId, name })
  const fresh = await lookup()
  for (const row of parsed) {
    const ref = (key: keyof typeof toCreate) => (row.refs[key] ? (find(fresh[key], row.refs[key]!)?.id ?? null) : null)
    await createEmployee(tx, ctx, {
      ...row.input,
      departmentId: ref('department'),
      positionId: ref('position'),
      unitId: ref('unit'),
      costCenterId: ref('costCenter'),
    })
  }
  await audit(tx, ctx, { action: 'import', entity: 'employee', metadata: { rows: parsed.length } })
  return { ...summary, imported: parsed.length }
}
