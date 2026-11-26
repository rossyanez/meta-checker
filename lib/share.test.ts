// @vitest-environment node
import { createHmac, randomBytes } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Report } from './check'
import { decodeShare, encodeShare, MAX_TOKEN_CHARS } from './share'

// Test keys are built at run time, so no key-like literal sits in the source.
const secret = 's'.repeat(40)
const otherSecret = 'o'.repeat(40)
const now = Date.UTC(2026, 0, 15, 12, 0, 0)
const DAY_MS = 24 * 60 * 60 * 1000
const opts = { secret, now }

function buildReport(overrides: Partial<Report> = {}): Report {
  return {
    requestedUrl: 'https://example.com/',
    finalUrl: 'https://example.com/',
    status: 200,
    redirects: [],
    contentType: 'text/html; charset=utf-8',
    speed: { ttfbMs: 123, htmlBytes: 2560 },
    page: {
      titles: ['Example'],
      descriptions: ['An example page.'],
      canonicals: ['https://example.com/'],
      robots: { tags: ['index, follow'], index: true, follow: true },
      headings: [{ level: 1, text: 'Welcome' }],
      headingCount: 1,
      og: { title: ['Example'], description: [], image: [], url: [], type: ['website'] },
    },
    links: { found: 1, checked: 1, broken: [{ url: 'https://example.com/gone', status: 404 }], skipped: [], stoppedEarly: false },
    ...overrides,
  }
}

const b64url = (bytes: Buffer) => bytes.toString('base64url')

/** Builds a token the way the format says, so tests can sign payloads that encodeShare would never produce. */
function signRaw(compressed: Buffer, key = secret): string {
  const payload = b64url(compressed)
  return `${payload}.${b64url(createHmac('sha256', key).update(payload).digest())}`
}

const signJson = (value: unknown, key = secret) => signRaw(deflateRawSync(Buffer.from(JSON.stringify(value))), key)

function tokenFor(report: Report = buildReport()): string {
  const token = encodeShare(report, opts)
  if (token === null) throw new Error('expected a token')
  return token
}

/** Random text that compresses badly, so tests can push the token past its size cap. */
const noise = (chars: number) => randomBytes(chars).toString('base64').slice(0, chars)

