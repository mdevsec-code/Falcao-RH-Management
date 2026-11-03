/**
 * Recrutamento: vagas, perguntas, banco de talentos e candidaturas.
 * Isolamento por tenant, privilégios (inclusive da role pública
 * `falcao_public`), chaves compostas e funções públicas na migração
 * `0005_recruitment_security.sql`.
 */
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { APPLICATION_STAGES, JOB_STATUSES, JOB_VISIBILITIES, QUESTION_KINDS, WORK_MODES } from '@falcao-rh/contracts'

import { user } from './auth'
import { contractTypeEnum, departments, positions, tenants, units } from './domain'

const id = () => uuid('id').primaryKey().defaultRandom()
const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' })
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()

export const jobStatusEnum = pgEnum('job_status', JOB_STATUSES)
export const jobVisibilityEnum = pgEnum('job_visibility', JOB_VISIBILITIES)
export const workModeEnum = pgEnum('work_mode', WORK_MODES)
export const questionKindEnum = pgEnum('question_kind', QUESTION_KINDS)
export const applicationStageEnum = pgEnum('application_stage', APPLICATION_STAGES)
export const fileScanStatusEnum = pgEnum('file_scan_status', ['pending', 'clean', 'infected'])

// ---------- vagas ----------

export const jobOpenings = pgTable(
  'job_openings',
  {
    id: id(),
    tenantId: tenantId(),
    title: text('title').notNull(),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'set null' }),
    positionId: uuid('position_id').references(() => positions.id, { onDelete: 'set null' }),
    contractType: contractTypeEnum('contract_type').notNull(),
    city: text('city').default('').notNull(),
    state: text('state'),
    workMode: workModeEnum('work_mode').notNull(),
    salaryMin: numeric('salary_min', { precision: 12, scale: 2 }),
    salaryMax: numeric('salary_max', { precision: 12, scale: 2 }),
    showSalary: boolean('show_salary').default(false).notNull(),
    description: text('description').notNull(),
    requirements: text('requirements').default('').notNull(),
    benefits: text('benefits').default('').notNull(),
    openings: integer('openings').default(1).notNull(),
    hiredCount: integer('hired_count').default(0).notNull(),
    /** Gestor responsável: vê e movimenta as candidaturas desta vaga. */
    managerUserId: text('manager_user_id').references(() => user.id, { onDelete: 'set null' }),
    visibility: jobVisibilityEnum('visibility').default('public').notNull(),
    status: jobStatusEnum('status').default('draft').notNull(),
    /** Token aleatório do link público; a vaga nunca é aberta pelo UUID. */
    shareToken: text('share_token').notNull().unique('job_openings_share_token_uq'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    index('job_openings_tenant_status_idx').on(t.tenantId, t.status),
    index('job_openings_manager_idx').on(t.managerUserId),
  ],
)

export const jobQuestions = pgTable(
  'job_questions',
  {
    id: id(),
    tenantId: tenantId(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobOpenings.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    kind: questionKindEnum('kind').notNull(),
    label: text('label').notNull(),
    /** Opções das perguntas de escolha; nulo nos outros tipos. */
    options: jsonb('options').$type<string[]>(),
    required: boolean('required').default(false).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [uniqueIndex('job_questions_job_position_uq').on(t.jobId, t.position)],
)

// ---------- banco de talentos ----------

/** Ficha da pessoa. Junção de fichas nunca é automática (spec 6.1). */
export const candidates = pgTable(
  'candidates',
  {
    id: id(),
    tenantId: tenantId(),
    fullName: text('full_name').notNull(),
    /** Sempre em minúsculas (CHECK na migração). */
    email: text('email').notNull(),
    phone: text('phone').notNull(),
    city: text('city').notNull(),
    state: text('state').notNull(),
    cpf: text('cpf'),
    linkedin: text('linkedin'),
    tags: text('tags').array().default([]).notNull(),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    index('candidates_tenant_email_idx').on(t.tenantId, t.email),
    index('candidates_tenant_cpf_idx').on(t.tenantId, t.cpf),
  ],
)

export const applications = pgTable(
  'applications',
  {
    id: id(),
    tenantId: tenantId(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobOpenings.id),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    /** Cópia em minúsculas do e-mail do formulário: barra a candidatura repetida. */
    email: text('email').notNull(),
    stage: applicationStageEnum('stage').default('new').notNull(),
    rejectionReason: text('rejection_reason'),
    rating: integer('rating'),
    talentPoolConsent: boolean('talent_pool_consent').default(false).notNull(),
    consentAt: timestamp('consent_at', { withTimezone: true }),
    retentionUntil: date('retention_until'),
    /** Token do link de privacidade (excluir/renovar) enviado ao candidato. */
    privacyToken: text('privacy_token').notNull().unique('applications_privacy_token_uq'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    uniqueIndex('applications_job_email_uq').on(t.jobId, t.email),
    index('applications_job_stage_idx').on(t.jobId, t.stage),
    index('applications_candidate_idx').on(t.candidateId),
    index('applications_tenant_retention_idx').on(t.tenantId, t.retentionUntil),
  ],
)

export const applicationAnswers = pgTable(
  'application_answers',
  {
    id: id(),
    tenantId: tenantId(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => jobQuestions.id),
    value: text('value').notNull(),
    createdAt: createdAt(),
  },
  t => [uniqueIndex('application_answers_application_question_uq').on(t.applicationId, t.questionId)],
)

/** Histórico de etapas: somente inclusão. */
export const applicationEvents = pgTable(
  'application_events',
  {
    id: id(),
    tenantId: tenantId(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    fromStage: applicationStageEnum('from_stage'),
    /** Nulo em eventos sem mudança de etapa (ex.: currículo removido), que exigem `note`. */
    toStage: applicationStageEnum('to_stage'),
    /** Nulo quando foi o candidato ou o sistema. */
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: createdAt(),
  },
  t => [index('application_events_application_idx').on(t.applicationId, t.createdAt)],
)

export const applicationNotes = pgTable(
  'application_notes',
  {
    id: id(),
    tenantId: tenantId(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    authorUserId: text('author_user_id').references(() => user.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [index('application_notes_application_idx').on(t.applicationId, t.createdAt)],
)

export const candidateFiles = pgTable(
  'candidate_files',
  {
    id: id(),
    tenantId: tenantId(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'set null' }),
    storageKey: text('storage_key').notNull(),
    filename: text('filename').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    /** Só `clean` pode ser baixado; `infected` é removido do armazenamento. */
    scanStatus: fileScanStatusEnum('scan_status').default('pending').notNull(),
    scannedAt: timestamp('scanned_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    index('candidate_files_candidate_idx').on(t.candidateId),
    index('candidate_files_application_idx').on(t.applicationId),
    index('candidate_files_scan_idx').on(t.scanStatus, t.createdAt),
  ],
)
