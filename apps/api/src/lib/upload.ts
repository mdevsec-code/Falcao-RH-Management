import type { MultipartFile } from '@fastify/multipart'
import type { FastifyRequest } from 'fastify'

import { AppError, badRequest } from './errors'

export type UploadedFile = { buffer: Buffer; filename: string }

/** Lê um envio multipart: campos de texto primeiro, depois o arquivo. */
export const readUpload = async (request: FastifyRequest) => {
  let part: MultipartFile | undefined
  try {
    part = await request.file()
  } catch {
    throw badRequest('Envie o arquivo como formulário (multipart/form-data).')
  }
  if (!part) throw badRequest('Nenhum arquivo enviado.')
  let buffer: Buffer
  try {
    buffer = await part.toBuffer()
  } catch {
    throw new AppError(413, 'file_too_large', 'O arquivo passa de 10 MB.')
  }
  const fields: Record<string, string> = {}
  for (const [name, field] of Object.entries(part.fields))
    if (field && !Array.isArray(field) && field.type === 'field') fields[name] = String(field.value)
  const file: UploadedFile = { buffer, filename: part.filename }
  return { file, fields }
}
