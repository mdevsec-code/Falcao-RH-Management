import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import pg from 'pg'

import * as schema from './schema'

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

export const createDb = (url: string, max = 10) => {
  const pool = new pg.Pool({ connectionString: url, max })
  const db: Database = drizzle(pool, { schema })
  return { db, close: () => pool.end() }
}

export type TenantContext = { tenantId: string; userId: string }

/**
 * Executa `fn` numa transação presa a uma organização: fixa `app.tenant_id`
 * e `app.user_id` e troca para a role `falcao_app`, sujeita ao RLS. É o único
 * caminho dos módulos de domínio até o banco.
 */
export const withTenant = <T>(db: Database, ctx: TenantContext, fn: (tx: Tx) => Promise<T>) =>
  db.transaction(async tx => {
    await tx.execute(
      sql`select set_config('app.tenant_id', ${ctx.tenantId}, true), set_config('app.user_id', ${ctx.userId}, true)`,
    )
    await tx.execute(sql`set local role falcao_app`)
    return fn(tx)
  })

/** Como `withTenant`, sem organização: só enxerga os vínculos do próprio usuário. */
export const withUser = <T>(db: Database, userId: string, fn: (tx: Tx) => Promise<T>) =>
  db.transaction(async tx => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`)
    await tx.execute(sql`set local role falcao_app`)
    return fn(tx)
  })
