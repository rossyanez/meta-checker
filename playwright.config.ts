import { defineConfig, devices } from '@playwright/test'

const port = 3100

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The fixture server listens on 127.0.0.1 at a random port, which only the test policy admits.
    command: `npm run build && META_CHECKER_TEST_ALLOW_LOOPBACK=1 PORT=${port} npm start`,
    url: `http://localhost:${port}/tools/meta-checker`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
