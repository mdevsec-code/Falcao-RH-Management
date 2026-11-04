import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { stageMove, uuid } from '@falcao-rh/contracts'

import type { AppDeps } from '../../app'
import { ctxOf, requirePermission, tenantTx } from '../../http/context'
import { addNote, applicationDetail, board, candidateFileUrl, moveApplication, rateApplication } from './applications.service'

const idParams = z.object({ id: uuid })

/** Quadro de candidatos: RH e gestor (nas vagas em que é responsável) movem, avaliam e anotam. */
export const applicationRoutes =
  ({ db, mailer, storage }: AppDeps): FastifyPluginAsyncZod =>
  async app => {
    const read = { preHandler: requirePermission('recruitment.read') }

    app.get('/jobs/:id/applications', { ...read, schema: { params: idParams } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => board(tx, ctx, request.params.id))
    })

    app.get('/applications/:id', { ...read, schema: { params: idParams } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => applicationDetail(tx, ctx, request.params.id))
    })

    app.post('/applications/:id/stage', { ...read, schema: { params: idParams, body: stageMove } }, async request => {
      const ctx = ctxOf(request)
      const mail = await tenantTx(db, ctx, tx => moveApplication(tx, ctx, request.params.id, request.body))
      // Aviso ao candidato só depois do commit; falha de e-mail não desfaz a recusa.
      if (mail) await mailer.send(mail).catch(error => request.log.error(error, 'recusa: falha ao enviar e-mail'))
      return { ok: true }
    })

    app.patch(
      '/applications/:id',
      { ...read, schema: { params: idParams, body: z.object({ rating: z.number().int().min(1).max(5).nullable() }) } },
      async request => {
        const ctx = ctxOf(request)
        return tenantTx(db, ctx, tx => rateApplication(tx, ctx, request.params.id, request.body.rating))
      },
    )

    app.post(
      '/applications/:id/notes',
      { ...read, schema: { params: idParams, body: z.object({ body: z.string().trim().min(1).max(2000) }) } },
      async (request, reply) => {
        const ctx = ctxOf(request)
        return reply.status(201).send(await tenantTx(db, ctx, tx => addNote(tx, ctx, request.params.id, request.body.body)))
      },
    )

    app.get('/candidate-files/:id/download', { ...read, schema: { params: idParams } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => candidateFileUrl(tx, ctx, storage, request.params.id))
    })
  }
