/**
 * Movimento de DEMONSTRAÇÃO para a organização "(DEMO)": férias já gozadas,
 * férias marcadas, pedidos aguardando o gestor, ausências e documentos com
 * validade. Tudo FICTÍCIO. Idempotente: não faz nada se já houver pedidos.
 */
import { createHash } from 'node:crypto'

import { and, count, eq, ne } from 'drizzle-orm'

import { addDaysIso, calendarDays } from '@falcao-rh/contracts'

import { calendarDate } from '../lib/dates'
import type { Storage } from '../lib/storage'
import { vacationPeriods } from '../modules/requests/vacation'
import type { Database } from './client'
import { departments, documentCategories, documents, documentVersions, employees, requests, requestSteps, tenants } from './schema'

/** Primeira segunda-feira a partir da data (férias não começam sexta nem sábado). */
const monday = (iso: string) => {
  let date = iso
  while (new Date(`${date}T12:00:00Z`).getUTCDay() !== 1) date = addDaysIso(date, 1)
  return date
}

/** PDF mínimo e válido, com o título no conteúdo. */
const pdf = (title: string) =>
  Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 60>>stream\nBT /F1 18 Tf 60 760 Td (${title.replace(/[()\\]/g, '')} - DEMO) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  )

export const seedDemoActivity = async (db: Database, storage: Storage) => {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'falcao-demo'))
  if (!tenant) return null
  const T = tenant.id
  const [existing] = await db.select({ value: count() }).from(requests).where(eq(requests.tenantId, T))
  if ((existing?.value ?? 0) > 0) return null

  const today = calendarDate()
  const people = await db
    .select()
    .from(employees)
    .where(and(eq(employees.tenantId, T), ne(employees.status, 'terminated')))
    .orderBy(employees.registration)

  const insertRequest = async (
    values: Omit<typeof requests.$inferInsert, 'tenantId' | 'days'>,
    steps: Omit<typeof requestSteps.$inferInsert, 'tenantId' | 'requestId'>[],
  ) => {
    const [row] = await db
      .insert(requests)
      .values({ ...values, tenantId: T, days: calendarDays(values.startDate, values.endDate) })
      .returning()
    await db.insert(requestSteps).values(steps.map(step => ({ ...step, tenantId: T, requestId: row!.id })))
    return row!
  }
  const approvedStep = { position: 0, approverKind: 'hr' as const, status: 'approved' as const, decidedAt: new Date(), comment: 'Registro histórico (DEMO).' }

  let vacations = 0
  for (const [index, person] of people.entries()) {
    // Férias já gozadas: todos os períodos completos, menos o mais recente,
    // que fica com saldo para alguns (é o que gera os avisos de prazo).
    const periods = vacationPeriods(person.hireDate, today, []).filter(p => p.complete)
    for (const [k, period] of periods.entries()) {
      const isLatest = k === periods.length - 1
      if (isLatest && index % 3 !== 0) continue
      const start = monday(addDaysIso(period.end, 45 + ((index * 7) % 60)))
      if (start >= today) continue
      await insertRequest({ employeeId: person.id, type: 'vacation', status: 'approved', startDate: start, endDate: addDaysIso(start, 29), decidedAt: new Date() }, [approvedStep])
      vacations++
    }
  }

  // Férias marcadas para as próximas semanas.
  const upcoming = people.filter(p => vacationPeriods(p.hireDate, today, []).some(x => x.complete)).slice(1, 4)
  for (const [i, person] of upcoming.entries()) {
    const start = monday(addDaysIso(today, 9 + i * 12))
    await insertRequest({ employeeId: person.id, type: 'vacation', status: 'approved', startDate: start, endDate: addDaysIso(start, 14 + i * 2), decidedAt: new Date() }, [
      { ...approvedStep, comment: 'Boas férias.' },
    ])
  }

  // Pedidos aguardando o gestor de Obras (fila do gestor DEMO).
  const [obras] = await db.select().from(departments).where(and(eq(departments.tenantId, T), eq(departments.name, 'Obras')))
  const team = people.filter(p => p.managerId && p.managerId === obras?.managerEmployeeId).slice(0, 3)
  for (const [i, person] of team.entries()) {
    const start = monday(addDaysIso(today, 30 + i * 21))
    const isVacation = i < 2
    await insertRequest(
      {
        employeeId: person.id,
        type: isVacation ? 'vacation' : 'absence',
        absenceKind: isVacation ? null : 'justified',
        status: 'pending',
        startDate: start,
        endDate: isVacation ? addDaysIso(start, 14) : start,
        notes: isVacation ? null : 'Consulta no cartório para documentação.',
      },
      [
        { position: 0, approverKind: 'manager', approverEmployeeId: person.managerId, status: 'pending' },
        ...(isVacation ? [{ position: 1, approverKind: 'hr' as const, status: 'waiting' as const }] : []),
      ],
    )
  }

  // Ausências dos últimos meses: alimentam o absenteísmo.
  const absent = people.slice(5, 11)
  for (const [i, person] of absent.entries()) {
    const start = addDaysIso(today, -20 - i * 23)
    await insertRequest(
      {
        employeeId: person.id,
        type: 'absence',
        absenceKind: i % 3 === 0 ? 'medical' : i % 3 === 1 ? 'justified' : 'unjustified',
        status: 'approved',
        startDate: start,
        endDate: addDaysIso(start, i % 2),
        decidedAt: new Date(),
      },
      [approvedStep],
    )
  }

  // Documentos: contratos e certificados de NR com validade variada.
  const categories = await db.select().from(documentCategories).where(eq(documentCategories.tenantId, T))
  const category = (name: string) => categories.find(c => c.name === name)!
  const docs: { employeeId: string | null; category: string; title: string; expiresAt: string | null }[] = []
  for (const [i, person] of people.slice(0, 12).entries()) {
    docs.push({ employeeId: person.id, category: 'Contrato de trabalho', title: `Contrato de trabalho ${person.registration}`, expiresAt: null })
    if (i < 8)
      docs.push({
        employeeId: person.id,
        category: 'Certificados e treinamentos',
        title: i % 2 ? 'NR-35 Trabalho em altura' : 'NR-18 Segurança na construção',
        expiresAt: addDaysIso(today, [-6, 4, 12, 25, 90, 180, 300, 400][i]!),
      })
  }
  docs.push({ employeeId: null, category: 'Comprovantes', title: 'Política de uso de EPI', expiresAt: null })

  for (const doc of docs) {
    const [row] = await db
      .insert(documents)
      .values({ tenantId: T, employeeId: doc.employeeId, categoryId: category(doc.category).id, title: doc.title, expiresAt: doc.expiresAt })
      .returning()
    const body = pdf(doc.title)
    const sha256 = createHash('sha256').update(body).digest('hex')
    const storageKey = `${T}/${row!.id}/v1-${sha256.slice(0, 12)}`
    await storage.put(storageKey, body, 'application/pdf')
    await db.insert(documentVersions).values({
      tenantId: T,
      documentId: row!.id,
      version: 1,
      storageKey,
      filename: `${doc.title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: body.length,
      sha256,
    })
  }

  return { vacations, upcoming: upcoming.length, pending: team.length, absences: absent.length, documents: docs.length }
}
