import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { approvalFlowInput, tenantSettingsInput, uuid } from '@falcao-rh/contracts'

import type { AppDeps } from '../../app'
import { ctxOf, requirePermission, tenantTx } from '../../http/context'
import { deleteFlow, getSettings, listFlows, saveFlow, updateSettings } from './settings.service'

export const settingsRoutes =
  ({ db }: AppDeps): FastifyPluginAsyncZod =>
  async app => {
    const manage = { preHandler: requirePermission('settings.manage') }

    app.get('/settings', manage, async request => tenantTx(db, ctxOf(request), tx => getSettings(tx, ctxOf(request))))

    app.put('/settings', { ...manage, schema: { body: tenantSettingsInput } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => updateSettings(tx, ctx, request.body))
    })

    // Fluxos: leitura também para o RH, que acompanha as aprovações.
    app.get('/approval-flows', { preHandler: requirePermission('requests.manage') }, async request =>
      tenantTx(db, ctxOf(request), listFlows),
    )

    app.put('/approval-flows', { ...manage, schema: { body: approvalFlowInput } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => saveFlow(tx, ctx, request.body))
    })

    app.delete('/approval-flows/:id', { ...manage, schema: { params: z.object({ id: uuid }) } }, async (request, reply) => {
      const ctx = ctxOf(request)
      await tenantTx(db, ctx, tx => deleteFlow(tx, ctx, request.params.id))
      return reply.status(204).send()
    })
  }
