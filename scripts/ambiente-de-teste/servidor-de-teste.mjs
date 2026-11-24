// Servidor de teste do Falcão RH: responde no lugar da API real, com dados fictícios em memória.
import crypto from 'node:crypto'
import { JSON_NULL, portalRoutes } from './mock-portal.mjs'
// Mock da API do Falcão RH só para conferência visual (porta 3333).
import http from 'node:http'

const FIRST = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Larissa', 'Marcos', 'Natália', 'Otávio', 'Paula', 'Rafael', 'Sofia', 'Tiago', 'Vanessa', 'Wesley']
const LAST = ['Ferraz', 'Rezende', 'Almeida', 'Moreira', 'Cardoso', 'Duarte', 'Teixeira', 'Lacerda', 'Nogueira', 'Queiroz', 'Hidalgo', 'Pacheco', 'Barbosa', 'Gomes']
const DEPTS = [
  { id: '0b0c0d0e-0000-4000-8000-000000000001', name: 'Diretoria', parentId: null, headcount: 2 },
  { id: '0b0c0d0e-0000-4000-8000-000000000002', name: 'Obras', parentId: '0b0c0d0e-0000-4000-8000-000000000001', headcount: 14 },
  { id: '0b0c0d0e-0000-4000-8000-000000000003', name: 'Recursos Humanos', parentId: '0b0c0d0e-0000-4000-8000-000000000001', headcount: 3 },
  { id: '0b0c0d0e-0000-4000-8000-000000000004', name: 'Suprimentos', parentId: '0b0c0d0e-0000-4000-8000-000000000001', headcount: 6 },
  { id: '0b0c0d0e-0000-4000-8000-000000000005', name: 'Segurança do Trabalho', parentId: '0b0c0d0e-0000-4000-8000-000000000002', headcount: 4 },
  { id: '0b0c0d0e-0000-4000-8000-000000000006', name: 'Engenharia', parentId: '0b0c0d0e-0000-4000-8000-000000000002', headcount: 7 },
  { id: '0b0c0d0e-0000-4000-8000-000000000007', name: 'Financeiro', parentId: '0b0c0d0e-0000-4000-8000-000000000001', headcount: 3 },
]
const POSITIONS = ['Pedreiro', 'Eletricista', 'Engenheira Civil', 'Técnico de Segurança do Trabalho', 'Comprador', 'Analista de RH', 'Auxiliar Administrativo', 'Mestre de Obras', 'Analista Financeiro', 'Diretor']
const UNITS = [
  { id: 'u1', name: 'Sede Camaçari', code: 'CAM', city: 'Camaçari', state: 'BA' },
  { id: 'u2', name: 'Canteiro Fábrica Norte', code: 'FN', city: 'Camaçari', state: 'BA' },
  { id: 'u3', name: 'Canteiro Fábrica Sul', code: 'FS', city: 'Camaçari', state: 'BA' },
]
const pick = (arr, i) => arr[i % arr.length]
const iso = d => d.toISOString().slice(0, 10)
const addDays = (n, base = new Date()) => { const d = new Date(base); d.setDate(d.getDate() + n); return iso(d) }

const employees = Array.from({ length: 39 }, (_, i) => {
  const dept = pick(DEPTS.slice(1), i * 3)
  const first = pick(FIRST, i * 7 + 1)
  const name = `${first} ${pick(LAST, i * 5 + 2)} ${pick(LAST, i * 3 + 7)}`
  return {
    id: `e${i + 1}`,
    registration: String(1001 + i),
    fullName: name,
    socialName: null,
    email: `${first.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}${i}@falcao.invalid`,
    status: i % 13 === 4 ? 'terminated' : i % 9 === 5 ? 'on_leave' : 'active',
    contractType: i % 6 === 3 ? 'temporary' : 'clt',
    hireDate: addDays(-((i * 97) % 1900) - 30),
    departmentId: dept.id,
    departmentName: dept.name,
    positionTitle: pick(POSITIONS, i * 3 + 1),
    unitName: pick(UNITS, i).name,
    managerName: i % 8 === 6 ? null : pick(['Otávio Nogueira Queiroz', 'Wesley Hidalgo Pacheco', 'Tiago Lacerda'], i),
  }
}).sort((a, b) => a.fullName.localeCompare(b.fullName))

const detail = e => ({
  ...e,
  cpf: '52998224725',
  birthDate: '1990-04-12',
  phone: '(81) 99876-5432',
  address: { street: 'Rua da Aurora', number: '120', district: 'Centro', city: 'Camaçari', state: 'BA', zip: '42800-000' },
  positionId: 'p1', managerId: 'e2', unitId: 'u1', costCenterId: 'c1',
  terminationDate: e.status === 'terminated' ? addDays(-40) : null,
  workSchedule: 'Segunda a sexta, 07h às 17h',
  isMasked: false,
  costCenterName: '1.02 Obras Camaçari',
  history: [
    { id: 'h3', type: 'position_changed', effectiveDate: addDays(-60), reason: 'Promoção por desempenho', fields: [], actorName: 'Larissa Duarte', createdAt: new Date().toISOString() },
    { id: 'h2', type: 'data_updated', effectiveDate: addDays(-200), reason: null, fields: ['phone', 'address'], actorName: 'Larissa Duarte', createdAt: new Date().toISOString() },
    { id: 'h1', type: 'hired', effectiveDate: e.hireDate, reason: null, fields: [], actorName: 'Sistema', createdAt: new Date().toISOString() },
  ],
})

