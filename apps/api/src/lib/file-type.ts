import { ALLOWED_UPLOADS } from '@falcao-rh/contracts'

type Allowed = keyof typeof ALLOWED_UPLOADS

const startsWith = (bytes: Buffer, signature: number[], offset = 0) =>
  signature.every((byte, i) => bytes[offset + i] === byte)

/**
 * Identifica o tipo pelo conteúdo (assinatura dos primeiros bytes), não pelo
 * nome nem pelo cabeçalho enviado pelo navegador, que o usuário controla.
 */
export const sniffMimeType = (bytes: Buffer, filename: string): Allowed | null => {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'
  // DOCX e XLSX são contêineres ZIP: a assinatura confirma o contêiner e a
  // extensão escolhe o formato. O arquivo é sempre baixado como anexo, nunca
  // aberto pelo servidor.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  return null
}

/** Nome seguro para gravar e exibir: sem caminho, sem caracteres de controle. */
export const safeFilename = (filename: string) =>
  filename
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f"<>|:*?]/g, '_')
    .slice(0, 150) || 'arquivo'
