import { expect, test } from '@playwright/test'

import { randomCpf, shot } from './helpers'

// Estes dois testes precisam começar sem sessão.
test.describe('sem sessão', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('login com credenciais erradas mostra o erro', async ({ page }) => {
    await page.goto('/entrar')
    await page.getByLabel('E-mail').fill('ninguem@exemplo.invalid')
    await page.getByLabel('Senha').fill('senha-errada-123')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.')
    await shot(page, '01-login-erro')
  })

  test('sem sessão, a área interna redireciona para o login', async ({ page }) => {
    await page.goto('/colaboradores')
    await expect(page).toHaveURL(/\/entrar$/)
  })
})

test('painel mostra indicadores do banco', async ({ page }) => {
  await page.goto('/painel')
  const band = page.getByRole('region', { name: 'Quadro de pessoal' })
  await expect(band).toContainText('ativos')
  await expect(page.getByText('Evolução do quadro')).toBeVisible()
  await expect(page.getByText('Distribuição do quadro')).toBeVisible()
  await page.getByRole('tab', { name: 'Unidade' }).click()
  const distribution = page.locator('section', { has: page.getByRole('heading', { name: 'Distribuição do quadro' }) })
  await expect(distribution.getByText('Canteiro Residencial Norte')).toBeVisible()
  await shot(page, '02-painel')
})

test('cadastra um colaborador e o encontra na busca e na ficha', async ({ page }) => {
  await page.goto('/colaboradores')
  await expect(page.getByRole('heading', { name: 'Colaboradores' })).toBeVisible()
  await shot(page, '03-colaboradores')

  const registration = `E2E${Date.now().toString().slice(-6)}`
  const cpf = randomCpf()
  await page.getByRole('button', { name: 'Novo colaborador' }).click()
  const drawer = page.getByRole('dialog')
  await drawer.getByLabel('Nome completo').fill('Teste Ponta a Ponta')
  await drawer.getByLabel('CPF').fill(cpf)
  await drawer.getByLabel('Matrícula').fill(registration)
  await drawer.getByLabel('Data de admissão').fill('2026-10-01')
  await drawer.getByLabel('Departamento').selectOption({ label: 'Engenharia' })
  await shot(page, '04-formulario')
  await drawer.getByRole('button', { name: 'Cadastrar colaborador' }).click()

  await expect(page.getByRole('heading', { name: 'Teste Ponta a Ponta' })).toBeVisible()
  await expect(page.getByText(`Matrícula ${registration}`)).toBeVisible()
  await page.getByRole('tab', { name: /Histórico/ }).click()
  await expect(page.getByText('Admissão', { exact: true })).toBeVisible()
  await shot(page, '05-ficha')

  // CPF repetido é recusado com mensagem clara.
  await page.getByRole('link', { name: 'Colaboradores' }).first().click()
  await page.getByRole('button', { name: 'Novo colaborador' }).click()
  const again = page.getByRole('dialog')
  await again.getByLabel('Nome completo').fill('Duplicado')
  await again.getByLabel('CPF').fill(cpf)
  await again.getByLabel('Matrícula').fill(`${registration}X`)
  await again.getByLabel('Data de admissão').fill('2026-10-01')
  await again.getByRole('button', { name: 'Cadastrar colaborador' }).click()
  await expect(page.getByText(/Já existe um colaborador com este CPF/)).toBeVisible()
})

test('estrutura mostra o organograma com gestores e quadro', async ({ page }) => {
  await page.goto('/estrutura')
  const tree = page.getByRole('tree', { name: 'Organograma' })
  await expect(tree).toContainText('Diretoria')
  await expect(tree).toContainText('Obras')
  await shot(page, '06-organograma')
})
