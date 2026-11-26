// @vitest-environment node
import { statSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { closedPortUrl, startFixtureServer, type FixtureServer } from '../tests/fixture-server'
import { checkUrl, normalizeUrl, type CheckResult } from './check'

let server: FixtureServer

beforeAll(async () => {
  server = await startFixtureServer()
})
afterAll(() => server.close())

function reportOf(result: CheckResult) {
  if (result.kind !== 'report') throw new Error(`expected a report, got ${result.reason}`)
  return result.report
}

describe('checkUrl', () => {
  test('builds a full report for a complete page, including its broken links', async () => {
    const url = `${server.url}/fixtures/complete.html`
    const report = reportOf(await checkUrl(url))

    expect(report).toMatchObject({
      requestedUrl: url,
      finalUrl: url,
      status: 200,
      redirects: [],
      contentType: 'text/html; charset=utf-8',
      speed: { htmlBytes: statSync('tests/fixtures/complete.html').size },
      links: {
        found: 4,
        checked: 4,
        broken: [{ url: `${server.url}/status/404`, status: 404 }],
      },
    })
    expect(report.speed.ttfbMs).toBeGreaterThanOrEqual(0)
    expect(report.page).toMatchObject({
      titles: ['Complete Example Page'],
      descriptions: ['A sample page that has every tag the checker reads.'],
      canonicals: ['https://example.com/complete'],
      robots: { index: true, follow: true },
      headingCount: 4,
    })
  })

  test('reports the redirect chain and parses the final page', async () => {
    const report = reportOf(await checkUrl(`${server.url}/redirect/a`))
    expect(report.finalUrl).toBe(`${server.url}/fixtures/complete.html`)
    expect(report.redirects.map((r) => r.status)).toEqual([301, 302])
    expect(report.page?.titles).toEqual(['Complete Example Page'])
    expect(report.links?.broken).toEqual([{ url: `${server.url}/status/404`, status: 404 }])
  })

  test('checks at most 50 links, at most 8 at a time', async () => {
    const report = reportOf(await checkUrl(`${server.url}/many-links`))
    expect(report.links).toEqual({ found: 60, checked: 50, broken: [] })
    expect(server.maxInFlight()).toBeLessThanOrEqual(8)
    expect(server.maxInFlight()).toBeGreaterThan(1)
  })

  test('linkCap and concurrency are honoured', async () => {
    const own = await startFixtureServer()
    try {
      const report = reportOf(await checkUrl(`${own.url}/many-links`, { linkCap: 10, concurrency: 2 }))
      expect(report.links).toMatchObject({ found: 60, checked: 10 })
      expect(own.maxInFlight()).toBeLessThanOrEqual(2)
    } finally {
      await own.close()
    }
  })

  test('broken links keep page order and include network failures', async () => {
    const closed = await closedPortUrl()
    const hrefs = [closed, '/status/500', '/fixtures/complete.html', '/status/404']
    const query = hrefs.map((h) => `href=${encodeURIComponent(h)}`).join('&')
    const report = reportOf(await checkUrl(`${server.url}/link-list?${query}`))
    expect(report.links).toEqual({
      found: 4,
      checked: 4,
      broken: [
        { url: closed, status: null, error: 'network' },
        { url: `${server.url}/status/500`, status: 500 },
        { url: `${server.url}/status/404`, status: 404 },
      ],
    })
  })

  test('the link phase stops at its deadline and counts unfinished links as not checked', async () => {
    const started = Date.now()
    const report = reportOf(
      await checkUrl(`${server.url}/hanging-links`, { linkPhaseMs: 300, linkTimeoutMs: 2000 }),
    )
    expect(Date.now() - started).toBeLessThan(1000)
    expect(report.links?.found).toBe(60)
    expect(report.links?.checked).toBeLessThan(50)
    expect(report.links?.broken).toEqual([])
  })

  test('the report does not carry the page link list', async () => {
    const report = reportOf(await checkUrl(`${server.url}/many-links`, { linkCap: 1 }))
    expect(report.page).not.toHaveProperty('links')
    expect(report.links?.found).toBe(60)
  })

  test('a non-HTML response has no page and no links', async () => {
    const report = reportOf(await checkUrl(`${server.url}/file.pdf`))
    expect(report).toMatchObject({
      status: 200,
      contentType: 'application/pdf',
      speed: { htmlBytes: 18 },
      page: null,
      links: null,
    })
  })

  test('HTML with no Content-Type is still parsed', async () => {
    const report = reportOf(await checkUrl(`${server.url}/no-type`))
    expect(report.contentType).toBeNull()
    expect(report.page?.titles).toEqual(['Fixture'])
  })

  test('an error status with an HTML body is still a report', async () => {
    const report = reportOf(await checkUrl(`${server.url}/status/500`))
    expect(report.status).toBe(500)
    expect(report.page?.headings).toEqual([{ level: 1, text: 'Status 500' }])
  })

  test('a slow page is a timeout error with a friendly message', async () => {
    expect(await checkUrl(`${server.url}/slow`, { pageTimeoutMs: 200 })).toEqual({
      kind: 'error',
      reason: 'timeout',
      message: 'The page took longer than 10 seconds to respond. Check the address or try again later.',
    })
  })

  test('an unreachable address is a network error with a friendly message', async () => {
    expect(await checkUrl(await closedPortUrl())).toEqual({
      kind: 'error',
      reason: 'network',
      message: "We couldn't reach that address. Check the spelling, or the site may be down.",
    })
  })

  test('a redirect loop is an error with a friendly message', async () => {
    expect(await checkUrl(`${server.url}/loop`)).toEqual({
      kind: 'error',
      reason: 'too-many-redirects',
      message: 'The page redirected more than 10 times, so we stopped following it.',
    })
  })

  test.each(['', '   ', 'ftp://example.com/file', 'https://user:secret@example.com/'])('%j is an invalid URL', async (input) => {
    expect(await checkUrl(input)).toEqual({
      kind: 'error',
      reason: 'invalid-url',
      message: 'Enter a full web address, like https://example.com.',
    })
  })
})

describe('normalizeUrl', () => {
  test.each([
    ['example.com', 'https://example.com/'],
    ['  https://example.com/a?b=1  ', 'https://example.com/a?b=1'],
    ['http://example.org', 'http://example.org/'],
    ['example.com:8080/path', 'https://example.com:8080/path'],
    ['HTTPS://EXAMPLE.COM', 'https://example.com/'],
  ])('%j becomes %j', (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected)
  })

  test.each(['', '   ', 'ftp://example.com', 'javascript:alert(1)', 'mailto:hello@example.com', 'https://',
    'https://user@example.com/', 'https://user:secret@example.com/', 'example.com@example.org'])(
    '%j is rejected',
    (input) => {
      expect(normalizeUrl(input)).toBeNull()
    },
  )
})
