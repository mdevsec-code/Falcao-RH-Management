import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { admissionDocumentTitle, admissionSelfData, uuid } from '@falcao-rh/contracts'

import type { AppDeps } from '../../app'
import { ctxOf, requirePermission, tenantTx } from '../../http/context'
import { badRequest } from '../../lib/errors'
import { Outbox } from '../../lib/notify'
import { readUpload } from '../../lib/upload'
import { admissionStatus, admissionSubmit, admissionUpload, admissionView, createAdmissionLink, withAdmissionLink } from './admission.service'

const idParams = z.object({ id: uuid })

/** RH gera o link de admissão digital na ficha do colaborador. */
export const admissionRoutes =
  ({ db }: AppDeps): FastifyPluginAsyncZod =>
  async app => {
    const update = { preHandler: requirePermission('employees.update') }
    app.get('/employees/:id/admission-link', { ...update, schema: { params: idParams } }, async request =>
      tenantTx(db, ctxOf(request), tx => admissionStatus(tx, request.params.id)),
    )
    app.post('/employees/:id/admission-link', { ...update, schema: { params: idParams } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => createAdmissionLink(tx, ctx, request.params.id))
    })
  }

/** Link público: sem sessão; o token abre só o cadastro do próprio colaborador. */
export const admissionPublicRoutes =
  ({ db, env, mailer, storage }: AppDeps): FastifyPluginAsyncZod =>
  async app => {
    const test = env.NODE_ENV === 'test'
    const limit = { rateLimit: { max: test ? 10_000 : 30, timeWindow: '1 minute' } }
    const params = z.object({ token: z.string().min(20).max(100) })

    app.get('/admission/:token', { config: limit, schema: { params } }, async request =>
      withAdmissionLink(db, request.params.token, admissionView),
    )

    app.post('/admission/:token/documents', { config: limit, schema: { params } }, async (request, reply) => {
      const { file, fields } = await readUpload(request)
      const title = admissionDocumentTitle.safeParse(fields.title)
      if (!title.success) throw badRequest('Informe qual documento está enviando.')
      const row = await withAdmissionLink(db, request.params.token, (tx, link) => admissionUpload(tx, link, storage, request.ip, title.data, file))
      return reply.status(201).send(row)
    })

    app.post('/admission/:token', { config: limit, schema: { params, body: admissionSelfData } }, async (request, reply) => {
      const outbox = new Outbox(env.WEB_ORIGIN)
      await withAdmissionLink(db, request.params.token, (tx, link) => admissionSubmit(tx, link, outbox, request.ip, request.body))
      await outbox.flush(mailer, error => app.log.error(error, 'falha ao enviar e-mail'))
      return reply.status(204).send()
    })
  }
