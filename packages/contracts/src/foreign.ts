/**
 * Contratação de estrangeiros (foco em trabalhadores chineses): as etapas do
 * processo migratório e o cálculo de progresso, prazos e alertas da triagem.
 *
 * Base (pesquisa de 18/11/2026):
 * - Autorização de residência para trabalho: pedida ao MJSP (CGIL/DEMIG) pelo
 *   MigranteWeb (RN CNIg 01/2017 e 02/2017; Res. CNIg/MJSP 51/2025; Decreto
 *   12.657/2025). Análise em até 30 dias, +30 com exigência; recurso em 10 dias.
 * - Visto VITEM V no consulado da jurisdição, com a publicação no DOU.
 * - RNM na Polícia Federal: até 90 dias da entrada (multa diária depois),
 *   pré-cadastro no SISMIGRA + GRU; o protocolo da PF vale para admitir.
 * - China na Convenção da Apostila desde 07/11/2023; tradução juramentada no
 *   Brasil (Lei 14.195/2021).
 * - Isenção de visto Brasil–China (30 dias, desde 11/05/2026) é para turismo e
 *   negócios: não autoriza trabalho.
 * - CREA: registro temporário (1 ano, renovável uma vez) sem revalidar diploma.
 * - Caso BYD/Jinjiang (Camaçari, 2024): passaportes retidos e visto diferente da
 *   função real configuraram trabalho análogo à escravidão.
 */
import { z } from 'zod'

export const FOREIGN_PHASES = [
  { key: 'documentos', label: 'Documentos de origem' },
  { key: 'autorizacao', label: 'Autorização de residência' },
  { key: 'visto', label: 'Visto no consulado' },
  { key: 'chegada', label: 'Chegada e RNM' },
  { key: 'admissao', label: 'Admissão' },
  { key: 'conformidade', label: 'Conformidade' },
] as const
export type ForeignPhase = (typeof FOREIGN_PHASES)[number]['key']

export type ForeignStepDef = {
  key: string
  phase: ForeignPhase
  label: string
  hint?: string
  /** Só vale para profissão regulamentada (engenharia, técnico): registro no CREA. */
  regulatedOnly?: true
}

