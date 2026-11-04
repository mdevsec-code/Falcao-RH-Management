import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { JOB_STATUSES, jobInput, uuid } from '@falcao-rh/contracts'

import type { AppDeps } from '../../app'
import { ctxOf, requirePermission, tenantTx } from '../../http/context'
import { changeJobStatus, createJob, getJob, listJobs, updateJob } from './jobs.service'

const idParams = z.object({ id: uuid })

/** Vagas: RH e administrador gerenciam; o gestor lê as vagas de que é responsável. */
export const jobRoutes =
  ({ db, env }: AppDeps): FastifyPluginAsyncZod =>
  async app => {
    const read = { preHandler: requirePermission('recruitment.read') }
    const manage = { preHandler: requirePermission('recruitment.manage') }
    const web = env.WEB_ORIGIN

    app.get('/jobs', { ...read, schema: { querystring: z.object({ status: z.enum(JOB_STATUSES).optional() }) } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => listJobs(tx, ctx, web, request.query.status))
    })

    app.post('/jobs', { ...manage, schema: { body: jobInput } }, async (request, reply) => {
      const ctx = ctxOf(request)
      return reply.status(201).send(await tenantTx(db, ctx, tx => createJob(tx, ctx, web, request.body)))
    })

    app.get('/jobs/:id', { ...read, schema: { params: idParams } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => getJob(tx, ctx, web, request.params.id))
    })

    app.put('/jobs/:id', { ...manage, schema: { params: idParams, body: jobInput } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => updateJob(tx, ctx, web, request.params.id, request.body))
    })

    app.post(
      '/jobs/:id/status',
      { ...manage, schema: { params: idParams, body: z.object({ status: z.enum(JOB_STATUSES) }) } },
      async request => {
        const ctx = ctxOf(request)
        return tenantTx(db, ctx, tx => changeJobStatus(tx, ctx, web, request.params.id, request.body.status))
      },
    )
  }
