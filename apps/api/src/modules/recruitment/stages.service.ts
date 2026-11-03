import { and, asc, count, eq, inArray } from 'drizzle-orm'

import { DEFAULT_STAGES, type StagesInput } from '@falcao-rh/contracts'

import type { Database, Tx } from '../../db/client'
import { applications, recruitmentStages } from '../../db/schema'
import type { Ctx } from '../../http/context'
import { audit } from '../../lib/audit'
import { AppError, badRequest } from '../../lib/errors'

/** Etapas iniciais de uma organização nova (operação de sistema, fora do RLS). */
export const ensureDefaultStages = async (db: Database | Tx, tenantId: string) => {
  const [existing] = await db
    .select({ id: recruitmentStages.id })
    .from(recruitmentStages)
    .where(eq(recruitmentStages.tenantId, tenantId))
    .limit(1)
  if (existing) return
  await db
    .insert(recruitmentStages)
    .values(DEFAULT_STAGES.map((name, position) => ({ tenantId, name, position, isInitial: position === 0 })))
}

/** Etapas da organização, na ordem, com quantas candidaturas em andamento cada uma tem. */
export const listStages = async (tx: Tx) => {
  const stages = await tx
    .select({
      id: recruitmentStages.id,
      name: recruitmentStages.name,
      position: recruitmentStages.position,
      isInitial: recruitmentStages.isInitial,
    })
    .from(recruitmentStages)
    .orderBy(asc(recruitmentStages.position))
  const open = await tx
    .select({ stageId: applications.stageId, total: count() })
    .from(applications)
    .where(eq(applications.status, 'open'))
    .groupBy(applications.stageId)
  const totals = new Map(open.map(row => [row.stageId, row.total]))
  return stages.map(stage => ({ ...stage, openApplications: totals.get(stage.id) ?? 0 }))
}

const INITIAL_FIRST = 'A etapa Novo é sempre a primeira.'

/**
 * Substitui a lista de etapas: renomeia e reordena as que vêm com `id`, cria
 * as sem `id` e remove as que ficaram de fora. A primeira posição é sempre a
 * etapa inicial, cujo nome não muda. Etapa com candidatura em andamento não
 * sai (409); as encerradas que estavam nela ficam sem etapa e o histórico
 * guarda o rótulo.
 */
export const replaceStages = async (tx: Tx, ctx: Ctx, input: StagesInput) => {
  // Trava a lista: duas edições simultâneas não se misturam.
  const current = await tx.select().from(recruitmentStages).orderBy(asc(recruitmentStages.position)).for('update')
  const initial = current.find(stage => stage.isInitial)
  if (!initial) throw new AppError(500, 'internal_error', 'Organização sem etapa inicial.')
  const byId = new Map(current.map(stage => [stage.id, stage]))

  const [first, ...rest] = input.stages
  if (first!.id && first!.id !== initial.id) throw badRequest(INITIAL_FIRST)
  const kept = new Set<string>()
  for (const item of rest) {
    if (!item.id) continue
    if (item.id === initial.id) throw badRequest(INITIAL_FIRST)
    if (!byId.has(item.id)) throw badRequest('Etapa não encontrada.')
    if (kept.has(item.id)) throw badRequest('Etapa repetida na lista.')
    kept.add(item.id)
  }

  const removed = current.filter(stage => !stage.isInitial && !kept.has(stage.id))
  if (removed.length) {
    const removedIds = removed.map(stage => stage.id)
    const busy = await tx
      .select({ stageId: applications.stageId })
      .from(applications)
      .where(and(eq(applications.status, 'open'), inArray(applications.stageId, removedIds)))
      .groupBy(applications.stageId)
    const busyIds = new Set(busy.map(row => row.stageId))
    const blocked = removed.find(stage => busyIds.has(stage.id))
    if (blocked) throw new AppError(409, 'conflict', `Mova os candidatos antes de remover a etapa ${blocked.name}.`)

    await tx.update(applications).set({ stageId: null }).where(inArray(applications.stageId, removedIds))
    await tx.delete(recruitmentStages).where(inArray(recruitmentStages.id, removedIds))
  }

  // Posições trocadas no meio do caminho: a unicidade é conferida no fim da transação.
  for (const [index, item] of rest.entries()) {
    const position = index + 1
    if (item.id) {
      const before = byId.get(item.id)!
      if (before.name !== item.name || before.position !== position) {
        await tx
          .update(recruitmentStages)
          .set({ name: item.name, position })
          .where(eq(recruitmentStages.id, item.id))
      }
    } else {
      await tx.insert(recruitmentStages).values({ tenantId: ctx.tenantId, name: item.name, position })
    }
  }

  const stages = await listStages(tx)
  await audit(tx, ctx, {
    action: 'update',
    entity: 'recruitment_stages',
    metadata: { stages: stages.map(stage => stage.name), removed: removed.map(stage => stage.name) },
  })
  return stages
}