describe('encodeShare and decodeShare', () => {
  test('round-trip keeps hostile strings byte-exact', () => {
    const hostile = [
      '<script>alert(1)</script>',
      '"><img src=x onerror=alert(1)>',
      "' OR 1=1 --",
      'null\u0000byte and ‮right-to-left',
      'emoji 🧪 and astral 𝔘𝔫𝔦𝔠𝔬𝔡𝔢',
      'line\nbreak\ttab\\backslash',
      '{"v":2}',
    ]
    const report = buildReport({
      finalUrl: 'https://example.com/a?b=<c>&d="e"',
      page: { ...buildReport().page!, titles: hostile, descriptions: hostile.slice(0, 5) },
    })

    const decoded = decodeShare(tokenFor(report), opts)

    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.report.finalUrl).toBe(report.finalUrl)
    expect(decoded.report.page?.titles).toEqual(hostile)
    expect(decoded.report.page?.descriptions).toEqual(hostile.slice(0, 5))
    expect(decoded.report.links).toEqual(report.links)
  })

  test('a token uses only base64url characters and one dot', () => {
    expect(tokenFor()).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  })

  test('the link knows when it was made and expires 90 days later', () => {
    const decoded = decodeShare(tokenFor(), opts)
    expect(decoded.ok && decoded.checkedAt.getTime()).toBe(now)
    expect(decoded.ok && decoded.expiresAt.getTime()).toBe(now + 90 * DAY_MS)
  })

  test('a link still works just before it expires and not after', () => {
    const token = tokenFor()
    expect(decodeShare(token, { secret, now: now + 90 * DAY_MS - 1000 }).ok).toBe(true)
    expect(decodeShare(token, { secret, now: now + 90 * DAY_MS + 1000 })).toEqual({ ok: false, reason: 'expired' })
  })

  test('a tampered payload fails the signature check', () => {
    const [payload, sig] = tokenFor().split('.')
    const flipped = (payload[0] === 'A' ? 'B' : 'A') + payload.slice(1)
    expect(decodeShare(`${flipped}.${sig}`, opts)).toEqual({ ok: false, reason: 'bad-signature' })
  })

  test('a tampered signature fails the signature check', () => {
    const [payload, sig] = tokenFor().split('.')
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
    expect(decodeShare(`${payload}.${flipped}`, opts)).toEqual({ ok: false, reason: 'bad-signature' })
    expect(decodeShare(`${payload}.${sig.slice(0, -2)}`, opts)).toEqual({ ok: false, reason: 'bad-signature' })
  })

  test('a token signed with another secret fails the signature check', () => {
    expect(decodeShare(tokenFor(), { secret: otherSecret, now })).toEqual({ ok: false, reason: 'bad-signature' })
  })

  test('unsigned garbage is refused by the signature check, before anything is inflated', () => {
    // Not deflate data at all: if it were inflated first, this would come back malformed.
    const payload = b64url(Buffer.from('this is not deflate data'))
    expect(decodeShare(`${payload}.${b64url(randomBytes(32))}`, opts)).toEqual({ ok: false, reason: 'bad-signature' })
  })

  test('a token longer than the cap is refused, even when correctly signed', () => {
    const token = signJson({ v: 1, exp: now / 1000 + 1000, report: buildReport({ finalUrl: noise(6000) }) })
    expect(token.length).toBeGreaterThan(MAX_TOKEN_CHARS)
    expect(decodeShare(token, opts)).toEqual({ ok: false, reason: 'too-large' })
  })

  test('a signed zip bomb that fits under the length cap is refused fast', () => {
    // 4 MB of JSON squeezes to about 4 KB. Without an output cap it would inflate and decode.
    const bomb = `{"v":1,"exp":${now / 1000 + 1000},"report":{"x":"${'a'.repeat(4 * 1024 * 1024)}"}}`
    const token = signRaw(deflateRawSync(Buffer.from(bomb), { level: 9 }))
    expect(token.length).toBeLessThanOrEqual(MAX_TOKEN_CHARS)

    const started = performance.now()
    expect(decodeShare(token, opts)).toEqual({ ok: false, reason: 'too-large' })
    expect(performance.now() - started).toBeLessThan(1000)
  })

  test('a signed 10 MB zip bomb is refused by the length cap', () => {
    const token = signRaw(deflateRawSync(Buffer.alloc(10 * 1024 * 1024), { level: 9 }))
    expect(decodeShare(token, opts)).toEqual({ ok: false, reason: 'too-large' })
  })

  test.each([
    ['empty', ''],
    ['no dot', 'abcdef'],
    ['two dots', 'abc.def.ghi'],
    ['empty payload', '.abcdef'],
    ['empty signature', 'abcdef.'],
    ['bad charset', 'ab+c/d=.efgh'],
    ['spaces', 'abc def.ghi'],
  ])('a malformed token is refused: %s', (_name, token) => {
    expect(decodeShare(token, opts)).toEqual({ ok: false, reason: 'malformed' })
  })

  test('a signed payload that is not deflate data is malformed', () => {
    const payload = b64url(Buffer.from('plain text, not deflate'))
    const token = `${payload}.${b64url(createHmac('sha256', secret).update(payload).digest())}`
    expect(decodeShare(token, opts)).toEqual({ ok: false, reason: 'malformed' })
  })

  test('a signed payload that is not JSON is malformed', () => {
    expect(decodeShare(signRaw(deflateRawSync(Buffer.from('not json {'))), opts)).toEqual({
      ok: false,
      reason: 'malformed',
    })
  })

  test.each([
    ['wrong version', { v: 2, exp: now / 1000 + 1000, report: buildReport() }],
    ['missing version', { exp: now / 1000 + 1000, report: buildReport() }],
    ['missing expiry', { v: 1, report: buildReport() }],
    ['expiry not a number', { v: 1, exp: 'soon', report: buildReport() }],
    ['missing report', { v: 1, exp: now / 1000 + 1000 }],
    ['not an object', [1, 2, 3]],
    ['null', null],
  ])('a signed payload with the wrong shape is malformed: %s', (_name, value) => {
    expect(decodeShare(signJson(value), opts)).toEqual({ ok: false, reason: 'malformed' })
  })
})

