import { createHash } from 'node:crypto'

import { and, asc, desc, eq, ilike, lte, sql, type SQL } from 'drizzle-orm'

import {
  addDaysIso,
  can,
  MAX_UPLOAD_BYTES,
  type DocumentCategoryInput,
  type DocumentFilters,
  type DocumentMetadata,
} from '@falcao-rh/contracts'

import type { Database, Tx } from '../../db/client'
import { documentCategories, documents, documentVersions, employees, user } from '../../db/schema'
import type { Ctx } from '../../http/context'
import { audit } from '../../lib/audit'
import { calendarDate } from '../../lib/dates'
import { AppError, badRequest, forbidden, notFound } from '../../lib/errors'
import { safeFilename, sniffMimeType } from '../../lib/file-type'
import { notify, userOfEmployee, usersWithRoles, type Outbox } from '../../lib/notify'
import type { Storage } from '../../lib/storage'

export type UploadedFile = { buffer: Buffer; filename: string }

// ---------- categorias ----------

/** Categorias com que toda organização começa; o RH ajusta depois. */
export const DEFAULT_CATEGORIES: DocumentCategoryInput[] = [
  { name: 'Contrato de trabalho', employeeVisible: true, employeeUpload: false, sensitive: false, requiresExpiry: false },
  { name: 'Documentos admissionais', employeeVisible: true, employeeUpload: true, sensitive: false, requiresExpiry: false },
  { name: 'Comprovantes', employeeVisible: true, employeeUpload: true, sensitive: false, requiresExpiry: false },
  { name: 'Certificados e treinamentos', employeeVisible: true, employeeUpload: true, sensitive: false, requiresExpiry: true },
  { name: 'Atestados médicos', employeeVisible: true, employeeUpload: true, sensitive: true, requiresExpiry: false },
  { name: 'Advertências', employeeVisible: true, employeeUpload: false, sensitive: false, requiresExpiry: false },
]

/** Operação de sistema (provisionamento de organização). */
export const ensureDefaultCategories = async (db: Database | Tx, tenantId: string) => {
  await db
    .insert(documentCategories)
    .values(DEFAULT_CATEGORIES.map(category => ({ ...category, tenantId })))
    .onConflictDoNothing()
}

export const listCategories = (tx: Tx) => tx.select().from(documentCategories).orderBy(asc(documentCategories.name))

export const saveCategory = async (tx: Tx, ctx: Ctx, input: DocumentCategoryInput, id?: string) => {
  const [row] = id
    ? await tx.update(documentCategories).set(input).where(eq(documentCategories.id, id)).returning()
    : await tx.insert(documentCategories).values({ ...input, tenantId: ctx.tenantId }).returning()
  if (!row) throw notFound('Categoria')
  await audit(tx, ctx, { action: id ? 'update' : 'create', entity: 'document_category', entityId: row.id })
  return row
}

export const deleteCategory = async (tx: Tx, ctx: Ctx, id: string) => {
  const deleted = await tx.delete(documentCategories).where(eq(documentCategories.id, id)).returning({ id: documentCategories.id })
  if (!deleted.length) throw notFound('Categoria')
  await audit(tx, ctx, { action: 'delete', entity: 'document_category', entityId: id })
}

// ---------- consultas ----------

const documentColumns = {
  id: documents.id,
  title: documents.title,
  employeeId: documents.employeeId,
  employeeName: sql<string | null>`coalesce(${employees.socialName}, ${employees.fullName})`,
  categoryId: documents.categoryId,
  categoryName: documentCategories.name,
  sensitive: documentCategories.sensitive,
  expiresAt: documents.expiresAt,
  status: documents.status,
  currentVersion: documents.currentVersion,
  filename: documentVersions.filename,
  mimeType: documentVersions.mimeType,
  sizeBytes: documentVersions.sizeBytes,
  updatedAt: documents.updatedAt,
}

const baseQuery = (tx: Tx) =>
  tx
    .select(documentColumns)
    .from(documents)
    .innerJoin(documentCategories, eq(documentCategories.id, documents.categoryId))
    .leftJoin(employees, eq(employees.id, documents.employeeId))
    .innerJoin(
      documentVersions,
      and(eq(documentVersions.documentId, documents.id), eq(documentVersions.version, documents.currentVersion)),
    )
    .$dynamic()

