import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { careerPageContent } from '@falcao-rh/contracts'

import type { AppDeps } from '../../app'
import { ctxOf, requirePermission, tenantTx } from '../../http/context'
import { readUpload } from '../../lib/upload'
import { careerAssetUrl, getCareerPage, publishCareerPage, saveCareerDraft, uploadCareerAsset } from './career-page.service'

/** Página oficial de vagas: RH e administrador editam, publicam e enviam imagens. */
export const careerPageRoutes =
  ({ db, env, storage }: AppDeps): FastifyPluginAsyncZod =>
  async app => {
    const manage = { preHandler: requirePermission('recruitment.manage') }

    app.get('/career-page', manage, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => getCareerPage(tx, ctx, env.WEB_ORIGIN))
    })

    app.put('/career-page', { ...manage, schema: { body: careerPageContent } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => saveCareerDraft(tx, ctx, env.WEB_ORIGIN, request.body))
    })

    app.post('/career-page/publish', manage, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => publishCareerPage(tx, ctx, env.WEB_ORIGIN))
    })

    app.post('/career-page/assets', manage, async (request, reply) => {
      const ctx = ctxOf(request)
      const { file } = await readUpload(request)
      return reply.status(201).send(await tenantTx(db, ctx, tx => uploadCareerAsset(tx, ctx, storage, file)))
    })

    app.get('/career-page/assets/:id', { ...manage, schema: { params: z.object({ id: z.uuid() }) } }, async request => {
      const ctx = ctxOf(request)
      return tenantTx(db, ctx, tx => careerAssetUrl(tx, ctx, storage, request.params.id))
    })
  }
