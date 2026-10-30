import { expect, type Page } from '@playwright/test'

export const credentials = () => {
  const email = process.env.E2E_EMAIL ?? 'admin@demo.falcao.invalid'
  const password = process.env.E2E_PASSWORD
  if (!password) throw new Error('Defina E2E_PASSWORD (senha dos usuários DEMO).')
  return { email, password }
}

/** Entra pelo formulário; os testes reaproveitam a sessão salva pelo setup. */
export const login = async (page: Page, email = credentials().email, landing = /\/painel$/) => {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(credentials().password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(landing)
}

export const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true })

/** CPF válido e diferente a cada execução: a suíte roda várias vezes no mesmo banco. */
export const randomCpf = () => {
  const base = String(Math.floor(Math.random() * 1e9)).padStart(9, '0')
  const digit = (d: string) => {
    let sum = 0
    for (let i = 0; i < d.length; i++) sum += Number(d[i]) * (d.length + 1 - i)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  const first = digit(base)
  return `${base}${first}${digit(base + first)}`
}