export const listDocuments = (tx: Tx, filters: DocumentFilters) => {
  const conditions = [
    eq(documents.status, 'active'),
    filters.employeeId ? eq(documents.employeeId, filters.employeeId) : undefined,
    filters.categoryId ? eq(documents.categoryId, filters.categoryId) : undefined,
    filters.q ? ilike(documents.title, `%${filters.q}%`) : undefined,
    filters.expiring ? lte(documents.expiresAt, addDaysIso(calendarDate(), 30)) : undefined,
  ].filter(Boolean) as SQL[]
  return baseQuery(tx)
    .where(and(...conditions))
    .orderBy(filters.expiring ? asc(documents.expiresAt) : desc(documents.updatedAt))
    .limit(300)
}

/** Portal: só categorias visíveis ao titular. */
export const myDocuments = (tx: Tx, ctx: Ctx) => {
  if (!ctx.employeeId) throw forbidden('Seu acesso não está vinculado a uma ficha de colaborador.')
  return baseQuery(tx)
    .where(
      and(
        eq(documents.employeeId, ctx.employeeId),
        eq(documents.status, 'active'),
        eq(documentCategories.employeeVisible, true),
      ),
    )
    .orderBy(desc(documents.updatedAt))
}

/** RH acessa todos; o titular, os próprios em categorias visíveis a ele. */
const loadAccessible = async (tx: Tx, ctx: Ctx, id: string) => {
  const [row] = await tx
    .select({ document: documents, category: documentCategories })
    .from(documents)
    .innerJoin(documentCategories, eq(documentCategories.id, documents.categoryId))
    .where(eq(documents.id, id))
  if (!row) throw notFound('Documento')
  const isOwner = row.document.employeeId !== null && row.document.employeeId === ctx.employeeId
  if (!can(ctx.role, 'documents.read') && !(isOwner && row.category.employeeVisible)) throw notFound('Documento')
  return row
}

export const getDocument = async (tx: Tx, ctx: Ctx, id: string) => {
  const { document, category } = await loadAccessible(tx, ctx, id)
  const versions = await tx
    .select({
      version: documentVersions.version,
      filename: documentVersions.filename,
      mimeType: documentVersions.mimeType,
      sizeBytes: documentVersions.sizeBytes,
      uploadedByName: user.name,
      createdAt: documentVersions.createdAt,
    })
    .from(documentVersions)
    .leftJoin(user, eq(user.id, documentVersions.uploadedBy))
    .where(eq(documentVersions.documentId, id))
    .orderBy(desc(documentVersions.version))
  return { ...document, categoryName: category.name, sensitive: category.sensitive, versions }
}

export const downloadUrl = async (tx: Tx, ctx: Ctx, storage: Storage, id: string, version?: number) => {
  const { document } = await loadAccessible(tx, ctx, id)
  const [file] = await tx
    .select()
    .from(documentVersions)
    .where(and(eq(documentVersions.documentId, id), eq(documentVersions.version, version ?? document.currentVersion)))
  if (!file) throw notFound('Versão')
  // Quem baixou o quê fica registrado: é acesso a dado pessoal.
  await audit(tx, ctx, { action: 'download', entity: 'document', entityId: id, metadata: { version: file.version } })
  return {
    url: await storage.downloadUrl({
      key: file.storageKey,
      filename: file.filename,
      mimeType: file.mimeType,
      tenantId: ctx.tenantId,
    }),
  }
}

// ---------- envio ----------

const checkFile = (file: UploadedFile) => {
  if (file.buffer.length === 0) throw badRequest('O arquivo está vazio.')
  if (file.buffer.length > MAX_UPLOAD_BYTES) throw new AppError(413, 'file_too_large', 'O arquivo passa de 10 MB.')
  const filename = safeFilename(file.filename)
  const mimeType = sniffMimeType(file.buffer, filename)
  if (!mimeType) throw badRequest('Tipo de arquivo não aceito. Envie PDF, imagem (PNG, JPG, WEBP), DOCX ou XLSX.')
  return { filename, mimeType, sha256: createHash('sha256').update(file.buffer).digest('hex') }
}

