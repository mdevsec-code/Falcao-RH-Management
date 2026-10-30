/**
 * Massa de DEMONSTRAÇÃO. Todos os dados são FICTÍCIOS (nomes gerados, CPFs
 * válidos apenas no formato, e-mails em domínio .invalid) e a organização
 * leva "(DEMO)" no nome. Usada pelo seed de desenvolvimento e pelos testes.
 */
import { eq } from 'drizzle-orm'

import type { Auth } from '../auth/auth'
import type { Database } from './client'
import { ensureDefaultCategories } from '../modules/documents/documents.service'
import { addMember, createTenant, createUserWithPassword } from './provision'
import { costCenters, departments, employeeEvents, employees, memberships, positions, tenants, units } from './schema'

export const seedDemo = async (db: Database, auth: Auth, admin_: { email: string; password: string }) => {
  const SLUG = 'falcao-demo'
  const [existing] = await db.select().from(tenants).where(eq(tenants.slug, SLUG))
  if (existing) return null

  // Gerador determinístico: a mesma massa a cada execução.
  let state = 42
  const random = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]!

  const cpf = (n: number) => {
    const base = String(200_000_000 + n * 7919).slice(0, 9)
    const digit = (d: string) => {
      let sum = 0
      for (let i = 0; i < d.length; i++) sum += Number(d[i]) * (d.length + 1 - i)
      const rest = (sum * 10) % 11
      return rest === 10 ? 0 : rest
    }
    const first = digit(base)
    return `${base}${first}${digit(base + first)}`
  }
  const isoDate = (date: Date) => date.toISOString().slice(0, 10)
  const daysAgo = (days: number) => isoDate(new Date(Date.now() - days * 86_400_000))

  const tenant = await createTenant(db, { name: 'Falcão Construções e Engenharia (DEMO)', slug: SLUG })
  const T = tenant.id

  const unitRows = await db
    .insert(units)
    .values([
      { tenantId: T, name: 'Sede Administrativa', code: 'SEDE', city: 'São Paulo', state: 'SP' },
      { tenantId: T, name: 'Canteiro Residencial Norte', code: 'OBR-01', city: 'Guarulhos', state: 'SP' },
      { tenantId: T, name: 'Canteiro Industrial', code: 'OBR-02', city: 'Campinas', state: 'SP' },
    ])
    .returning()
  const ccRows = await db
    .insert(costCenters)
    .values([
      { tenantId: T, code: '1.01', name: 'Administrativo' },
      { tenantId: T, code: '2.01', name: 'Obras Residenciais' },
      { tenantId: T, code: '2.02', name: 'Obras Industriais' },
    ])
    .returning()

  const positionTitles = [
    'Diretor de Operações', 'Engenheiro Civil', 'Técnico de Segurança do Trabalho', 'Mestre de Obras',
    'Pedreiro', 'Eletricista', 'Analista de RH', 'Analista Financeiro', 'Comprador', 'Auxiliar Administrativo',
  ] as const
  const positionRows = await db
    .insert(positions)
    .values(positionTitles.map(title => ({ tenantId: T, title })))
    .returning()
  const position = (title: (typeof positionTitles)[number]) => positionRows.find(p => p.title === title)!.id

  const deptSpecs = [
    ['Diretoria', null, 0, 0],
    ['Engenharia', 'Diretoria', 0, 1],
    ['Obras', 'Engenharia', 1, 1],
    ['Segurança do Trabalho', 'Engenharia', 1, 1],
    ['Recursos Humanos', 'Diretoria', 0, 0],
    ['Financeiro', 'Diretoria', 0, 0],
    ['Suprimentos', 'Diretoria', 0, 0],
  ] as const
  const deptIds: Record<string, string> = {}
  for (const [name, parentName, unitIndex, ccIndex] of deptSpecs) {
    const [row] = await db
      .insert(departments)
      .values({
        tenantId: T,
        name,
        parentId: parentName ? deptIds[parentName] : null,
        unitId: unitRows[unitIndex]!.id,
        costCenterId: ccRows[ccIndex]!.id,
      })
      .returning()
    deptIds[name] = row!.id
  }

  const first = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabriela', 'Heitor', 'Isabela', 'João', 'Larissa', 'Marcos', 'Natália', 'Otávio', 'Paula', 'Rafael', 'Sabrina', 'Tiago', 'Vanessa', 'Wesley']
  const last = ['Almeida', 'Barbosa', 'Cardoso', 'Duarte', 'Esteves', 'Ferraz', 'Gomes', 'Hidalgo', 'Lacerda', 'Moreira', 'Nogueira', 'Pacheco', 'Queiroz', 'Rezende', 'Teixeira']

  const roster: [string, (typeof positionTitles)[number], number][] = [
    ['Diretoria', 'Diretor de Operações', 1],
    ['Engenharia', 'Engenheiro Civil', 4],
    ['Obras', 'Mestre de Obras', 2],
    ['Obras', 'Pedreiro', 14],
    ['Obras', 'Eletricista', 5],
    ['Segurança do Trabalho', 'Técnico de Segurança do Trabalho', 3],
    ['Recursos Humanos', 'Analista de RH', 3],
    ['Financeiro', 'Analista Financeiro', 3],
    ['Suprimentos', 'Comprador', 2],
    ['Suprimentos', 'Auxiliar Administrativo', 2],
  ]

  let n = 0
  const created: { id: string; dept: string }[] = []
  for (const [dept, title, quantity] of roster) {
    for (let i = 0; i < quantity; i++) {
      n++
      const hire = daysAgo(Math.floor(random() * 2200) + 20)
      const terminated = n % 11 === 0
      const onLeave = !terminated && n % 13 === 0
      const birth = new Date(Date.UTC(1965 + Math.floor(random() * 38), Math.floor(random() * 12), 1 + Math.floor(random() * 27)))
      const [row] = await db
        .insert(employees)
        .values({
          tenantId: T,
          registration: String(1000 + n),
          fullName: `${pick(first)} ${pick(last)} ${pick(last)}`,
          cpf: cpf(n),
          birthDate: isoDate(birth),
          email: `colaborador${n}@demo.falcao.invalid`,
          departmentId: deptIds[dept],
          positionId: position(title),
          unitId: unitRows[deptSpecs.find(d => d[0] === dept)![2]]!.id,
          costCenterId: ccRows[deptSpecs.find(d => d[0] === dept)![3]]!.id,
          hireDate: hire,
          contractType: title === 'Pedreiro' && n % 4 === 0 ? 'temporario' : 'clt',
          status: terminated ? 'terminated' : onLeave ? 'on_leave' : 'active',
          terminationDate: terminated ? daysAgo(Math.floor(random() * 300)) : null,
          workSchedule: dept === 'Obras' ? '07:00–16:48, seg. a sex.' : '08:00–17:48, seg. a sex.',
        })
        .returning()
      created.push({ id: row!.id, dept })
      await db.insert(employeeEvents).values({ tenantId: T, employeeId: row!.id, type: 'hired', effectiveDate: hire })
    }
  }

  // O primeiro de cada departamento passa a gestor do departamento e da equipe.
  for (const [dept] of deptSpecs) {
    const team = created.filter(c => c.dept === dept)
    const head = team[0]
    if (!head) continue
    await db.update(departments).set({ managerEmployeeId: head.id }).where(eq(departments.id, deptIds[dept]!))
    for (const member of team.slice(1))
      await db.update(employees).set({ managerId: head.id }).where(eq(employees.id, member.id))
  }

  const admin = await createUserWithPassword(auth, { name: 'Administrador DEMO', email: admin_.email, password: admin_.password })
  await addMember(db, { tenantId: T, userId: admin.id, role: 'admin' })

  return { tenantId: T, employees: n }
}

