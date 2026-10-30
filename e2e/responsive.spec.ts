import { expect, test } from '@playwright/test'

import { shot } from './helpers'

test('no celular, o menu abre como gaveta e o painel cabe na tela', async ({ page }) => {
  await page.goto('/painel')
  await expect(page.getByRole('region', { name: 'Quadro de pessoal' })).toContainText('ativos')
  await expect(page.getByText('Evolução do quadro')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
  await shot(page, '07-mobile-painel')
  await page.getByRole('button', { name: 'Abrir menu' }).click()
  await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible()
  await shot(page, '08-mobile-menu')
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'Colaboradores' }).click()
  await expect(page.getByRole('heading', { name: 'Colaboradores' })).toBeVisible()
})
