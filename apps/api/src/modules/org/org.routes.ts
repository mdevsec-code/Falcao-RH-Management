import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { costCenterInput, departmentInput, positionInput, unitInput, uuid } from '@falcao-rh/contracts'

import { ctxOf, requirePermission, tenantTx } from '../../http/context'
import type { AppDeps } from '../../app'
import {
  costCenterService,
  createDepartment,
  deleteDepartment,
  listDepartments,
  positionService,
  unitService,
  updateDepartment,
} from './org.service'

const idParams = z.object({ id: uuid })

export const orgRoutes =
  ({ db }: AppDeps): FastifyPluginAsyncZod =>
  async app => {
    const read = { preHandler: requirePermission('org.read') }
    const manage = { preHandler: requirePermission('org.manage') }

    const simple = [
      ['units', unitService, unitInput],
      ['cost-centers', costCenterService, costCenterInput],
      ['positions', positionService, positionInput],
    ] as const

    for (const [path, service, input] of simple) {
      app.get(`/${path}`, read, async request =>
        tenantTx(db, ctxOf(request), tx => service.list(tx)),
      )
      app.post(`/${path}`, { ...manage, schema: { body: input } }, async (request, reply) => {
        const ctx = ctxOf(request)
        const row = await tenantTx(db, ctx, tx => service.create(tx, ctx, request.body as never))
        return reply.status(201).send(row)
      })
      app.put(`/${path}/:id`, { ...manage, schema: { params: idParams, body: input } }, async request => {
        const ctx = ctxOf(request)
        return tenantTx(db, ctx, tx => service.update(tx, ctx, request.params.id, request.body as never))
      })
      app.delete(`/${path}/:id`, { ...manage, schema: { params: idParams } }, async (request, reply) => {
        const ctx = ctxOf(request)
        await tenantTx(db, ctx, tx => service.remove(tx, ctx, request.params.id))
        return reply.status(204).send()
      })
    }

    app.get('/departments', read, async request => tenantTx(db, ctxOf(request), listDepartments))

    app.post('/departments', { ...manage, schema: { body: departmentInput } }, async (request, reply) => {
      const ctx = ctxOf(request)
      const row = await tenantTx(db, ctx, tx => createDepartment(tx, ctx, request.body))
      return reply.status(201).send(row)
    })

    app.put(
      '/departments/:id',
      { ...manage, schema: { params: idParams, body: departmentInput } },
      async request => {
        const ctx = ctxOf(request)
        return tenantTx(db, ctx, tx => updateDepartment(tx, ctx, request.params.id, request.body))
      },
    )

    app.delete('/departments/:id', { ...manage, schema: { params: idParams } }, async (request, reply) => {
      const ctx = ctxOf(request)
      await tenantTx(db, ctx, tx => deleteDepartment(tx, ctx, request.params.id))
      return reply.status(204).send()
    })
  }
