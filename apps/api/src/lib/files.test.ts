import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { safeFilename, sniffMimeType } from './file-type'
import { DOWNLOAD_TTL_SECONDS, LocalStorage } from './storage'

describe('tipo de arquivo pelo conteúdo', () => {
  it('reconhece PDF, PNG, JPEG e WEBP pela assinatura', () => {
    expect(sniffMimeType(Buffer.from('%PDF-1.7 ...'), 'x.bin')).toBe('application/pdf')
    expect(sniffMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), 'x')).toBe('image/png')
    expect(sniffMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'x')).toBe('image/jpeg')
    expect(sniffMimeType(Buffer.from('RIFF\0\0\0\0WEBPVP8 '), 'x')).toBe('image/webp')
  })
  it('recusa executável com extensão de PDF e HTML', () => {
    expect(sniffMimeType(Buffer.from('MZ\x90\x00'), 'nota.pdf')).toBeNull()
    expect(sniffMimeType(Buffer.from('<html><script>'), 'pagina.pdf')).toBeNull()
  })
  it('ZIP só passa como DOCX ou XLSX', () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0])
    expect(sniffMimeType(zip, 'a.docx')).toMatch(/wordprocessingml/)
    expect(sniffMimeType(zip, 'a.zip')).toBeNull()
  })
  it('limpa caminhos e caracteres perigosos do nome', () => {
    expect(safeFilename('../../etc/passwd')).toBe('passwd')
    expect(safeFilename('C:\\Users\\a\\nota "final".pdf')).toBe('nota _final_.pdf')
  })
})

describe('link de download do armazenamento local', () => {
  afterEach(() => vi.useRealTimers())

  const storage = async () => new LocalStorage(await mkdtemp(join(tmpdir(), 'falcao-rh-')), 'segredo-de-teste-com-32-caracteres!')
  const target = { key: 't/doc/v1', filename: 'a.pdf', mimeType: 'application/pdf', tenantId: 't' }
  const tokenOf = (url: string) => new URL(url, 'http://x').searchParams.get('token')!

  it('valida o token assinado', async () => {
    const s = await storage()
    expect(s.verify(tokenOf(await s.downloadUrl(target)))).toMatchObject(target)
  })

  it('recusa token adulterado', async () => {
    const s = await storage()
    const token = tokenOf(await s.downloadUrl(target))
    const [payload, signature] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ ...target, tenantId: 'outro', exp: 9e9 })).toString('base64url')
    expect(s.verify(`${forged}.${signature}`)).toBeNull()
    expect(s.verify(`${payload}.x${signature!.slice(1)}`)).toBeNull()
  })

  it('o token expira', async () => {
    const s = await storage()
    const token = tokenOf(await s.downloadUrl(target))
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + (DOWNLOAD_TTL_SECONDS + 5) * 1000)
    expect(s.verify(token)).toBeNull()
  })

  it('a chave não escapa do diretório', async () => {
    const s = await storage()
    await expect(s.put('../fora.txt', Buffer.from('x'))).rejects.toThrow(/inválida/)
  })
})
