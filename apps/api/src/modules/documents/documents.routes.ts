import type { MultipartFile } from '@fastify/multipart'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest } from 'fastify'
import { z } from 'zod'

import { documentCategoryInput, documentFilters, documentMetadata, uuid } from '@falcao-rh/contracts'

import type { AppDeps } from '../../app'
import { ctxOf, requirePermission, TENANT_HEADER, tenantTx } from '../../http/context'
import { AppError, badRequest, notFound } from '../../lib/errors'
import { Outbox } from '../../lib/notify'
import { LocalStorage } from '../../lib/storage'
import {
  addVersion,
  createDocument,
  deleteCategory,
  downloadUrl,
  getDocument,
  listCategories,
  listDocuments,
  myDocuments,
  saveCategory,
  updateDocument,
  type UploadedFile,
} from './documents.service'

const idParams = z.object({ id: uuid })

/** Lê um envio multipart: campos de texto primeiro, depois o arquivo. */
const readUpload = async (request: FastifyRequest) => {
  let part: MultipartFile | undefined
  try {
    part = await request.file()
  } catch {
    throw badRequest('Envie o arquivo como formulário (multipart/form-data).')
  }
  if (!part) throw badRequest('Nenhum arquivo enviado.')
  let buffer: Buffer
  try {
    buffer = await part.toBuffer()
  } catch {
    throw new AppError(413, 'file_too_large', 'O arquivo passa de 10 MB.')
  }
  const fields: Record<string, string> = {}
  for (const [name, field] of Object.entries(part.fields))
    if (field && !Array.isArray(field) && field.type === 'field') fields[name] = String(field.value)
  const file: UploadedFile = { buffer, filename: part.filename }
  return { file, fields }
}

const metadataFrom = (fields: Record<string, string>) => {
  const parsed = documentMetadata.safeParse({
    title: fields.title,
    categoryId: fields.categoryId,
    employeeId: fields.employeeId || null,
    expiresAt: fields.expiresAt || null,
  })
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Dados do documento inválidos.')
  return parsed.data
}

export const documentRoutes =
  ({ db, env, mailer, storage }: AppDeps): FastifyPluginAsyncZod =>
  async app => {
    const flush = (outbox: Outbox) => outbox.flush(mailer, error => app.log.error(error, 'falha ao enviar e-mail'))
    const read = { preHandler: requirePermission('documents.read') }
    const manage = { preHandler: requirePermission('documents.manage') }

    // Categorias: leitura para quem envia documentos (RH e colaboradores).
    app.get('/document-categories', async request => tenantTx(db, ctxOf(request), listCategories))
    app.post('/document-categories', { ...manage, schema: { body: documentCategoryInput } }, async (request, reply) => {
      const ctx = ctxOf(request)
      return reply.status(201).send(await tenantTx(db, ctx, tx => saveCategory(tx, ctx, request.body)))
    })
    app.put('/document-categories/:id', { ...manage, schema: { params: idParams, body: documentCategoryInput } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => saveCategory(tx, ctx, request.body, request.params.id))
    })
    app.delete('/document-categories/:id', { ...manage, schema: { params: idParams } }, async (request, reply) => {
      const ctx = ctxOf(request)
      await tenantTx(db, ctx, tx => deleteCategory(tx, ctx, request.params.id))
      return reply.status(204).send()
    })

    app.get('/documents', { ...read, schema: { querystring: documentFilters } }, async request =>
      tenantTx(db, ctxOf(request), tx => listDocuments(tx, request.query)),
    )

    app.post('/documents', manage, async (request, reply) => {
      const ctx = ctxOf(request)
      const { file, fields } = await readUpload(request)
      const outbox = new Outbox(env.WEB_ORIGIN)
      const row = await tenantTx(db, ctx, tx => createDocument(tx, ctx, storage, outbox, metadataFrom(fields), file, 'hr'))
      await flush(outbox)
      return reply.status(201).send(row)
    })

    app.get('/documents/:id', { schema: { params: idParams } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => getDocument(tx, ctx, request.params.id))
    })

    app.post('/documents/:id/versions', { ...manage, schema: { params: idParams } }, async request => {
      const ctx = ctxOf(request)
      const { file } = await readUpload(request)
      return tenantTx(db, ctx, tx => addVersion(tx, ctx, storage, request.params.id, file))
    })

    app.patch(
      '/documents/:id',
      {
        ...manage,
        schema: {
          params: idParams,
          body: z.object({
            title: z.string().trim().min(2).max(160).optional(),
            expiresAt: z.iso.date().nullable().optional(),
            status: z.enum(['active', 'archived']).optional(),
          }),
        },
      },
      async request => {
        const ctx = ctxOf(request)
        return tenantTx(db, ctx, tx => updateDocument(tx, ctx, request.params.id, request.body))
      },
    )

    app.get(
      '/documents/:id/download',
      { schema: { params: idParams, querystring: z.object({ version: z.coerce.number().int().min(1).optional() }) } },
      async request => {
        const ctx = ctxOf(request)
        return tenantTx(db, ctx, tx => downloadUrl(tx, ctx, storage, request.params.id, request.query.version))
      },
    )

    // Portal do colaborador
    app.get('/me/documents', { preHandler: requirePermission('self.read') }, async request =>
      tenantTx(db, ctxOf(request), tx => myDocuments(tx, ctxOf(request))),
    )

    app.post('/me/documents', { preHandler: requirePermission('self.update') }, async (request, reply) => {
      const ctx = ctxOf(request)
      const { file, fields } = await readUpload(request)
      const outbox = new Outbox(env.WEB_ORIGIN)
      const row = await tenantTx(db, ctx, tx =>
        createDocument(tx, ctx, storage, outbox, metadataFrom(fields), file, 'self'),
      )
      await flush(outbox)
      return reply.status(201).send(row)
    })

    // Download no driver local: o link assinado vale 5 minutos e só para a
    // organização que o emitiu. No S3 o link aponta direto para o bucket.
    app.get(
      '/files',
      {
        schema: { querystring: z.object({ token: z.string().max(4096) }) },
        // O navegador abre o link sem o cabeçalho de organização: a organização
        // vem do token (ainda não verificado aqui) e passa pela checagem normal
        // de vínculo do usuário; a assinatura é conferida no handler.
        onRequest: async request => {
          const payload = String((request.query as { token?: string }).token ?? '').split('.')[0] ?? ''
          try {
            const { tenantId } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { tenantId?: string }
            if (typeof tenantId === 'string') request.headers[TENANT_HEADER] = tenantId
          } catch {
            // Token malformado: o handler responde 404.
          }
        },
      },
      async (request, reply) => {
      if (!(storage instanceof LocalStorage)) throw notFound('Arquivo')
      const target = storage.verify(request.query.token)
      if (!target || target.tenantId !== ctxOf(request).tenantId) throw notFound('Arquivo')
      const body = await storage.read(target.key)
      return reply
        .header('content-type', target.mimeType)
        .header('content-disposition', storage.contentDisposition(target.filename))
        .header('cache-control', 'no-store')
        .header('x-content-type-options', 'nosniff')
        .send(body)
      },
    )
  }
