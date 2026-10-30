import type { Tx } from '../db/client'
import { auditLogs } from '../db/schema'
import type { Ctx } from '../http/context'

export type AuditEntry = {
  action: string
  entity: string
  entityId?: string | null
  /** Nomes dos campos alterados. Valores de dados pessoais nunca vão para o log. */
  changedFields?: string[]
  metadata?: Record<string, unknown>
}

export const audit = (tx: Tx, ctx: Ctx, entry: AuditEntry) =>
  tx.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    changedFields: entry.changedFields ?? null,
    metadata: entry.metadata ?? null,
    ip: ctx.ip,
  })

/** Campos cujo valor mudou entre `before` e `after` (comparação rasa). */
export const changedKeys = (before: Record<string, unknown>, after: Record<string, unknown>) =>
  Object.keys(after).filter(key => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