/**
 * Um usuário de cada perfil na organização DEMO, para ver a diferença entre
 * as visões: RH, gestor (o gestor do departamento Obras) e colaborador (uma
 * pessoa da equipe dele). Idempotente.
 */
export const seedDemoProfiles = async (db: Database, auth: Auth, password: string) => {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'falcao-demo'))
  if (!tenant) return []
  await ensureDefaultCategories(db, tenant.id)
  const [obras] = await db.select().from(departments).where(eq(departments.name, 'Obras'))
  const team = obras
    ? await db.select().from(employees).where(eq(employees.departmentId, obras.id)).orderBy(employees.registration)
    : []
  const manager = obras?.managerEmployeeId ?? null
  const worker = team.find(e => e.id !== manager && e.status === 'active')?.id ?? null

  const profiles = [
    { email: 'rh@demo.falcao.invalid', name: 'Analista de RH DEMO', role: 'hr' as const, employeeId: null },
    { email: 'gestor@demo.falcao.invalid', name: 'Gestor de Obras DEMO', role: 'manager' as const, employeeId: manager },
    { email: 'colaborador@demo.falcao.invalid', name: 'Colaborador DEMO', role: 'employee' as const, employeeId: worker },
  ]
  for (const profile of profiles) {
    const user = await createUserWithPassword(auth, { name: profile.name, email: profile.email, password })
    await db
      .insert(memberships)
      .values({ tenantId: tenant.id, userId: user.id, role: profile.role, employeeId: profile.employeeId })
      .onConflictDoNothing()
  }
  return profiles.map(p => p.email)
}