describe('trimming', () => {
  test('a huge report fits by shortening strings, and keeps every list item a verdict depends on', () => {
    const long = 'x'.repeat(5000)
    const many = (n: number) => Array.from({ length: n }, (_, i) => `${long}${i}`)
    // Titles and descriptions are kept whole, so they stay well under the 64 KB decode limit here.
    const shown = Array.from({ length: 8 }, (_, i) => `${'x'.repeat(2000)}${i}`)
    const report = buildReport({
      finalUrl: `https://example.com/${long}`,
      contentType: `text/html; ${long}`,
      redirects: Array.from({ length: 10 }, (_, i) => ({ url: `https://example.com/${i}/${long}`, status: 301 })),
      page: {
        titles: shown,
        descriptions: shown,
        canonicals: many(8),
        robots: { tags: many(12), index: false, follow: true },
        headings: Array.from({ length: 200 }, (_, i) => ({ level: 2, text: `${long}${i}` })),
        headingCount: 1234,
        og: { title: many(8), description: many(8), image: many(8), url: many(8), type: many(8) },
      },
      links: {
        found: 777,
        checked: 50,
        broken: Array.from({ length: 30 }, (_, i) => ({ url: `https://example.com/broken/${i}/${'x'.repeat(200)}`, status: 404 })),
        skipped: Array.from({ length: 20 }, (_, i) => ({ url: `http://10.0.0.${i}/${'x'.repeat(200)}`, status: null, error: 'blocked' as const })),
        stoppedEarly: true,
      },
    })

    const token = tokenFor(report)
    expect(token.length).toBeLessThanOrEqual(MAX_TOKEN_CHARS)
    const decoded = decodeShare(token, opts)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    const { page, links } = decoded.report

    // Lists shown as "Found N" or as a chain keep every item.
    expect(decoded.report.redirects).toHaveLength(10)
    expect(page!.canonicals).toHaveLength(8)
    expect(page!.robots.tags).toHaveLength(12)
    expect(page!.og.image).toHaveLength(8)
    // Titles and descriptions show their length, so they are never shortened.
    expect(page!.titles).toEqual(report.page!.titles)
    expect(page!.descriptions).toEqual(report.page!.descriptions)
    // Every broken and skipped link is kept.
    expect(links!.broken).toEqual(report.links!.broken)
    expect(links!.skipped).toEqual(report.links!.skipped)
    expect(links).toMatchObject({ found: 777, checked: 50, stoppedEarly: true })
    // Other strings are shortened, URLs keep their origin, and only the headings list is cut.
    expect([...page!.canonicals[0]].length).toBeLessThanOrEqual(300)
    expect(new URL(decoded.report.finalUrl).origin).toBe('https://example.com')
    expect([...decoded.report.finalUrl].length).toBeLessThanOrEqual(300)
    expect(decoded.report.redirects.every((hop) => new URL(hop.url).origin === 'https://example.com')).toBe(true)
    expect(page!.headings.length).toBeGreaterThanOrEqual(5)
    expect(page!.headings.length).toBeLessThanOrEqual(40)
    expect(page!.headingCount).toBe(1234)
    expect(page!.robots.index).toBe(false)
  })

  test('trimming never splits a character in two', () => {
    const text = '🧪'.repeat(400)
    const decoded = decodeShare(tokenFor(buildReport({ page: { ...buildReport().page!, canonicals: [text] } })), opts)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    const cut = decoded.report.page!.canonicals[0]
    expect([...cut].length).toBeLessThanOrEqual(300)
    expect(cut.isWellFormed()).toBe(true)
    expect(text.startsWith(cut.replace(/…$/, ''))).toBe(true)
  })

  test('tightens its caps instead of emptying lists when the report is hard to compress', () => {
    const report = buildReport({
      page: {
        ...buildReport().page!,
        headings: Array.from({ length: 200 }, () => ({ level: 2, text: noise(300) })),
        headingCount: 200,
      },
      links: {
        found: 50,
        checked: 50,
        broken: Array.from({ length: 50 }, (_, i) => ({ url: `https://example.com/docs/${i}/${noise(20)}`, status: 404 })),
        skipped: [],
        stoppedEarly: false,
      },
    })

    const token = tokenFor(report)
    expect(token.length).toBeLessThanOrEqual(MAX_TOKEN_CHARS)
    const decoded = decodeShare(token, opts)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.report.page!.headings.length).toBeGreaterThanOrEqual(5)
    expect(decoded.report.page!.headingCount).toBe(200)
    expect(decoded.report.links!.broken).toEqual(report.links!.broken)
  })

  test('never cuts a broken or skipped link, even when every other string is cut to the tightest cap', () => {
    // Long links that compress well, next to text that does not, so only the tightest caps can fit.
    const hard = (n: number) => Array.from({ length: n }, () => noise(400))
    const brokenUrl = (i: number) => `https://example.com/archive/2019/a-long-article-slug-that-goes-on-and-on-${i}`
    const report = buildReport({
      finalUrl: `https://example.com/${noise(400)}`,
      redirects: Array.from({ length: 5 }, () => ({ url: `https://example.com/${noise(300)}`, status: 301 })),
      page: {
        ...buildReport().page!,
        canonicals: [noise(400)],
        robots: { tags: Array.from({ length: 30 }, () => noise(400)), index: true, follow: true },
        headings: Array.from({ length: 200 }, () => ({ level: 2, text: noise(300) })),
        headingCount: 200,
        og: { title: hard(6), description: hard(6), image: hard(6), url: hard(6), type: [] },
      },
      links: {
        found: 50,
        checked: 50,
        broken: Array.from({ length: 40 }, (_, i) => ({ url: brokenUrl(i), status: 404 })),
        skipped: Array.from({ length: 10 }, (_, i) => ({ url: `http://10.0.0.${i}/${'private-page/'.repeat(8)}`, status: null, error: 'blocked' as const })),
        stoppedEarly: false,
      },
    })

    const decoded = decodeShare(tokenFor(report), opts)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    // The tightest caps ran: plain-text URLs are cut to 60 characters.
    expect([...decoded.report.finalUrl].length).toBeLessThanOrEqual(60)
    expect(decoded.report.links!.broken).toEqual(report.links!.broken)
    expect(decoded.report.links!.skipped).toEqual(report.links!.skipped)
  })

  test('returns null when the broken links cannot fit whole', () => {
    const report = buildReport({
      links: {
        found: 50,
        checked: 50,
        broken: Array.from({ length: 50 }, () => ({ url: `https://example.com/${noise(280)}`, status: 404 })),
        skipped: [],
        stoppedEarly: false,
      },
    })
    expect(encodeShare(report, opts)).toBeNull()
  })

  test('returns null when even the tightest caps do not fit', () => {
    // A title is never shortened, because the report shows its length.
    const report = buildReport({ page: { ...buildReport().page!, titles: [noise(9000)] } })
    expect(encodeShare(report, opts)).toBeNull()
  })

  test('returns null rather than a token that would inflate past the decode limit', () => {
    // Compresses to a tiny token, but a reader would refuse it, so it must never be handed out.
    const report = buildReport({ page: { ...buildReport().page!, titles: ['x'.repeat(70_000)] } })
    expect(encodeShare(report, opts)).toBeNull()
  })

  test('does not change the report it was given', () => {
    const report = buildReport({ finalUrl: `https://example.com/${'x'.repeat(1000)}` })
    const copy = structuredClone(report)
    tokenFor(report)
    expect(report).toEqual(copy)
  })
})

