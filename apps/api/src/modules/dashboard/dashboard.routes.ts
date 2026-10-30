import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { dashboardFilters } from '@falcao-rh/contracts'

import type { AppDeps } from '../../app'
import { ctxOf, requirePermission, tenantTx } from '../../http/context'
import { getDashboard } from './dashboard.service'

export const dashboardRoutes =
  ({ db }: AppDeps): FastifyPluginAsyncZod =>
  async app => {
    app.get(
      '/dashboard',
      { preHandler: requirePermission('dashboard.view'), schema: { querystring: dashboardFilters } },
      async request => tenantTx(db, ctxOf(request), tx => getDashboard(tx, ctxOf(request), request.query)),
    )
  }
