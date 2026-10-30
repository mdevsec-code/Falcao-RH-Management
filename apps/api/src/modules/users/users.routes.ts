import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { inviteInput, ROLES, uuid } from '@falcao-rh/contracts'

import type { AppDeps } from '../../app'
import { ctxOf, requirePermission, tenantTx } from '../../http/context'
import { getMe, inviteMember, listMembers, updateMember } from './users.service'

const memberUpdate = z
  .object({
    role: z.enum(ROLES).optional(),
    status: z.enum(['active', 'disabled']).optional(),
    employeeId: uuid.nullable().optional(),
  })
  .refine(value => Object.keys(value).length > 0, 'Nada para alterar.')

export const userRoutes =
  ({ db, auth, env }: AppDeps): FastifyPluginAsyncZod =>
  async app => {
    app.get('/me', async request => getMe(db, ctxOf(request)))

    const manage = { preHandler: requirePermission('users.manage') }

    app.get('/members', manage, async request =>
      tenantTx(db, ctxOf(request), tx => listMembers(tx, ctxOf(request))),
    )

    app.post('/members', { ...manage, schema: { body: inviteInput } }, async (request, reply) => {
      const row = await inviteMember(db, auth, ctxOf(request), request.body, env.WEB_ORIGIN)
      return reply.status(201).send(row)
    })

    app.patch(
      '/members/:id',
      { ...manage, schema: { params: z.object({ id: uuid }), body: memberUpdate } },
      async request => {
        const ctx = ctxOf(request)
        return tenantTx(db, ctx, tx => updateMember(tx, ctx, request.params.id, request.body))
      },
    )
  }
