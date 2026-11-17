/**
 * Benefícios VA/VR: planos com histórico de valores, a escolha de cada
 * colaborador ao longo do tempo e a apuração mensal. Segurança na migração
 * `0018_benefits_security.sql`.
 */
import { sql } from 'drizzle-orm'
import { boolean, date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { BENEFIT_KINDS, BENEFIT_RUN_STATUSES, BENEFIT_VALUE_TYPES } from '@falcao-rh/contracts'

import { user } from './auth'
import { employees, tenants } from './domain'

const id = () => uuid('id').primaryKey().defaultRandom()
const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' })
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull()

export const benefitKindEnum = pgEnum('benefit_kind', BENEFIT_KINDS)
export const benefitValueTypeEnum = pgEnum('benefit_value_type', BENEFIT_VALUE_TYPES)
export const benefitRunStatusEnum = pgEnum('benefit_run_status', BENEFIT_RUN_STATUSES)

export const benefitPlans = pgTable(
  'benefit_plans',
  {
    id: id(),
    tenantId: tenantId(),
    kind: benefitKindEnum('kind').notNull(),
    name: text('name').notNull(),
    provider: text('provider').default('').notNull(),
    valueType: benefitValueTypeEnum('value_type').notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  t => [uniqueIndex('benefit_plans_tenant_name_uq').on(t.tenantId, t.name)],
)

/** Histórico de valores programados: nunca se altera, só se acrescenta. */
export const benefitPlanValues = pgTable(
  'benefit_plan_values',
  {
    id: id(),
    tenantId: tenantId(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => benefitPlans.id, { onDelete: 'cascade' }),
    valueCents: integer('value_cents').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  t => [uniqueIndex('benefit_plan_values_plan_date_uq').on(t.planId, t.effectiveFrom)],
)

/** Escolha de cada colaborador ao longo do tempo; `end_date` nulo = vigente. */
export const employeeBenefits = pgTable(
  'employee_benefits',
  {
    id: id(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => benefitPlans.id, { onDelete: 'restrict' }),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  t => [
    uniqueIndex('employee_benefits_current_uq').on(t.tenantId, t.employeeId).where(sql`${t.endDate} is null`),
    index('employee_benefits_employee_idx').on(t.employeeId),
  ],
)

/** Apuração mensal: em conferência até o RH fechar; fechada não muda. */
export const benefitRuns = pgTable(
  'benefit_runs',
  {
    id: id(),
    tenantId: tenantId(),
    competence: text('competence').notNull(),
    workdays: integer('workdays').notNull(),
    status: benefitRunStatusEnum('status').default('draft').notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: text('closed_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  t => [uniqueIndex('benefit_runs_tenant_competence_uq').on(t.tenantId, t.competence)],
)

/** Linha da apuração: guarda nome do plano e valor usados, para o histórico não mudar. */
export const benefitRunItems = pgTable(
  'benefit_run_items',
  {
    id: id(),
    tenantId: tenantId(),
    runId: uuid('run_id')
      .notNull()
      .references(() => benefitRuns.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').references(() => benefitPlans.id, { onDelete: 'set null' }),
    planName: text('plan_name').notNull(),
    kind: benefitKindEnum('kind').notNull(),
    valueType: benefitValueTypeEnum('value_type').notNull(),
    unitValueCents: integer('unit_value_cents').notNull(),
    /** Dias úteis no período de vínculo e de escolha do benefício. */
    eligibleDays: integer('eligible_days').notNull(),
    /** Dias úteis de férias e ausências aprovadas. */
    deductedDays: integer('deducted_days').notNull(),
    days: integer('days').notNull(),
    amountCents: integer('amount_cents').notNull(),
    adjusted: boolean('adjusted').default(false).notNull(),
    note: text('note').default('').notNull(),
  },
  t => [uniqueIndex('benefit_run_items_run_employee_uq').on(t.runId, t.employeeId)],
)
