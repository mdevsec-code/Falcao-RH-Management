import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { requestCreate, requestDecision, requestFilters, uuid } from '@falcao-rh/contracts'

import type { AppDeps } from '../../app'
import { ctxOf, requirePermission, tenantTx } from '../../http/context'
import { forbidden } from '../../lib/errors'
import { Outbox } from '../../lib/notify'
import {
  calendar,
  cancelRequest,
  createRequest,
  decideRequest,
  getRequest,
  listRequests,
  vacationBalance,
} from './requests.service'

const idParams = z.object({ id: uuid })

export const requestRoutes =
  ({ db, env, mailer }: AppDeps): FastifyPluginAsyncZod =>
  async app => {
    /** Executa com caixa de saída: e-mails só depois do commit. */
    const withOutbox = async <T>(run: (outbox: Outbox) => Promise<T>) => {
      const outbox = new Outbox(env.WEB_ORIGIN)
      const result = await run(outbox)
      await outbox.flush(mailer, error => app.log.error(error, 'falha ao enviar e-mail'))
      return result
    }

    app.get(
      '/requests',
      { preHandler: requirePermission('requests.read'), schema: { querystring: requestFilters } },
      async request => tenantTx(db, ctxOf(request), tx => listRequests(tx, ctxOf(request), request.query)),
    )

    app.get('/requests/:id', { schema: { params: idParams } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => getRequest(tx, ctx, request.params.id))
    })

    app.post('/requests', { schema: { body: requestCreate } }, async (request, reply) => {
      const ctx = ctxOf(request)
      const row = await withOutbox(outbox => tenantTx(db, ctx, tx => createRequest(tx, ctx, outbox, request.body)))
      return reply.status(201).send(row)
    })

    app.post(
      '/requests/:id/decision',
      { preHandler: requirePermission('requests.approve'), schema: { params: idParams, body: requestDecision } },
      async request => {
        const ctx = ctxOf(request)
        return withOutbox(outbox => tenantTx(db, ctx, tx => decideRequest(tx, ctx, outbox, request.params.id, request.body)))
      },
    )

    app.post('/requests/:id/cancel', { schema: { params: idParams } }, async (request, reply) => {
      const ctx = ctxOf(request)
      await withOutbox(outbox => tenantTx(db, ctx, tx => cancelRequest(tx, ctx, outbox, request.params.id)))
      return reply.status(204).send()
    })

    app.get(
      '/calendar',
      {
        schema: {
          querystring: z.object({ from: z.iso.date(), to: z.iso.date(), departmentId: uuid.optional() }),
        },
      },
      async request => tenantTx(db, ctxOf(request), tx => calendar(tx, ctxOf(request), request.query)),
    )

    app.get(
      '/employees/:id/vacation-balance',
      { preHandler: requirePermission('requests.read'), schema: { params: idParams } },
      async request => tenantTx(db, ctxOf(request), tx => vacationBalance(tx, ctxOf(request), request.params.id)),
    )

    // Portal do colaborador
    app.get('/me/requests', { preHandler: requirePermission('self.read') }, async request => {
      const ctx = ctxOf(request)
      if (!ctx.employeeId) throw forbidden('Seu acesso não está vinculado a uma ficha de colaborador.')
      return tenantTx(db, ctx, tx => listRequests(tx, { ...ctx, scope: 'self', role: 'employee' }, {}))
    })

    app.get('/me/vacation-balance', { preHandler: requirePermission('self.read') }, async request => {
      const ctx = ctxOf(request)
      if (!ctx.employeeId) throw forbidden('Seu acesso não está vinculado a uma ficha de colaborador.')
      return tenantTx(db, ctx, tx => vacationBalance(tx, { ...ctx, scope: 'self' }, ctx.employeeId!))
    })
  }
