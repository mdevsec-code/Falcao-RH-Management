import { BadgeCheck, Briefcase, CalendarDays, Clock3, Lock, UserRound } from 'lucide-react'
import { useRef, type ReactNode } from 'react'

import { useTilt } from '../components/motion'
import { Avatar, Badge, Detail, Panel } from '../components/ui/layout'
import { contractLabel, displayCpf, EVENT_LABELS, formatDate, statusLabel, statusTone, tenure } from '../lib/format'
import { gsap, MOTION, SplitText, useGSAP } from '../lib/gsap'
import type { EmployeeDetail } from '../lib/types'

/** Cabeçalho e dados da ficha: usados pelo RH (ficha) e pelo próprio colaborador (portal). */
export function ProfileHeader({ employee, actions }: { employee: EmployeeDetail; actions?: ReactNode }) {
  const name = employee.socialName ?? employee.fullName
  const ref = useRef<HTMLElement>(null)
  const card = useRef<HTMLDivElement>(null)
  useTilt(card, 2.5)
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION.ok, () => {
        const split = SplitText.create('[data-profile-name]', { type: 'lines,chars', mask: 'lines', aria: 'auto' })
        gsap
          .timeline()
          .from('[data-profile-avatar]', { scale: 0.6, rotate: -8, autoAlpha: 0, duration: 0.9, ease: 'back.out(1.6)' })
          .from(split.chars, { yPercent: 115, duration: 0.9, stagger: 0.014 }, 0.15)
          .from('[data-profile-fade]', { y: 12, autoAlpha: 0, duration: 0.7, stagger: 0.07 }, 0.4)
          .from('[data-profile-fact]', { y: 18, autoAlpha: 0, duration: 0.7, stagger: 0.06 }, 0.5)
        return () => split.revert()
      })
    },
    { scope: ref, dependencies: [name] },
  )

  const facts = [
    { icon: Clock3, label: 'Tempo de casa', value: tenure(employee.hireDate, employee.terminationDate) },
    { icon: CalendarDays, label: 'Admissão', value: formatDate(employee.hireDate) },
    { icon: Briefcase, label: 'Contrato', value: contractLabel(employee.contractType) },
    { icon: UserRound, label: 'Gestor', value: employee.managerName ?? 'Não definido' },
  ]

  return (
    <header ref={ref} className="mb-8">
      <div ref={card} className="night-glow grain relative overflow-hidden rounded-xl border border-night-line text-snow shadow-lift will-change-transform">
        <div className="blueprint pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_right,transparent,black_60%)]" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{ background: 'radial-gradient(500px circle at var(--mx, 80%) var(--my, 0%), rgb(254 190 2 / 0.12), transparent 60%)' }}
          aria-hidden
        />
        <div className="relative flex flex-wrap items-start gap-6 p-6 sm:p-8">
          <span data-profile-avatar className="relative">
            <Avatar name={name} size="xl" className="ring-white/10" />
            {employee.status === 'active' && (
              <span className="absolute -right-1.5 -bottom-1.5 flex size-7 items-center justify-center rounded-full bg-ok text-snow ring-4 ring-night">
                <BadgeCheck className="size-4" aria-hidden />
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p data-profile-fade className="mb-2 text-[11px] font-medium tracking-[0.16em] text-fog uppercase">
              Matrícula <span className="num text-brand">{employee.registration}</span>
            </p>
            <h1 data-profile-name className="font-display text-[clamp(34px,4vw,56px)] leading-[0.92] font-semibold tracking-[-0.01em]">
              {name}
            </h1>
            <div data-profile-fade className="mt-3 flex flex-wrap items-center gap-3">
              <Badge tone={statusTone(employee.status)}>{statusLabel(employee.status)}</Badge>
              <span className="text-[15px] text-fog">
                {[employee.positionTitle, employee.departmentName].filter(Boolean).join(' · ') || 'Cargo e departamento não informados'}
              </span>
            </div>
          </div>
          {actions && (
            <div data-profile-fade className="flex flex-wrap gap-2">
              {actions}
            </div>
          )}
        </div>
        <dl className="relative grid grid-cols-2 border-t border-night-line lg:grid-cols-4">
          {facts.map(fact => (
            <div data-profile-fact key={fact.label} className="flex items-center gap-3 border-night-line px-6 py-4 max-lg:odd:border-r max-lg:[&:nth-child(-n+2)]:border-b lg:border-r lg:last:border-r-0 sm:px-8">
              <fact.icon className="size-4 shrink-0 text-brand" aria-hidden />
              <div className="min-w-0">
                <dt className="text-[11px] tracking-[0.12em] text-fog/80 uppercase">{fact.label}</dt>
                <dd className="truncate text-[14.5px] font-medium">{fact.value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
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
        icon={UserRound}
        aside={
          employee.isMasked && (
            <span className="flex items-center gap-1.5 rounded-full bg-sunken px-2.5 py-1 text-[12px] text-steel ring-1 ring-line">
              <Lock className="size-3" aria-hidden /> Parte dos dados é restrita ao RH
            </span>
          )
        }
      >
        <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
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

      <Panel title="Vínculo" icon={Briefcase}>
        <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
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

/**
 * Linha do tempo: é de fato uma sequência, então a marcação vertical
 * carrega informação. A linha amarela acompanha a rolagem (scrub) e cada
 * marco acende quando a linha chega nele.
 */
export function ProfileHistory({ history }: { history: EmployeeDetail['history'] }) {
  const ref = useRef<HTMLOListElement>(null)
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION.ok, () => {
        gsap.fromTo(
          '[data-progress]',
          { scaleY: 0 },
          { scaleY: 1, ease: 'none', transformOrigin: 'top', scrollTrigger: { trigger: ref.current, start: 'top 75%', end: 'bottom 55%', scrub: 0.6 } },
        )
        gsap.utils.toArray<HTMLElement>('[data-milestone]', ref.current).forEach(item => {
          gsap.from(item.querySelector('[data-dot]'), {
            scale: 0,
            duration: 0.5,
            ease: 'back.out(3)',
            scrollTrigger: { trigger: item, start: 'top 72%', toggleActions: 'play none none reverse' },
          })
        })
      })
    },
    { scope: ref, dependencies: [history.length] },
  )
  if (history.length === 0) return <p className="text-sm text-steel">Nenhuma movimentação registrada.</p>
  return (
    <ol ref={ref} className="relative ml-3">
      <span className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-line" aria-hidden />
      <span data-progress className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-brand" aria-hidden />
      {history.map(event => (
        <li data-milestone key={event.id} className="relative pb-7 pl-8 last:pb-0">
          <span
            data-dot
            className={`absolute top-1 -left-[7px] size-4 rounded-full border-[3px] border-paper shadow-xs ${event.type === 'hired' ? 'bg-brand ring-2 ring-brand/30' : 'bg-ink'}`}
            aria-hidden
          />
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <p className="font-medium text-ink">{EVENT_LABELS[event.type]}</p>
            <p className="num text-[13px] text-steel">{formatDate(event.effectiveDate)}</p>
          </div>
          {event.actorName && <p className="text-[13px] text-steel">Registrado por {event.actorName}</p>}
          {(event.reason || (event.type === 'data_updated' && event.fields.length > 0)) && (
            <div className="mt-2 rounded-sm border border-line bg-sunken px-3 py-2 text-[13.5px] text-ink-soft">
              {event.reason && <p>Motivo: {event.reason}</p>}
              {event.type === 'data_updated' && event.fields.length > 0 && (
                <p>Campos alterados: {event.fields.map(f => FIELD_LABELS[f] ?? f).join(', ')}</p>
              )}
            </div>
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
