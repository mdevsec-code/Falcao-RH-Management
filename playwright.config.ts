import { defineConfig, devices } from '@playwright/test'

/**
 * E2E contra um ambiente já em execução (API + web + banco com o seed DEMO).
 * Credenciais do administrador DEMO via E2E_EMAIL e E2E_PASSWORD.
 */
export const STATE = 'test-results/.auth/admin.json'
export const STATE_MANAGER = 'test-results/.auth/manager.json'
export const STATE_EMPLOYEE = 'test-results/.auth/employee.json'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    locale: 'pt-BR',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  // Um login só para a suíte: o limite de tentativas da API (5/min) vale aqui também.
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop',
      dependencies: ['setup'],
      testIgnore: /responsive/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: STATE },
    },
    {
      name: 'mobile',
      dependencies: ['setup'],
      testMatch: /responsive/,
      use: { ...devices['Pixel 7'], storageState: STATE },
    },
  ],
})
