/**
 * Processo de automações: o mesmo código da API, rodando as tarefas
 * agendadas a cada hora. Pode haver mais de uma instância: as marcas em
 * `automation_marks` impedem avisos duplicados.
 */
import { runAutomations } from './automations/automations'
import { createDb } from './db/client'
import { loadEnv } from './env'
import { createMailer } from './lib/mailer'

const INTERVAL_MS = 60 * 60 * 1000

const env = loadEnv()
const { db, close } = createDb(env.DATABASE_URL, 2)
const mailer = createMailer(env, message => console.info(message))

let running = false
const tick = async () => {
  if (running) return
  running = true
  try {
    const result = await runAutomations(db, mailer, env.WEB_ORIGIN)
    console.info(JSON.stringify({ msg: 'automações executadas', at: new Date().toISOString(), result }))
  } catch (error) {
    console.error('falha nas automações', error)
  } finally {
    running = false
  }
}

await tick()
const timer = setInterval(tick, INTERVAL_MS)

const shutdown = async () => {
  clearInterval(timer)
  await close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
