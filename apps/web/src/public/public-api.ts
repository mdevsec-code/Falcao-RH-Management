/**
 * Cliente da página pública de vagas. Sem sessão e sem cookies: nada daqui
 * depende do login do sistema interno.
 */
import type { CareerPageContent, CONTRACT_TYPES, WorkMode } from '@falcao-rh/contracts'

import { ApiError } from '../lib/api'

export type { CareerPageContent }

type ContractType = (typeof CONTRACT_TYPES)[number]

export type PublicJob = {
  token: string
  title: string
  city: string
  state: string | null
  workMode: WorkMode
  contractType: ContractType
  departmentName: string | null
  salary: { min: number | null; max: number | null } | null
  description: string
  requirements: string
  benefits: string
  publishedAt: string | null
}

export type PublicQuestion = { id: string; kind: 'text' | 'yes_no' | 'choice'; label: string; options: string[] | null; required: boolean }
export type PublicJobDetail = PublicJob & { questions: PublicQuestion[]; accepting: boolean }

export type CareersData = { company: { name: string }; page: CareerPageContent | null; jobs: PublicJob[] }

const base = '/api/public/v1'

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  let response: Response
  try {
    response = await fetch(`${base}${path}`, { credentials: 'omit', ...init })
  } catch {
    throw new ApiError(0, 'network', 'Sem conexão. Verifique sua internet e tente de novo.')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, data?.code ?? 'error', data?.message ?? 'Não foi possível concluir. Tente de novo.')
  return data as T
}

export const publicApi = {
  careers: (slug: string) => request<CareersData>(`/${encodeURIComponent(slug)}/jobs`),
  job: (slug: string, token: string) => request<PublicJobDetail>(`/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(token)}`),
  apply: (slug: string, token: string, form: FormData) =>
    request<{ ok: true }>(`/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(token)}/applications`, { method: 'POST', body: form }),
  erase: (token: string) => request<{ ok: true }>(`/privacy/${encodeURIComponent(token)}/erase`, { method: 'POST' }),
  renew: (token: string) => request<{ ok: true }>(`/privacy/${encodeURIComponent(token)}/renew`, { method: 'POST' }),
  assetUrl: (slug: string, id: string) => `${base}/${encodeURIComponent(slug)}/assets/${encodeURIComponent(id)}`,
}

export const formatSalary = (salary: PublicJob['salary']) => {
  if (!salary) return null
  const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
  if (salary.min !== null && salary.max !== null) return `${money(salary.min)} a ${money(salary.max)}`
  if (salary.min !== null) return `A partir de ${money(salary.min)}`
  if (salary.max !== null) return `Até ${money(salary.max)}`
  return null
}

/** "há 3 dias" a partir da data de publicação. */
export const postedAgo = (iso: string | null) => {
  if (!iso) return null
  const days = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000))
  if (days === 0) return 'Publicada hoje'
  if (days === 1) return 'Publicada ontem'
  return `Publicada há ${days} dias`
}
