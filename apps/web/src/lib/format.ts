import { CONTRACT_TYPE_LABELS, EMPLOYEE_STATUS_LABELS, formatCpf } from '@falcao-rh/contracts'

import type { ContractType, EmployeeEvent, EmployeeStatus } from './types'

/** Hoje no calendário do usuário (toISOString daria o dia UTC). */
export const todayIso = () => new Date().toLocaleDateString('en-CA')

/** Datas ISO (AAAA-MM-DD) sem passar por fuso horário: 2026-03-01 é 01/03/2026 em qualquer lugar. */
export const formatDate = (iso: string | null | undefined) => {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const formatMonth = (yyyyMm: string) => {
  const [y, m] = yyyyMm.split('-')
  return `${MONTHS[Number(m) - 1]}/${y!.slice(2)}`
}

export const formatNumber = (value: number) => value.toLocaleString('pt-BR')

export const displayCpf = (cpf: string) => (cpf.includes('*') ? cpf : formatCpf(cpf))

export const statusLabel = (status: EmployeeStatus) => EMPLOYEE_STATUS_LABELS[status]
const STATUS_TONES = { active: 'ok', on_leave: 'warn', terminated: 'neutral' } as const
export const statusTone = (status: EmployeeStatus) => STATUS_TONES[status]
export const contractLabel = (type: ContractType) => CONTRACT_TYPE_LABELS[type]

export const EVENT_LABELS: Record<EmployeeEvent['type'], string> = {
  hired: 'Admissão',
  data_updated: 'Atualização cadastral',
  department_changed: 'Mudança de departamento',
  position_changed: 'Mudança de cargo',
  manager_changed: 'Mudança de gestor',
  status_changed: 'Mudança de situação',
}

/** Tempo de casa por extenso: "3 anos e 2 meses". */
export const tenure = (hireDate: string, until?: string | null) => {
  const start = new Date(`${hireDate}T00:00:00`)
  const end = until ? new Date(`${until}T00:00:00`) : new Date()
  let months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth()
  if (end.getDate() < start.getDate()) months--
  if (months < 1) return 'menos de 1 mês'
  const years = Math.floor(months / 12)
  const rest = months % 12
  const parts = [
    years ? `${years} ${years === 1 ? 'ano' : 'anos'}` : '',
    rest ? `${rest} ${rest === 1 ? 'mês' : 'meses'}` : '',
  ].filter(Boolean)
  return parts.join(' e ')
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]!.toUpperCase())
    .join('')
