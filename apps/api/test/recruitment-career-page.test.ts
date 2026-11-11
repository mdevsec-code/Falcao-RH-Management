/**
 * Página oficial de vagas editável (spec 5.9): rascunho separado do
 * publicado, só texto simples, imagens servidas só quando publicadas.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_CAREER_PAGE, type CareerPageContent } from '@falcao-rh/contracts'

import { withTenant } from '../src/db/client'
import { careerPages } from '../src/db/schema'
import { createTestApp, type TestApp } from './harness'

type EditorState = { draft: CareerPageContent; published: CareerPageContent | null; publishedAt: string | null; previewUrl: string }

let t: TestApp
let a: Awaited<ReturnType<TestApp['seedTenant']>>
let b: Awaited<ReturnType<TestApp['seedTenant']>>

beforeAll(async () => {
  t = await createTestApp()
  a = await t.seedTenant('alfa', ['admin', 'hr', 'manager'])
  b = await t.seedTenant('beta', ['admin'])
})

afterAll(() => t.close())

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)])
const PDF = Buffer.from('%PDF-1.7\n% arquivo de teste\n')

const hr = () => a.users.hr!.cookie
const getPage = (cookie = hr()) => t.app.inject({ method: 'GET', url: '/api/v1/career-page', headers: { cookie } })
const putPage = (content: unknown, cookie = hr()) =>
  t.app.inject({ method: 'PUT', url: '/api/v1/career-page', headers: { cookie }, payload: content as object })
const publish = (cookie = hr()) => t.app.inject({ method: 'POST', url: '/api/v1/career-page/publish', headers: { cookie } })
const publicPage = async (slug = 'alfa') => {
  const response = await t.app.inject({ method: 'GET', url: `/api/public/v1/${slug}/jobs` })
  expect(response.statusCode).toBe(200)
  return response.json<{ page: CareerPageContent | null }>().page
}
const upload = (name: string, bytes: Buffer, cookie = hr()) => {
  const form = new FormData()
  form.append('file', new Blob([bytes]), name)
  return t.app.inject({ method: 'POST', url: '/api/v1/career-page/assets', headers: { cookie }, payload: form as never })
}
const publicAsset = (id: string, slug = 'alfa') => t.app.inject({ method: 'GET', url: `/api/public/v1/${slug}/assets/${id}` })

const withTitle = (title: string): CareerPageContent => ({ ...DEFAULT_CAREER_PAGE, hero: { ...DEFAULT_CAREER_PAGE.hero, title } })

describe('página oficial de vagas', () => {
  it('GET cria a página com o conteúdo padrão, ainda não publicada', async () => {
    const response = await getPage()
    expect(response.statusCode).toBe(200)
    const state = response.json<EditorState>()
    expect(state.draft).toEqual(DEFAULT_CAREER_PAGE)
    expect(state.published).toBeNull()
    expect(state.publishedAt).toBeNull()
    expect(state.previewUrl).toMatch(/\/vagas\/alfa$/)
    expect(await publicPage()).toBeNull()
  })

  it('recusa marcação HTML em qualquer texto', async () => {
    const content = { ...DEFAULT_CAREER_PAGE, about: { ...DEFAULT_CAREER_PAGE.about, body: 'Olá <script>alert(1)</script>' } }
    const response = await putPage(content)
    expect(response.statusCode).toBe(400)
  })

  it('salvar o rascunho não muda a página pública até publicar', async () => {
    const saved = await putPage(withTitle('Rascunho da capa'))
    expect(saved.statusCode).toBe(200)
    expect(saved.json<EditorState>().draft.hero.title).toBe('Rascunho da capa')
    expect(await publicPage()).toBeNull()

    const published = await publish()
    expect(published.statusCode).toBe(200)
    const state = published.json<EditorState>()
    expect(state.published?.hero.title).toBe('Rascunho da capa')
    expect(state.publishedAt).not.toBeNull()
    expect((await publicPage())?.hero.title).toBe('Rascunho da capa')

    await putPage(withTitle('Outra capa ainda não publicada'))
    expect((await publicPage())?.hero.title).toBe('Rascunho da capa')
  })

  it('o gestor não edita nem publica', async () => {
    const cookie = a.users.manager!.cookie
    expect((await getPage(cookie)).statusCode).toBe(403)
    expect((await putPage(DEFAULT_CAREER_PAGE, cookie)).statusCode).toBe(403)
    expect((await publish(cookie)).statusCode).toBe(403)
    expect((await upload('capa.png', PNG, cookie)).statusCode).toBe(403)
  })

  it('imagem: recusa PDF; só serve publicamente o que está publicado', async () => {
    const pdf = await upload('capa.png', PDF)
    expect(pdf.statusCode).toBe(400)

    const sent = await upload('capa.png', PNG)
    expect(sent.statusCode).toBe(201)
    const { id, url } = sent.json<{ id: string; url: string }>()
    expect(url).toBeTruthy()

    // Pré-visualização interna funciona antes de publicar.
    const preview = await t.app.inject({ method: 'GET', url: `/api/v1/career-page/assets/${id}`, headers: { cookie: hr() } })
    expect(preview.statusCode).toBe(200)
    expect(preview.json<{ url: string }>().url).toBeTruthy()

    // Enviada, mas fora do publicado: 404.
    expect((await publicAsset(id)).statusCode).toBe(404)

    // No rascunho, ainda não publicada: 404.
    const page = { ...DEFAULT_CAREER_PAGE, hero: { ...DEFAULT_CAREER_PAGE.hero, imageId: id } }
    expect((await putPage(page)).statusCode).toBe(200)
    expect((await publicAsset(id)).statusCode).toBe(404)

    // Publicada na capa: 200 com o tipo do banco.
    expect((await publish()).statusCode).toBe(200)
    const served = await publicAsset(id)
    expect(served.statusCode).toBe(200)
    expect(served.headers['content-type']).toBe('image/png')
    expect(served.headers['x-content-type-options']).toBe('nosniff')
    expect(served.headers['cache-control']).toBe('public, max-age=300')
    expect(served.rawPayload.equals(PNG)).toBe(true)

    // A outra organização não serve a imagem da A.
    expect((await publicAsset(id, 'beta')).statusCode).toBe(404)
  })

  it('rascunho só aceita imagens enviadas pela própria organização', async () => {
    const sent = await upload('foto.png', PNG)
    const { id } = sent.json<{ id: string }>()
    const page = { ...DEFAULT_CAREER_PAGE, about: { ...DEFAULT_CAREER_PAGE.about, imageIds: [id] } }
    const response = await putPage(page, b.users.admin!.cookie)
    expect(response.statusCode).toBe(400)
  })

  it('a empresa A não lê a página da B', async () => {
    await getPage(b.users.admin!.cookie)
    const rows = await withTenant(t.db, { tenantId: a.tenant.id, userId: a.users.admin!.id }, tx => tx.select().from(careerPages))
    expect(rows.map(r => r.tenantId)).toEqual([a.tenant.id])
  })
})
