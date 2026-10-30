import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'

import { createDb } from './client'

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../migrations', import.meta.url))

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL não definido. Veja .env.example.')

const { db, close } = createDb(url)
await migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER })
await close()
console.log('Migrações aplicadas.')
