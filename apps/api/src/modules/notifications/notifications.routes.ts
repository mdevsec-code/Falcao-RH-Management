import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { uuid } from '@falcao-rh/contracts'

import type { AppDeps } from '../../app'
import { notifications } from '../../db/schema'
import { ctxOf, tenantTx } from '../../http/context'

// O RLS limita às notificações do próprio usuário; o filtro explícito é a
// segunda camada.
export const notificationRoutes =
  ({ db }: AppDeps): FastifyPluginAsyncZod =>
  async app => {
    app.get('/notifications', async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, async tx => {
        const mine = eq(notifications.userId, ctx.userId)
        const [items, [unread]] = await Promise.all([
          tx.select().from(notifications).where(mine).orderBy(desc(notifications.createdAt)).limit(30),
          tx.select({ value: count() }).from(notifications).where(and(mine, isNull(notifications.readAt))),
        ])
        return { items, unread: unread?.value ?? 0 }
      })
    })

    app.post(
      '/notifications/read',
      { schema: { body: z.object({ ids: z.array(uuid).max(100).optional() }) } },
      async (request, reply) => {
        const ctx = ctxOf(request)
        await tenantTx(db, ctx, tx =>
          tx
            .update(notifications)
            .set({ readAt: new Date() })
            .where(
              and(
                eq(notifications.userId, ctx.userId),
                isNull(notifications.readAt),
                request.body.ids ? inArray(notifications.id, request.body.ids) : undefined,
              ),
            ),
        )
        return reply.status(204).send()
      },
    )
  }