const months = Array.from({ length: 13 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - 12 + i); return d.toISOString().slice(0, 7) })
const dashboard = {
  period: { from: addDays(-365), to: addDays(0) },
  headcount: { active: 33, onLeave: 3, total: 36 },
  movement: { hires: 7, terminations: 3, turnover: 14.7 },
  distribution: {
    byDepartment: DEPTS.map(d => ({ label: d.name, total: d.headcount })).sort((a, b) => b.total - a.total),
    byUnit: UNITS.map((u, i) => ({ label: u.name, total: [15, 12, 9][i] })),
    byCostCenter: [{ label: '1.02 Obras Camaçari', total: 18 }, { label: '1.01 Administrativo', total: 11 }, { label: '1.03 Obras Industriais', total: 7 }],
  },
  trend: months.map((month, i) => ({ month, headcount: [31, 32, 32, 32, 32, 33, 33, 33, 33, 34, 36, 36, 35][i], hires: i % 3, terminations: i % 4 === 0 ? 1 : 0 })),
  birthdays: [
    { id: 'e3', name: 'Carla Ferraz Lacerda', day: 4, departmentName: 'Obras' },
    { id: 'e8', name: 'Henrique Gomes', day: 17, departmentName: 'Engenharia' },
    { id: 'e11', name: 'Natália Pacheco', day: 28, departmentName: 'Financeiro' },
  ],
  recentHires: employees.slice(0, 4).map(e => ({ id: e.id, name: e.fullName, hireDate: e.hireDate, departmentName: e.departmentName, positionTitle: e.positionTitle })),
  activity: employees.slice(4, 9).map((e, i) => ({ id: `a${i}`, type: ['position_changed', 'department_changed', 'hired', 'status_changed', 'data_updated'][i], effectiveDate: addDays(-i * 9), createdAt: new Date().toISOString(), employeeId: e.id, employeeName: e.fullName })),
  alerts: [
    { key: 'vacation_deadline', label: 'com férias perto do prazo legal (60 dias)', total: 1, href: '/solicitacoes' },
    { key: 'documents_expiring', label: 'documentos vencidos ou vencendo em 30 dias', total: 4, href: '/documentos?expiring=1' },
    { key: 'no_manager', label: 'sem gestor definido', total: 6, href: '/colaboradores' },
  ],
  absence: { absenteeism: 0.1, lostDays: 6, workdays: 251 },
  requests: {
    pending: 3,
    upcomingVacations: employees.slice(10, 13).map((e, i) => ({ id: `v${i}`, employeeId: e.id, name: e.fullName, startDate: addDays(8 + i * 11), endDate: addDays(21 + i * 11), days: 14 })),
  },
}

const requests = employees.slice(0, 12).map((e, i) => ({
  id: `r${i + 1}`, employeeId: e.id, employeeName: e.fullName, departmentName: e.departmentName,
  type: i % 3 === 1 ? 'absence' : 'vacation', absenceKind: i % 3 === 1 ? (i % 2 ? 'medical' : 'justified') : null,
  status: ['pending', 'approved', 'approved', 'pending', 'rejected', 'approved', 'cancelled', 'pending'][i % 8],
  startDate: addDays(-10 + i * 3), endDate: addDays(-10 + i * 3 + (i % 3 === 1 ? 1 : 13)), days: i % 3 === 1 ? 2 : 14,
  notes: i === 0 ? 'Viagem em família já programada.' : null, createdAt: new Date().toISOString(), currentStep: 'manager', isRestricted: false,
}))

const balance = {
  available: 24,
  periods: [
    { start: '2023-03-01', end: '2024-02-29', deadline: addDays(40), complete: true, unjustifiedAbsences: 0, entitled: 30, approved: 20, pending: 0, remaining: 10, fractions: [20] },
    { start: '2024-03-01', end: '2025-02-28', deadline: addDays(300), complete: true, unjustifiedAbsences: 0, entitled: 30, approved: 14, pending: 2, remaining: 14, fractions: [14] },
    { start: '2025-03-01', end: '2026-02-28', deadline: addDays(600), complete: false, unjustifiedAbsences: 0, entitled: 30, approved: 0, pending: 0, remaining: 30, fractions: [] },
  ],
}

const categories = [
  { id: 'c1', name: 'Contrato de trabalho', employeeVisible: true, employeeUpload: false, sensitive: false, requiresExpiry: false },
  { id: 'c2', name: 'ASO', employeeVisible: true, employeeUpload: false, sensitive: false, requiresExpiry: true },
  { id: 'c3', name: 'Atestados médicos', employeeVisible: true, employeeUpload: true, sensitive: true, requiresExpiry: false },
  { id: 'c4', name: 'Certificados NR', employeeVisible: true, employeeUpload: true, sensitive: false, requiresExpiry: true },
]
const documents = employees.slice(0, 10).map((e, i) => ({
  id: `doc${i + 1}`, title: ['Contrato de trabalho', 'ASO admissional', 'Certificado NR-35', 'Atestado', 'Certificado NR-10'][i % 5],
  employeeId: e.id, employeeName: e.fullName, categoryId: pick(categories, i).id, categoryName: pick(categories, i).name,
  sensitive: i % 5 === 3, expiresAt: i % 3 === 0 ? addDays(-5 + i * 9) : null, status: 'active', currentVersion: 1 + (i % 3),
  filename: `documento-${i + 1}.pdf`, mimeType: 'application/pdf', sizeBytes: 120000 + i * 53000, updatedAt: new Date().toISOString(),
}))

const me = {
  user: { id: 'u-admin', name: 'Administrador DEMO', email: 'admin@demo.falcao.invalid' },
  tenant: { id: 't1', name: 'Falcão Construções e Engenharia (DEMO)', slug: 'falcao' },
  role: 'admin', scope: 'all', employeeId: 'e1',
  permissions: [], mfaPending: false,
  organizations: [{ tenantId: 't1', tenantName: 'Falcão Construções e Engenharia (DEMO)', role: 'admin' }],
}

const notifications = {
  unread: 2,
  items: [
    { id: 'n1', kind: 'request_pending', title: 'Ana Ferraz pediu férias', body: '14 dias a partir de 10/11. Aguarda sua aprovação.', link: '/solicitacoes?id=r1', readAt: null, createdAt: new Date(Date.now() - 12 * 60000).toISOString() },
    { id: 'n2', kind: 'document_expiring', title: 'ASO vence em 7 dias', body: 'Bruno Rezende Ferraz', link: '/documentos', readAt: null, createdAt: new Date(Date.now() - 5 * 3600000).toISOString() },
    { id: 'n3', kind: 'request_decided', title: 'Férias aprovadas', body: 'Carla Moreira Nogueira, 20/12 a 02/01.', link: null, readAt: new Date().toISOString(), createdAt: new Date(Date.now() - 3 * 86400000).toISOString() },
  ],
}

const deptFull = DEPTS.map((d, i) => ({ ...d, code: `D${i + 1}`, parentName: DEPTS.find(p => p.id === d.parentId)?.name ?? null, managerEmployeeId: 'e2', managerName: pick(['Otávio Nogueira Queiroz', 'Wesley Hidalgo Pacheco', 'Larissa Duarte'], i), unitId: 'u1', unitName: 'Sede Recife', costCenterId: 'c1', costCenterName: '1.02 Obras' }))

