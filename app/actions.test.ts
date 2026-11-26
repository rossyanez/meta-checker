// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// The action reads the request headers through next/headers, which only works inside a Next request.
const request = vi.hoisted(() => ({ headers: new Headers() }))
vi.mock('next/headers', () => ({ headers: async () => request.headers }))

/** A fresh copy of the action, so each test starts with an empty limiter and reads TRUSTED_PROXY_HOPS anew. */
async function loadAction(trustedProxyHops?: string) {
  vi.resetModules()
  vi.stubEnv('TRUSTED_PROXY_HOPS', trustedProxyHops ?? '')
  return (await import('./actions')).checkAction
}

/** One check from a visitor with these headers. An address that is not a URL fails fast, with no network. */
function check(action: Awaited<ReturnType<typeof loadAction>>, headers: Record<string, string>) {
  request.headers = new Headers(headers)
  const form = new FormData()
  form.set('url', 'not a url')
  return action(null, form)
}

const limited = (seconds: number) => ({
  kind: 'error',
  reason: 'rate-limited',
  message: `Too many checks. Try again in ${seconds} seconds.`,
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

test('an unexpected throw becomes a friendly error', async () => {
  const checkAction = await loadAction()
  request.headers = new Headers({ 'x-meta-checker-peer': '203.0.113.1' })
  const broken = {
    get() {
      throw new Error('boom')
    },
  } as unknown as FormData
  expect(await checkAction(null, broken)).toEqual({
    kind: 'error',
    reason: 'unexpected',
    message: 'Something went wrong while reading that page. Try again, or try a different address.',
  })
})

test('a blank address is an invalid-url error', async () => {
  const checkAction = await loadAction()
  request.headers = new Headers({ 'x-meta-checker-peer': '203.0.113.1' })
  const form = new FormData()
  form.set('url', '  ')
  expect(await checkAction(null, form)).toMatchObject({ kind: 'error', reason: 'invalid-url' })
})

describe('the per-visitor rate limit', () => {
  test('the 11th check in a minute is refused with the real wait in seconds', async () => {
    const action = await loadAction()
    const visitor = { 'x-meta-checker-peer': '203.0.113.5' }
    for (let i = 0; i < 10; i++) expect(await check(action, visitor)).toMatchObject({ reason: 'invalid-url' })
    expect(await check(action, visitor)).toEqual(limited(60))
    vi.advanceTimersByTime(15_500)
    expect(await check(action, visitor)).toEqual(limited(45))
    vi.advanceTimersByTime(44_500)
    expect(await check(action, visitor)).toMatchObject({ reason: 'invalid-url' })
  })

  test('each visitor has their own bucket', async () => {
    const action = await loadAction()
    for (let i = 0; i < 10; i++) await check(action, { 'x-meta-checker-peer': '203.0.113.5' })
    expect(await check(action, { 'x-meta-checker-peer': '203.0.113.5' })).toEqual(limited(60))
    expect(await check(action, { 'x-meta-checker-peer': '203.0.113.6' })).toMatchObject({ reason: 'invalid-url' })
  })

  test('with no trusted proxy, a spoofed X-Forwarded-For does not get a fresh bucket', async () => {
    const action = await loadAction()
    for (let i = 0; i < 10; i++) {
      await check(action, { 'x-meta-checker-peer': '203.0.113.5', 'x-forwarded-for': `198.51.100.${i}` })
    }
    expect(await check(action, { 'x-meta-checker-peer': '203.0.113.5', 'x-forwarded-for': '198.51.100.99' })).toEqual(
      limited(60),
    )
  })

  test('with one trusted proxy, the rightmost X-Forwarded-For entry is the visitor', async () => {
    const action = await loadAction('1')
    // The proxy appends the address it saw; anything to its left came from the client.
    for (let i = 0; i < 10; i++) {
      await check(action, { 'x-meta-checker-peer': '10.0.0.2', 'x-forwarded-for': `1.2.3.${i}, 198.51.100.7` })
    }
    expect(await check(action, { 'x-meta-checker-peer': '10.0.0.2', 'x-forwarded-for': '198.51.100.7' })).toEqual(
      limited(60),
    )
    expect(await check(action, { 'x-meta-checker-peer': '10.0.0.2', 'x-forwarded-for': '198.51.100.8' })).toMatchObject({
      reason: 'invalid-url',
    })
  })

  test('with two trusted proxies, the second entry from the right is the visitor', async () => {
    const action = await loadAction('2')
    for (let i = 0; i < 10; i++) await check(action, { 'x-forwarded-for': `9.9.9.${i}, 198.51.100.7, 10.0.0.${i}` })
    expect(await check(action, { 'x-forwarded-for': '198.51.100.7, 10.0.0.50' })).toEqual(limited(60))
  })

  test('a forwarded list shorter than the trusted hops falls into one shared bucket', async () => {
    const action = await loadAction('2')
    for (let i = 0; i < 10; i++) await check(action, { 'x-forwarded-for': `198.51.100.${i}` })
    expect(await check(action, { 'x-forwarded-for': '198.51.100.200' })).toEqual(limited(60))
  })

  test('a request without the peer address falls into one shared bucket', async () => {
    const action = await loadAction()
    for (let i = 0; i < 10; i++) await check(action, { 'x-forwarded-for': `198.51.100.${i}` })
    expect(await check(action, {})).toEqual(limited(60))
  })

  test('an IPv4-mapped IPv6 peer shares the bucket of its IPv4 address', async () => {
    const action = await loadAction()
    for (let i = 0; i < 10; i++) await check(action, { 'x-meta-checker-peer': '::ffff:203.0.113.9' })
    expect(await check(action, { 'x-meta-checker-peer': '203.0.113.9' })).toEqual(limited(60))
  })

  test('IPv6 visitors are counted by their /64', async () => {
    const action = await loadAction()
    for (let i = 0; i < 10; i++) await check(action, { 'x-meta-checker-peer': `2001:db8:1:2::${i + 1}` })
    expect(await check(action, { 'x-meta-checker-peer': '2001:db8:1:2:ffff:ffff:ffff:ffff' })).toEqual(limited(60))
    expect(await check(action, { 'x-meta-checker-peer': '2001:db8:1:3::1' })).toMatchObject({ reason: 'invalid-url' })
  })

  test.each(['-1', '1.5', 'one', ' 1'])('TRUSTED_PROXY_HOPS=%j is refused at startup', async (value) => {
    await expect(loadAction(value)).rejects.toThrow(/TRUSTED_PROXY_HOPS/)
  })
})

test('a report comes with a share token that decodes to the same report', async () => {
  const { startFixtureServer } = await import('../tests/fixture-server')
  const server = await startFixtureServer()
  try {
    vi.stubEnv('META_CHECKER_TEST_ALLOW_LOOPBACK', '1')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const checkAction = await loadAction()
    const { decodeShare } = await import('../lib/share')
    request.headers = new Headers({ 'x-meta-checker-peer': '203.0.113.1' })
    const form = new FormData()
    form.set('url', `${server.url}/fixtures/complete.html`)

    const result = await checkAction(null, form)

    expect(result.kind).toBe('report')
    if (result.kind !== 'report') return
    expect(result.shareToken).toEqual(expect.any(String))
    expect(decodeShare(result.shareToken!)).toMatchObject({ ok: true, report: result.report })
  } finally {
    vi.restoreAllMocks()
    await server.close()
  }
})
