/**
 * Fase 5: documentos, solicitações e aprovações, notificações e automações.
 * Isolamento por tenant, privilégios e chaves compostas na migração
 * `0003_phase5_security.sql`.
 */
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { ABSENCE_KINDS, APPROVER_KINDS, NOTIFICATION_KINDS, REQUEST_STATUSES, REQUEST_TYPES } from '@falcao-rh/contracts'

import { user } from './auth'
import { departments, employees, tenants } from './domain'

const id = () => uuid('id').primaryKey().defaultRandom()
const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' })
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()

// ---------- documentos ----------

export const documentStatusEnum = pgEnum('document_status', ['active', 'archived'])

export const documentCategories = pgTable(
  'document_categories',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    employeeVisible: boolean('employee_visible').default(true).notNull(),
    employeeUpload: boolean('employee_upload').default(false).notNull(),
    sensitive: boolean('sensitive').default(false).notNull(),
    requiresExpiry: boolean('requires_expiry').default(false).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [uniqueIndex('document_categories_tenant_name_uq').on(t.tenantId, t.name)],
)

export const documents = pgTable(
  'documents',
  {
    id: id(),
    tenantId: tenantId(),
    /** Nulo para documentos da empresa (políticas, modelos). */
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => documentCategories.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    expiresAt: date('expires_at'),
    currentVersion: integer('current_version').default(1).notNull(),
    status: documentStatusEnum('status').default('active').notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    index('documents_employee_idx').on(t.employeeId),
    index('documents_tenant_expires_idx').on(t.tenantId, t.expiresAt),
  ],
)

/** Cada envio é uma versão nova; nada é sobrescrito no armazenamento. */
export const documentVersions = pgTable(
  'document_versions',
  {
    id: id(),
    tenantId: tenantId(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    storageKey: text('storage_key').notNull(),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  t => [uniqueIndex('document_versions_document_version_uq').on(t.documentId, t.version)],
)

// ---------- solicitações e aprovações ----------

export const requestTypeEnum = pgEnum('request_type', REQUEST_TYPES)
export const absenceKindEnum = pgEnum('absence_kind', ABSENCE_KINDS)
export const requestStatusEnum = pgEnum('request_status', REQUEST_STATUSES)
export const approverKindEnum = pgEnum('approver_kind', APPROVER_KINDS)
export const stepStatusEnum = pgEnum('step_status', ['waiting', 'pending', 'approved', 'rejected', 'skipped'])

export const requests = pgTable(
  'requests',
  {
    id: id(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    type: requestTypeEnum('type').notNull(),
    absenceKind: absenceKindEnum('absence_kind'),
    status: requestStatusEnum('status').default('pending').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    /** Dias corridos, inclusive (férias na CLT contam em dias corridos). */
    days: integer('days').notNull(),
    notes: text('notes'),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    index('requests_tenant_status_idx').on(t.tenantId, t.status),
    index('requests_employee_period_idx').on(t.employeeId, t.startDate),
  ],
)

export const requestSteps = pgTable(
  'request_steps',
  {
    id: id(),
    tenantId: tenantId(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    approverKind: approverKindEnum('approver_kind').notNull(),
    /** Gestor que decide esta etapa (quando `approver_kind = manager`). */
    approverEmployeeId: uuid('approver_employee_id').references(() => employees.id, { onDelete: 'set null' }),
    status: stepStatusEnum('status').default('waiting').notNull(),
    decidedBy: text('decided_by').references(() => user.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    comment: text('comment'),
    createdAt: createdAt(),
  },
  t => [
    uniqueIndex('request_steps_request_position_uq').on(t.requestId, t.position),
    index('request_steps_pending_idx').on(t.tenantId, t.status, t.approverKind),
  ],
)

/** Fluxo por tipo de solicitação; `department_id` nulo é o padrão da organização. */
export const approvalFlows = pgTable(
  'approval_flows',
  {
    id: id(),
    tenantId: tenantId(),
    requestType: requestTypeEnum('request_type').notNull(),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'cascade' }),
    steps: approverKindEnum('steps').array().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  // NULLS NOT DISTINCT: um único fluxo padrão (sem departamento) por tipo.
  t => [unique('approval_flows_scope_uq').on(t.tenantId, t.requestType, t.departmentId).nullsNotDistinct()],
)

// ---------- notificações e automações ----------

export const notificationKindEnum = pgEnum('notification_kind', NOTIFICATION_KINDS)

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    tenantId: tenantId(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: notificationKindEnum('kind').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    link: text('link'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  t => [index('notifications_user_idx').on(t.userId, t.readAt, t.createdAt)],
)

/** Marca o que uma automação já fez, para nunca avisar duas vezes a mesma coisa. */
export const automationMarks = pgTable(
  'automation_marks',
  {
    id: id(),
    tenantId: tenantId(),
    kind: text('kind').notNull(),
    ref: text('ref').notNull(),
    bucket: text('bucket').notNull(),
    createdAt: createdAt(),
  },
  t => [uniqueIndex('automation_marks_uq').on(t.tenantId, t.kind, t.ref, t.bucket)],
)
