import { and, asc, count, eq, ne } from 'drizzle-orm'

import { ROLE_PERMISSIONS, type InviteInput, type Role } from '@falcao-rh/contracts'

import type { Auth } from '../../auth/auth'
import { withUser, type Database, type Tx } from '../../db/client'
import { employees, memberships, tenants, user } from '../../db/schema'
import { myMemberships, tenantTx, type Ctx } from '../../http/context'
import { audit } from '../../lib/audit'
import { AppError, badRequest, notFound } from '../../lib/errors'

export const getMe = async (db: Database, ctx: Ctx) => {
  const memberships_ = await withUser(db, ctx.userId, tx => myMemberships(tx, ctx.userId))
  // Configurações internas das organizações não vão para o navegador.
  const organizations = memberships_.map(({ tenantSettings: _settings, ...org }) => org)
  const [tenant] = await tenantTx(db, ctx, tx =>
    tx.select({ id: tenants.id, name: tenants.name, slug: tenants.slug }).from(tenants).where(eq(tenants.id, ctx.tenantId)),
  )
  return {
    user: { id: ctx.userId, name: ctx.userName, email: ctx.userEmail },
    tenant: tenant!,
    role: ctx.role,
    scope: ctx.scope,
    employeeId: ctx.employeeId,
    permissions: ROLE_PERMISSIONS[ctx.role],
    mfaPending: ctx.mfaPending,
    organizations,
  }
}

// A política de leitura também libera os vínculos do próprio usuário em
// outras organizações: o filtro por tenant aqui é obrigatório.
export const listMembers = (tx: Tx, ctx: Ctx) =>
  tx
    .select({
      id: memberships.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      role: memberships.role,
      status: memberships.status,
      employeeId: memberships.employeeId,
      employeeName: employees.fullName,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .leftJoin(employees, eq(employees.id, memberships.employeeId))
    .where(eq(memberships.tenantId, ctx.tenantId))
    .orderBy(asc(user.name))

/**
 * Convite: cria (ou reaproveita) a identidade, vincula à organização com o
 * perfil escolhido e envia o link para definir a senha. Nenhuma senha
 * provisória trafega.
 */
export const inviteMember = async (
  db: Database,
  auth: Auth,
  ctx: Ctx,
  input: InviteInput,
  webOrigin: string,
) => {
  const email = input.email.toLowerCase()
  const authCtx = await auth.$context
  const existing = await authCtx.internalAdapter.findUserByEmail(email)
  const identity =
    existing?.user ?? (await authCtx.internalAdapter.createUser(
      { name: input.name, email, emailVerified: false },
      { method: 'admin' },
    ))

  const membership = await tenantTx(db, ctx, async tx => {
    const [row] = await tx
      .insert(memberships)
      .values({
        tenantId: ctx.tenantId,
        userId: identity.id,
        role: input.role,
        employeeId: input.employeeId ?? null,
      })
      .returning()
    await audit(tx, ctx, {
      action: 'invite',
      entity: 'membership',
      entityId: row!.id,
      metadata: { role: input.role },
    })
    return row!
  })

  await auth.api.requestPasswordReset({ body: { email, redirectTo: `${webOrigin}/definir-senha` } })
  return membership
}

export const updateMember = async (
  tx: Tx,
  ctx: Ctx,
  id: string,
  input: { role?: Role; status?: 'active' | 'disabled'; employeeId?: string | null },
) => {
  const [before] = await tx
    .select()
    .from(memberships)
    .where(and(eq(memberships.id, id), eq(memberships.tenantId, ctx.tenantId)))
  if (!before) throw notFound('Acesso')
  if (before.userId === ctx.userId && (input.role !== undefined || input.status === 'disabled'))
    throw badRequest('Você não pode alterar o próprio perfil nem desativar o próprio acesso.')

  const losesAdmin =
    before.role === 'admin' && ((input.role && input.role !== 'admin') || input.status === 'disabled')
  if (losesAdmin) {
    const [others] = await tx
      .select({ value: count() })
      .from(memberships)
      .where(
        and(
          eq(memberships.tenantId, ctx.tenantId),
          eq(memberships.role, 'admin'),
          eq(memberships.status, 'active'),
          ne(memberships.id, id),
        ),
      )
    if ((others?.value ?? 0) === 0)
      throw new AppError(409, 'last_admin', 'A organização precisa de pelo menos um administrador ativo.')
  }

  const [row] = await tx.update(memberships).set(input).where(eq(memberships.id, id)).returning()
  await audit(tx, ctx, {
    action: 'update',
    entity: 'membership',
    entityId: id,
    changedFields: Object.keys(input),
    metadata: input.role ? { from: before.role, to: input.role } : undefined,
  })
  return row!
}
