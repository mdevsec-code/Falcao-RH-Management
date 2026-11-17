import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { employeeTransportInput, transportRouteInput, uuid } from '@falcao-rh/contracts'

import type { AppDeps } from '../../app'
import { ctxOf, requirePermission, tenantTx } from '../../http/context'
import { AppError, badRequest } from '../../lib/errors'
import {
  clearEmployeeTransport,
  deleteRoute,
  exportTransport,
  importTransport,
  listRoutes,
  saveRoute,
  setEmployeeTransport,
  transportBoard,
} from './transport.service'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const idParams = z.object({ id: uuid })

export const transportRoutesPlugin =
  ({ db }: AppDeps): FastifyPluginAsyncZod =>
  async app => {
    const read = { preHandler: requirePermission('transport.read') }
    const manage = { preHandler: requirePermission('transport.manage') }

    app.get('/transport/board', read, async request => tenantTx(db, ctxOf(request), transportBoard))
    app.get('/transport/routes', read, async request => tenantTx(db, ctxOf(request), listRoutes))

    app.post('/transport/routes', { ...manage, schema: { body: transportRouteInput } }, async (request, reply) => {
      const ctx = ctxOf(request)
      return reply.status(201).send(await tenantTx(db, ctx, tx => saveRoute(tx, ctx, request.body)))
    })
    app.put('/transport/routes/:id', { ...manage, schema: { params: idParams, body: transportRouteInput } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => saveRoute(tx, ctx, request.body, request.params.id))
    })
    app.delete('/transport/routes/:id', { ...manage, schema: { params: idParams } }, async (request, reply) => {
      const ctx = ctxOf(request)
      await tenantTx(db, ctx, tx => deleteRoute(tx, ctx, request.params.id))
      return reply.status(204).send()
    })

    app.put(
      '/transport/employees/:id',
      { ...manage, schema: { params: idParams, body: employeeTransportInput } },
      async request => {
        const ctx = ctxOf(request)
        return tenantTx(db, ctx, tx => setEmployeeTransport(tx, ctx, request.params.id, request.body))
      },
    )
    app.delete('/transport/employees/:id', { ...manage, schema: { params: idParams } }, async (request, reply) => {
      const ctx = ctxOf(request)
      await tenantTx(db, ctx, tx => clearEmployeeTransport(tx, ctx, request.params.id))
      return reply.status(204).send()
    })

    app.get('/transport/export', read, async (request, reply) => {
      const file = await tenantTx(db, ctxOf(request), exportTransport)
      return reply
        .header('content-type', XLSX)
        .header('content-disposition', `attachment; filename="transporte-${new Date().toISOString().slice(0, 10)}.xlsx"`)
        .header('cache-control', 'no-store')
        .send(file)
    })

    app.post(
      '/transport/import',
      { ...manage, schema: { querystring: z.object({ commit: z.stringbool().default(false) }) } },
      async request => {
        const ctx = ctxOf(request)
        const part = await request.file().catch(() => undefined)
        if (!part) throw badRequest('Envie a planilha (.xlsx ou .csv).')
        const buffer = await part.toBuffer().catch(() => {
          throw new AppError(413, 'file_too_large', 'A planilha passa de 10 MB.')
        })
        return tenantTx(db, ctx, tx => importTransport(tx, ctx, { buffer, filename: part.filename }, request.query.commit))
      },
    )
  }
