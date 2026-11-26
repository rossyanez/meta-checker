import { expect, test, type APIResponse } from '@playwright/test'
import { startFixtureServer, type FixtureServer } from '../fixture-server'

let server: FixtureServer

test.beforeAll(async () => {
  server = await startFixtureServer()
})
test.afterAll(() => server.close())

const HIRE = { name: 'Want a full audit? Hire me', href: 'https://rossyanez.com/#contact' }

/** Width and height from a PNG response's IHDR chunk. */
async function pngSize(response: APIResponse) {
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/png')
  const bytes = await response.body()
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG')
  expect(bytes.subarray(12, 16).toString('latin1')).toBe('IHDR')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/** The content of every `<meta>` with this name or property in the served HTML, in order. */
function metaContent(html: string, key: string): string[] {
  const tags = html.match(/<meta\b[^>]*>/g) ?? []
  return tags
    .filter((tag) => tag.includes(`name="${key}"`) || tag.includes(`property="${key}"`))
    .map((tag) => /content="([^"]*)"/.exec(tag)?.[1] ?? '')
}

test('a shared report opens in a fresh browser without fetching the page again', async ({ page, browser, request }) => {
  await page.goto('/tools/meta-checker')
  await page.getByLabel('Page URL').fill(`${server.url}/fixtures/complete.html`)
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText('200', { timeout: 15_000 })

  await expect(page.getByRole('link', { name: HIRE.name })).toHaveAttribute('href', HIRE.href)
  const href = await page.getByRole('link', { name: 'Share this report' }).getAttribute('href')
  expect(href).toMatch(/^\/tools\/meta-checker\/r\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  const before = server.requests()
  expect(before).toBeGreaterThan(0)

  const fresh = await browser.newContext()
  try {
    const shared = await fresh.newPage()
    await shared.goto(href!)
    await expect(shared.getByRole('heading', { level: 1 })).toHaveText('Report for 127.0.0.1')
    await expect(shared.getByRole('region', { name: 'Title' })).toContainText('Complete Example Page')
    await expect(shared.getByRole('region', { name: 'Broken links' })).toContainText(`${server.url}/status/404`)
    await expect(shared.getByRole('link', { name: HIRE.name })).toHaveAttribute('href', HIRE.href)
    await expect(shared.getByRole('link', { name: 'Check another page' })).toHaveAttribute('href', '/tools/meta-checker')

    const reportImage = await request.get(`${href}/opengraph-image`)
    expect(await pngSize(reportImage)).toEqual({ width: 1200, height: 630 })
    // The image route decodes the token on its own. If it could not, it would draw the generic tool card.
    const toolImage = await request.get('/tools/meta-checker/opengraph-image')
    expect((await reportImage.body()).equals(await toolImage.body())).toBe(false)

    const html = await (await request.get(href!)).text()
    expect(metaContent(html, 'robots')).toEqual(['noindex, nofollow'])
    const [ogImage] = metaContent(html, 'og:image')
    expect(new URL(ogImage).pathname).toBe(`${href}/opengraph-image`)
  } finally {
    await fresh.close()
  }

  expect(server.requests()).toBe(before)
})

test('a changed report link shows a friendly message', async ({ page }) => {
  await page.goto('/tools/meta-checker/r/not-a-real-token')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This report link does not work')
  await expect(page.getByRole('link', { name: 'Check another page' })).toHaveAttribute('href', '/tools/meta-checker')
})

test('the tool page has a canonical URL and an Open Graph card', async ({ request }) => {
  const html = await (await request.get('/tools/meta-checker')).text()

  expect(html).toContain('<link rel="canonical" href="https://rossyanez.com/tools/meta-checker"/>')
  expect(metaContent(html, 'og:title')).toEqual(['Meta Checker'])
  expect(metaContent(html, 'og:url')).toEqual(['https://rossyanez.com/tools/meta-checker'])
  expect(metaContent(html, 'twitter:card')).toEqual(['summary_large_image'])
  const [ogImage] = metaContent(html, 'og:image')
  const imageUrl = new URL(ogImage)
  expect(imageUrl.origin + imageUrl.pathname).toBe('https://rossyanez.com/tools/meta-checker/opengraph-image')

  expect(await pngSize(await request.get(imageUrl.pathname + imageUrl.search))).toEqual({ width: 1200, height: 630 })
})
