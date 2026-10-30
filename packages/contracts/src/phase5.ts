import { z } from 'zod'

import { ROLES } from './permissions'
import { uuid } from './schemas'

const isoDate = z.iso.date()
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform(value => (value === '' ? null : value))
    .nullable()
    .optional()

// ---------- solicitações e aprovações ----------

export const REQUEST_TYPES = ['vacation', 'absence'] as const
export type RequestType = (typeof REQUEST_TYPES)[number]
export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  vacation: 'Férias',
  absence: 'Ausência',
}

/**
 * Tipos de ausência. `medical` é dado de saúde (LGPD art. 5º, II): o tipo só
 * aparece para o RH e para o titular; o gestor vê "Ausência justificada".
 * `unjustified` (falta) é registrada pelo RH, nunca solicitada.
 */
export const ABSENCE_KINDS = ['justified', 'medical', 'bereavement', 'marriage', 'blood_donation', 'unjustified'] as const
export type AbsenceKind = (typeof ABSENCE_KINDS)[number]
export const ABSENCE_KIND_LABELS: Record<AbsenceKind, string> = {
  justified: 'Folga ou abono',
  medical: 'Atestado médico',
  bereavement: 'Falecimento de familiar',
  marriage: 'Casamento',
  blood_donation: 'Doação de sangue',
  unjustified: 'Falta não justificada',
}
export const SENSITIVE_ABSENCE_KINDS: readonly AbsenceKind[] = ['medical']

export const REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]
export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: 'Aguardando aprovação',
  approved: 'Aprovada',
  rejected: 'Recusada',
  cancelled: 'Cancelada',
}

export const APPROVER_KINDS = ['manager', 'hr'] as const
export type ApproverKind = (typeof APPROVER_KINDS)[number]
export const APPROVER_LABELS: Record<ApproverKind, string> = { manager: 'Gestor direto', hr: 'RH' }

const period = z
  .object({ startDate: isoDate, endDate: isoDate })
  .refine(p => p.endDate >= p.startDate, { message: 'A data final não pode ser anterior à inicial.', path: ['endDate'] })

export const requestCreate = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('vacation'),
    employeeId: uuid.optional(),
    startDate: isoDate,
    endDate: isoDate,
    notes: optionalText(500),
  }),
  z.object({
    type: z.literal('absence'),
    employeeId: uuid.optional(),
    kind: z.enum(ABSENCE_KINDS),
    startDate: isoDate,
    endDate: isoDate,
    notes: optionalText(500),
    documentId: uuid.nullable().optional(),
  }),
]).superRefine((value, ctx) => {
  const parsed = period.safeParse(value)
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, code: 'custom' })
})
export type RequestCreate = z.infer<typeof requestCreate>

export const requestDecision = z
  .object({
    decision: z.enum(['approve', 'reject']),
    comment: optionalText(500),
  })
  .refine(d => d.decision === 'approve' || (d.comment && d.comment.length >= 3), {
    message: 'Explique o motivo da recusa.',
    path: ['comment'],
  })
export type RequestDecision = z.infer<typeof requestDecision>

export const requestFilters = z.object({
  status: z.enum(REQUEST_STATUSES).optional(),
  type: z.enum(REQUEST_TYPES).optional(),
  employeeId: uuid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  /** Só o que espera uma decisão de quem consulta. */
  awaitingMe: z.coerce.boolean().optional(),
})
export type RequestFilters = z.infer<typeof requestFilters>

export const approvalFlowInput = z.object({
  requestType: z.enum(REQUEST_TYPES),
  departmentId: uuid.nullable().optional(),
  steps: z
    .array(z.enum(APPROVER_KINDS))
    .min(1, 'Defina ao menos uma etapa.')
    .max(2)
    .refine(steps => new Set(steps).size === steps.length, 'Etapas repetidas.'),
})
export type ApprovalFlowInput = z.infer<typeof approvalFlowInput>

// ---------- documentos ----------

export const documentCategoryInput = z.object({
  name: z.string().trim().min(2).max(80),
  /** O titular vê documentos desta categoria no portal. */
  employeeVisible: z.boolean().default(true),
  /** O titular pode enviar documentos desta categoria pelo portal. */
  employeeUpload: z.boolean().default(false),
  /** Conteúdo sensível (ex.: atestados): só RH e titular, nunca gestor. */
  sensitive: z.boolean().default(false),
  requiresExpiry: z.boolean().default(false),
})
export type DocumentCategoryInput = z.infer<typeof documentCategoryInput>

export const documentMetadata = z.object({
  title: z.string().trim().min(2).max(160),
  categoryId: uuid,
  employeeId: uuid.nullable().optional(),
  expiresAt: isoDate.nullable().optional(),
})
export type DocumentMetadata = z.infer<typeof documentMetadata>

export const documentFilters = z.object({
  employeeId: uuid.optional(),
  categoryId: uuid.optional(),
  q: z.string().trim().max(100).optional(),
  expiring: z.coerce.boolean().optional(),
})
export type DocumentFilters = z.infer<typeof documentFilters>

/** Tipos aceitos: verificados pelo conteúdo (assinatura do arquivo), não só pela extensão. */
export const ALLOWED_UPLOADS = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
} as const
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

// ---------- configurações ----------

export const tenantSettingsInput = z.object({
  name: z.string().trim().min(2).max(160),
  legalName: optionalText(200),
  cnpj: z
    .string()
    .transform(v => v.replace(/\D/g, ''))
    .refine(v => v === '' || v.length === 14, 'CNPJ deve ter 14 dígitos.')
    .transform(v => (v === '' ? null : v))
    .nullable()
    .optional(),
  /** Perfis obrigados a usar verificação em duas etapas. */
  requireMfaFor: z.array(z.enum(ROLES)).default([]),
})
export type TenantSettingsInput = z.infer<typeof tenantSettingsInput>

export type TenantSettings = { requireMfaFor?: (typeof ROLES)[number][] }

// ---------- importação ----------

export const IMPORT_COLUMNS = [
  ['registration', 'Matrícula', true],
  ['fullName', 'Nome completo', true],
  ['cpf', 'CPF', true],
  ['hireDate', 'Data de admissão', true],
  ['contractType', 'Tipo de contrato', true],
  ['socialName', 'Nome social', false],
  ['birthDate', 'Data de nascimento', false],
  ['email', 'E-mail', false],
  ['phone', 'Telefone', false],
  ['department', 'Departamento', false],
  ['position', 'Cargo', false],
  ['unit', 'Unidade', false],
  ['costCenter', 'Centro de custo', false],
  ['workSchedule', 'Jornada', false],
] as const

// ---------- notificações ----------

export const NOTIFICATION_KINDS = [
  'request_submitted',
  'request_decided',
  'request_reminder',
  'document_expiring',
  'vacation_deadline',
  'document_added',
] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

// ---------- calendário (CLT) ----------

/** Dias corridos entre duas datas ISO, inclusive. */
export const calendarDays = (startDate: string, endDate: string) =>
  Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1

export const addDaysIso = (isoDate: string, days: number) => {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
