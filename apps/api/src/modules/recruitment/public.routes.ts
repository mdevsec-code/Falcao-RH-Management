import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import type { AppDeps } from '../../app'
import { AppError } from '../../lib/errors'
import { verifyTurnstile } from '../../lib/turnstile'
import { readUpload } from '../../lib/upload'
import { eraseByToken, getPublicJob, listPublicJobs, renewByToken, submitApplication } from './public.service'

const slugParams = z.object({ slug: z.string().min(1).max(80) })
const jobParams = slugParams.extend({ token: z.string().min(16).max(200) })

/**
 * Página pública de vagas: sem sessão, sem cookies, sob a role `falcao_public`.
 * Limites por IP mais rígidos que o global, sobretudo no envio.
 */
export const publicRecruitmentRoutes =
  ({ db, env, storage, mailer }: AppDeps): FastifyPluginAsyncZod =>
  async app => {
    const test = env.NODE_ENV === 'test'
    const reads = { rateLimit: { max: test ? 10_000 : 120, timeWindow: '1 minute' } }
    const writes = { rateLimit: { max: test ? 10_000 : 10, timeWindow: '1 minute' } }

    app.get('/:slug/jobs', { config: reads, schema: { params: slugParams } }, async request => listPublicJobs(db, request.params.slug))

    app.get('/:slug/jobs/:token', { config: reads, schema: { params: jobParams } }, async request =>
      getPublicJob(db, request.params.slug, request.params.token),
    )

    app.post('/:slug/jobs/:token/applications', { config: writes, schema: { params: jobParams } }, async (request, reply) => {
      const { file, fields } = await readUpload(request)
      if (env.TURNSTILE_SECRET && !(await verifyTurnstile(env.TURNSTILE_SECRET, fields['cf-turnstile-response'], request.ip)))
        throw new AppError(400, 'captcha_failed', 'Confirme que você não é um robô e envie de novo.')
      await submitApplication(
        { db, storage, mailer, webOrigin: env.WEB_ORIGIN, log: error => request.log.error(error, 'candidatura: falha secundária') },
        request.params.slug,
        request.params.token,
        fields,
        file,
      )
      return reply.status(201).send({ ok: true })
    })

    // Link do e-mail do candidato. Sempre a mesma resposta: não revela se o
    // token existia nem se já foi usado.
    const privacyParams = z.object({ token: z.string().min(1).max(200) })
    const privacyDeps = (ip: string, log: (error: unknown) => void) => ({ db, storage, ip, log })

    app.post('/privacy/:token/erase', { config: writes, schema: { params: privacyParams } }, async request => {
      await eraseByToken(privacyDeps(request.ip, error => request.log.error(error, 'exclusão: falha ao remover arquivo')), request.params.token)
      return { ok: true }
    })

    app.post('/privacy/:token/renew', { config: writes, schema: { params: privacyParams } }, async request => {
      await renewByToken(privacyDeps(request.ip, error => request.log.error(error)), request.params.token)
      return { ok: true }
    })
  }
