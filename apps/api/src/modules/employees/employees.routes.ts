import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import {
  addressSchema,
  employeeFilters,
  employeeInput,
  employeeStatusChange,
  employeeUpdate,
  uuid,
} from '@falcao-rh/contracts'

import type { AppDeps } from '../../app'
import { ctxOf, requirePermission, tenantTx } from '../../http/context'
import {
  changeEmployeeStatus,
  createEmployee,
  getEmployee,
  getMyEmployee,
  listEmployees,
  updateEmployee,
  updateMyEmployee,
} from './employees.service'

const idParams = z.object({ id: uuid })

const selfUpdate = z.object({
  socialName: employeeUpdate.shape.socialName,
  phone: employeeUpdate.shape.phone,
  email: employeeUpdate.shape.email,
  address: addressSchema.nullable().optional(),
})

export const employeeRoutes =
  ({ db }: AppDeps): FastifyPluginAsyncZod =>
  async app => {
    app.get(
      '/employees',
      { preHandler: requirePermission('employees.read'), schema: { querystring: employeeFilters } },
      async request => tenantTx(db, ctxOf(request), tx => listEmployees(tx, ctxOf(request), request.query)),
    )

    app.get(
      '/employees/:id',
      { preHandler: requirePermission('employees.read'), schema: { params: idParams } },
      async request => tenantTx(db, ctxOf(request), tx => getEmployee(tx, ctxOf(request), request.params.id)),
    )

    app.post(
      '/employees',
      { preHandler: requirePermission('employees.create'), schema: { body: employeeInput } },
      async (request, reply) => {
        const ctx = ctxOf(request)
        const row = await tenantTx(db, ctx, tx => createEmployee(tx, ctx, request.body))
        return reply.status(201).send(row)
      },
    )

    app.patch(
      '/employees/:id',
      { preHandler: requirePermission('employees.update'), schema: { params: idParams, body: employeeUpdate } },
      async request => {
        const ctx = ctxOf(request)
        return tenantTx(db, ctx, tx => updateEmployee(tx, ctx, request.params.id, request.body))
      },
    )

    app.post(
      '/employees/:id/status',
      {
        preHandler: requirePermission('employees.terminate'),
        schema: { params: idParams, body: employeeStatusChange },
      },
      async request => {
        const ctx = ctxOf(request)
        return tenantTx(db, ctx, tx => changeEmployeeStatus(tx, ctx, request.params.id, request.body))
      },
    )

    // Portal do colaborador
    app.get('/me/employee', { preHandler: requirePermission('self.read') }, async request =>
      tenantTx(db, ctxOf(request), tx => getMyEmployee(tx, ctxOf(request))),
    )

    app.patch(
      '/me/employee',
      { preHandler: requirePermission('self.update'), schema: { body: selfUpdate } },
      async request => {
        const ctx = ctxOf(request)
        return tenantTx(db, ctx, tx => updateMyEmployee(tx, ctx, request.body))
      },
    )
  }
