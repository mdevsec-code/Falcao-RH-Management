/**
 * Seed de DESENVOLVIMENTO: cria a organização "(DEMO)" com dados FICTÍCIOS.
 * Recusa-se a rodar com NODE_ENV=production.
 *
 *   SEED_ADMIN_EMAIL=voce@exemplo.com SEED_ADMIN_PASSWORD=... npm run db:seed
 */
import { createAuth } from '../auth/auth'
import { loadEnv } from '../env'
import { MemoryMailer } from '../lib/mailer'
import { createDb } from './client'
import { createStorage } from '../lib/storage'
import { seedDemoActivity } from './demo-activity'
import { seedDemo, seedDemoProfiles } from './demo-data'

const env = loadEnv()
if (env.NODE_ENV === 'production') throw new Error('O seed de demonstração não roda em produção.')

const email = process.env.SEED_ADMIN_EMAIL
const password = process.env.SEED_ADMIN_PASSWORD
if (!email || !password || password.length < 10)
  throw new Error('Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD (mínimo 10 caracteres).')

const { db, close } = createDb(env.DATABASE_URL)
const auth = createAuth({ db, env, mailer: new MemoryMailer() })

const result = await seedDemo(db, auth, { email, password })
console.log(
  result
    ? `Organização de demonstração criada com ${result.employees} colaboradores FICTÍCIOS. Entre com ${email} em ${env.WEB_ORIGIN}.`
    : 'A organização de demonstração já existe. Nada a fazer.',
)
const profiles = await seedDemoProfiles(db, auth, password)
if (profiles.length) console.log(`Usuários de demonstração por perfil (mesma senha): ${profiles.join(', ')}`)
const activity = await seedDemoActivity(db, createStorage(env))
if (activity) console.log(`Movimento de demonstração (FICTÍCIO): ${JSON.stringify(activity)}`)
await close()
