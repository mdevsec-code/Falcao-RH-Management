// Rotas do servidor de teste para as telas novas: benefícios VA/VR, mobilidade,
// painel de R&S e link de admissão. Dados fictícios, em memória.
export const JSON_NULL = { __null: true }

export function portalRoutes({ employees, jobs, findApplication }) {
  const today = new Date()
  const month = (offset = 0) => new Date(today.getFullYear(), today.getMonth() + offset, 1).toLocaleDateString('en-CA').slice(0, 7)
  const iso = days => new Date(Date.now() + days * 86400000).toISOString()
  const active = employees.filter(e => e.status !== 'terminated')

  // ---------- benefícios ----------
  const plans = [
    { id: 'bp1', kind: 'va', name: 'Caju Alimentação', provider: 'Caju', valueType: 'monthly', active: true, currentValueCents: 65000 },
    { id: 'bp2', kind: 'vr', name: 'Caju Refeição', provider: 'Caju', valueType: 'daily', active: true, currentValueCents: 3500 },
    { id: 'bp3', kind: 'vr', name: 'Refeição (contrato antigo)', provider: 'Pluxee', valueType: 'daily', active: false, currentValueCents: 3000 },
  ].map(p => ({ ...p, scheduled: [], history: [{ valueCents: p.currentValueCents, effectiveFrom: `${month(-6)}-01`, createdAt: iso(-180) }] }))
  const enrollments = new Map(active.map((e, i) => [e.id, i % 5 === 4 ? null : plans[i % 2]]))
  const planView = p => ({ ...p, employees: [...enrollments.values()].filter(x => x?.id === p.id).length })
  const employeeRow = e => {
    const plan = enrollments.get(e.id) ?? null
    return { employeeId: e.id, registration: e.registration, fullName: e.fullName, departmentName: e.departmentName, planId: plan?.id ?? null, planName: plan?.name ?? null, kind: plan?.kind ?? null, startDate: plan ? e.hireDate : null }
  }
  const items = () =>
    active.filter(e => enrollments.get(e.id)).map((e, i) => {
      const plan = enrollments.get(e.id)
      const deductedDays = i % 7 === 3 ? 2 : 0
      const days = 22 - deductedDays
      return {
        id: `it-${e.id}`, employeeId: e.id, registration: e.registration, fullName: e.fullName, planName: plan.name, kind: plan.kind, valueType: plan.valueType,
        unitValueCents: plan.currentValueCents, eligibleDays: 22, deductedDays, days,
        amountCents: plan.valueType === 'daily' ? plan.currentValueCents * days : plan.currentValueCents, adjusted: false, note: deductedDays ? 'Faltas descontadas' : '',
      }
    })
  const runs = [
    { id: 'run-1', competence: month(-1), workdays: 22, status: 'closed', closedAt: iso(-20), items: items() },
    { id: 'run-2', competence: month(0), workdays: 22, status: 'draft', closedAt: null, items: items() },
  ]
  const runSummary = ({ items: list, ...r }) => ({
    ...r,
    people: list.length,
    amountCents: list.reduce((s, x) => s + x.amountCents, 0),
    byKind: ['va', 'vr'].map(kind => ({ kind, people: list.filter(x => x.kind === kind).length, amountCents: list.filter(x => x.kind === kind).reduce((s, x) => s + x.amountCents, 0) })),
  })

  // ---------- mobilidade ----------
  const routes = [
    { id: 'rt1', name: 'Rota 01 · Camaçari Centro', vehicle: 'Ônibus 46 lugares', capacity: 46, driver: 'José Ribeiro', shift: '1º turno' },
    { id: 'rt2', name: 'Rota 02 · Lauro de Freitas', vehicle: 'Micro-ônibus 28 lugares', capacity: 28, driver: 'Antônio Matos', shift: '1º turno' },
    { id: 'rt3', name: 'Rota 03 · Dias d’Ávila', vehicle: 'Van 15 lugares', capacity: 15, driver: 'Carla Souza', shift: '2º turno' },
  ]
  const CITIES = [['Camaçari', 'Centro'], ['Camaçari', 'Gleba A'], ['Lauro de Freitas', 'Itinga'], ['Dias d’Ávila', 'Centro'], ['Salvador', 'Cajazeiras'], ['Simões Filho', 'CIA']]
  const MODES = ['chartered', 'chartered', 'mobility', 'own', 'chartered', 'none', null]
  const board = employees.map((e, i) => {
    const [city, district] = CITIES[i % CITIES.length]
    const mode = MODES[i % MODES.length]
    const route = mode === 'chartered' ? routes[i % routes.length] : null
    return {
      employeeId: e.id, registration: e.registration, fullName: e.fullName, status: e.status, departmentName: e.departmentName, positionTitle: e.positionTitle,
      homeCity: city, homeDistrict: district, mode, provider: mode === 'mobility' ? 'Caju' : mode === 'chartered' ? 'Transportadora Litoral' : null,
      routeId: route?.id ?? null, routeName: route?.name ?? null, pickupPoint: route ? `Ponto ${(i % 6) + 1}` : null, pickupDistrict: route ? district : null, pickupCity: route ? city : null,
      monthlyCostCents: mode === 'mobility' ? 32000 : mode === 'chartered' ? 41000 : null, notes: null,
    }
  })

  // ---------- painel de R&S ----------
  const insights = jobId => {
    const list = jobId ? jobs.filter(j => j.id === jobId) : jobs
    const STAGES = ['Cadastro do candidato', 'Triagem', 'Entrevista/agendamento', 'Teste prático', 'Pesquisa de referência', 'Exame admissional', 'Solicitação de documentos', 'Resultados da seleção', 'Admissão']
    const scale = jobId ? 1 : list.length || 1
    const stages = STAGES.map((name, i) => ({ id: `st-${i}`, name, current: Math.max(0, (9 - i) * scale - i), reached: Math.max(1, (10 - i) * 2 * scale), rejected: i ? Math.round(scale * (i % 3)) : 0 }))
    const applications = stages[0].reached
    const hired = 2 * scale
    return {
      totals: { applications, open: stages.reduce((s, x) => s + x.current, 0), hired, rejected: stages.reduce((s, x) => s + x.rejected, 0), openJobs: list.filter(j => j.status === 'published').length, openings: list.reduce((s, j) => s + (j.openings ?? 1), 0), conversionRate: hired / applications, avgDaysToHire: 18 },
      stages,
      monthly: [-5, -4, -3, -2, -1, 0].map((m, i) => ({ month: month(m), received: (8 + i * 3) * scale, hired: Math.round((i % 3) * scale * 0.6), rejected: (2 + i) * scale })),
      byJob: list.map((j, i) => ({ id: j.id, title: j.title, status: j.status, openings: j.openings ?? 1, hiredCount: i % 3, open: 4 + (i % 5), rejected: i % 4 })),
      recent: employees.slice(0, 8).map((e, i) => ({
        id: `ev${i}`, outcome: i === 0 ? 'hired' : i === 3 ? 'rejected' : null, fromLabel: i % 4 === 1 ? null : STAGES[i % 4], toLabel: STAGES[(i % 4) + 1],
        candidateName: e.fullName, jobTitle: list[i % (list.length || 1)]?.title ?? 'Vaga', createdAt: iso(-i * 0.4),
      })),
    }
  }

  const admissionLinks = new Map()

  // ---------- estrangeiros (triagem migratória) ----------
  const date = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
  const blank = { passport: '', rnm: '', visaType: '', visaExpiresAt: null, languages: '', consulate: '', regulatedProfession: false, authorizationPublishedAt: null, arrivalDate: null, rnmAppointmentAt: null, steps: {} }
  const doneSteps = (...keys) => Object.fromEntries(keys.map(k => [k, { status: 'done', date: null, note: '' }]))
  const DOCS = ['passport', 'criminal', 'qualification', 'translation']
  const AUTH = ['contract', 'company_docs', 'migranteweb', 'published']
  const VISA = ['visa_application', 'visa_issued']
  const foreignPeople = new Map(
    [
      ['fw-1', 'Wang Lei', 'Engenheiro de montagem', 'Pequim', true, { steps: doneSteps('passport', 'criminal'), }],
      ['fw-2', 'Chen Jing', 'Técnica em automação', 'Xangai', true, { steps: { ...doneSteps(...DOCS, 'contract', 'company_docs'), migranteweb: { status: 'in_progress', date: date(-12), note: 'Protocolo 08228.004512/2026-31' } } }],
      ['fw-3', 'Li Na', 'Supervisora de qualidade', 'Cantão', false, { authorizationPublishedAt: date(-20), steps: { ...doneSteps(...DOCS, ...AUTH), visa_application: { status: 'in_progress', date: date(-5), note: 'Agendado no consulado' } } }],
      ['fw-4', 'Zhang Wei', 'Soldador industrial', 'Xangai', false, { authorizationPublishedAt: date(-110), arrivalDate: date(-78), visaExpiresAt: date(290), steps: { ...doneSteps(...DOCS, ...AUTH, ...VISA, 'arrival', 'cpf'), rnm_precadastro: { status: 'in_progress', date: null, note: '' } } }],
      ['fw-5', 'Liu Yang', 'Eletricista de média tensão', 'Pequim', false, { authorizationPublishedAt: date(-140), arrivalDate: date(-96), visaExpiresAt: date(40), steps: doneSteps(...DOCS, ...AUTH, ...VISA, 'arrival', 'cpf', 'rnm_precadastro') }],
      ['fw-6', 'Huang Min', 'Engenheira civil', 'Hong Kong', true, { authorizationPublishedAt: date(-200), arrivalDate: date(-150), rnmAppointmentAt: date(-120), rnm: 'F123456-7', visaExpiresAt: date(500), steps: doneSteps(...DOCS, ...AUTH, ...VISA, 'arrival', 'cpf', 'rnm_precadastro', 'rnm_appointment', 'rnm_issued', 'ctps', 'crea', 'aso', 'esocial', 'passport_with_worker', 'role_matches_visa', 'lodging') }],
    ].map(([id, fullName, jobTitle, consulate, regulatedProfession, extra], i) => [
      id,
      {
        id, fullName, email: `${fullName.toLowerCase().replace(' ', '.')}@exemplo.cn`, phone: '+86 138 0000 000' + i, city: 'Camaçari', state: 'BA', jobTitle, stage: 'Solicitação de documentos',
        foreign: { ...blank, nationality: 'Chinesa', languages: 'Mandarim, inglês', passport: `E${70000000 + i * 1234}`, visaType: 'VITEM V (trabalho)', consulate, regulatedProfession, ...extra },
      },
    ]),
  )

  return (method, p, payload, q) => {
    let m
    // benefícios
    if (p === '/benefits/plans' && method === 'GET') return plans.map(planView)
    if (p === '/benefits/plans' && method === 'POST') { const plan = { id: `bp${plans.length + 1}`, ...payload, currentValueCents: payload.valueCents ?? null, scheduled: [], history: [] }; plans.push(plan); return planView(plan) }
    if ((m = /^\/benefits\/plans\/([\w-]+)(\/values)?$/.exec(p))) { const plan = plans.find(x => x.id === m[1]); if (!plan) return null; if (!m[2]) Object.assign(plan, payload ?? {}); else if (payload?.valueCents) plan.currentValueCents = payload.valueCents; return planView(plan) }
    if (p === '/benefits/employees' && method === 'GET') return active.map(employeeRow)
    if ((m = /^\/benefits\/employees\/([\w-]+)(\/end)?$/.exec(p))) {
      const e = employees.find(x => x.id === m[1]); if (!e) return null
      if (method === 'GET') { const plan = enrollments.get(e.id); return plan ? [{ id: `en-${e.id}`, planName: plan.name, kind: plan.kind, startDate: e.hireDate, endDate: null }] : [] }
      enrollments.set(e.id, m[2] ? null : plans.find(x => x.id === payload?.planId) ?? null)
      return employeeRow(e)
    }
    if (p === '/benefits/runs' && method === 'GET') return runs.map(runSummary).sort((a, b) => b.competence.localeCompare(a.competence))
    if (p === '/benefits/runs' && method === 'POST') { const run = { id: `run-${runs.length + 1}`, competence: payload?.competence ?? month(0), workdays: 22, status: 'draft', closedAt: null, items: items() }; runs.push(run); return { id: run.id } }
    if ((m = /^\/benefits\/runs\/([\w-]+)(?:\/(\w+))?(?:\/([\w-]+))?$/.exec(p))) {
      const run = runs.find(x => x.id === m[1]); if (!run) return null
      if (method === 'DELETE') { runs.splice(runs.indexOf(run), 1); return { ok: true } }
      if (m[2] === 'recalculate') run.items = items()
      if (m[2] === 'close') { run.status = 'closed'; run.closedAt = new Date().toISOString() }
      if (m[2] === 'reopen') { run.status = 'draft'; run.closedAt = null }
      if (m[2] === 'items' && m[3]) Object.assign(run.items.find(x => x.id === m[3]) ?? {}, payload ?? {}, { adjusted: true })
      if (m[2] === 'export') return { ok: true }
      const { items: list, ...rest } = run
      return { ...rest, items: list }
    }
    // mobilidade
    if (p === '/transport/board' && method === 'GET') return board
    if (p === '/transport/routes' && method === 'GET') return routes.map(r => ({ ...r, riders: board.filter(b => b.routeId === r.id).length }))
    if (p === '/transport/routes' && method === 'POST') { const r = { id: `rt${routes.length + 1}`, ...payload }; routes.push(r); return { ...r, riders: 0 } }
    if ((m = /^\/transport\/routes\/([\w-]+)$/.exec(p))) { const r = routes.find(x => x.id === m[1]); if (!r) return null; if (method === 'DELETE') routes.splice(routes.indexOf(r), 1); else Object.assign(r, payload ?? {}); return { ...r, riders: 0 } }
    if ((m = /^\/transport\/employees\/([\w-]+)$/.exec(p))) { const row = board.find(x => x.employeeId === m[1]); if (!row) return null; Object.assign(row, payload ?? {}); const route = routes.find(r => r.id === row.routeId); row.routeName = route?.name ?? null; return row }
    if (p.startsWith('/transport/import')) return { total: 0, created: 0, updated: 0, errors: [] }
    if (p === '/transport/export') return { ok: true }
    // painel de R&S
    if (p === '/recruitment/insights') return insights(q.get('jobId'))
    // admissão digital
    if ((m = /^\/employees\/([\w-]+)\/admission-link$/.exec(p))) {
      if (method === 'GET') return admissionLinks.get(m[1]) ?? JSON_NULL
      const link = { expiresAt: iso(7), submittedAt: null }
      admissionLinks.set(m[1], link)
      return { path: `/admissao/${m[1]}-demo`, expiresAt: link.expiresAt }
    }
    if (p === '/candidates/foreign' && method === 'GET') return [...foreignPeople.values()].sort((a, b) => a.fullName.localeCompare(b.fullName))
    if ((m = /^\/candidates\/([\w-]+)\/foreign$/.exec(p)) && method === 'PUT') {
      const id = m[1]
      if (!payload?.foreign) { foreignPeople.delete(id); return { id, foreign: null } }
      let person = foreignPeople.get(id)
      if (!person) {
        const a = findApplication?.(id)
        if (!a) return null
        person = { id, fullName: a.candidate.fullName, email: a.candidate.email, phone: a.candidate.phone, city: a.candidate.city, state: a.candidate.state, jobTitle: a.jobTitle ?? null, stage: null, foreign: { ...blank } }
        foreignPeople.set(id, person)
      }
      person.foreign = { ...blank, ...person.foreign, ...payload.foreign }
      return { id, foreign: person.foreign }
    }
    return undefined
  }
}
