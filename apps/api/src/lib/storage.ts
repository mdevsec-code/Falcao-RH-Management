import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'

import type { Env } from '../env'

/** Validade de um link de download: curta, só para o clique de quem pediu. */
export const DOWNLOAD_TTL_SECONDS = 300

export type DownloadTarget = { key: string; filename: string; mimeType: string; tenantId: string }

/**
 * Armazenamento de arquivos privados. Nada fica em diretório público: o
 * download sempre passa por um link assinado de vida curta, emitido depois
 * da checagem de permissão.
 */
export interface Storage {
  put(key: string, body: Buffer, mimeType: string): Promise<void>
  downloadUrl(target: DownloadTarget): Promise<string>
}

const contentDisposition = (filename: string) =>
  `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`

// ---------- disco local (desenvolvimento) ----------

type LocalToken = DownloadTarget & { exp: number }

export class LocalStorage implements Storage {
  private readonly root: string

  constructor(
    dir: string,
    private readonly secret: string,
  ) {
    this.root = resolve(dir)
  }

  /** Impede que uma chave escape do diretório (`../`). */
  private pathOf(key: string) {
    const path = resolve(this.root, key)
    if (!path.startsWith(this.root + sep)) throw new Error('Chave de arquivo inválida.')
    return path
  }

  async put(key: string, body: Buffer) {
    const path = this.pathOf(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, body, { flag: 'wx' })
  }

  async read(key: string) {
    return readFile(this.pathOf(key))
  }

  private sign(payload: string) {
    return createHmac('sha256', this.secret).update(payload).digest('base64url')
  }

  async downloadUrl(target: DownloadTarget) {
    const payload = Buffer.from(
      JSON.stringify({ ...target, exp: Math.floor(Date.now() / 1000) + DOWNLOAD_TTL_SECONDS } satisfies LocalToken),
    ).toString('base64url')
    return `/api/v1/files?token=${payload}.${this.sign(payload)}`
  }

  /** Valida assinatura e validade; devolve o alvo ou `null`. */
  verify(token: string): LocalToken | null {
    const [payload, signature] = token.split('.')
    if (!payload || !signature) return null
    const expected = Buffer.from(this.sign(payload))
    const given = Buffer.from(signature)
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as LocalToken
    return data.exp >= Math.floor(Date.now() / 1000) ? data : null
  }

  contentDisposition = contentDisposition
}

// ---------- Amazon S3 (produção) ----------

export class S3Storage implements Storage {
  private readonly client: S3Client

  constructor(
    private readonly bucket: string,
    region: string,
    endpoint?: string,
  ) {
    this.client = new S3Client({ region, ...(endpoint ? { endpoint, forcePathStyle: true } : {}) })
  }

  async put(key: string, body: Buffer, mimeType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
        ServerSideEncryption: 'AES256',
        // Nunca sobrescreve: cada versão tem chave própria.
        IfNoneMatch: '*',
      }),
    )
  }

  async downloadUrl(target: DownloadTarget) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: target.key,
        ResponseContentDisposition: contentDisposition(target.filename),
        ResponseContentType: target.mimeType,
      }),
      { expiresIn: DOWNLOAD_TTL_SECONDS },
    )
  }
}

export const createStorage = (env: Env): Storage =>
  env.STORAGE_DRIVER === 's3'
    ? new S3Storage(env.S3_BUCKET!, env.S3_REGION, env.S3_ENDPOINT)
    : new LocalStorage(env.STORAGE_DIR, env.AUTH_SECRET)
