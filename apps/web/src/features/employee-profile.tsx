import { Lock } from 'lucide-react'
import { useRef, type ReactNode } from 'react'

import { usePageReveal } from '../components/motion'

import { Badge, Detail, Panel } from '../components/ui/layout'
import { contractLabel, displayCpf, EVENT_LABELS, formatDate, initials, statusLabel, statusTone, tenure } from '../lib/format'
import type { EmployeeDetail } from '../lib/types'

/** Cabeçalho e dados da ficha: usados pelo RH (ficha) e pelo próprio colaborador (portal). */
export function ProfileHeader({ employee, actions }: { employee: EmployeeDetail; actions?: ReactNode }) {
  const name = employee.socialName ?? employee.fullName
  const ref = useRef<HTMLElement>(null)
  usePageReveal(ref)
  return (
    <header ref={ref} className="mb-8 flex flex-wrap items-start gap-6">
      <span className="flex size-20 shrink-0 items-center justify-center rounded-md bg-ink font-display text-[34px] font-semibold text-brand">
        {initials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[clamp(34px,3.6vw,52px)] leading-[0.95] font-semibold text-ink">{name}</h1>
          <Badge tone={statusTone(employee.status)}>{statusLabel(employee.status)}</Badge>
        </div>
        <p className="mt-2 text-steel">
          {[employee.positionTitle, employee.departmentName].filter(Boolean).join(' em ') || 'Cargo e departamento não informados'}
        </p>
        <p className="num mt-0.5 text-sm text-steel">
          Matrícula {employee.registration}. {employee.status === 'terminated' ? 'Ficou' : 'Está'} na empresa há{' '}
          {tenure(employee.hireDate, employee.terminationDate)}.
        </p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

export function ProfileDetails({ employee }: { employee: EmployeeDetail }) {
  const a = employee.address
  const address = a
    ? [[a.street, a.number].filter(Boolean).join(', '), a.complement, a.district, [a.city, a.state].filter(Boolean).join('/'), a.zip]
        .filter(Boolean)
        .join(', ') || null
    : null
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel
        title="Dados pessoais"
        aside={
          employee.isMasked && (
            <span className="flex items-center gap-1.5 text-[13px] text-steel">
              <Lock className="size-3.5" aria-hidden /> Parte dos dados é restrita ao RH
            </span>
          )
        }
      >
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Nome civil">{employee.fullName}</Detail>
          <Detail label="Nome social">{employee.socialName}</Detail>
          <Detail label="CPF">{displayCpf(employee.cpf)}</Detail>
          <Detail label="Data de nascimento">{formatDate(employee.birthDate)}</Detail>
          <Detail label="E-mail">{employee.email}</Detail>
          <Detail label="Telefone">{employee.phone}</Detail>
          <div className="sm:col-span-2">
            <Detail label="Endereço">{address}</Detail>
          </div>
        </dl>
      </Panel>

      <Panel title="Vínculo">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Cargo">{employee.positionTitle}</Detail>
          <Detail label="Departamento">{employee.departmentName}</Detail>
          <Detail label="Gestor direto">{employee.managerName}</Detail>
          <Detail label="Unidade">{employee.unitName}</Detail>
          <Detail label="Centro de custo">{employee.costCenterName}</Detail>
          <Detail label="Tipo de contrato">{contractLabel(employee.contractType)}</Detail>
          <Detail label="Admissão">{formatDate(employee.hireDate)}</Detail>
          <Detail label="Desligamento">{formatDate(employee.terminationDate)}</Detail>
          <div className="sm:col-span-2">
            <Detail label="Jornada">{employee.workSchedule}</Detail>
          </div>
        </dl>
      </Panel>
    </div>
  )
}

/** Linha do tempo: é de fato uma sequência, então a marcação vertical carrega informação. */
export function ProfileHistory({ history }: { history: EmployeeDetail['history'] }) {
  if (history.length === 0) return <p className="text-sm text-steel">Nenhuma movimentação registrada.</p>
  return (
    <ol className="relative ml-2 border-l-2 border-line">
      {history.map(event => (
        <li key={event.id} className="relative pb-5 pl-6 last:pb-0">
          <span
            className={`absolute top-1.5 -left-[7px] size-3 rounded-full border-2 border-paper ${event.type === 'hired' ? 'bg-brand' : 'bg-ink'}`}
            aria-hidden
          />
          <p className="font-medium text-ink">{EVENT_LABELS[event.type]}</p>
          <p className="num text-sm text-steel">
            Vigente em {formatDate(event.effectiveDate)}
            {event.actorName && `, registrado por ${event.actorName}`}
          </p>
          {event.reason && <p className="mt-1 text-sm text-ink-soft">Motivo: {event.reason}</p>}
          {event.type === 'data_updated' && event.fields.length > 0 && (
            <p className="mt-1 text-sm text-ink-soft">Campos alterados: {event.fields.map(f => FIELD_LABELS[f] ?? f).join(', ')}</p>
          )}
        </li>
      ))}
    </ol>
  )
}

const FIELD_LABELS: Record<string, string> = {
  fullName: 'nome',
  socialName: 'nome social',
  cpf: 'CPF',
  birthDate: 'nascimento',
  email: 'e-mail',
  phone: 'telefone',
  address: 'endereço',
  unitId: 'unidade',
  costCenterId: 'centro de custo',
  hireDate: 'admissão',
  contractType: 'tipo de contrato',
  workSchedule: 'jornada',
  registration: 'matrícula',
}