export const FOREIGN_STEPS = [
  { key: 'passport', phase: 'documentos', label: 'Passaporte válido', hint: 'Válido por todo o período do contrato.' },
  {
    key: 'criminal',
    phase: 'documentos',
    label: 'Antecedentes criminais apostilados',
    hint: 'Do país de nacionalidade e de onde morou nos últimos 5 anos. Apostila emitida na China (Convenção da Apostila desde 07/11/2023).',
  },
  { key: 'qualification', phase: 'documentos', label: 'Diploma ou comprovação de experiência apostilados' },
  { key: 'translation', phase: 'documentos', label: 'Tradução juramentada no Brasil', hint: 'Por tradutor juramentado inscrito em Junta Comercial (Lei 14.195/2021).' },
  {
    key: 'contract',
    phase: 'autorizacao',
    label: 'Contrato de trabalho assinado',
    hint: 'Com as cláusulas mínimas da RN CNIg 02/2017 e a função que a pessoa vai realmente exercer.',
  },
  { key: 'company_docs', phase: 'autorizacao', label: 'Documentos da empresa', hint: 'Ato constitutivo, nomeação do representante legal e certidões.' },
  {
    key: 'migranteweb',
    phase: 'autorizacao',
    label: 'Pedido no MigranteWeb (MJSP)',
    hint: 'Autorização de residência para fins de trabalho, com a GRU paga. Protocole de 30 a 90 dias antes da data prevista.',
  },
  { key: 'published', phase: 'autorizacao', label: 'Autorização publicada no Diário Oficial', hint: 'Análise em até 30 dias, mais 30 se houver exigência. Se negar, recurso em 10 dias.' },
  {
    key: 'visa_application',
    phase: 'visto',
    label: 'Pedido do visto VITEM V',
    hint: 'No consulado da jurisdição (Pequim, Xangai, Cantão ou Hong Kong), com a publicação no DOU, o formulário RER e os antecedentes.',
  },
  { key: 'visa_issued', phase: 'visto', label: 'Visto emitido' },
  {
    key: 'arrival',
    phase: 'chegada',
    label: 'Entrada no Brasil com o visto de trabalho',
    hint: 'A isenção de visto Brasil–China de 30 dias é para turismo e negócios: não permite trabalhar.',
  },
  { key: 'cpf', phase: 'chegada', label: 'CPF' },
  { key: 'rnm_precadastro', phase: 'chegada', label: 'Pré-cadastro no SISMIGRA e GRU paga' },
  { key: 'rnm_appointment', phase: 'chegada', label: 'Atendimento na Polícia Federal', hint: 'Até 90 dias da entrada. Depois disso, multa por dia de atraso.' },
  { key: 'rnm_issued', phase: 'chegada', label: 'CRNM retirada', hint: 'Enquanto a carteira não sai, o protocolo da PF vale para a admissão.' },
  { key: 'ctps', phase: 'admissao', label: 'Carteira de Trabalho Digital ativada', hint: 'Gerada a partir do CPF; a pessoa ativa no aplicativo.' },
  {
    key: 'crea',
    phase: 'admissao',
    label: 'Registro temporário no CREA',
    hint: 'Para engenheiros e técnicos: 1 ano, renovável uma vez, com um profissional brasileiro responsável.',
    regulatedOnly: true,
  },
  { key: 'aso', phase: 'admissao', label: 'Exame admissional (ASO)' },
  { key: 'esocial', phase: 'admissao', label: 'Admissão no eSocial', hint: 'Com o CPF e a CRNM ou o protocolo da PF.' },
  {
    key: 'passport_with_worker',
    phase: 'conformidade',
    label: 'Passaporte em posse do próprio trabalhador',
    hint: 'Reter documentos é indício de trabalho análogo à escravidão (caso BYD/Jinjiang, Camaçari, 2024).',
  },
  { key: 'role_matches_visa', phase: 'conformidade', label: 'Função exercida igual à do visto e do contrato' },
  { key: 'lodging', phase: 'conformidade', label: 'Alojamento vistoriado (NR-24)', hint: 'Cama, banheiros e refeitório na proporção da norma.' },
] as const satisfies readonly ForeignStepDef[]
export type ForeignStepKey = (typeof FOREIGN_STEPS)[number]['key']

export const FOREIGN_STEP_STATUSES = ['pending', 'in_progress', 'done', 'na'] as const
export type ForeignStepStatus = (typeof FOREIGN_STEP_STATUSES)[number]
export const FOREIGN_STEP_STATUS_LABELS: Record<ForeignStepStatus, string> = {
  pending: 'Falta fazer',
  in_progress: 'Em andamento',
  done: 'Feito',
  na: 'Não se aplica',
}

export const foreignStep = z.object({
  status: z.enum(FOREIGN_STEP_STATUSES).default('pending'),
  date: z.iso.date().nullable().default(null),
  note: z.string().trim().max(300).default(''),
})
export type ForeignStep = z.infer<typeof foreignStep>

const stepKeys = FOREIGN_STEPS.map(s => s.key) as [ForeignStepKey, ...ForeignStepKey[]]

/** Campos do processo; todos com padrão, para fichas antigas continuarem válidas. */
export const foreignProcessFields = {
  consulate: z.string().trim().max(60).default(''),
  regulatedProfession: z.boolean().default(false),
  authorizationPublishedAt: z.iso.date().nullable().default(null),
  arrivalDate: z.iso.date().nullable().default(null),
  rnmAppointmentAt: z.iso.date().nullable().default(null),
  steps: z.partialRecord(z.enum(stepKeys), foreignStep).default({}),
}

// ---------- triagem ----------

export type ForeignAlert = { tone: 'danger' | 'warn'; message: string }

type ProcessInput = {
  regulatedProfession: boolean
  arrivalDate: string | null
  rnmAppointmentAt: string | null
  visaExpiresAt: string | null
  authorizationPublishedAt: string | null
  steps: Partial<Record<ForeignStepKey, ForeignStep>>
}

const DAY = 86_400_000
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY)
const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY).toISOString().slice(0, 10)

