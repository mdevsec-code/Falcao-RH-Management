import type { Role } from '@falcao-rh/contracts'

import type { Auth } from '../auth/auth'
import { ensureDefaultCategories } from '../modules/documents/documents.service'
import type { Database } from './client'
import { memberships, tenants } from './schema'

/**
 * Operações de sistema (seed, CLI de implantação, testes): rodam com o
 * usuário dono do banco, fora do RLS. Nunca são expostas por rota HTTP.
 */
export const createTenant = async (db: Database, input: { name: string; slug: string; cnpj?: string }) => {
  const [tenant] = await db.insert(tenants).values(input).returning()
  await ensureDefaultCategories(db, tenant!.id)
  return tenant!
}

export const createUserWithPassword = async (
  auth: Auth,
  input: { name: string; email: string; password: string },
) => {
  const ctx = await auth.$context
  const existing = await ctx.internalAdapter.findUserByEmail(input.email)
  if (existing) return existing.user
  const user = await ctx.internalAdapter.createUser(
    { name: input.name, email: input.email.toLowerCase(), emailVerified: true },
    { method: 'admin' },
  )
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: await ctx.password.hash(input.password),
  })
  return user
}

export const addMember = async (
  db: Database,
  input: { tenantId: string; userId: string; role: Role; employeeId?: string | null },
) => {
  const [row] = await db.insert(memberships).values(input).returning()
  return row!
}
