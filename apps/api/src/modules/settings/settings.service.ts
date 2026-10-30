import { asc, eq, sql } from 'drizzle-orm'

import type { ApprovalFlowInput, TenantSettings, TenantSettingsInput } from '@falcao-rh/contracts'

import type { Tx } from '../../db/client'
import { approvalFlows, departments, tenants } from '../../db/schema'
import type { Ctx } from '../../http/context'
import { audit, changedKeys } from '../../lib/audit'
import { notFound } from '../../lib/errors'

export const getSettings = async (tx: Tx, ctx: Ctx) => {
  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, ctx.tenantId))
  if (!tenant) throw notFound('Organização')
  const settings = tenant.settings as TenantSettings
  return {
    name: tenant.name,
    legalName: tenant.legalName,
    cnpj: tenant.cnpj,
    requireMfaFor: settings.requireMfaFor ?? [],
  }
}

export const updateSettings = async (tx: Tx, ctx: Ctx, input: TenantSettingsInput) => {
  const before = await getSettings(tx, ctx)
  await tx
    .update(tenants)
    .set({
      name: input.name,
      legalName: input.legalName ?? null,
      cnpj: input.cnpj ?? null,
      settings: sql`${tenants.settings} || ${JSON.stringify({ requireMfaFor: input.requireMfaFor })}::jsonb`,
    })
    .where(eq(tenants.id, ctx.tenantId))
  await audit(tx, ctx, {
    action: 'update',
    entity: 'tenant_settings',
    entityId: ctx.tenantId,
    changedFields: changedKeys(before, input),
  })
  return getSettings(tx, ctx)
}

export const listFlows = (tx: Tx) =>
  tx
    .select({
      id: approvalFlows.id,
      requestType: approvalFlows.requestType,
      departmentId: approvalFlows.departmentId,
      departmentName: departments.name,
      steps: approvalFlows.steps,
    })
    .from(approvalFlows)
    .leftJoin(departments, eq(departments.id, approvalFlows.departmentId))
    .orderBy(asc(approvalFlows.requestType), asc(departments.name))

/** Um fluxo por tipo e departamento (sem departamento = padrão da organização). */
export const saveFlow = async (tx: Tx, ctx: Ctx, input: ApprovalFlowInput) => {
  const [row] = await tx
    .insert(approvalFlows)
    .values({ tenantId: ctx.tenantId, requestType: input.requestType, departmentId: input.departmentId ?? null, steps: input.steps })
    .onConflictDoUpdate({
      target: [approvalFlows.tenantId, approvalFlows.requestType, approvalFlows.departmentId],
      set: { steps: input.steps },
    })
    .returning()
  await audit(tx, ctx, { action: 'save', entity: 'approval_flow', entityId: row!.id, metadata: { steps: input.steps } })
  return row!
}

export const deleteFlow = async (tx: Tx, ctx: Ctx, id: string) => {
  const deleted = await tx.delete(approvalFlows).where(eq(approvalFlows.id, id)).returning({ id: approvalFlows.id })
  if (!deleted.length) throw notFound('Fluxo')
  await audit(tx, ctx, { action: 'delete', entity: 'approval_flow', entityId: id })
}
