import { createHash, randomBytes, randomUUID } from 'node:crypto'

import { and, asc, eq, isNull, sql } from 'drizzle-orm'

import { ADMISSION_LINK_DAYS, type AdmissionSelfData } from '@falcao-rh/contracts'

import type { Database, Tx } from '../../db/client'
import { rowsOf } from '../../db/rows'
import { admissionLinks, auditLogs, documentCategories, documents, documentVersions, employees } from '../../db/schema'
import type { Ctx } from '../../http/context'
import { audit } from '../../lib/audit'
import { AppError, notFound } from '../../lib/errors'
import { notify, usersWithRoles, type Outbox } from '../../lib/notify'
import type { Storage } from '../../lib/storage'
import type { UploadedFile } from '../../lib/upload'
import { checkFile, ensureDefaultCategories } from '../documents/documents.service'

const CATEGORY = 'Documentos admissionais'
const hash = (token: string) => createHash('sha256').update(token).digest('hex')

// ---------- RH ----------

/** Gera o link (o anterior em aberto deixa de valer). O token só existe nesta resposta. */
export const createAdmissionLink = async (tx: Tx, ctx: Ctx, employeeId: string) => {
  const [employee] = await tx.select({ id: employees.id, status: employees.status }).from(employees).where(eq(employees.id, employeeId))
  if (!employee) throw notFound('Colaborador')
  if (employee.status === 'terminated') throw new AppError(409, 'terminated', 'Colaborador desligado não recebe link de admissão.')

  await tx
    .update(admissionLinks)
    .set({ expiresAt: new Date() })
    .where(and(eq(admissionLinks.employeeId, employeeId), isNull(admissionLinks.submittedAt)))
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + ADMISSION_LINK_DAYS * 86_400_000)
  await tx.insert(admissionLinks).values({ tenantId: ctx.tenantId, employeeId, tokenHash: hash(token), expiresAt, createdBy: ctx.userId })
  await audit(tx, ctx, { action: 'admission_link.created', entity: 'employee', entityId: employeeId })
  return { path: `/admissao/${token}`, expiresAt }
}

/** Situação do último link, para a ficha do colaborador. */
export const admissionStatus = async (tx: Tx, employeeId: string) => {
  const [last] = await tx
    .select({ expiresAt: admissionLinks.expiresAt, submittedAt: admissionLinks.submittedAt, createdAt: admissionLinks.createdAt })
    .from(admissionLinks)
    .where(eq(admissionLinks.employeeId, employeeId))
    .orderBy(sql`${admissionLinks.createdAt} desc`)
    .limit(1)
  return last ?? null
}

// ---------- link público ----------

type Link = { linkId: string; tenantId: string; employeeId: string }

/**
 * Transação do link: a organização e o colaborador vêm do hash do token, pela
 * função `admission_link_lookup`; depois tudo roda sob RLS da organização.
 */
export const withAdmissionLink = <T>(db: Database, token: string, fn: (tx: Tx, link: Link) => Promise<T>) =>
  db.transaction(async tx => {
    await tx.execute(sql`set local role falcao_app`)
    const [link] = rowsOf<{ link_id: string; tenant_id: string; employee_id: string }>(
      await tx.execute(sql`select link_id, tenant_id, employee_id from admission_link_lookup(${hash(token)})`),
    )
    if (!link) throw new AppError(404, 'admission_link_invalid', 'Este link expirou ou já foi usado. Peça um novo ao RH.')
    await tx.execute(sql`select set_config('app.tenant_id', ${link.tenant_id}, true), set_config('app.user_id', '', true)`)
    return fn(tx, { linkId: link.link_id, tenantId: link.tenant_id, employeeId: link.employee_id })
  })

const linkAudit = (tx: Tx, link: Link, ip: string, action: string, metadata?: Record<string, unknown>) =>
  tx.insert(auditLogs).values({
    tenantId: link.tenantId,
    actorUserId: null,
    action,
    entity: 'employee',
    entityId: link.employeeId,
    ip,
    metadata: { via: 'admission_link', ...metadata },
  })

const categoryId = async (tx: Tx, tenantId: string) => {
  await ensureDefaultCategories(tx, tenantId)
  const [category] = await tx.select({ id: documentCategories.id }).from(documentCategories).where(eq(documentCategories.name, CATEGORY))
  return category!.id
}

const sentDocuments = async (tx: Tx, link: Link) =>
  tx
    .select({ id: documents.id, title: documents.title })
    .from(documents)
    .where(and(eq(documents.employeeId, link.employeeId), eq(documents.categoryId, await categoryId(tx, link.tenantId)), isNull(documents.createdBy)))
    .orderBy(asc(documents.createdAt))

export const admissionView = async (tx: Tx, link: Link) => {
  const [e] = await tx
    .select({
      fullName: employees.fullName,
      socialName: employees.socialName,
      birthDate: employees.birthDate,
      email: employees.email,
      phone: employees.phone,
      address: employees.address,
    })
    .from(employees)
    .where(eq(employees.id, link.employeeId))
  return { employee: e!, documents: await sentDocuments(tx, link) }
}

export const admissionUpload = async (tx: Tx, link: Link, storage: Storage, ip: string, title: string, file: UploadedFile) => {
  const checked = checkFile(file)
  const [document] = await tx
    .insert(documents)
    .values({ tenantId: link.tenantId, employeeId: link.employeeId, categoryId: await categoryId(tx, link.tenantId), title, createdBy: null })
    .returning({ id: documents.id, title: documents.title })
  const storageKey = `${link.tenantId}/${document!.id}/v1-${checked.sha256.slice(0, 12)}-${randomUUID().slice(0, 8)}`
  await tx.insert(documentVersions).values({
    tenantId: link.tenantId,
    documentId: document!.id,
    version: 1,
    storageKey,
    filename: checked.filename,
    mimeType: checked.mimeType,
    sizeBytes: file.buffer.length,
    sha256: checked.sha256,
    uploadedBy: null,
  })
  // Grava o arquivo antes do commit: se falhar, a transação desfaz o registro.
  await storage.put(storageKey, file.buffer, checked.mimeType)
  await linkAudit(tx, link, ip, 'upload', { title })
  return document!
}

export const admissionSubmit = async (tx: Tx, link: Link, outbox: Outbox, ip: string, data: AdmissionSelfData) => {
  const [employee] = await tx
    .update(employees)
    .set({ ...data, address: data.address })
    .where(eq(employees.id, link.employeeId))
    .returning({ fullName: employees.fullName })
  await tx.update(admissionLinks).set({ submittedAt: new Date() }).where(eq(admissionLinks.id, link.linkId))
  // Só os nomes dos campos vão para o log, nunca os valores.
  await linkAudit(tx, link, ip, 'admission.submitted', { fields: Object.keys(data) })
  await notify(tx, link.tenantId, outbox, {
    userIds: await usersWithRoles(tx, link.tenantId, ['hr', 'admin']),
    kind: 'document_added',
    title: 'Admissão digital recebida',
    body: `${employee!.fullName} enviou os dados e documentos de admissão.`,
    link: `/colaboradores/${link.employeeId}`,
  })
}
