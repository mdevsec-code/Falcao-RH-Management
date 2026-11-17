/**
 * Admissão digital: link de uso único para o novo colaborador preencher os
 * dados e enviar os documentos. Guardamos só o hash do token. Segurança na
 * migração `0016_admission_links_security.sql`.
 */
import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { user } from './auth'
import { employees, tenants } from './domain'

export const admissionLinks = pgTable(
  'admission_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  t => [uniqueIndex('admission_links_token_uq').on(t.tokenHash)],
)
