import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import {
  benefitItemUpdate,
  benefitPlanCreate,
  benefitPlanInput,
  benefitRunCreate,
  benefitValueInput,
  employeeBenefitInput,
  uuid,
} from '@falcao-rh/contracts'

import type { AppDeps } from '../../app'
import { ctxOf, requirePermission, tenantTx } from '../../http/context'
import {
  addPlanValue,
  closeRun,
  createPlan,
  createRun,
  deleteRun,
  employeeBenefitHistory,
  endEmployeeBenefit,
  exportRun,
  getRun,
  listEmployeeBenefits,
  listPlans,
  listRuns,
  recalculateRun,
  setEmployeeBenefit,
  updateItem,
  updatePlan,
} from './benefits.service'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const idParams = z.object({ id: uuid })

export const benefitRoutes =
  ({ db }: AppDeps): FastifyPluginAsyncZod =>
  async app => {
    const read = { preHandler: requirePermission('benefits.read') }
    const manage = { preHandler: requirePermission('benefits.manage') }

    // Planos e histórico de valores
    app.get('/benefits/plans', read, async request => tenantTx(db, ctxOf(request), listPlans))
    app.post('/benefits/plans', { ...manage, schema: { body: benefitPlanCreate } }, async (request, reply) => {
      const ctx = ctxOf(request)
      return reply.status(201).send(await tenantTx(db, ctx, tx => createPlan(tx, ctx, request.body)))
    })
    app.put('/benefits/plans/:id', { ...manage, schema: { params: idParams, body: benefitPlanInput } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => updatePlan(tx, ctx, request.params.id, request.body))
    })
    app.post('/benefits/plans/:id/values', { ...manage, schema: { params: idParams, body: benefitValueInput } }, async (request, reply) => {
      const ctx = ctxOf(request)
      return reply.status(201).send(await tenantTx(db, ctx, tx => addPlanValue(tx, ctx, request.params.id, request.body)))
    })

    // Escolha de cada colaborador
    app.get('/benefits/employees', read, async request => tenantTx(db, ctxOf(request), listEmployeeBenefits))
    app.get('/benefits/employees/:id', { ...read, schema: { params: idParams } }, async request =>
      tenantTx(db, ctxOf(request), tx => employeeBenefitHistory(tx, request.params.id)),
    )
    app.put('/benefits/employees/:id', { ...manage, schema: { params: idParams, body: employeeBenefitInput } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => setEmployeeBenefit(tx, ctx, request.params.id, request.body))
    })
    app.post(
      '/benefits/employees/:id/end',
      { ...manage, schema: { params: idParams, body: z.object({ endDate: z.iso.date() }) } },
      async (request, reply) => {
        const ctx = ctxOf(request)
        await tenantTx(db, ctx, tx => endEmployeeBenefit(tx, ctx, request.params.id, request.body.endDate))
        return reply.status(204).send()
      },
    )

    // Apuração mensal
    app.get('/benefits/runs', read, async request => tenantTx(db, ctxOf(request), listRuns))
    app.post('/benefits/runs', { ...manage, schema: { body: benefitRunCreate } }, async (request, reply) => {
      const ctx = ctxOf(request)
      return reply.status(201).send(await tenantTx(db, ctx, tx => createRun(tx, ctx, request.body.competence)))
    })
    app.get('/benefits/runs/:id', { ...read, schema: { params: idParams } }, async request => tenantTx(db, ctxOf(request), tx => getRun(tx, request.params.id)))
    app.post('/benefits/runs/:id/recalculate', { ...manage, schema: { params: idParams } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => recalculateRun(tx, ctx, request.params.id))
    })
    app.patch(
      '/benefits/runs/:id/items/:itemId',
      { ...manage, schema: { params: z.object({ id: uuid, itemId: uuid }), body: benefitItemUpdate } },
      async request => {
        const ctx = ctxOf(request)
        return tenantTx(db, ctx, tx => updateItem(tx, ctx, request.params.id, request.params.itemId, request.body))
      },
    )
    app.post('/benefits/runs/:id/close', { ...manage, schema: { params: idParams } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => closeRun(tx, ctx, request.params.id))
    })
    app.delete('/benefits/runs/:id', { ...manage, schema: { params: idParams } }, async (request, reply) => {
      const ctx = ctxOf(request)
      await tenantTx(db, ctx, tx => deleteRun(tx, ctx, request.params.id))
      return reply.status(204).send()
    })
    app.get('/benefits/runs/:id/export', { ...read, schema: { params: idParams } }, async (request, reply) => {
      const { competence, file } = await tenantTx(db, ctxOf(request), tx => exportRun(tx, request.params.id))
      return reply
        .header('content-type', XLSX)
        .header('content-disposition', `attachment; filename="beneficios-${competence}.xlsx"`)
        .header('cache-control', 'no-store')
        .send(file)
    })
  }
