// @vitest-environment node
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { closedPortUrl, startFixtureServer, type FixtureServer } from '../tests/fixture-server'
import { fetchPage, probeLink } from './fetcher'

let server: FixtureServer
let closed: string

beforeAll(async () => {
  server = await startFixtureServer()
  closed = await closedPortUrl()
})
afterAll(() => server.close())

const text = (body: Uint8Array) => new TextDecoder().decode(body)

describe('fetchPage', () => {
  test('fetches a 200 page with its body, content type and timing', async () => {
    const url = `${server.url}/fixtures/complete.html`
    const result = await fetchPage(url)
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
    const { page } = result
    expect(page).toMatchObject({
      requestedUrl: url,
      finalUrl: url,
      status: 200,
      redirects: [],
      contentType: 'text/html; charset=utf-8',
    })
    expect(text(page.body)).toContain('<title>Complete Example Page</title>')
    expect(Number.isInteger(page.ttfbMs)).toBe(true)
    expect(page.ttfbMs).toBeGreaterThanOrEqual(0)
  })

  test('sends the checker user agent and an HTML accept header', async () => {
    const result = await fetchPage(`${server.url}/echo-headers`)
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
    expect(JSON.parse(text(result.page.body))).toMatchObject({
      'user-agent': 'meta-checker/0.1',
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    })
  })

  test('follows a redirect chain with relative Location headers', async () => {
    const result = await fetchPage(`${server.url}/redirect/a`)
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
    expect(result.page).toMatchObject({
      requestedUrl: `${server.url}/redirect/a`,
      finalUrl: `${server.url}/fixtures/complete.html`,
      status: 200,
      redirects: [
        { url: `${server.url}/redirect/a`, status: 301 },
        { url: `${server.url}/redirect/b`, status: 302 },
      ],
    })
    expect(text(result.page.body)).toContain('Complete Example Page')
  })

  test('time to first byte includes the time spent on redirects', async () => {
    const result = await fetchPage(`${server.url}/redirect/slow-a`)
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
    expect(result.page.redirects).toHaveLength(2)
    expect(result.page.ttfbMs).toBeGreaterThanOrEqual(300)
  })

  test('a redirect status with no Location is the final response', async () => {
    const result = await fetchPage(`${server.url}/redirect/none`)
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
    expect(result.page).toMatchObject({ status: 302, redirects: [], finalUrl: `${server.url}/redirect/none` })
  })

  test('a redirect loop stops with too-many-redirects', async () => {
    expect(await fetchPage(`${server.url}/loop`)).toEqual({ ok: false, reason: 'too-many-redirects' })
  })

  test('maxRedirects caps the number of hops', async () => {
    expect(await fetchPage(`${server.url}/redirect/a`, { maxRedirects: 1 })).toEqual({
      ok: false,
      reason: 'too-many-redirects',
    })
  })

  test('a slow page times out', async () => {
    const started = Date.now()
    expect(await fetchPage(`${server.url}/slow`, { timeoutMs: 200 })).toEqual({ ok: false, reason: 'timeout' })
    expect(Date.now() - started).toBeLessThan(1500)
  })

  test('a closed port is a network failure', async () => {
    expect(await fetchPage(closed)).toEqual({ ok: false, reason: 'network' })
  })

  test.each(['ftp://example.com/file', 'javascript:alert(1)', 'not a url', ''])(
    '%j is an invalid URL',
    async (input) => {
      expect(await fetchPage(input)).toEqual({ ok: false, reason: 'invalid-url' })
    },
  )

  test('returns non-HTML bytes and their content type', async () => {
    const result = await fetchPage(`${server.url}/file.pdf`)
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
    expect(result.page.contentType).toBe('application/pdf')
    expect(text(result.page.body)).toBe('%PDF-1.4\n%fixture\n')
  })

  test('an error status is still a fetched page', async () => {
    const result = await fetchPage(`${server.url}/status/404`)
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
    expect(result.page.status).toBe(404)
    expect(text(result.page.body)).toContain('Status 404')
  })

  test('a missing Content-Type is null', async () => {
    const result = await fetchPage(`${server.url}/no-type`)
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
    expect(result.page.contentType).toBeNull()
  })
})

describe('probeLink', () => {
  test('a working link reports 200', async () => {
    const url = `${server.url}/fixtures/complete.html`
    expect(await probeLink(url)).toEqual({ url, status: 200 })
  })

  test('a missing page reports 404', async () => {
    const url = `${server.url}/status/404`
    expect(await probeLink(url)).toEqual({ url, status: 404 })
  })

  test('a server that refuses HEAD is retried with GET', async () => {
    const url = `${server.url}/head-405`
    expect(await probeLink(url)).toEqual({ url, status: 200 })
  })

  test('a HEAD that never answers falls back to GET within the budget', async () => {
    const url = `${server.url}/head-hang`
    const started = Date.now()
    expect(await probeLink(url, { timeoutMs: 1000 })).toEqual({ url, status: 200 })
    expect(Date.now() - started).toBeLessThan(1000)
  })

  test('a redirect is followed to its final status', async () => {
    const url = `${server.url}/redirect/a`
    expect(await probeLink(url)).toEqual({ url, status: 200 })
  })

  test('a closed port has no status and a network error', async () => {
    expect(await probeLink(closed)).toEqual({ url: closed, status: null, error: 'network' })
  })

  test('a slow link times out within the budget', async () => {
    const url = `${server.url}/slow`
    const started = Date.now()
    expect(await probeLink(url, { timeoutMs: 200 })).toEqual({ url, status: null, error: 'timeout' })
    expect(Date.now() - started).toBeLessThan(1500)
  })

  test('a redirect loop reports too-many-redirects', async () => {
    const url = `${server.url}/loop`
    expect(await probeLink(url)).toEqual({ url, status: null, error: 'too-many-redirects' })
  })
})
