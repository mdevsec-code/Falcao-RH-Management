import { z } from 'zod'

import { isValidCpf, onlyDigits } from './cpf'
import { CONTRACT_TYPES, uuid } from './schemas'

// ---------- situação e etapas do funil ----------

/**
 * Situação da candidatura. Contratado e Recusado são desfechos, não etapas do
 * quadro; as etapas (`open`) são definidas por organização e vêm do banco.
 */
export const APPLICATION_STATUSES = ['open', 'hired', 'rejected'] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]
export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  open: 'Em andamento',
  hired: 'Contratado',
  rejected: 'Recusado',
}

/** Desfecho registrado num evento do histórico (reaberta = saiu de um desfecho). */
export const APPLICATION_OUTCOMES = ['hired', 'rejected', 'reopened'] as const
export type ApplicationOutcome = (typeof APPLICATION_OUTCOMES)[number]
export const APPLICATION_OUTCOME_LABELS: Record<ApplicationOutcome, string> = {
  hired: 'Contratado',
  rejected: 'Recusado',
  reopened: 'Reaberta',
}

/** Etapas iniciais de toda organização. A primeira é fixa: não muda de nome nem sai. */
export const DEFAULT_STAGES = ['Novo', 'Triagem', 'Entrevista', 'Proposta'] as const
export const MAX_STAGES = 12

const stageKey = (name: string) => name.trim().toLocaleLowerCase('pt-BR')

/**
 * Lista completa das etapas, na ordem. A primeira é sempre a etapa fixa
 * (Novo): o nome dela é ignorado. Itens com `id` renomeiam/reordenam; sem
 * `id`, criam; etapas que ficarem de fora são removidas.
 */
export const stagesInput = z.object({
  stages: z
    .array(z.object({ id: uuid.optional(), name: z.string().trim().min(3).max(40) }))
    .min(1)
    .max(MAX_STAGES)
    .refine(
      stages => {
        const names = [DEFAULT_STAGES[0], ...stages.slice(1).map(s => s.name)].map(stageKey)
        return new Set(names).size === names.length
      },
      { message: 'Já existe uma etapa com este nome.' },
    ),
})
export type StagesInput = z.infer<typeof stagesInput>

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
    /** Pergunta existente (editar sem perder respostas); ausente = nova. */
    id: uuid.optional(),
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

/**
 * Mover para uma etapa da organização, ou recusar com motivo. Contratar só
 * pela ação de contratação, que cria o colaborador.
 */
export const stageMove = z.union([
  z.strictObject({ stageId: uuid }),
  z.strictObject({
    outcome: z.literal('rejected'),
    reason: z.string({ error: 'Explique o motivo da recusa.' }).trim().min(3).max(300),
  }),
])
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

// ---------- página oficial de vagas (editável pelo RH) ----------

/** Ícones permitidos nos cartões de benefícios (nomes do lucide). */
export const BENEFIT_ICONS = [
  'HeartPulse',
  'Bus',
  'Utensils',
  'GraduationCap',
  'ShieldCheck',
  'HardHat',
  'Wallet',
  'Smile',
  'Clock',
  'TrendingUp',
  'Users',
  'Home',
] as const
export type BenefitIcon = (typeof BENEFIT_ICONS)[number]

/** Texto simples: recusa qualquer marcação (`<` seguido de letra, `/` ou `!`). */
const plain = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(v => !/<[a-zA-Z/!]/.test(v), 'Use só texto, sem marcações HTML.')

const httpUrl = z.url({ protocol: /^https?$/, error: 'Informe um link que comece com https://' })
const optionalLink = <T extends z.ZodType>(schema: T) =>
  z.preprocess(v => (typeof v === 'string' && v.trim() === '' ? undefined : v), schema.optional())

export const careerPageContent = z.object({
  hero: z.object({ enabled: z.boolean(), title: plain(3, 80), subtitle: plain(0, 200), imageId: uuid.nullable() }),
  about: z.object({ enabled: z.boolean(), title: plain(3, 80), body: plain(0, 3000), imageIds: z.array(uuid).max(4) }),
  benefits: z.object({
    enabled: z.boolean(),
    title: plain(3, 80),
    items: z.array(z.object({ icon: z.enum(BENEFIT_ICONS), title: plain(2, 60), text: plain(0, 240) })).max(12),
  }),
  faq: z.object({ enabled: z.boolean(), items: z.array(z.object({ question: plain(5, 200), answer: plain(2, 1500) })).max(15) }),
  links: z.object({
    instagram: optionalLink(httpUrl),
    linkedin: optionalLink(httpUrl),
    facebook: optionalLink(httpUrl),
    site: optionalLink(httpUrl),
    whatsapp: optionalLink(
      z
        .string()
        .transform(v => v.replace(/\D/g, ''))
        .refine(v => v.length >= 10 && v.length <= 13, 'WhatsApp com DDD, só números.'),
    ),
    email: optionalLink(z.email('E-mail inválido.')),
  }),
})
export type CareerPageContent = z.infer<typeof careerPageContent>

export const DEFAULT_CAREER_PAGE: CareerPageContent = {
  hero: {
    enabled: true,
    title: 'Construa sua carreira na Falcão',
    subtitle: 'Vagas abertas em obras e no escritório. Venha fazer parte.',
    imageId: null,
  },
  about: { enabled: true, title: 'Sobre a Falcão', body: '', imageIds: [] },
  benefits: { enabled: false, title: 'Por que trabalhar aqui', items: [] },
  faq: { enabled: true, items: [] },
  links: {},
}