describe('the server secret', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  test('uses META_CHECKER_SHARE_SECRET when it is long enough', async () => {
    vi.stubEnv('META_CHECKER_SHARE_SECRET', secret)
    vi.resetModules()
    const share = await import('./share')
    const token = share.encodeShare(buildReport(), { now })!
    expect(decodeShare(token, { secret, now }).ok).toBe(true)
  })

  test.each([
    ['missing', undefined],
    ['too short', 'short-secret'],
  ])('warns and uses a random key when the secret is %s', async (_name, value) => {
    vi.stubEnv('META_CHECKER_SHARE_SECRET', value)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.resetModules()
    const share = await import('./share')

    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0][0])).toMatch(/restart/)
    const token = share.encodeShare(buildReport(), { now })!
    expect(share.decodeShare(token, { now }).ok).toBe(true)
    expect(decodeShare(token, { secret: value ?? '', now }).ok).toBe(false)
  })

  test('without a secret, every copy of the module in one process shares the random key', async () => {
    // Next bundles each route separately, so the page and its image route each load their own copy.
    vi.stubEnv('META_CHECKER_SHARE_SECRET', undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.resetModules()
    const first = await import('./share')
    vi.resetModules()
    const second = await import('./share')

    expect(second).not.toBe(first)
    expect(second.decodeShare(first.encodeShare(buildReport(), { now })!, { now }).ok).toBe(true)
  })
})
