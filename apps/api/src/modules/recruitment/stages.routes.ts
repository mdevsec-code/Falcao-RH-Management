import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { stagesInput } from '@falcao-rh/contracts'

import type { AppDeps } from '../../app'
import { ctxOf, requirePermission, tenantTx } from '../../http/context'
import { listStages, replaceStages } from './stages.service'

/** Etapas do processo seletivo: o gestor lê (quadro); RH e administrador editam. */
export const recruitmentStageRoutes =
  ({ db }: AppDeps): FastifyPluginAsyncZod =>
  async app => {
    app.get('/recruitment/stages', { preHandler: requirePermission('recruitment.read') }, async request =>
      tenantTx(db, ctxOf(request), listStages),
    )

    app.put(
      '/recruitment/stages',
      { preHandler: requirePermission('recruitment.manage'), schema: { body: stagesInput } },
      async request => {
        const ctx = ctxOf(request)
        return tenantTx(db, ctx, tx => replaceStages(tx, ctx, request.body))
      },
    )
  }
