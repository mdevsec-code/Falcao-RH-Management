/**
 * Cliente HTTP da API de domínio. A sessão viaja no cookie (mesma origem,
 * via proxy); a organização ativa, no cabeçalho `x-tenant-id`.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message)
  }
}

const TENANT_KEY = 'falcao-rh:tenant'

export const tenantStore = {
  get: () => {
    try {
      return localStorage.getItem(TENANT_KEY)
    } catch {
      return null
    }
  },
  set: (id: string) => {
    try {
      localStorage.setItem(TENANT_KEY, id)
    } catch {
      // Navegação privada: segue com a organização padrão.
    }
  },
}

type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | undefined | null>
}

const tenantHeaders = (): Record<string, string> => {
  const tenant = tenantStore.get()
  return tenant ? { 'x-tenant-id': tenant } : {}
}

const failure = async (response: Response) => {
  const data = await response.json().catch(() => null)
  return new ApiError(
    response.status,
    data?.code ?? 'error',
    data?.message ?? 'Não foi possível concluir a operação.',
    data?.issues,
  )
}

/** Envio de arquivo (multipart). Campos de texto vão antes do arquivo. */
export async function apiUpload<T>(path: string, fields: Record<string, string | null | undefined>, file: File): Promise<T> {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) if (value) form.append(key, value)
  form.append('file', file)
  const response = await fetch(`/api/v1${path}`, { method: 'POST', body: form, credentials: 'include', headers: tenantHeaders() }).catch(() => {
    throw new ApiError(0, 'network', 'Sem conexão com o servidor. Verifique sua internet e tente de novo.')
  })
  if (!response.ok) throw await failure(response)
  return (await response.json()) as T
}

/** Baixa um arquivo gerado pela API (ex.: planilha) e oferece para salvar. */
export async function apiDownload(path: string, fallbackName: string) {
  const response = await fetch(`/api/v1${path}`, { credentials: 'include', headers: tenantHeaders() })
  if (!response.ok) throw await failure(response)
  const name = /filename="?([^";]+)"?/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName
  saveBlob(await response.blob(), name)
}

/** Abre um link de download já assinado (documentos). */
export function openDownload(url: string) {
  const link = document.createElement('a')
  link.href = url
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function api<T>(path: string, { method = 'GET', body, query }: Options = {}): Promise<T> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {}))
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  const qs = params.toString()

  const headers: Record<string, string> = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  const tenant = tenantStore.get()
  if (tenant) headers['x-tenant-id'] = tenant

  let response: Response
  try {
    response = await fetch(`/api/v1${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network', 'Sem conexão com o servidor. Verifique sua internet e tente de novo.')
  }

  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => null)
  if (!response.ok)
    throw new ApiError(
      response.status,
      data?.code ?? 'error',
      data?.message ?? 'Não foi possível concluir a operação.',
      data?.issues,
    )
  return data as T
}
