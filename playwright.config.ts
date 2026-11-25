import { defineConfig, devices } from '@playwright/test'

const port = 3100

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && cp -r .next/static .next/standalone/.next/ && PORT=${port} npm start`,
    url: `http://localhost:${port}/tools/meta-checker`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
