import { buildApp } from './app'
import { createAuth } from './auth/auth'
import { createDb } from './db/client'
import { loadEnv } from './env'
import { createMailer } from './lib/mailer'
import { createStorage } from './lib/storage'

const env = loadEnv()
const { db, close } = createDb(env.DATABASE_URL, env.DATABASE_POOL_MAX)

// Sem SMTP_URL (só fora de produção), os e-mails aparecem no log.
const mailer = createMailer(env, message => console.info(message))
const storage = createStorage(env)

const auth = createAuth({ db, env, mailer })
const app = await buildApp(
  { db, auth, env, mailer, storage },
  {
    logger: {
      level: env.LOG_LEVEL,
      // Cookies e cabeçalhos de autenticação nunca vão para o log.
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
      ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
    },
  },
)

const shutdown = async () => {
  await app.close()
  await close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await app.listen({ port: env.PORT, host: env.HOST })
