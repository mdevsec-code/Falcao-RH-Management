import { expect, test } from '@playwright/test'

import { STATE_EMPLOYEE, STATE_MANAGER } from '../playwright.config'
import { shot } from './helpers'

/** Próxima segunda-feira a pelo menos `days` dias de hoje, em AAAA-MM-DD. */
const nextMonday = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  while (date.getDay() !== 1) date.setDate(date.getDate() + 1)
  return date.toLocaleDateString('en-CA')
}

test.describe.serial('ausência: colaborador pede, gestor aprova', () => {
  const day = nextMonday(200 + Math.floor(Math.random() * 300))
  const shown = day.split('-').reverse().join('/')

  test('o colaborador pede uma folga pelo portal', async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: STATE_EMPLOYEE })).newPage()
    await page.goto('/minhas-solicitacoes')
    await expect(page.getByText('Saldo de férias')).toBeVisible()
    await page.getByRole('button', { name: 'Nova solicitação' }).click()
    const drawer = page.getByRole('dialog')
    await drawer.getByRole('radio', { name: /Ausência/ }).click()
    await drawer.getByLabel('Motivo').selectOption('justified')
    await drawer.getByLabel('Início').fill(day)
    await drawer.getByLabel('Fim').fill(day)
    await drawer.getByLabel('Observações').fill('Teste E2E: consulta.')
    await shot(page, '20-nova-solicitacao')
    await drawer.getByRole('button', { name: 'Enviar solicitação' }).click()
    await expect(page.getByText('Solicitação enviada')).toBeVisible()
    await expect(page.getByRole('row', { name: new RegExp(shown) })).toContainText('Aguardando aprovação')
  })

  test('o gestor vê na fila, abre e aprova', async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: STATE_MANAGER })).newPage()
    await page.goto('/solicitacoes')
    const row = page.getByRole('row', { name: new RegExp(shown) })
    await expect(row).toBeVisible()
    await row.click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByText('Aguardando decisão')).toBeVisible()
    await shot(page, '21-aprovacao')
    await drawer.getByRole('button', { name: 'Aprovar' }).click()
    await expect(page.getByText('Solicitação aprovada.')).toBeVisible()
    await expect(page.getByRole('row', { name: new RegExp(shown) })).toHaveCount(0)
  })

  test('o colaborador vê a decisão e o aviso', async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: STATE_EMPLOYEE })).newPage()
    await page.goto('/minhas-solicitacoes')
    await expect(page.getByRole('row', { name: new RegExp(shown) })).toContainText('Aprovada')
    await page.getByRole('button', { name: /Notificações/ }).click()
    await expect(page.getByRole('menuitem').first()).toContainText(/aprovada/i)
  })
})

test('paleta de comandos leva a qualquer tela pelo teclado', async ({ page }) => {
  await page.goto('/painel')
  await expect(page.getByRole('region', { name: 'Quadro de pessoal' })).toBeVisible()
  await page.keyboard.press('Control+k')
  await page.getByRole('combobox').fill('docum')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/documentos$/)
})

test('documentos: filtro de vencimento e download por link temporário', async ({ page }) => {
  await page.goto('/documentos')
  await page.getByRole('button', { name: 'Vencidos ou vencendo em 30 dias' }).click()
  await expect(page.getByText(/Vencido em|Vence em/).first()).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /^Baixar / }).first().click()
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/)
})

test('minha conta oferece a verificação em duas etapas', async ({ page }) => {
  await page.goto('/minha-conta')
  await expect(page.getByRole('heading', { name: 'Verificação em duas etapas' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ativar verificação em duas etapas' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Aparelhos conectados' })).toBeVisible()
})
