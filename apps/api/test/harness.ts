/**
 * Ambiente de teste: PostgreSQL real (PGlite, em memória) com as mesmas
 * migrações de produção, inclusive RLS. Nada de mocks de banco.
 */
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { fileURLToPath } from 'node:url'

import { buildApp } from '../src/app'
import { createAuth } from '../src/auth/auth'
import type { Database } from '../src/db/client'
import { addMember, createTenant, createUserWithPassword } from '../src/db/provision'
import * as schema from '../src/db/schema'
import { loadEnv } from '../src/env'
import { MemoryMailer } from '../src/lib/mailer'
import { LocalStorage } from '../src/lib/storage'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Role } from '@falcao-rh/contracts'

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url))

export const PASSWORD = 'senha-de-teste-123'

export const createTestDb = async () => {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: MIGRATIONS })
  return { db: db as unknown as Database, client }
}

export const createTestApp = async () => {
  const { db, client } = await createTestDb()
  const env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'pglite://memory',
    AUTH_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres',
    API_URL: 'http://localhost:3333',
    WEB_ORIGIN: 'http://localhost:5173',
  })
  const mailer = new MemoryMailer()
  const auth = createAuth({ db, env, mailer })
  const storage = new LocalStorage(await mkdtemp(join(tmpdir(), 'falcao-rh-')), env.AUTH_SECRET)
  const app = await buildApp({ db, auth, env, mailer, storage })

  const login = async (email: string, password = PASSWORD) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: env.WEB_ORIGIN },
      payload: { email, password },
    })
    if (response.statusCode !== 200) throw new Error(`login falhou: ${response.statusCode} ${response.body}`)
    const cookies = ([] as string[]).concat(response.headers['set-cookie'] ?? [])
    return cookies.map(cookie => cookie.split(';')[0]).join('; ')
  }

  /** Cria uma organização com um usuário de cada perfil pedido. */
  const seedTenant = async (slug: string, roles: Role[] = ['admin']) => {
    const tenant = await createTenant(db, { name: `Empresa ${slug}`, slug })
    const users: Partial<Record<Role, { id: string; email: string; cookie: string }>> = {}
    for (const role of roles) {
      const email = `${role}@${slug}.test`
      const created = await createUserWithPassword(auth, { name: `${role} ${slug}`, email, password: PASSWORD })
      await addMember(db, { tenantId: tenant.id, userId: created.id, role })
      users[role] = { id: created.id, email, cookie: await login(email) }
    }
    return { tenant, users }
  }

  const close = async () => {
    await app.close()
    await client.close()
  }

  return { app, db, auth, mailer, storage, env, login, seedTenant, close }
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>

let cpfSeed = 100_000_000
/** CPF válido e único por chamada, para massa de teste. */
export const nextCpf = () => {
  const base = String(cpfSeed++).padStart(9, '0')
  const digit = (digits: string) => {
    let sum = 0
    for (let i = 0; i < digits.length; i++) sum += Number(digits[i]) * (digits.length + 1 - i)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  const first = digit(base)
  return `${base}${first}${digit(base + first)}`
}
