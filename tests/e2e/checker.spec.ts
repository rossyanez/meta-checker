import { expect, test } from '@playwright/test'
import { closedPortUrl, startFixtureServer, type FixtureServer } from '../fixture-server'

let server: FixtureServer

test.beforeAll(async () => {
  server = await startFixtureServer()
})
test.afterAll(() => server.close())

test('checks a page and shows its report', async ({ page }) => {
  await page.goto('/tools/meta-checker')
  await page.getByLabel('Page URL').fill(`${server.url}/fixtures/complete.html`)
  await page.getByRole('button', { name: 'Check' }).click()

  const summary = page.getByRole('region', { name: 'Summary' })
  await expect(summary).toContainText('200', { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Summary' })).toBeFocused()

  const title = page.getByRole('region', { name: 'Title' })
  await expect(title).toContainText('Complete Example Page')
  await expect(title).toContainText('21 characters')

  await expect(page.getByRole('region', { name: 'Headings outline' })).toContainText('What this page covers')

  const links = page.getByRole('region', { name: 'Broken links' })
  await expect(links).toContainText('Checked 4 of 4 links')
  await expect(links).toContainText(`${server.url}/status/404`)
})

test('shows a friendly error when the address cannot be reached', async ({ page }) => {
  await page.goto('/tools/meta-checker')
  await page.getByLabel('Page URL').fill(await closedPortUrl())
  await page.getByRole('button', { name: 'Check' }).click()

  const message = "We couldn't reach that address. Check the spelling, or the site may be down."
  // Next also renders an empty role="alert" route announcer, so pick ours by its text.
  await expect(page.getByRole('alert').filter({ hasText: message })).toHaveText(message, { timeout: 15_000 })
})