// ---------- página pública de vagas (demonstração) ----------
const publicJobs = [
  { token: 'mestre-de-obras-bv-8f2k1c9d0a', title: 'Mestre de obras', city: 'Camaçari', state: 'BA', workMode: 'site', contractType: 'clt', departmentName: 'Obras', salary: { min: 5200, max: 6800 }, publishedAt: addDays(-2),
    description: 'Vai coordenar as equipes do canteiro da fábrica: distribuir as frentes de serviço, acompanhar cronograma e qualidade, e ser a ponte entre a engenharia e a obra.',
    requirements: 'Experiência como mestre ou encarregado geral em obras verticais\nLeitura de projetos estruturais e de arquitetura\nNR-18 e NR-35 válidas (ou disponibilidade para fazer)\nLiderança de equipes de 30+ pessoas',
    benefits: 'Plano de saúde e odontológico\nVale-alimentação de R$ 900\nTransporte fretado da Av. Mascarenhas de Morais\nParticipação nos resultados da obra' },
  { token: 'eng-civil-residente-3j9x0q2w', title: 'Engenheira(o) civil residente', city: 'Camaçari', state: 'BA', workMode: 'site', contractType: 'clt', departmentName: 'Engenharia', salary: null, publishedAt: addDays(-5),
    description: 'Responsável técnica pelo canteiro da fábrica: planejamento semanal, controle de qualidade, medições de empreiteiros e segurança da obra.',
    requirements: 'CREA ativo\n3+ anos em obra industrial\nDomínio de MS Project ou similar\nCNH B', benefits: 'Plano de saúde\nCarro da empresa\nAuxílio pós-graduação' },
  { token: 'eletricista-predial-7m1n2b3v', title: 'Eletricista predial', city: 'Camaçari', state: 'BA', workMode: 'site', contractType: 'clt', departmentName: 'Obras', salary: { min: 2600, max: 3100 }, publishedAt: addDays(-1),
    description: 'Instalações elétricas de baixa tensão na obra da fábrica: tubulação, enfiação, quadros de distribuição e testes.',
    requirements: 'NR-10 válida\nExperiência comprovada em carteira\nLeitura de projeto elétrico', benefits: 'Vale-alimentação\nTransporte\nCesta básica por assiduidade' },
  { token: 'tecnico-seguranca-5c6d7e8f', title: 'Técnico(a) de segurança do trabalho', city: 'Camaçari', state: 'BA', workMode: 'site', contractType: 'clt', departmentName: 'Segurança do Trabalho', salary: { min: 3800, max: 4500 }, publishedAt: addDays(-8),
    description: 'Inspeções diárias, DDS, controle de EPIs, integração de novos colaboradores e investigação de incidentes nos canteiros de obras.',
    requirements: 'Registro no MTE\nExperiência em construção civil\nConhecimento das NR-18 e NR-35', benefits: 'Plano de saúde\nVale-alimentação\nAjuda de custo para deslocamento entre obras' },
  { token: 'comprador-suprimentos-1a2s3d4f', title: 'Comprador(a) de suprimentos', city: 'Camaçari', state: 'BA', workMode: 'hybrid', contractType: 'clt', departmentName: 'Suprimentos', salary: null, publishedAt: addDays(-12),
    description: 'Cotação, negociação e acompanhamento de pedidos de materiais para as obras, em contato direto com os almoxarifados dos canteiros.',
    requirements: 'Experiência com compras para construção civil\nExcel intermediário\nBoa negociação', benefits: 'Plano de saúde\nHome office 2x por semana\nGympass' },
  { token: 'pedreiro-acabamento-9z8y7x6w', title: 'Pedreiro(a) de acabamento', city: 'Jaboatão dos Guararapes', state: 'PE', workMode: 'site', contractType: 'temporary', departmentName: 'Obras', salary: { min: 2300, max: 2700 }, publishedAt: addDays(-3),
    description: 'Assentamento de porcelanato, revestimentos e acabamentos nas áreas administrativas da fábrica.',
    requirements: 'Experiência com porcelanato grande formato\nCapricho e atenção a detalhes', benefits: 'Vale-alimentação\nTransporte\nPossibilidade de efetivação' },
]
const questionsFor = token => (token.startsWith('mestre') || token.startsWith('tecnico')
  ? [{ id: 'q-nr35', kind: 'yes_no', label: 'Tem NR-35 válida?', options: null, required: true }, { id: 'q-exp', kind: 'choice', label: 'Quanto tempo de experiência na função?', options: ['Menos de 2 anos', '2 a 5 anos', 'Mais de 5 anos'], required: true }]
  : [{ id: 'q-disp', kind: 'yes_no', label: 'Tem disponibilidade para início imediato?', options: null, required: false }])
