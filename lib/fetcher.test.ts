// @vitest-environment node
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { answering, fixturePolicy, noDnsPolicy } from '../tests/policy'
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
    const result = await fetchPage(url, { policy: fixturePolicy })
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
    const result = await fetchPage(`${server.url}/echo-headers`, { policy: fixturePolicy })
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
    expect(JSON.parse(text(result.page.body))).toMatchObject({
      'user-agent': 'meta-checker/0.1',
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    })
  })

  test('follows a redirect chain with relative Location headers', async () => {
    const result = await fetchPage(`${server.url}/redirect/a`, { policy: fixturePolicy })
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
    const result = await fetchPage(`${server.url}/redirect/slow-a`, { policy: fixturePolicy })
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
    expect(result.page.redirects).toHaveLength(2)
    expect(result.page.ttfbMs).toBeGreaterThanOrEqual(300)
  })

  test('a redirect status with no Location is the final response', async () => {
    const result = await fetchPage(`${server.url}/redirect/none`, { policy: fixturePolicy })
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
    expect(result.page).toMatchObject({ status: 302, redirects: [], finalUrl: `${server.url}/redirect/none` })
  })

  test('a redirect loop stops with too-many-redirects', async () => {
    expect(await fetchPage(`${server.url}/loop`, { policy: fixturePolicy })).toEqual({ ok: false, reason: 'too-many-redirects' })
  })

  test('maxRedirects caps the number of hops', async () => {
    expect(await fetchPage(`${server.url}/redirect/a`, { policy: fixturePolicy, maxRedirects: 1 })).toEqual({
      ok: false,
      reason: 'too-many-redirects',
    })
  })

  test('a slow page times out', async () => {
    const started = Date.now()
    expect(await fetchPage(`${server.url}/slow`, { policy: fixturePolicy, timeoutMs: 200 })).toEqual({ ok: false, reason: 'timeout' })
    expect(Date.now() - started).toBeLessThan(1500)
  })

  test('a closed port is a network failure', async () => {
    expect(await fetchPage(closed, { policy: fixturePolicy })).toEqual({ ok: false, reason: 'network' })
  })

  test.each(['ftp://example.com/file', 'javascript:alert(1)', 'not a url', ''])(
    '%j is an invalid URL',
    async (input) => {
      expect(await fetchPage(input, { policy: fixturePolicy })).toEqual({ ok: false, reason: 'invalid-url' })
    },
  )

  test('returns non-HTML bytes and their content type', async () => {
    const result = await fetchPage(`${server.url}/file.pdf`, { policy: fixturePolicy })
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
    expect(result.page.contentType).toBe('application/pdf')
    expect(text(result.page.body)).toBe('%PDF-1.4\n%fixture\n')
  })

  test('an error status is still a fetched page', async () => {
    const result = await fetchPage(`${server.url}/status/404`, { policy: fixturePolicy })
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
    expect(result.page.status).toBe(404)
    expect(text(result.page.body)).toContain('Status 404')
  })

  test('a missing Content-Type is null', async () => {
    const result = await fetchPage(`${server.url}/no-type`, { policy: fixturePolicy })
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
    expect(result.page.contentType).toBeNull()
  })
})

describe('probeLink', () => {
  test('a working link reports 200', async () => {
    const url = `${server.url}/fixtures/complete.html`
    expect(await probeLink(url, { policy: fixturePolicy })).toEqual({ url, status: 200 })
  })

  test('a missing page reports 404', async () => {
    const url = `${server.url}/status/404`
    expect(await probeLink(url, { policy: fixturePolicy })).toEqual({ url, status: 404 })
  })

  test('a server that refuses HEAD is retried with GET', async () => {
    const url = `${server.url}/head-405`
    expect(await probeLink(url, { policy: fixturePolicy })).toEqual({ url, status: 200 })
  })

  test('a HEAD that never answers falls back to GET within the budget', async () => {
    const url = `${server.url}/head-hang`
    const started = Date.now()
    expect(await probeLink(url, { policy: fixturePolicy, timeoutMs: 1000 })).toEqual({ url, status: 200 })
    expect(Date.now() - started).toBeLessThan(1000)
  })

  test('a slow link that answers after the HEAD share still reports its status', async () => {
    const url = `${server.url}/delay/700`
    expect(await probeLink(url, { policy: fixturePolicy, timeoutMs: 1000 })).toEqual({ url, status: 200 })
  })

  test('a redirect is followed to its final status', async () => {
    const url = `${server.url}/redirect/a`
    expect(await probeLink(url, { policy: fixturePolicy })).toEqual({ url, status: 200 })
  })

  test('a closed port has no status and a network error', async () => {
    expect(await probeLink(closed, { policy: fixturePolicy })).toEqual({ url: closed, status: null, error: 'network' })
  })

  test('a slow link times out within the budget', async () => {
    const url = `${server.url}/slow`
    const started = Date.now()
    expect(await probeLink(url, { policy: fixturePolicy, timeoutMs: 200 })).toEqual({ url, status: null, error: 'timeout' })
    expect(Date.now() - started).toBeLessThan(1500)
  })

  test('a redirect loop reports too-many-redirects', async () => {
    const url = `${server.url}/loop`
    expect(await probeLink(url, { policy: fixturePolicy })).toEqual({ url, status: null, error: 'too-many-redirects' })
  })
})

