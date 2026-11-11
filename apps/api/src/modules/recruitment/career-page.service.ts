/**
 * Página oficial de vagas (spec 5.9). O RH edita um rascunho; publicar copia o
 * rascunho para a versão publicada, a única que a rota pública lê. Imagens
 * ficam no armazenamento privado e só são servidas publicamente quando
 * aparecem na versão publicada (função `public_career_asset`).
 */
import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'

import { DEFAULT_CAREER_PAGE, type CareerPageContent } from '@falcao-rh/contracts'

import type { Tx } from '../../db/client'
import { careerAssets, careerPages } from '../../db/schema'
import type { Ctx } from '../../http/context'
import { audit } from '../../lib/audit'
import { AppError, badRequest } from '../../lib/errors'
import { sniffMimeType } from '../../lib/file-type'
import type { Storage } from '../../lib/storage'
import type { UploadedFile } from '../../lib/upload'
import { tenantSlug } from './jobs.service'

/** Imagens da página: PNG, JPEG ou WebP até 5 MB. */
export const CAREER_IMAGE_MAX_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export type CareerPageState = {
  draft: CareerPageContent
  published: CareerPageContent | null
  publishedAt: string | null
  previewUrl: string
}

/** Página da organização; cria com o conteúdo padrão na primeira leitura. */
const loadPage = async (tx: Tx, ctx: Ctx) => {
  const [existing] = await tx.select().from(careerPages).where(eq(careerPages.tenantId, ctx.tenantId))
  if (existing) return existing
  const [created] = await tx
    .insert(careerPages)
    .values({ tenantId: ctx.tenantId, draft: DEFAULT_CAREER_PAGE, updatedBy: ctx.userId })
    .onConflictDoNothing()
    .returning()
  if (created) return created
  const [raced] = await tx.select().from(careerPages).where(eq(careerPages.tenantId, ctx.tenantId))
  return raced!
}

const toState = async (tx: Tx, ctx: Ctx, webOrigin: string, page: typeof careerPages.$inferSelect): Promise<CareerPageState> => {
  const { slug } = await tenantSlug(tx, ctx.tenantId)
  return {
    draft: page.draft as CareerPageContent,
    published: (page.published as CareerPageContent | null) ?? null,
    publishedAt: page.publishedAt?.toISOString() ?? null,
    previewUrl: `${webOrigin}/vagas/${slug}`,
  }
}

export const getCareerPage = async (tx: Tx, ctx: Ctx, webOrigin: string) => toState(tx, ctx, webOrigin, await loadPage(tx, ctx))

/** Ids de imagem usados no conteúdo (capa e fotos do "Sobre"). */
const imageIdsOf = (content: CareerPageContent) => [...(content.hero.imageId ? [content.hero.imageId] : []), ...content.about.imageIds]

export const saveCareerDraft = async (tx: Tx, ctx: Ctx, webOrigin: string, content: CareerPageContent) => {
  const ids = [...new Set(imageIdsOf(content))]
  if (ids.length) {
    // RLS: só enxerga as imagens da própria organização.
    const found = await tx.select({ id: careerAssets.id }).from(careerAssets).where(inArray(careerAssets.id, ids))
    if (found.length !== ids.length) throw badRequest('Uma das imagens não foi encontrada. Envie a imagem de novo.')
  }
  await loadPage(tx, ctx)
  const [page] = await tx
    .update(careerPages)
    .set({ draft: content, updatedBy: ctx.userId })
    .where(eq(careerPages.tenantId, ctx.tenantId))
    .returning()
  return toState(tx, ctx, webOrigin, page!)
}

export const publishCareerPage = async (tx: Tx, ctx: Ctx, webOrigin: string) => {
  const current = await loadPage(tx, ctx)
  const [page] = await tx
    .update(careerPages)
    .set({ published: current.draft, publishedAt: new Date(), updatedBy: ctx.userId })
    .where(eq(careerPages.tenantId, ctx.tenantId))
    .returning()
  await audit(tx, ctx, { action: 'career_page.published', entity: 'career_page', entityId: page!.id })
  return toState(tx, ctx, webOrigin, page!)
}

/** Grava a imagem no armazenamento e registra; devolve o id e um link temporário. */
export const uploadCareerAsset = async (tx: Tx, ctx: Ctx, storage: Storage, file: UploadedFile) => {
  if (file.buffer.length > CAREER_IMAGE_MAX_BYTES) throw new AppError(413, 'file_too_large', 'A imagem passa de 5 MB.')
  const mimeType = sniffMimeType(file.buffer, file.filename)
  if (!mimeType || !IMAGE_TYPES.has(mimeType)) throw badRequest('Envie uma imagem PNG, JPEG ou WebP.')
  const id = randomUUID()
  const ext = mimeType.split('/')[1]
  const storageKey = `career/${ctx.tenantId}/${id}.${ext}`
  await storage.put(storageKey, file.buffer, mimeType)
  try {
    await tx.insert(careerAssets).values({
      id,
      tenantId: ctx.tenantId,
      storageKey,
      filename: file.filename.slice(0, 200) || `imagem.${ext}`,
      mimeType,
      sizeBytes: file.buffer.length,
      createdBy: ctx.userId,
    })
  } catch (error) {
    await storage.remove(storageKey).catch(() => undefined)
    throw error
  }
  await audit(tx, ctx, { action: 'career_page.asset_uploaded', entity: 'career_asset', entityId: id })
  const url = await storage.downloadUrl({ key: storageKey, filename: `imagem.${ext}`, mimeType, tenantId: ctx.tenantId })
  return { id, url }
}

/** Link temporário para a pré-visualização no editor (inclusive imagens não publicadas). */
export const careerAssetUrl = async (tx: Tx, ctx: Ctx, storage: Storage, id: string) => {
  const [asset] = await tx.select().from(careerAssets).where(eq(careerAssets.id, id))
  if (!asset) throw new AppError(404, 'not_found', 'Imagem não encontrada.')
  return { url: await storage.downloadUrl({ key: asset.storageKey, filename: asset.filename, mimeType: asset.mimeType, tenantId: ctx.tenantId }) }
}
