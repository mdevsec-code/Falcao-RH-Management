import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import type { AppDeps } from '../../app'
import { ctxOf, requirePermission, tenantTx } from '../../http/context'
import { AppError, badRequest } from '../../lib/errors'
import { exportEmployees, importEmployees, importTemplate } from './transfer.service'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export const transferRoutes =
  ({ db }: AppDeps): FastifyPluginAsyncZod =>
  async app => {
    app.get('/employees/export', { preHandler: requirePermission('employees.export') }, async (request, reply) => {
      const ctx = ctxOf(request)
      const file = await tenantTx(db, ctx, tx => exportEmployees(tx, ctx))
      const date = new Date().toISOString().slice(0, 10)
      return reply
        .header('content-type', XLSX)
        .header('content-disposition', `attachment; filename="colaboradores-${date}.xlsx"`)
        .header('cache-control', 'no-store')
        .send(file)
    })

    app.get('/employees/import/template', { preHandler: requirePermission('employees.import') }, async (request, reply) => {
      const file = await tenantTx(db, ctxOf(request), importTemplate)
      return reply
        .header('content-type', XLSX)
        .header('content-disposition', 'attachment; filename="modelo-importacao-colaboradores.xlsx"')
        .send(file)
    })

    app.post(
      '/employees/import',
      {
        preHandler: requirePermission('employees.import'),
        schema: {
          querystring: z.object({
            commit: z.stringbool().default(false),
            createMissing: z.stringbool().default(false),
          }),
        },
      },
      async request => {
        const ctx = ctxOf(request)
        const part = await request.file().catch(() => undefined)
        if (!part) throw badRequest('Envie a planilha (.xlsx ou .csv).')
        const buffer = await part.toBuffer().catch(() => {
          throw new AppError(413, 'file_too_large', 'A planilha passa de 10 MB.')
        })
        return tenantTx(db, ctx, tx => importEmployees(tx, ctx, { buffer, filename: part.filename }, request.query))
      },
    )
  }