// Every refusal below is decided before a connection. The short timeout only keeps a regression from
// hanging on an address that never answers.
const QUICK = 1_000

describe('fetchPage refuses destinations that are not public web servers', () => {
  test.each([
    ['loopback IPv4', 'http://127.0.0.1/'],
    ['localhost', 'http://localhost/'],
    ['a subdomain of localhost', 'http://foo.localhost/'],
    ['localhost with a trailing dot', 'http://localhost./'],
    ['a full-width IDN form of localhost', 'http://ｌｏｃａｌｈｏｓｔ/'],
    ['a private IPv4 address', 'http://10.0.0.1/'],
    ['the cloud metadata address', 'http://169.254.169.254/'],
    ['loopback IPv6', 'http://[::1]/'],
    ['IPv4-mapped loopback, dotted', 'http://[::ffff:127.0.0.1]/'],
    ['IPv4-mapped loopback, hex', 'http://[::ffff:7f00:1]/'],
    ['IPv4-compatible loopback', 'http://[::127.0.0.1]/'],
    ['IPv4-compatible public-looking address', 'http://[::102:304]/'],
    ['IPv6 outside 2000::/3', 'http://[4000::1]/'],
    ['IPv6 1::, outside 2000::/3', 'http://[1::]/'],
    ['NAT64 loopback', 'http://[64:ff9b::7f00:1]/'],
    ['NAT64 local-use loopback', 'http://[64:ff9b:1::7f00:1]/'],
    ['the AWS IPv6 metadata address', 'http://[fd00:ec2::254]/'],
    ['the Alibaba metadata address', 'http://100.100.100.200/'],
    ['the Oracle metadata address', 'http://192.0.0.192/'],
    ['the Azure host address', 'http://168.63.129.16/'],
    ['carrier-grade NAT', 'http://100.64.0.1/'],
    ['the unspecified IPv4 address', 'http://0.0.0.0/'],
    ['the unspecified IPv6 address', 'http://[::]/'],
    ['multicast', 'http://224.0.0.1/'],
    ['broadcast', 'http://255.255.255.255/'],
    ['the benchmarking range', 'http://198.18.0.1/'],
    ['loopback as a decimal number', 'http://2130706433/'],
    ['loopback as a hex number', 'http://0x7f000001/'],
    ['loopback as hex dotted', 'http://0x7f.1/'],
    ['loopback in short form', 'http://127.1/'],
    ['loopback in octal', 'http://017700000001/'],
  ])('%s (%s) is blocked without asking DNS', async (_name, url) => {
    const policy = noDnsPolicy()
    expect(await fetchPage(url, { policy, timeoutMs: QUICK })).toEqual({ ok: false, reason: 'blocked' })
    expect(policy.calls).toEqual([])
  })

  test('a public-looking name whose DNS answer is private is blocked', async () => {
    const policy = answering(false, ['10.0.0.1'])
    expect(await fetchPage('http://intranet.example.test/', { policy, timeoutMs: QUICK })).toEqual({
      ok: false,
      reason: 'blocked',
    })
    expect(policy.calls).toEqual(['intranet.example.test'])
  })

  test('a DNS answer that mixes public and private addresses is blocked', async () => {
    const policy = answering(false, ['93.184.215.14', '10.0.0.1'])
    expect(await fetchPage('http://mixed.example.test/', { policy, timeoutMs: QUICK })).toEqual({
      ok: false,
      reason: 'blocked',
    })
    expect(policy.calls).toEqual(['mixed.example.test'])
  })

  test('an empty DNS answer is blocked', async () => {
    const policy = answering(false, [])
    expect(await fetchPage('http://empty.example.test/', { policy, timeoutMs: QUICK })).toEqual({
      ok: false,
      reason: 'blocked',
    })
    expect(policy.calls).toEqual(['empty.example.test'])
  })

  test('a port other than 80 or 443 is blocked', async () => {
    const policy = answering(false, ['93.184.215.14'])
    expect(await fetchPage('http://shop.example.test:8080/', { policy, timeoutMs: QUICK })).toEqual({
      ok: false,
      reason: 'blocked',
    })
  })

  test('the test policy lifts the port rule only for loopback', async () => {
    const policy = answering(true, ['93.184.215.14'])
    expect(await fetchPage('http://shop.example.test:8080/', { policy, timeoutMs: QUICK })).toEqual({
      ok: false,
      reason: 'blocked',
    })
  })

  test('a redirect into a private address is blocked', async () => {
    const url = `${server.url}/redirect-to?location=${encodeURIComponent('http://10.0.0.1/')}`
    expect(await fetchPage(url, { policy: fixturePolicy, timeoutMs: QUICK })).toEqual({ ok: false, reason: 'blocked' })
  })

  test('a redirect into the cloud metadata address is blocked', async () => {
    const url = `${server.url}/redirect-to?location=${encodeURIComponent('http://169.254.169.254/latest/meta-data/')}`
    expect(await fetchPage(url, { policy: fixturePolicy, timeoutMs: QUICK })).toEqual({ ok: false, reason: 'blocked' })
  })

  test('a redirect to an address with credentials is blocked', async () => {
    const target = `${server.url.replace('http://', 'http://user:secret@')}/fixtures/complete.html`
    const url = `${server.url}/redirect-to?location=${encodeURIComponent(target)}`
    expect(await fetchPage(url, { policy: fixturePolicy, timeoutMs: QUICK })).toEqual({ ok: false, reason: 'blocked' })
  })

  test('a redirect to a non-web scheme is blocked', async () => {
    const url = `${server.url}/redirect-to?location=${encodeURIComponent('file:///etc/passwd')}`
    expect(await fetchPage(url, { policy: fixturePolicy, timeoutMs: QUICK })).toEqual({ ok: false, reason: 'blocked' })
  })

  test('the checked address is the one connected to, with one DNS lookup per connection', async () => {
    // A rebinding attempt: the first answer passes the check, a second lookup would get a private address.
    const policy = answering(true, ['127.0.0.1'], ['10.0.0.1'])
    const port = new URL(server.url).port
    const result = await fetchPage(`http://rebind.example.test:${port}/fixtures/complete.html`, { policy })
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
    expect(text(result.page.body)).toContain('Complete Example Page')
    expect(policy.calls).toEqual(['rebind.example.test'])
  })
})

