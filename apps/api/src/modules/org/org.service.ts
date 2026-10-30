import { and, asc, count, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import type {
  CostCenterInput,
  DepartmentInput,
  PositionInput,
  UnitInput,
} from '@falcao-rh/contracts'

import type { Tx } from '../../db/client'
import { rowsOf } from '../../db/rows'
import { costCenters, departments, employees, positions, units } from '../../db/schema'
import type { Ctx } from '../../http/context'
import { audit, changedKeys } from '../../lib/audit'
import { badRequest, notFound } from '../../lib/errors'

// Unidades, centros de custo e cargos têm o mesmo ciclo de vida: um CRUD
// genérico sobre a tabela, auditado. O RLS garante o tenant; o `tenantId`
// explícito no insert é exigido pelo WITH CHECK da política.

type SimpleTable = typeof units | typeof costCenters | typeof positions

const simpleCrud = <T extends SimpleTable, I extends Record<string, unknown>>(
  table: T,
  entity: string,
  label: string,
  orderBy: (t: T) => Parameters<typeof asc>[0],
) => ({
  list: (tx: Tx) => tx.select().from(table as SimpleTable).orderBy(asc(orderBy(table))),

  create: async (tx: Tx, ctx: Ctx, input: I) => {
    const [row] = await tx
      .insert(table as SimpleTable)
      .values({ ...input, tenantId: ctx.tenantId } as never)
      .returning()
    await audit(tx, ctx, { action: 'create', entity, entityId: row!.id })
    return row!
  },

  update: async (tx: Tx, ctx: Ctx, id: string, input: I) => {
    const [before] = await tx.select().from(table as SimpleTable).where(eq((table as SimpleTable).id, id))
    if (!before) throw notFound(label)
    const [row] = await tx
      .update(table as SimpleTable)
      .set(input as never)
      .where(eq((table as SimpleTable).id, id))
      .returning()
    await audit(tx, ctx, {
      action: 'update',
      entity,
      entityId: id,
      changedFields: changedKeys(before as never, input),
    })
    return row!
  },

  remove: async (tx: Tx, ctx: Ctx, id: string) => {
    const deleted = await tx
      .delete(table as SimpleTable)
      .where(eq((table as SimpleTable).id, id))
      .returning({ id: (table as SimpleTable).id })
    if (deleted.length === 0) throw notFound(label)
    await audit(tx, ctx, { action: 'delete', entity, entityId: id })
  },
})

export const unitService = simpleCrud<typeof units, UnitInput>(units, 'unit', 'Unidade', t => t.name)
export const costCenterService = simpleCrud<typeof costCenters, CostCenterInput>(
  costCenters,
  'cost_center',
  'Centro de custo',
  t => t.code,
)
export const positionService = simpleCrud<typeof positions, PositionInput>(
  positions,
  'position',
  'Cargo',
  t => t.title,
)

// ---------- departamentos ----------

const manager = alias(employees, 'manager')
const parent = alias(departments, 'parent')

export const listDepartments = async (tx: Tx) => {
  const headcount = tx
    .select({ departmentId: employees.departmentId, total: count().as('total') })
    .from(employees)
    .where(sql`${employees.status} <> 'terminated'`)
    .groupBy(employees.departmentId)
    .as('headcount')

  return tx
    .select({
      id: departments.id,
      name: departments.name,
      code: departments.code,
      parentId: departments.parentId,
      parentName: parent.name,
      managerEmployeeId: departments.managerEmployeeId,
      managerName: manager.fullName,
      unitId: departments.unitId,
      unitName: units.name,
      costCenterId: departments.costCenterId,
      costCenterName: costCenters.name,
      headcount: sql<number>`coalesce(${headcount.total}, 0)::int`,
    })
    .from(departments)
    .leftJoin(parent, eq(parent.id, departments.parentId))
    .leftJoin(manager, eq(manager.id, departments.managerEmployeeId))
    .leftJoin(units, eq(units.id, departments.unitId))
    .leftJoin(costCenters, eq(costCenters.id, departments.costCenterId))
    .leftJoin(headcount, eq(headcount.departmentId, departments.id))
    .orderBy(asc(departments.name))
}

/** Impede ciclos: o novo pai não pode ser o próprio departamento nem um descendente. */
const assertNoCycle = async (tx: Tx, id: string, parentId: string | null | undefined) => {
  if (!parentId) return
  if (parentId === id) throw badRequest('Um departamento não pode ser subordinado a si mesmo.')
  const result = await tx.execute(sql`
    with recursive chain as (
      select id, parent_id from departments where id = ${parentId}
      union all
      select d.id, d.parent_id from departments d join chain c on d.id = c.parent_id
    )
    select exists(select 1 from chain where id = ${id}) as found
  `)
  if (rowsOf<{ found: boolean }>(result)[0]?.found) throw badRequest('Essa subordinação criaria um ciclo na hierarquia.')
}

export const createDepartment = async (tx: Tx, ctx: Ctx, input: DepartmentInput) => {
  const [row] = await tx
    .insert(departments)
    .values({ ...input, tenantId: ctx.tenantId })
    .returning()
  await audit(tx, ctx, { action: 'create', entity: 'department', entityId: row!.id })
  return row!
}

export const updateDepartment = async (tx: Tx, ctx: Ctx, id: string, input: DepartmentInput) => {
  const [before] = await tx.select().from(departments).where(eq(departments.id, id))
  if (!before) throw notFound('Departamento')
  await assertNoCycle(tx, id, input.parentId)
  const [row] = await tx.update(departments).set(input).where(eq(departments.id, id)).returning()
  await audit(tx, ctx, {
    action: 'update',
    entity: 'department',
    entityId: id,
    changedFields: changedKeys(before, input),
  })
  return row!
}

export const deleteDepartment = async (tx: Tx, ctx: Ctx, id: string) => {
  const [inUse] = await tx
    .select({ total: count() })
    .from(employees)
    .where(and(eq(employees.departmentId, id), sql`${employees.status} <> 'terminated'`))
  if ((inUse?.total ?? 0) > 0)
    throw badRequest('Há colaboradores ativos neste departamento. Transfira-os antes de excluir.')
  const deleted = await tx.delete(departments).where(eq(departments.id, id)).returning({ id: departments.id })
  if (deleted.length === 0) throw notFound('Departamento')
  await audit(tx, ctx, { action: 'delete', entity: 'department', entityId: id })
}
