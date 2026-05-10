import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT ?? '3000';

export default defineConfig({
  testDir: './tests/e2e',
  // Tests séquentiels : on partage la même BDD jetable. Faire tourner en parallèle
  // créerait des conflits sur les MealPlan / SharedLink.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
