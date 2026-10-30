// Capturas das telas principais para revisão visual e para o README.
// Uso: E2E_PASSWORD=... node e2e/screens.mjs  (ambiente DEMO rodando)
import { mkdir } from 'node:fs/promises'

import { chromium } from '@playwright/test'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = process.env.E2E_PASSWORD
const OUT = process.env.SCREENS_DIR ?? 'docs/screenshots'
if (!PASSWORD) throw new Error('Defina E2E_PASSWORD (senha dos usuários DEMO).')
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch()
const errors = []

const session = async (email, viewport = { width: 1440, height: 900 }) => {
  const page = await browser.newPage({ viewport, locale: 'pt-BR' })
  page.on('pageerror', error => errors.push(`${email}: ${error.message}`))
  page.on('console', message => message.type() === 'error' && errors.push(`${email}: ${message.text()}`))
  await page.goto(`${BASE}/entrar`)
  await page.waitForTimeout(2600)
  return page
}

const login = async (page, email) => {
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL(/\/(painel|meu-cadastro)$/)
  await page.waitForTimeout(2600)
}

const shot = async (page, name, path, wait = 1800) => {
  if (path) await page.goto(`${BASE}${path}`)
  await page.waitForTimeout(wait)
  await page.screenshot({ path: `${OUT}/${name}.png` })
}

const admin = await session('admin')
await admin.screenshot({ path: `${OUT}/01-login.png` })
await login(admin, 'admin@demo.falcao.invalid')
await shot(admin, '02-painel', null, 400)
await shot(admin, '03-colaboradores', '/colaboradores')
await shot(admin, '04-solicitacoes-calendario', '/solicitacoes?tab=calendario')
await shot(admin, '05-documentos', '/documentos')
await shot(admin, '06-estrutura', '/estrutura')
await shot(admin, '07-configuracoes', '/configuracoes')
await shot(admin, '08-minha-conta', '/minha-conta')
await admin.goto(`${BASE}/painel`)
await admin.waitForTimeout(1500)
await admin.keyboard.press('Control+k')
await admin.keyboard.type('ana')
await shot(admin, '09-paleta', null, 900)

const employee = await session('colaborador')
await login(employee, 'colaborador@demo.falcao.invalid')
await shot(employee, '10-portal', '/meu-cadastro')
await shot(employee, '11-ferias', '/minhas-solicitacoes')

const mobile = await session('gestor', { width: 390, height: 844 })
await login(mobile, 'gestor@demo.falcao.invalid')
await shot(mobile, '12-mobile-painel', null, 400)

await browser.close()
console.log(errors.length ? `ERROS:\n${errors.join('\n')}` : 'Sem erros no console.')
