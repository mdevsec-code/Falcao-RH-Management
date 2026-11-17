import { z } from 'zod'

import { uuid } from './schemas'

// ---------- benefícios: vale-alimentação e vale-refeição ----------

export const BENEFIT_KINDS = ['va', 'vr'] as const
export type BenefitKind = (typeof BENEFIT_KINDS)[number]
export const BENEFIT_KIND_LABELS: Record<BenefitKind, string> = { va: 'Vale-alimentação', vr: 'Vale-refeição' }

/** Diário: valor × dias trabalhados. Mensal: valor cheio, proporcional aos dias do mês. */
export const BENEFIT_VALUE_TYPES = ['daily', 'monthly'] as const
export type BenefitValueType = (typeof BENEFIT_VALUE_TYPES)[number]
export const BENEFIT_VALUE_TYPE_LABELS: Record<BenefitValueType, string> = { daily: 'Por dia trabalhado', monthly: 'Mensal' }

export const BENEFIT_RUN_STATUSES = ['draft', 'closed'] as const
export type BenefitRunStatus = (typeof BENEFIT_RUN_STATUSES)[number]
export const BENEFIT_RUN_STATUS_LABELS: Record<BenefitRunStatus, string> = { draft: 'Em conferência', closed: 'Fechada' }

const isoDate = z.iso.date()
const cents = z.coerce.number().int('Valor em centavos.').min(1, 'Informe o valor.').max(10_000_000)

export const benefitPlanInput = z.object({
  kind: z.enum(BENEFIT_KINDS),
  name: z.string().trim().min(2).max(80),
  provider: z.string().trim().max(80).default(''),
  valueType: z.enum(BENEFIT_VALUE_TYPES),
  active: z.boolean().default(true),
})
export type BenefitPlanInput = z.infer<typeof benefitPlanInput>

/** Novo valor programado: entra no histórico e vale a partir da data. */
export const benefitValueInput = z.object({ valueCents: cents, effectiveFrom: isoDate })
export type BenefitValueInput = z.infer<typeof benefitValueInput>

/** Plano novo já nasce com o primeiro valor. */
export const benefitPlanCreate = benefitPlanInput.extend(benefitValueInput.shape)

/** Escolha do colaborador: um benefício por vez; trocar encerra o anterior. */
export const employeeBenefitInput = z.object({ planId: uuid, startDate: isoDate })
export type EmployeeBenefitInput = z.infer<typeof employeeBenefitInput>

export const competence = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use o formato AAAA-MM.')
export const benefitRunCreate = z.object({ competence })
export const benefitItemUpdate = z.object({
  days: z.coerce.number().int().min(0).max(31),
  note: z.string().trim().max(300).default(''),
})
export type BenefitItemUpdate = z.infer<typeof benefitItemUpdate>
