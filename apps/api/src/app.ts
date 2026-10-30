import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { MAX_UPLOAD_BYTES } from '@falcao-rh/contracts'
import { fromNodeHeaders } from 'better-auth/node'
import Fastify, { type FastifyServerOptions } from 'fastify'
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'

import type { Auth } from './auth/auth'
import type { Database } from './db/client'
import type { Env } from './env'
import { authenticate, TENANT_HEADER } from './http/context'
import { AppError, fromPgError } from './lib/errors'
import type { Mailer } from './lib/mailer'
import type { Storage } from './lib/storage'
import { dashboardRoutes } from './modules/dashboard/dashboard.routes'
import { documentRoutes } from './modules/documents/documents.routes'
import { employeeRoutes } from './modules/employees/employees.routes'
import { notificationRoutes } from './modules/notifications/notifications.routes'
import { orgRoutes } from './modules/org/org.routes'
import { requestRoutes } from './modules/requests/requests.routes'
import { settingsRoutes } from './modules/settings/settings.routes'
import { transferRoutes } from './modules/employees/transfer.routes'
import { userRoutes } from './modules/users/users.routes'

export type AppDeps = { db: Database; auth: Auth; env: Env; mailer: Mailer; storage: Storage }

export const buildApp = async (deps: AppDeps, options: FastifyServerOptions = {}) => {
  const { env, auth, db } = deps
  const app = Fastify({
    trustProxy: env.NODE_ENV === 'production',
    bodyLimit: 1024 * 1024,
    ...options,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.decorateRequest('ctx', null)

  await app.register(helmet, {
    // API pura: nenhuma resposta é renderizada como página.
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  })
  await app.register(cors, {
    origin: [env.WEB_ORIGIN],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', TENANT_HEADER],
  })
  await app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10, fieldSize: 1000 },
  })
  await app.register(rateLimit, {
    global: true,
    max: env.NODE_ENV === 'test' ? 10_000 : 300,
    timeWindow: '1 minute',
  })

  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({
        code: 'validation_error',
        message: 'Dados inválidos.',
        issues: error.validation.map(issue => ({
          path: issue.instancePath.replace(/^\//, '').replaceAll('/', '.'),
          message: issue.message,
        })),
      })
    }
    const known = error instanceof AppError ? error : fromPgError(error)
    if (known) return reply.status(known.statusCode).send({ code: known.code, message: known.message })
    if ((error as { statusCode?: number }).statusCode === 429)
      return reply.status(429).send({ code: 'rate_limited', message: 'Muitas requisições. Tente em instantes.' })

    request.log.error(error)
    return reply.status(500).send({ code: 'internal_error', message: 'Erro interno. A equipe foi notificada.' })
  })

  app.get('/health', async () => ({ status: 'ok' }))

  // Better Auth: login, sessão, MFA e redefinição de senha.
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, env.API_URL)
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          ...(request.body ? { body: JSON.stringify(request.body) } : {}),
        }),
      )
      reply.status(response.status)
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') reply.header(key, value)
      })
      const cookies = response.headers.getSetCookie()
      if (cookies.length) reply.header('set-cookie', cookies)
      return reply.send(response.body ? await response.text() : null)
    },
  })

  // API de domínio: toda rota exige sessão e organização.
  await app.register(
    async api => {
      api.addHook('preHandler', authenticate(auth, db))
      await api.register(userRoutes(deps))
      await api.register(orgRoutes(deps))
      await api.register(employeeRoutes(deps))
      await api.register(dashboardRoutes(deps))
      await api.register(requestRoutes(deps))
      await api.register(documentRoutes(deps))
      await api.register(notificationRoutes(deps))
      await api.register(settingsRoutes(deps))
      await api.register(transferRoutes(deps))
    },
    { prefix: '/api/v1' },
  )

  return app
}