const careerPage = {
  hero: { enabled: true, title: 'Construa sua carreira na Falcão', subtitle: 'Construção civil em grandes fábricas do ramo automotivo internacional. Venha fazer parte.', imageId: null },
  about: { enabled: true, title: 'Sobre a Falcão', body: 'A Falcão atua na construção civil e lidera a construção de grandes fábricas do ramo automotivo internacional.', imageIds: [] },
  benefits: {
    enabled: true,
    title: 'Por que trabalhar aqui',
    items: [
      { icon: '💰', title: 'Salário', text: 'Compatível com o mercado.' },
      { icon: '🚌', title: 'Transporte', text: 'Fretado ou auxílio mobilidade.' },
      { icon: '🛒', title: 'Alimentação', text: 'Para compras/mercado.' },
      { icon: '🍽️', title: 'Refeição', text: 'Almoço e café da manhã.' },
      { icon: '🩺', title: 'Plano de Saúde', text: 'Sem descontos de mensalidades ou coparticipações, sendo custeado 100% pela empresa.' },
      { icon: '🦷', title: 'Plano Odontológico', text: 'Mais cuidado com a sua saúde bucal.' },
      { icon: '📈', title: 'PPR', text: 'Participação nos resultados conforme a CCT (Convenção Coletiva de Trabalho).' },
      { icon: '🚀', title: 'Crescimento e desenvolvimento', text: '' },
    ],
  },
  faq: { enabled: true, items: [
    { question: 'Preciso ter experiência?', answer: 'Depende da vaga: cada uma informa os requisitos. Para ajudante e servente, não exigimos experiência anterior.' },
    { question: 'Como acompanho minha candidatura?', answer: 'Você recebe um e-mail de confirmação e é avisado por e-mail a cada novidade do processo.' },
    { question: 'Posso me candidatar a mais de uma vaga?', answer: 'Sim. Seu cadastro fica no nosso banco de talentos (se você autorizar) e pode ser considerado para outras vagas.' },
    { question: 'Como peço a exclusão dos meus dados?', answer: 'Pelo link no e-mail de confirmação, a qualquer momento. A exclusão é imediata.' },
  ] },
  links: { instagram: 'https://instagram.com/', linkedin: 'https://linkedin.com/', site: 'https://falcao.com.br', whatsapp: '81999990000', email: 'rh@falcao.com.br' },
}
// ---------- vagas internas (RH) ----------
const STAGES = [
  { id: 'st-novo', name: 'Cadastro do candidato', position: 0, isInitial: true },
  { id: 'st-triagem', name: 'Triagem', position: 1, isInitial: false },
  { id: 'st-entrevista', name: 'Entrevista/agendamento', position: 2, isInitial: false },
  { id: 'st-teste', name: 'Teste prático', position: 3, isInitial: false },
  { id: 'st-referencia', name: 'Pesquisa de referência', position: 4, isInitial: false },
  { id: 'st-exame', name: 'Exame admissional', position: 5, isInitial: false },
  { id: 'st-documentos', name: 'Solicitação de documentos', position: 6, isInitial: false },
  { id: 'st-proposta', name: 'Resultados da seleção', position: 7, isInitial: false },
  { id: 'st-admissao', name: 'Admissão', position: 8, isInitial: false },
]
const deptName = id => DEPTS.find(d => d.id === id)?.name ?? null
const deptIdByName = name => DEPTS.find(d => d.name === name)?.id ?? null
const MANAGERS = { u3: 'Otávio Nogueira Queiroz', u2: 'Larissa Duarte', 'u-admin': 'Administrador DEMO' }
let jobSeq = 0
const internalJobs = publicJobs.map((j, i) => ({
  id: `job-${++jobSeq}`,
  title: j.title, departmentId: deptIdByName(j.departmentName), unitId: null, positionId: null,
  contractType: j.contractType, city: 'Camaçari', state: 'BA', workMode: j.workMode,
  salaryMin: j.salary?.min ?? null, salaryMax: j.salary?.max ?? null, showSalary: Boolean(j.salary),
  description: j.description, requirements: j.requirements, benefits: [['Salário', 'Transporte', 'Alimentação', 'Refeição', 'Plano de Saúde', 'Plano Odontológico', 'PPR', 'Crescimento e desenvolvimento']][0].join('\n'),
  openings: [2, 1, 3, 1, 1, 4][i], hiredCount: [0, 0, 1, 0, 0, 1][i], managerUserId: i % 2 ? 'u2' : 'u3',
  visibility: 'public', status: 'published', shareToken: j.token, publishedAt: j.publishedAt, closedAt: null,
  createdAt: j.publishedAt, questions: questionsFor(j.token),
  counts: { stages: { 'st-novo': [12, 4, 9, 6, 3, 15][i], 'st-triagem': [5, 2, 3, 2, 1, 4][i], 'st-entrevista': [3, 1, 1, 1, 0, 2][i], 'st-proposta': [1, 0, 0, 1, 0, 1][i] }, hired: [0, 0, 1, 0, 0, 1][i], rejected: [7, 2, 4, 3, 1, 6][i] },
}))
internalJobs.push(
  { ...internalJobs[1], id: `job-${++jobSeq}`, title: 'Almoxarife de obra', departmentId: '0b0c0d0e-0000-4000-8000-000000000004', city: 'Camaçari', state: 'BA', status: 'draft', publishedAt: null, shareToken: 'almoxarife-rascunho-0k9j8h7g', salaryMin: 2200, salaryMax: 2600, showSalary: true, hiredCount: 0, createdAt: addDays(-1), counts: { stages: {}, hired: 0, rejected: 0 }, questions: [] },
  { ...internalJobs[0], id: `job-${++jobSeq}`, title: 'Armador', status: 'closed', closedAt: addDays(-20), publishedAt: addDays(-80), shareToken: 'armador-encerrada-5t4r3e2w', openings: 3, hiredCount: 3, createdAt: addDays(-80), counts: { stages: {}, hired: 3, rejected: 11 } },
)
const jobView = job => {
  const { shareToken, questions, ...rest } = job
  const open = Object.values(job.counts.stages).reduce((a, b) => a + b, 0)
  return { ...rest, departmentName: deptName(job.departmentId), managerName: MANAGERS[job.managerUserId] ?? null, shareUrl: `http://localhost:5173/vagas/falcao/${shareToken}`, total: open + job.counts.hired + job.counts.rejected }
}
const jobDetailView = job => ({ ...jobView(job), questions: job.questions })
const TRANSITIONS = { draft: ['published'], published: ['paused', 'closed'], paused: ['published', 'closed'], closed: [] }
const fail = (status, message) => ({ __status: status, code: 'error', message })
const questionsFrom = (incoming = []) => incoming.map((q, i) => ({ id: q.id ?? `q-${Date.now()}-${i}`, kind: q.kind, label: q.label, options: q.options ?? null, required: Boolean(q.required) }))
function jobsRoute(method, p, payload, q) {
  if (p === '/recruitment/stages' && method === 'GET') return STAGES.map(s => ({ ...s, openApplications: internalJobs.reduce((n, j) => n + (j.counts.stages[s.id] ?? 0), 0) }))
  if (p === '/jobs' && method === 'GET') return internalJobs.filter(j => !q.get('status') || j.status === q.get('status')).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).map(jobView)
  if (p === '/jobs' && method === 'POST') {
    if (!payload?.title || payload.title.trim().length < 3) return fail(400, 'Informe o título da vaga.')
    if (!payload.description || payload.description.trim().length < 20) return fail(400, 'Descreva a vaga com ao menos 20 caracteres.')
    const job = { ...payload, id: `job-${++jobSeq}`, status: 'draft', hiredCount: 0, publishedAt: null, closedAt: null, createdAt: new Date().toISOString(),
      shareToken: `vaga-${Math.random().toString(36).slice(2, 14)}`, questions: questionsFrom(payload.questions), counts: { stages: {}, hired: 0, rejected: 0 } }
    internalJobs.push(job)
    return { ...jobDetailView(job), __status: 201 }
  }
  const match = p.match(/^\/jobs\/([^/]+)(\/status)?$/)
  if (!match) return undefined
  const job = internalJobs.find(j => j.id === match[1])
  if (!job) return fail(404, 'Vaga não encontrada.')
  if (!match[2] && method === 'GET') return jobDetailView(job)
  if (!match[2] && method === 'PUT') {
    if (job.status === 'closed') return fail(400, 'Vaga encerrada não pode ser editada.')
    Object.assign(job, { ...payload, questions: questionsFrom(payload.questions) })
    return jobDetailView(job)
  }
  if (match[2] && method === 'POST') {
    const to = payload?.status
    if (!TRANSITIONS[job.status].includes(to)) return fail(400, 'Esta mudança de situação não é permitida para a vaga.')
    if (to === 'published' && (!job.city || !job.state)) return fail(400, 'Informe cidade e UF antes de publicar a vaga.')
    job.status = to
    if (to === 'published' && !job.publishedAt) job.publishedAt = new Date().toISOString()
    if (to === 'closed') job.closedAt = new Date().toISOString()
    return jobDetailView(job)
  }
  return undefined
}
// ---------- quadro de candidatos (demonstração) ----------
const CITIES = [['Camaçari', 'BA'], ['Salvador', 'BA'], ['Lauro de Freitas', 'BA'], ['Dias d\'Ávila', 'BA'], ['Simões Filho', 'BA'], ['Feira de Santana', 'BA']]
let appSeq = 0
const applicationsByJob = new Map()
const makeApplication = (job, stageId, status, n) => {
  const i = ++appSeq
  const first = pick(FIRST, i * 5 + 3)
  const fullName = `${first} ${pick(LAST, i * 7 + 1)} ${pick(LAST, i * 3 + 4)}`
  const [city, state] = pick(CITIES, i)
  const created = new Date(Date.now() - (n * 7 + (i % 5)) * 3600000 * 6).toISOString()
  const stageName = STAGES.find(s => s.id === stageId)?.name
  const answers = job.questions.map(q => ({ questionId: q.id, label: q.label, value: q.kind === 'yes_no' ? (i % 3 ? 'sim' : 'não') : q.kind === 'choice' ? pick(q.options, i) : 'Disponível a partir de segunda.' }))
  const events = [{ id: `ev-${i}-0`, fromLabel: null, toLabel: 'Novo', outcome: null, note: null, actorName: null, createdAt: created }]
  if (stageId && stageId !== 'st-novo') events.push({ id: `ev-${i}-1`, fromLabel: 'Novo', toLabel: stageName, outcome: null, note: null, actorName: 'Larissa Duarte', createdAt: new Date(Date.parse(created) + 86400000).toISOString() })
  if (status === 'rejected') events.push({ id: `ev-${i}-2`, fromLabel: 'Triagem', toLabel: null, outcome: 'rejected', note: 'Não tem a NR exigida para a função.', actorName: 'Larissa Duarte', createdAt: new Date(Date.parse(created) + 2 * 86400000).toISOString() })
  return {
    id: `app-${i}`, jobId: job.id, jobTitle: job.title, stageId: status === 'open' ? stageId : null, status,
    rating: i % 4 === 0 ? null : (i % 5) + 1, createdAt: created, talentPoolConsent: i % 3 !== 0,
    rejectionReason: status === 'rejected' ? 'Não tem a NR exigida para a função.' : null,
    candidate: { id: `cand-${i}`, fullName, city, state, email: `${first.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${i}@exemplo.com`, phone: `(81) 9${String(8000 + i * 37).slice(0, 4)}-${String(1000 + i * 91).slice(-4)}`, cpf: '52998224725', linkedin: i % 4 === 1 ? 'https://www.linkedin.com/in/exemplo' : null, tags: i % 6 === 0 ? ['Bom para encarregado'] : [] },
    answers, events,
    notes: i % 5 === 0 ? [{ id: `note-${i}`, body: 'Conversamos por telefone: tem experiência em obra vertical e mora perto do canteiro.', authorName: 'Larissa Duarte', createdAt: new Date(Date.parse(created) + 3600000).toISOString() }] : [],
    file: { id: `file-${i}`, filename: `curriculo-${first.toLowerCase()}.pdf`, sizeBytes: 180000 + i * 3100, scanStatus: i % 9 === 0 ? 'pending' : 'clean', createdAt: created },
  }
}
for (const job of internalJobs) {
  const list = []
  for (const [stageId, total] of Object.entries(job.counts.stages)) for (let n = 0; n < total; n++) list.push(makeApplication(job, stageId, 'open', n))
  for (let n = 0; n < job.counts.rejected; n++) list.push(makeApplication(job, null, 'rejected', n))
  applicationsByJob.set(job.id, list)
}
const findApplication = id => { for (const list of applicationsByJob.values()) { const a = list.find(x => x.id === id); if (a) return a } return null }
const recount = job => {
  const list = applicationsByJob.get(job.id) ?? []
  job.counts = { stages: {}, hired: job.counts.hired, rejected: list.filter(a => a.status === 'rejected').length }
  for (const a of list) if (a.status === 'open') job.counts.stages[a.stageId] = (job.counts.stages[a.stageId] ?? 0) + 1
}
const boardCard = a => ({ id: a.id, stageId: a.stageId, status: a.status, rating: a.rating, createdAt: a.createdAt, candidate: { id: a.candidate.id, fullName: a.candidate.fullName, city: a.candidate.city, state: a.candidate.state }, tags: a.candidate.tags, fileStatus: a.file?.scanStatus ?? null })
function boardRoute(method, p, payload, q) {
  let m = p.match(/^\/jobs\/([^/]+)\/applications$/)
  if (m && method === 'GET') {
    const list = (applicationsByJob.get(m[1]) ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { stages: STAGES.map(({ id, name, position }) => ({ id, name, position })), cards: list.filter(a => a.status === 'open').map(boardCard), rejected: list.filter(a => a.status === 'rejected').map(boardCard) }
  }
  // ---------- banco de talentos (demonstração) ----------
  const allApps = () => [...applicationsByJob.values()].flat()
  const inAYear = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10)
  const twin = (a, b) => a.id !== b.id && a.email === b.email
  const people = () => {
    const map = new Map()
    for (const a of allApps()) { if (!map.has(a.candidate.id)) map.set(a.candidate.id, { c: a.candidate, apps: [] }); map.get(a.candidate.id).apps.push(a) }
    return [...map.values()]
  }
  if (!globalThis.__talentSeeded) {
    globalThis.__talentSeeded = true
    const TAGS = ['NR-35', 'NR-18', 'NR-10', 'pedreiro', 'eletricista', 'indicação', 'CNH D', 'liderança']
    allApps().forEach((a, i) => { a.candidate.tags = i % 3 === 0 ? [TAGS[i % 8], TAGS[(i + 3) % 8]] : i % 3 === 1 ? [TAGS[i % 8]] : (a.candidate.tags ?? []) })
    const list = allApps(); list[1].candidate.email = list[0].candidate.email; list[1].candidate.fullName = list[0].candidate.fullName
    list[0].talentPoolConsent = true; list[1].talentPoolConsent = true
  }
  if (p === '/candidates' && method === 'GET') {
    const norm = v => (v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    let list = people()
    const term = norm(q.get('q'))
    if (term) list = list.filter(({ c, apps }) => norm(c.fullName + ' ' + c.email).includes(term) || apps.some(a => a.answers.some(x => norm(x.value).includes(term))))
    if (q.get('city')) list = list.filter(({ c }) => norm(c.city).includes(norm(q.get('city'))))
    if (q.get('tag')) list = list.filter(({ c }) => (c.tags ?? []).includes(q.get('tag')))
    if (q.get('consent') !== 'all') list = list.filter(({ apps }) => apps.some(a => a.talentPoolConsent))
    const everyone = people()
    list.sort((x, y) => Math.max(...y.apps.map(a => Date.parse(a.createdAt))) - Math.max(...x.apps.map(a => Date.parse(a.createdAt))))
    const size = Number(q.get('pageSize') ?? 25), page = Number(q.get('page') ?? 1)
    return { items: list.slice((page - 1) * size, page * size).map(({ c, apps }) => ({ id: c.id, fullName: c.fullName, city: c.city, state: c.state, tags: c.tags ?? [], invitedAt: c.invitedAt ?? null, lastApplicationAt: apps[0].createdAt, applications: apps.length, consentUntil: apps.some(a => a.talentPoolConsent) ? inAYear : null, duplicateOf: everyone.filter(o => twin(o.c, c)).map(o => o.c.id) })), total: list.length, page, pageSize: size }
  }
  m = p.match(/^\/candidates\/([^/]+)(\/duplicates|\/merge|\/invite)?$/)
  if (m) {
    const person = people().find(x => x.c.id === m[1])
    if (!person) return fail(404, 'Ficha não encontrada.')
    const { c, apps } = person
    if (!m[2] && method === 'GET') return { id: c.id, fullName: c.fullName, email: c.email, phone: c.phone, city: c.city, state: c.state, cpf: c.cpf ?? null, linkedin: c.linkedin ?? null, tags: c.tags ?? [], invitedAt: c.invitedAt ?? null, canInvite: apps.some(a => a.talentPoolConsent), applications: apps.map(a => ({ id: a.id, jobId: a.jobId, jobTitle: a.jobTitle, status: a.status, stage: STAGES.find(s => s.id === a.stageId)?.name ?? null, rating: a.rating, rejectionReason: a.rejectionReason, talentPoolConsent: a.talentPoolConsent, retentionUntil: a.talentPoolConsent ? inAYear : null, createdAt: a.createdAt, notes: a.notes })), files: apps.flatMap(a => (a.file ? [a.file] : [])) }
    if (!m[2] && method === 'PATCH') { c.tags = [...new Set(payload.tags)]; return { id: c.id, tags: c.tags } }
    if (m[2] === '/duplicates' && method === 'GET') return people().filter(o => twin(o.c, c)).map(o => ({ id: o.c.id, fullName: o.c.fullName, email: o.c.email, city: o.c.city, state: o.c.state, createdAt: o.apps[0].createdAt }))
    if (m[2] === '/merge' && method === 'POST') {
      const source = people().find(x => x.c.id === payload.sourceId)
      if (!source || !twin(source.c, c)) return fail(400, 'Só é possível juntar fichas com o mesmo e-mail ou CPF.')
      c.tags = [...new Set([...(c.tags ?? []), ...(source.c.tags ?? [])])]
      for (const a of source.apps) a.candidate = c
      return { id: c.id }
    }
    if (m[2] === '/invite' && method === 'POST') {
      if (!apps.some(a => a.talentPoolConsent)) return fail(409, 'Esta pessoa não autorizou contato pelo banco de talentos.')
      c.invitedAt = new Date().toISOString()
      return { ok: true }
    }
  }
  m = p.match(/^\/applications\/([^/]+)(\/stage|\/notes|\/hire)?$/)
  if (m) {
    const a = findApplication(m[1])
    if (!a) return fail(404, 'Candidatura não encontrada.')
    const job = internalJobs.find(j => j.id === a.jobId)
    if (!m[2] && method === 'GET') {
      const others = [...applicationsByJob.values()].flat().filter(x => x.candidate.email === a.candidate.email && x.id !== a.id)
      return { ...a, otherApplications: others.map(o => ({ id: o.id, jobTitle: o.jobTitle, stage: o.status === 'open' ? STAGES.find(s => s.id === o.stageId)?.name : o.status === 'hired' ? 'Contratado' : 'Recusado', createdAt: o.createdAt })) }
    }
    if (!m[2] && method === 'PATCH') { a.rating = payload?.rating ?? null; return { id: a.id, rating: a.rating } }
    if (m[2] === '/notes' && method === 'POST') { const note = { id: `note-${Date.now()}`, body: payload.body, authorName: 'Administrador DEMO', createdAt: new Date().toISOString() }; a.notes.unshift(note); return { ...note, __status: 201 } }
    if (m[2] === '/hire' && method === 'POST') {
      if (a.status !== 'open') return fail(409, 'Só candidaturas em andamento podem ser contratadas.')
      if (a.stageId === STAGES[0].id) return fail(409, 'Mova o candidato para além da etapa Cadastro do candidato antes de contratar.')
      if (employees.some(e => e.registration === payload.registration)) return fail(409, 'Já existe um colaborador com esta matrícula com este valor.')
      const employeeId = `hired-${Date.now()}`
      employees.unshift({ ...employees[0], id: employeeId, registration: payload.registration, fullName: payload.fullName, email: payload.email, hireDate: payload.hireDate, contractType: payload.contractType, status: 'active' })
      applicationsByJob.set(a.jobId, applicationsByJob.get(a.jobId).filter(x => x.id !== a.id))
      job.hiredCount += 1
      job.counts.hired += 1
      recount(job)
      return { employeeId, suggestCloseJob: job.hiredCount >= job.openings, __status: 201 }
    }
    if (m[2] === '/stage' && method === 'POST') {
      if (a.status === 'hired') return fail(409, 'Candidato já contratado: a candidatura não muda mais de etapa.')
      const now = new Date().toISOString()
      if (payload?.stageId) {
        const to = STAGES.find(s => s.id === payload.stageId)
        if (!to) return fail(404, 'Etapa não encontrada.')
        const fromLabel = a.status === 'open' ? STAGES.find(s => s.id === a.stageId)?.name : null
        a.events.push({ id: `ev-${Date.now()}`, fromLabel, toLabel: to.name, outcome: a.status === 'rejected' ? 'reopened' : null, note: null, actorName: 'Administrador DEMO', createdAt: now })
        a.status = 'open'; a.stageId = to.id; a.rejectionReason = null
      } else if (payload?.outcome === 'rejected') {
        if (!payload.reason || payload.reason.trim().length < 3) return fail(400, 'Explique o motivo da recusa.')
        a.events.push({ id: `ev-${Date.now()}`, fromLabel: STAGES.find(s => s.id === a.stageId)?.name ?? null, toLabel: null, outcome: 'rejected', note: payload.reason, actorName: 'Administrador DEMO', createdAt: now })
        a.status = 'rejected'; a.stageId = null; a.rejectionReason = payload.reason
      }
      if (job) recount(job)
      return { ok: true }
    }
  }
  m = p.match(/^\/candidate-files\/([^/]+)\/download$/)
  if (m && method === 'GET') {
    const a = [...applicationsByJob.values()].flat().find(x => x.file?.id === m[1])
    if (!a) return fail(404, 'Arquivo não encontrado.')
    if (a.file.scanStatus === 'pending') return fail(409, 'O currículo ainda está em verificação de segurança.')
    return { url: 'data:application/pdf;base64,JVBERi0xLjQKJSVFT0YK' }
  }
  return undefined
}

const publicJobView = j => ({ token: j.shareToken, title: j.title, city: 'Camaçari', state: 'BA', workMode: j.workMode, contractType: j.contractType, departmentName: deptName(j.departmentId),
  salary: j.showSalary && (j.salaryMin != null || j.salaryMax != null) ? { min: j.salaryMin ?? null, max: j.salaryMax ?? null } : null,
  description: j.description, requirements: j.requirements ?? '', benefits: j.benefits ?? '', publishedAt: j.publishedAt })

function publicRoute(method, p) {
  const [, slug, kind, token, extra] = p.split('/')
  if (slug === 'privacy') return { ok: true }
  if (slug !== 'falcao') return null
  if (method === 'POST' && kind === 'jobs' && extra === 'applications') return { ok: true, __status: 201 }
  if (kind === 'jobs' && !token) return { company: { name: 'Falcão Construções e Engenharia' }, page: careerPublished.content, jobs: internalJobs.filter(j => j.status === 'published' && j.visibility === 'public').sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')).map(publicJobView) }
  if (kind === 'jobs') {
    const job = internalJobs.find(j => j.shareToken === token && (j.status === 'published' || j.status === 'paused'))
    return job ? { ...publicJobView(job), questions: job.questions, accepting: job.status === 'published' } : null
  }
  return null
}

// Editor da página: rascunho separado do publicado.
const careerPublished = { content: careerPage, at: new Date(Date.now() - 3 * 86400000).toISOString() }
let careerDraft = structuredClone(careerPage)
function careerEditor(method, p, payload) {
  if (p === '/career-page' && method === 'GET') return { draft: careerDraft, published: careerPublished.content, publishedAt: careerPublished.at, previewUrl: 'http://localhost:5173/vagas/falcao' }
  if (p === '/career-page' && method === 'PUT') { careerDraft = payload; return { draft: careerDraft, published: careerPublished.content, publishedAt: careerPublished.at, previewUrl: 'http://localhost:5173/vagas/falcao' } }
  if (p === '/career-page/publish' && method === 'POST') { careerPublished.content = structuredClone(careerDraft); careerPublished.at = new Date().toISOString(); return { draft: careerDraft, published: careerPublished.content, publishedAt: careerPublished.at, previewUrl: 'http://localhost:5173/vagas/falcao' } }
  return undefined
}

let portal
function route(method, path, q, payload) {
  if (path === '/api/auth/get-session') return { session: { token: 'cur', id: 's1' }, user: { id: 'u-admin', name: me.user.name, email: me.user.email, twoFactorEnabled: true } }
  if (path === '/api/auth/list-sessions') return [
    { id: 's1', token: 'cur', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130', ipAddress: '177.10.20.30', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 's2', token: 'other', userAgent: 'Mozilla/5.0 (iPhone) Safari/604', ipAddress: '177.10.20.31', createdAt: new Date(Date.now() - 86400000 * 2).toISOString(), updatedAt: new Date().toISOString() },
  ]
  if (path.startsWith('/api/auth/sign-in')) return { user: me.user }
  if (path.startsWith('/api/auth')) return {}
  if (path.startsWith('/api/public/v1/')) return publicRoute(method, path.replace('/api/public/v1', ''))
  const p = path.replace('/api/v1', '')
  portal ??= portalRoutes({ employees, jobs: internalJobs, findApplication: id => [...applicationsByJob.values()].flat().find(a => a.candidate.id === id) })
  const portalResult = portal(method, p, payload, q)
  if (portalResult !== undefined) return portalResult
  const boardResult = boardRoute(method, p, payload, q)
  if (boardResult !== undefined) return boardResult
  const jobs = jobsRoute(method, p, payload, q)
  if (jobs !== undefined) return jobs
  const editor = careerEditor(method, p, payload)
  if (editor !== undefined) return editor
  if (method !== 'GET') return {}
  if (p === '/me') return me
  if (p === '/dashboard') return dashboard
  if (p === '/notifications') return notifications
  if (p === '/departments') return deptFull
  if (p === '/units') return UNITS
  if (p === '/positions') return POSITIONS.map((t, i) => ({ id: `p${i}`, title: t, cbo: `7152-${10 + i}`, level: pick(['Júnior', 'Pleno', 'Sênior'], i) }))
  if (p === '/cost-centers') return [{ id: 'c1', code: '1.01', name: 'Administrativo' }, { id: 'c2', code: '1.02', name: 'Obras Camaçari' }, { id: 'c3', code: '1.03', name: 'Obras Industriais' }]
  if (p === '/employees') {
    let list = employees
    if (q.get('q')) list = list.filter(e => e.fullName.toLowerCase().includes(q.get('q').toLowerCase()))
    if (q.get('status')) list = list.filter(e => e.status === q.get('status'))
    if (q.get('departmentId')) list = list.filter(e => e.departmentId === q.get('departmentId'))
    const size = Number(q.get('pageSize') ?? 25), page = Number(q.get('page') ?? 1)
    return { items: list.slice((page - 1) * size, page * size), total: list.length, page, pageSize: size }
  }
  if (/^\/employees\/[^/]+\/vacation-balance$/.test(p) || p === '/me/vacation-balance') return balance
  if (/^\/employees\/[^/]+$/.test(p)) return detail(employees.find(e => e.id === p.split('/')[2]) ?? employees[0])
  if (p === '/me/employee') return detail(employees[0])
  if (p === '/requests') return q.get('awaitingMe') ? requests.filter(r => r.status === 'pending') : q.get('status') ? requests.filter(r => r.status === q.get('status')) : requests
  if (p === '/me/requests') return requests.slice(0, 4)
  if (/^\/requests\/[^/]+$/.test(p)) {
    const r = requests.find(x => x.id === p.split('/')[2]) ?? requests[0]
    return { ...r, documentId: null, decidedAt: null, canDecide: r.status === 'pending', canCancel: false, steps: [
      { id: 's1', position: 1, approverKind: 'manager', approverName: 'Otávio Nogueira Queiroz', status: 'approved', decidedByName: 'Otávio Nogueira Queiroz', decidedAt: new Date().toISOString(), comment: 'Ok, equipe coberta.' },
      { id: 's2', position: 2, approverKind: 'hr', approverName: null, status: r.status === 'pending' ? 'pending' : 'approved', decidedByName: 'Larissa Duarte', decidedAt: new Date().toISOString(), comment: null },
    ] }
  }
  if (p === '/calendar') return requests.filter(r => r.status !== 'cancelled' && r.status !== 'rejected')
  if (p === '/documents' || p === '/me/documents') return documents
  if (/^\/documents\/[^/]+$/.test(p)) { const d = documents.find(x => x.id === p.split('/')[2]) ?? documents[0]; return { ...d, versions: Array.from({ length: d.currentVersion }, (_, i) => ({ version: d.currentVersion - i, filename: d.filename, mimeType: d.mimeType, sizeBytes: d.sizeBytes, uploadedByName: 'Larissa Duarte', createdAt: new Date().toISOString() })) } }
  if (p === '/document-categories') return categories
  if (p === '/settings') return { name: 'Falcão Construções (DEMO)', legalName: 'Falcão Construções e Engenharia LTDA', cnpj: '12.345.678/0001-90', requireMfaFor: ['admin', 'hr'] }
  if (p === '/approval-flows') return [{ id: 'f1', requestType: 'vacation', departmentId: null, departmentName: null, steps: ['manager', 'hr'] }, { id: 'f2', requestType: 'absence', departmentId: '0b0c0d0e-0000-4000-8000-000000000002', departmentName: 'Obras', steps: ['manager'] }]
  if (p === '/members') return [
    { id: 'm1', userId: 'u-admin', name: me.user.name, email: me.user.email, role: 'admin', status: 'active', employeeId: 'e1', employeeName: employees[0].fullName, createdAt: '2025-01-10' },
    { id: 'm2', userId: 'u2', name: 'Larissa Duarte', email: 'rh@demo.falcao.invalid', role: 'hr', status: 'active', employeeId: 'e2', employeeName: employees[1].fullName, createdAt: '2025-02-03' },
    { id: 'm3', userId: 'u3', name: 'Otávio Nogueira Queiroz', email: 'gestor@demo.falcao.invalid', role: 'manager', status: 'active', employeeId: 'e3', employeeName: employees[2].fullName, createdAt: '2025-03-21' },
    { id: 'm4', userId: 'u4', name: 'Bruno Rezende Ferraz', email: 'colaborador@demo.falcao.invalid', role: 'employee', status: 'disabled', employeeId: null, employeeName: null, createdAt: '2025-06-12' },
  ]
  return null
}

// ---------- imagens da página de vagas (binário, fora do roteador JSON) ----------
const careerAssets = new Map()
const sniffImage = b =>
  b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : null
const filePart = (buffer, contentType) => {
  const boundary = '--' + /boundary=(.+)$/.exec(contentType)?.[1]
  const start = buffer.indexOf('filename=')
  if (start < 0) return null
  const dataStart = buffer.indexOf('\r\n\r\n', start) + 4
  const dataEnd = buffer.indexOf('\r\n' + boundary, dataStart)
  return buffer.subarray(dataStart, dataEnd)
}
const publishedImageIds = () => {
  const c = careerPublished.content
  return c ? [c.hero.imageId, ...(c.about.imageIds ?? [])].filter(Boolean) : []
}
const assetHandler = (req, url, buffer, res) => {
  const json = (status, body) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); return true }
  const image = asset => { res.setHeader('content-type', asset.type); res.setHeader('cache-control', 'public, max-age=300'); res.end(asset.bytes); return true }
  if (req.method === 'POST' && url.pathname === '/api/v1/career-page/assets') {
    const bytes = filePart(buffer, req.headers['content-type'] ?? '')
    const type = bytes && sniffImage(bytes)
    if (!type) return json(400, { code: 'bad_request', message: 'Envie uma imagem PNG, JPEG ou WebP.' })
    if (bytes.length > 5 * 1024 * 1024) return json(413, { code: 'file_too_large', message: 'A imagem passa de 5 MB.' })
    const id = crypto.randomUUID()
    careerAssets.set(id, { type, bytes: Buffer.from(bytes) })
    return json(201, { id, url: `/api/v1/mock-files/${id}` })
  }
  let m = /^\/api\/v1\/career-page\/assets\/([\w-]+)$/.exec(url.pathname)
  if (req.method === 'GET' && m) return careerAssets.has(m[1]) ? json(200, { url: `/api/v1/mock-files/${m[1]}` }) : json(404, { message: 'Imagem não encontrada.' })
  m = /^\/api\/v1\/mock-files\/([\w-]+)$/.exec(url.pathname)
  if (req.method === 'GET' && m) return careerAssets.has(m[1]) ? image(careerAssets.get(m[1])) : json(404, { message: 'Imagem não encontrada.' })
  m = /^\/api\/public\/v1\/[\w-]+\/assets\/([\w-]+)$/.exec(url.pathname)
  if (req.method === 'GET' && m) return careerAssets.has(m[1]) && publishedImageIds().includes(m[1]) ? image(careerAssets.get(m[1])) : json(404, { message: 'Imagem não encontrada.' })
  return false
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (assetHandler(req, url, Buffer.concat(chunks), res)) return
  const raw = Buffer.concat(chunks).toString('utf8')
  let payload = null
  if ((req.headers['content-type'] ?? '').includes('application/json')) try { payload = JSON.parse(raw) } catch {}
  const body = route(req.method, url.pathname, url.searchParams, payload)
  res.setHeader('content-type', 'application/json')
  if (body === JSON_NULL) return res.end('null')
  if (body && body.__status) { res.statusCode = body.__status; delete body.__status }
  if (body === null) { res.statusCode = 404; return res.end(JSON.stringify({ message: 'not found' })) }
  res.end(JSON.stringify(body))
}).listen(3333, '127.0.0.1', () => console.log('mock api on 3333'))