const storeVersion = async (
  tx: Tx,
  ctx: Ctx,
  storage: Storage,
  documentId: string,
  version: number,
  file: UploadedFile,
) => {
  const checked = checkFile(file)
  const storageKey = `${ctx.tenantId}/${documentId}/v${version}-${checked.sha256.slice(0, 12)}`
  await tx.insert(documentVersions).values({
    tenantId: ctx.tenantId,
    documentId,
    version,
    storageKey,
    filename: checked.filename,
    mimeType: checked.mimeType,
    sizeBytes: file.buffer.length,
    sha256: checked.sha256,
    uploadedBy: ctx.userId,
  })
  // Grava o arquivo antes do commit: se falhar, a transação desfaz o registro.
  await storage.put(storageKey, file.buffer, checked.mimeType)
}

export const createDocument = async (
  tx: Tx,
  ctx: Ctx,
  storage: Storage,
  outbox: Outbox,
  meta: DocumentMetadata,
  file: UploadedFile,
  mode: 'hr' | 'self',
) => {
  const [category] = await tx.select().from(documentCategories).where(eq(documentCategories.id, meta.categoryId))
  if (!category) throw badRequest('Categoria inválida.')

  let employeeId = meta.employeeId ?? null
  if (mode === 'self') {
    if (!ctx.employeeId) throw forbidden('Seu acesso não está vinculado a uma ficha de colaborador.')
    if (!category.employeeUpload) throw forbidden('Esta categoria não aceita envio pelo colaborador.')
    employeeId = ctx.employeeId
  }
  if (category.requiresExpiry && !meta.expiresAt) throw badRequest('Esta categoria exige data de validade.')
  if (employeeId) {
    const [exists] = await tx.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId))
    if (!exists) throw notFound('Colaborador')
  }

  const [document] = await tx
    .insert(documents)
    .values({
      tenantId: ctx.tenantId,
      employeeId,
      categoryId: category.id,
      title: meta.title,
      expiresAt: meta.expiresAt ?? null,
      createdBy: ctx.userId,
    })
    .returning()
  await storeVersion(tx, ctx, storage, document!.id, 1, file)
  await audit(tx, ctx, { action: 'upload', entity: 'document', entityId: document!.id, metadata: { mode } })

  if (mode === 'self') {
    await notify(tx, ctx.tenantId, outbox, {
      userIds: (await usersWithRoles(tx, ctx.tenantId, ['hr', 'admin'])).filter(id => id !== ctx.userId),
      kind: 'document_added',
      title: 'Novo documento enviado pelo colaborador',
      body: `${ctx.userName} enviou "${meta.title}" em ${category.name}.`,
      link: `/documentos?id=${document!.id}`,
    })
  } else if (employeeId && category.employeeVisible) {
    const owner = await userOfEmployee(tx, ctx.tenantId, employeeId)
    if (owner && owner !== ctx.userId)
      await notify(tx, ctx.tenantId, outbox, {
        userIds: [owner],
        kind: 'document_added',
        title: 'Novo documento no seu cadastro',
        body: `O RH adicionou "${meta.title}" em ${category.name}.`,
        link: '/meu-cadastro',
      })
  }
  return document!
}

export const addVersion = async (tx: Tx, ctx: Ctx, storage: Storage, id: string, file: UploadedFile) => {
  const [document] = await tx.select().from(documents).where(eq(documents.id, id))
  if (!document) throw notFound('Documento')
  const version = document.currentVersion + 1
  await storeVersion(tx, ctx, storage, id, version, file)
  await tx.update(documents).set({ currentVersion: version }).where(eq(documents.id, id))
  await audit(tx, ctx, { action: 'new_version', entity: 'document', entityId: id, metadata: { version } })
  return getDocument(tx, ctx, id)
}

export const updateDocument = async (
  tx: Tx,
  ctx: Ctx,
  id: string,
  input: { title?: string; expiresAt?: string | null; status?: 'active' | 'archived' },
) => {
  const [row] = await tx.update(documents).set(input).where(eq(documents.id, id)).returning()
  if (!row) throw notFound('Documento')
  await audit(tx, ctx, { action: input.status === 'archived' ? 'archive' : 'update', entity: 'document', entityId: id, changedFields: Object.keys(input) })
  return row
}
