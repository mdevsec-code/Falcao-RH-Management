import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { candidateFilters, candidateInvite, candidateMerge, candidateUpdate, uuid } from '@falcao-rh/contracts'

import type { AppDeps } from '../../app'
import { ctxOf, requirePermission, tenantTx } from '../../http/context'
import { AppError } from '../../lib/errors'
import { candidateDuplicates, getCandidate, inviteCandidate, listCandidates, mergeCandidates, updateCandidateTags } from './talent.service'

const idParams = z.object({ id: uuid })

/** Banco de talentos: RH e administrador. O gestor não vê o banco inteiro. */
export const talentRoutes =
  ({ db, env, mailer }: AppDeps): FastifyPluginAsyncZod =>
  async app => {
    const read = { preHandler: requirePermission('talent_pool.read') }
    const manage = { preHandler: [requirePermission('talent_pool.read'), requirePermission('recruitment.manage')] }

    app.get('/candidates', { ...read, schema: { querystring: candidateFilters } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => listCandidates(tx, request.query))
    })

    app.get('/candidates/:id', { ...read, schema: { params: idParams } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => getCandidate(tx, request.params.id))
    })

    app.get('/candidates/:id/duplicates', { ...read, schema: { params: idParams } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => candidateDuplicates(tx, request.params.id))
    })

    app.patch('/candidates/:id', { ...manage, schema: { params: idParams, body: candidateUpdate } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => updateCandidateTags(tx, ctx, request.params.id, request.body.tags))
    })

    app.post('/candidates/:id/merge', { ...manage, schema: { params: idParams, body: candidateMerge } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => mergeCandidates(tx, ctx, request.params.id, request.body.sourceId))
    })

    app.post('/candidates/:id/invite', { ...manage, schema: { params: idParams, body: candidateInvite } }, async request => {
      const ctx = ctxOf(request)
      const mail = await tenantTx(db, ctx, tx => inviteCandidate(tx, ctx, env.WEB_ORIGIN, request.params.id, request.body.jobId))
      // O convite é o e-mail: se ele falhar, o RH precisa saber para tentar de novo.
      await mailer.send(mail).catch(error => {
        request.log.error(error, 'convite: falha ao enviar e-mail')
        throw new AppError(502, 'mail_failed', 'Não foi possível enviar o convite. Tente de novo.')
      })
      return { ok: true }
    })
  }
