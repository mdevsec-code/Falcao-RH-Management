import { and, eq } from 'drizzle-orm'
import { fromNodeHeaders } from 'better-auth/node'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { can, ROLE_SCOPE, type DataScope, type Permission, type Role, type TenantSettings } from '@falcao-rh/contracts'

import type { Auth } from '../auth/auth'
import { withTenant, withUser, type Database, type Tx } from '../db/client'
import { memberships, tenants } from '../db/schema'
import { AppError, forbidden } from '../lib/errors'

/** Quem está agindo, em qual organização e com que perfil. */
export type Ctx = {
  userId: string
  userName: string
  userEmail: string
  tenantId: string
  role: Role
  scope: DataScope
  employeeId: string | null
  ip: string
  /** O perfil exige MFA nesta organização e o usuário ainda não ativou. */
  mfaPending: boolean
}

declare module 'fastify' {
  interface FastifyRequest {
    ctx: Ctx | null
  }
}

export const TENANT_HEADER = 'x-tenant-id'

/** Rotas liberadas enquanto o MFA obrigatório não é ativado: o mínimo para a tela de conta. */
const MFA_PENDING_ALLOWED = new Set(['GET /api/v1/me', 'GET /api/v1/notifications'])

export const myMemberships = (tx: Tx, userId: string) =>
  tx
    .select({
      tenantId: memberships.tenantId,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      role: memberships.role,
      employeeId: memberships.employeeId,
      tenantSettings: tenants.settings,
    })
    .from(memberships)
    .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')))
    .orderBy(tenants.name)

/**
 * preHandler das rotas autenticadas: valida a sessão e escolhe a organização
 * (cabeçalho `x-tenant-id`, ou a única a que o usuário tem acesso).
 */
export const authenticate = (auth: Auth, db: Database) =>
  async function authenticateRequest(request: FastifyRequest) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) })
    if (!session) throw new AppError(401, 'unauthenticated', 'Faça login para continuar.')

    const userId = session.user.id
    const list = await withUser(db, userId, tx => myMemberships(tx, userId))
    if (list.length === 0) throw forbidden('Seu usuário não tem acesso a nenhuma organização.')

    const wanted = request.headers[TENANT_HEADER]
    const chosen = typeof wanted === 'string' ? list.find(m => m.tenantId === wanted) : list[0]
    if (!chosen) throw forbidden('Você não tem acesso a esta organização.')

    const required = (chosen.tenantSettings as TenantSettings).requireMfaFor ?? []
    const mfaPending = required.includes(chosen.role) && !session.user.twoFactorEnabled

    request.ctx = {
      mfaPending,
      userId,
      userName: session.user.name,
      userEmail: session.user.email,
      tenantId: chosen.tenantId,
      role: chosen.role,
      scope: ROLE_SCOPE[chosen.role],
      employeeId: chosen.employeeId,
      ip: request.ip,
    }

    if (mfaPending && !MFA_PENDING_ALLOWED.has(`${request.method} ${request.routeOptions.url}`))
      throw new AppError(403, 'mfa_required', 'Ative a verificação em duas etapas para continuar.')
  }

export const ctxOf = (request: FastifyRequest): Ctx => {
  if (!request.ctx) throw new AppError(401, 'unauthenticated', 'Faça login para continuar.')
  return request.ctx
}

export const requirePermission = (permission: Permission) =>
  async function checkPermission(request: FastifyRequest, _reply: FastifyReply) {
    if (!can(ctxOf(request).role, permission)) throw forbidden()
  }

/** Abre a transação da organização do usuário atual. */
export const tenantTx = <T>(db: Database, ctx: Ctx, fn: (tx: Tx) => Promise<T>) =>
  withTenant(db, { tenantId: ctx.tenantId, userId: ctx.userId }, fn)