/** Etapas que valem para a pessoa, com o status de cada uma. */
export const foreignSteps = (f: ProcessInput) =>
  FOREIGN_STEPS.filter(s => !('regulatedOnly' in s) || f.regulatedProfession).map(s => ({ ...s, ...(f.steps[s.key] ?? { status: 'pending' as const, date: null, note: '' }) }))

/**
 * Situação do processo: progresso, fase atual, próxima etapa, prazo do RNM e
 * alertas. `today` em AAAA-MM-DD.
 */
export const foreignProcess = (f: ProcessInput, today: string) => {
  const steps = foreignSteps(f)
  const applicable = steps.filter(s => s.status !== 'na')
  const done = applicable.filter(s => s.status === 'done').length
  const isDone = (key: ForeignStepKey) => ['done', 'na'].includes(f.steps[key]?.status ?? 'pending')
  // Conformidade é verificação contínua: não define a fase nem a próxima etapa.
  const flow = steps.filter(s => s.phase !== 'conformidade' && s.status !== 'done' && s.status !== 'na')
  const next = flow[0] ?? null
  const phase = next?.phase ?? 'conformidade'

  const arrived = Boolean(f.arrivalDate) || isDone('arrival')
  const rnmDeadline = f.arrivalDate ? addDays(f.arrivalDate, 90) : null
  const rnmDaysLeft = rnmDeadline && !isDone('rnm_appointment') ? daysBetween(today, rnmDeadline) : null
  const visaDaysLeft = f.visaExpiresAt ? daysBetween(today, f.visaExpiresAt) : null

  const alerts: ForeignAlert[] = []
  if (rnmDaysLeft !== null) {
    if (rnmDaysLeft < 0) alerts.push({ tone: 'danger', message: `RNM fora do prazo há ${-rnmDaysLeft} dias: multa diária. Agende na PF já.` })
    else if (rnmDaysLeft <= 20 && !f.rnmAppointmentAt) alerts.push({ tone: 'danger', message: `Faltam ${rnmDaysLeft} dias para o prazo do RNM e não há atendimento agendado.` })
    else if (rnmDaysLeft <= 20) alerts.push({ tone: 'warn', message: `Prazo do RNM em ${rnmDaysLeft} dias (atendimento em ${f.rnmAppointmentAt}).` })
  }
  if (f.rnmAppointmentAt && rnmDeadline && f.rnmAppointmentAt > rnmDeadline && !isDone('rnm_appointment'))
    alerts.push({ tone: 'danger', message: 'O atendimento na PF está marcado depois do prazo de 90 dias.' })
  if (visaDaysLeft !== null && visaDaysLeft < 0) alerts.push({ tone: 'danger', message: `Visto ou residência vencido há ${-visaDaysLeft} dias.` })
  else if (visaDaysLeft !== null && visaDaysLeft <= 60) alerts.push({ tone: 'warn', message: `Visto ou residência vence em ${visaDaysLeft} dias: peça a renovação.` })
  if (arrived && !isDone('published')) alerts.push({ tone: 'danger', message: 'Chegou ao Brasil sem a autorização de trabalho publicada: não pode trabalhar.' })
  if (arrived) {
    const missing = steps.filter(s => s.phase === 'conformidade' && s.status !== 'done' && s.status !== 'na')
    if (missing.length) alerts.push({ tone: 'warn', message: `Conformidade pendente: ${missing.map(s => s.label).join('; ')}.` })
  }
  if (isDone('esocial') && !isDone('rnm_appointment') && !isDone('rnm_issued'))
    alerts.push({ tone: 'danger', message: 'Admitido sem RNM nem protocolo da PF.' })

  return {
    steps,
    done,
    total: applicable.length,
    progress: applicable.length ? done / applicable.length : 1,
    phase,
    next,
    rnmDeadline,
    rnmDaysLeft,
    visaDaysLeft,
    /** Pronto para trabalhar: tudo do fluxo até a admissão feito. */
    ready: flow.length === 0,
    alerts,
  }
}
export type ForeignProcess = ReturnType<typeof foreignProcess>
