import { test as setup } from '@playwright/test'

import { STATE, STATE_EMPLOYEE, STATE_MANAGER } from '../playwright.config'
import { login } from './helpers'

// Um login por perfil para a suíte inteira: o limite de tentativas da API
// (5 por minuto) vale aqui também.
setup('entrar como administrador DEMO', async ({ page }) => {
  await login(page)
  await page.context().storageState({ path: STATE })
})

setup('entrar como gestor DEMO', async ({ page }) => {
  await login(page, 'gestor@demo.falcao.invalid')
  await page.context().storageState({ path: STATE_MANAGER })
})

setup('entrar como colaborador DEMO', async ({ page }) => {
  await login(page, 'colaborador@demo.falcao.invalid', /\/meu-cadastro$/)
  await page.context().storageState({ path: STATE_EMPLOYEE })
})