describe('fetchPage limits what it reads', () => {
  test('a body over 5 MB without a Content-Length is too large', async () => {
    expect(await fetchPage(`${server.url}/huge`, { policy: fixturePolicy })).toEqual({ ok: false, reason: 'too-large' })
  })

  test('a Content-Length over 5 MB is too large before any body arrives', async () => {
    const started = Date.now()
    expect(await fetchPage(`${server.url}/huge-length`, { policy: fixturePolicy, timeoutMs: 2_000 })).toEqual({
      ok: false,
      reason: 'too-large',
    })
    expect(Date.now() - started).toBeLessThan(1_000)
  })

  test('a body that trickles in forever hits the total timeout', async () => {
    const started = Date.now()
    expect(await fetchPage(`${server.url}/trickle`, { policy: fixturePolicy, timeoutMs: 500 })).toEqual({
      ok: false,
      reason: 'timeout',
    })
    expect(Date.now() - started).toBeLessThan(1_500)
  })
})

describe('probeLink refuses destinations that are not public web servers', () => {
  test('a link to a private address is blocked', async () => {
    const policy = noDnsPolicy()
    expect(await probeLink('http://10.0.0.1/admin', { policy, timeoutMs: QUICK })).toEqual({
      url: 'http://10.0.0.1/admin',
      status: null,
      error: 'blocked',
    })
  })

  test('a link that redirects into a private address is blocked', async () => {
    const url = `${server.url}/redirect-to?location=${encodeURIComponent('http://192.168.1.1/')}`
    expect(await probeLink(url, { policy: fixturePolicy, timeoutMs: QUICK })).toEqual({
      url,
      status: null,
      error: 'blocked',
    })
  })
})

describe('fetchPage gives up on a connection that never opens', () => {
  // 15 s, so a missing connect timeout fails on the assertion after the 10 s page budget, not on Vitest's limit.
  test('a connect that hangs fails after the connect timeout, well inside the page budget', { timeout: 15_000 }, async () => {
    const policy = { resolve: () => new Promise<never>(() => {}), allowLoopback: false }
    const started = Date.now()
    expect(await fetchPage('http://stalled.example.test/', { policy })).toEqual({ ok: false, reason: 'network' })
    const elapsed = Date.now() - started
    expect(elapsed).toBeGreaterThanOrEqual(2_500)
    expect(elapsed).toBeLessThan(5_000)
  })
})
