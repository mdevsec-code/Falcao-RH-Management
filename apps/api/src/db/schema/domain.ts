/**
 * Tabelas de domínio. Toda tabela com `tenant_id` é isolada por Row Level
 * Security (migração `0001_security.sql`, ADR-0004): a aplicação só as acessa
 * através de `withTenant`, que fixa a organização na transação.
 */
import { sql } from 'drizzle-orm'
import {
  date,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

import { CONTRACT_TYPES, EMPLOYEE_STATUSES, ROLES } from '@falcao-rh/contracts'

import { user } from './auth'

const id = () => uuid('id').primaryKey().defaultRandom()
const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' })
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()

export const roleEnum = pgEnum('role', ROLES)
export const membershipStatusEnum = pgEnum('membership_status', ['active', 'disabled'])
export const contractTypeEnum = pgEnum('contract_type', CONTRACT_TYPES)
export const employeeStatusEnum = pgEnum('employee_status', EMPLOYEE_STATUSES)
export const employeeEventEnum = pgEnum('employee_event', [
  'hired',
  'data_updated',
  'department_changed',
  'position_changed',
  'manager_changed',
  'status_changed',
])

// ---------- multi-tenancy ----------

export const tenants = pgTable('tenants', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  legalName: text('legal_name'),
  cnpj: text('cnpj'),
  settings: jsonb('settings').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    tenantId: tenantId(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    status: membershipStatusEnum('status').default('active').notNull(),
    /** Vínculo com a ficha de colaborador: base do portal e do escopo de gestor. */
    employeeId: uuid('employee_id').references((): AnyPgColumn => employees.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    uniqueIndex('memberships_tenant_user_uq').on(t.tenantId, t.userId),
    uniqueIndex('memberships_tenant_employee_uq').on(t.tenantId, t.employeeId),
    index('memberships_user_idx').on(t.userId),
  ],
)

// ---------- estrutura organizacional ----------

export const units = pgTable(
  'units',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    code: text('code'),
    city: text('city'),
    state: text('state'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [uniqueIndex('units_tenant_name_uq').on(t.tenantId, t.name)],
)

export const costCenters = pgTable(
  'cost_centers',
  {
    id: id(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [uniqueIndex('cost_centers_tenant_code_uq').on(t.tenantId, t.code)],
)

export const positions = pgTable(
  'positions',
  {
    id: id(),
    tenantId: tenantId(),
    title: text('title').notNull(),
    cbo: text('cbo'),
    level: text('level'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [uniqueIndex('positions_tenant_title_level_uq').on(t.tenantId, t.title, t.level)],
)

export const departments = pgTable(
  'departments',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    code: text('code'),
    parentId: uuid('parent_id'),
    managerEmployeeId: uuid('manager_employee_id').references((): AnyPgColumn => employees.id, {
      onDelete: 'set null',
    }),
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'set null' }),
    costCenterId: uuid('cost_center_id').references(() => costCenters.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    foreignKey({ columns: [t.parentId], foreignColumns: [t.id] }).onDelete('restrict'),
    uniqueIndex('departments_tenant_name_uq').on(t.tenantId, t.name),
    index('departments_parent_idx').on(t.parentId),
  ],
)

// ---------- colaboradores ----------

export type Address = {
  zip?: string | null
  street?: string | null
  number?: string | null
  complement?: string | null
  district?: string | null
  city?: string | null
  state?: string | null
}

export const employees = pgTable(
  'employees',
  {
    id: id(),
    tenantId: tenantId(),
    registration: text('registration').notNull(),
    fullName: text('full_name').notNull(),
    socialName: text('social_name'),
    /** Dado pessoal: só dígitos; exibido mascarado sem `employees.read_sensitive`. */
    cpf: text('cpf').notNull(),
    birthDate: date('birth_date'),
    email: text('email'),
    phone: text('phone'),
    address: jsonb('address').$type<Address>(),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    positionId: uuid('position_id').references(() => positions.id, { onDelete: 'set null' }),
    managerId: uuid('manager_id'),
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'set null' }),
    costCenterId: uuid('cost_center_id').references(() => costCenters.id, { onDelete: 'set null' }),
    hireDate: date('hire_date').notNull(),
    terminationDate: date('termination_date'),
    contractType: contractTypeEnum('contract_type').notNull(),
    status: employeeStatusEnum('status').default('active').notNull(),
    workSchedule: text('work_schedule'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    foreignKey({ columns: [t.managerId], foreignColumns: [t.id] }).onDelete('set null'),
    uniqueIndex('employees_tenant_registration_uq').on(t.tenantId, t.registration),
    uniqueIndex('employees_tenant_cpf_uq').on(t.tenantId, t.cpf),
    index('employees_tenant_status_idx').on(t.tenantId, t.status),
    index('employees_department_idx').on(t.departmentId),
    index('employees_manager_idx').on(t.managerId),
    index('employees_name_search_idx').using('gin', sql`to_tsvector('simple', ${t.fullName})`),
  ],
)

/** Histórico funcional: cada movimentação, com o antes e o depois. */
export const employeeEvents = pgTable(
  'employee_events',
  {
    id: id(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    type: employeeEventEnum('type').notNull(),
    effectiveDate: date('effective_date').notNull(),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    reason: text('reason'),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  t => [index('employee_events_employee_idx').on(t.employeeId, t.effectiveDate)],
)

// ---------- auditoria ----------

/**
 * Trilha de auditoria append-only: a role da aplicação só tem INSERT e
 * SELECT. Não guarda valores de dados pessoais, só os nomes dos campos.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    tenantId: tenantId(),
    actorUserId: text('actor_user_id'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    changedFields: text('changed_fields').array(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  t => [index('audit_logs_tenant_created_idx').on(t.tenantId, t.createdAt)],
)
