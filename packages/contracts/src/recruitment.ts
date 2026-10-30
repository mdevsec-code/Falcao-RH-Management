import { z } from 'zod'

import { isValidCpf, onlyDigits } from './cpf'
import { CONTRACT_TYPES, uuid } from './schemas'

// ---------- etapas do funil ----------

export const APPLICATION_STAGES = ['new', 'screening', 'interview', 'offer', 'hired', 'rejected'] as const
export type ApplicationStage = (typeof APPLICATION_STAGES)[number]
export const APPLICATION_STAGE_LABELS: Record<ApplicationStage, string> = {
  new: 'Novo',
  screening: 'Triagem',
  interview: 'Entrevista',
  offer: 'Proposta',
  hired: 'Contratado',
  rejected: 'Recusado',
}
/** Etapas em andamento (o candidato ainda está no processo). */
export const OPEN_STAGES = ['new', 'screening', 'interview', 'offer'] as const satisfies readonly ApplicationStage[]

// ---------- vagas ----------

export const JOB_STATUSES = ['draft', 'published', 'paused', 'closed'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Rascunho',
  published: 'Publicada',
  paused: 'Pausada',
  closed: 'Encerrada',
}

export const JOB_VISIBILITIES = ['public', 'unlisted'] as const
export type JobVisibility = (typeof JOB_VISIBILITIES)[number]
export const JOB_VISIBILITY_LABELS: Record<JobVisibility, string> = {
  public: 'Pública',
  unlisted: 'Somente com o link',
}

export const WORK_MODES = ['onsite', 'site', 'hybrid'] as const
export type WorkMode = (typeof WORK_MODES)[number]
export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  onsite: 'Presencial',
  site: 'Canteiro de obras',
  hybrid: 'Híbrido',
}

export const QUESTION_KINDS = ['text', 'yes_no', 'choice'] as const
export type QuestionKind = (typeof QUESTION_KINDS)[number]

const text = (max: number) => z.string().trim().max(max)
const stateCode = z.string().trim().length(2, 'Use a sigla do estado (UF).').transform(v => v.toUpperCase())
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform(v => (v ? v : undefined))

export const jobQuestionInput = z
  .object({
    kind: z.enum(QUESTION_KINDS),
    label: z.string().trim().min(3).max(200),
    options: z.array(z.string().trim().min(1).max(100)).min(2).max(10).optional(),
    required: z.boolean().default(false),
  })
  .refine(q => q.kind !== 'choice' || q.options !== undefined, {
    message: 'Informe ao menos duas opções.',
    path: ['options'],
  })
  .refine(q => q.kind === 'choice' || q.options === undefined, {
    message: 'Opções só se aplicam a perguntas de escolha.',
    path: ['options'],
  })
export type JobQuestionInput = z.infer<typeof jobQuestionInput>

export const jobInput = z
  .object({
    title: z.string().trim().min(3).max(120),
    departmentId: uuid.nullable().default(null),
    unitId: uuid.nullable().default(null),
    positionId: uuid.nullable().default(null),
    contractType: z.enum(CONTRACT_TYPES),
    city: text(120).default(''),
    state: stateCode.optional(),
    workMode: z.enum(WORK_MODES),
    salaryMin: z.number().nonnegative().nullable().default(null),
    salaryMax: z.number().nonnegative().nullable().default(null),
    showSalary: z.boolean().default(false),
    description: z.string().trim().min(20, 'Descreva a vaga com ao menos 20 caracteres.').max(10_000),
    requirements: text(10_000).default(''),
    benefits: text(10_000).default(''),
    openings: z.number().int().min(1).max(99).default(1),
    managerUserId: z.string().nullable().default(null),
    visibility: z.enum(JOB_VISIBILITIES).default('public'),
    questions: z.array(jobQuestionInput).max(10).default([]),
  })
  .refine(j => j.salaryMin == null || j.salaryMax == null || j.salaryMax >= j.salaryMin, {
    message: 'O salário máximo não pode ser menor que o mínimo.',
    path: ['salaryMax'],
  })
export type JobInput = z.infer<typeof jobInput>

// ---------- candidatura ----------

export const applicationForm = z.object({
  fullName: z.string().trim().min(3).max(120),
  email: z.string().trim().toLowerCase().pipe(z.email('E-mail inválido.')),
  phone: z
    .string()
    .transform(onlyDigits)
    .refine(v => v.length >= 10 && v.length <= 20, 'Telefone inválido.'),
  city: z.string().trim().min(2).max(120),
  state: stateCode,
  cpf: optionalString
    .refine(v => v === undefined || isValidCpf(v), 'CPF inválido')
    .transform(v => (v === undefined ? undefined : onlyDigits(v))),
  linkedin: optionalString.refine(v => v === undefined || z.url({ protocol: /^https?$/ }).safeParse(v).success, 'Informe um link válido.'),
  /** Respostas às perguntas da vaga, por id da pergunta. */
  answers: z.record(z.string(), z.string().trim().max(2000)).default({}),
  privacyConsent: z.literal(true, { error: 'É necessário aceitar a política de privacidade.' }),
  talentPoolConsent: z.boolean().default(false),
  /** Honeypot: humanos não veem este campo; bots o preenchem. */
  website: z.string().max(0),
  /** Momento em que o formulário foi aberto (anti-bot por tempo de preenchimento). */
  startedAt: z.number(),
})
export type ApplicationForm = z.infer<typeof applicationForm>

// ---------- funil ----------

export const stageMove = z
  .object({
    /** `hired` só pela ação de contratar, que cria o colaborador. */
    stage: z.enum(['new', 'screening', 'interview', 'offer', 'rejected']),
    reason: z.string().trim().min(3).max(300).optional(),
  })
  .refine(m => m.stage !== 'rejected' || !!m.reason, {
    message: 'Explique o motivo da recusa.',
    path: ['reason'],
  })
export type StageMove = z.infer<typeof stageMove>

export const candidateFilters = z.object({
  q: z.string().trim().max(100).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().length(2).toUpperCase().optional(),
  tag: z.string().trim().max(60).optional(),
  consent: z.enum(['yes', 'all']).default('yes'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})
export type CandidateFilters = z.infer<typeof candidateFilters>

// ---------- configurações ----------

export const RECRUITMENT_DEFAULTS = {
  retentionMonthsWithoutConsent: 6,
  talentPoolMonths: 24,
  rejectionMessage:
    'Agradecemos seu interesse. Neste momento seguimos com outros perfis para esta vaga, mas seus dados podem ser considerados em oportunidades futuras.',
  hiredMessage: 'Parabéns! Você foi selecionado(a). O RH da Falcão vai entrar em contato com os próximos passos.',
} as const

export const recruitmentSettingsInput = z.object({
  retentionMonthsWithoutConsent: z.number().int().min(1).max(60),
  talentPoolMonths: z.number().int().min(1).max(60),
  rejectionMessage: z.string().trim().min(20).max(1000),
  hiredMessage: z.string().trim().min(20).max(1000),
})
export type RecruitmentSettings = z.infer<typeof recruitmentSettingsInput>
