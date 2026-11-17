/**
 * Mobilidade e transporte: rotas do fretado e como cada pessoa chega à obra.
 * Isolamento por tenant, privilégios e chaves compostas na migração
 * `0013_transport_security.sql`.
 */
import { integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { TRANSPORT_MODES } from '@falcao-rh/contracts'

import { employees, tenants } from './domain'

const id = () => uuid('id').primaryKey().defaultRandom()
const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' })
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()

// ---------- mobilidade e transporte ----------

export const transportModeEnum = pgEnum('transport_mode', TRANSPORT_MODES)

export const transportRoutes = pgTable(
  'transport_routes',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    vehicle: text('vehicle'),
    capacity: integer('capacity'),
    driver: text('driver'),
    shift: text('shift'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [uniqueIndex('transport_routes_tenant_name_uq').on(t.tenantId, t.name)],
)

export const employeeTransport = pgTable(
  'employee_transport',
  {
    id: id(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    mode: transportModeEnum('mode').notNull(),
    provider: text('provider'),
    routeId: uuid('route_id').references(() => transportRoutes.id, { onDelete: 'set null' }),
    pickupPoint: text('pickup_point'),
    pickupDistrict: text('pickup_district'),
    pickupCity: text('pickup_city'),
    monthlyCostCents: integer('monthly_cost_cents'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [uniqueIndex('employee_transport_employee_uq').on(t.tenantId, t.employeeId)],
)
