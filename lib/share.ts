// Share links carry the whole report in the URL, signed so nobody can change it and compressed so it fits.
// This is the only module that knows the token format: base64url(deflateRaw(JSON)) "." base64url(HMAC-SHA256).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import type { Report } from './check'

/** Longer tokens are refused before anything else, so a visitor can't make the server verify or inflate much. */
export const MAX_TOKEN_CHARS = 6000
/** The most a signed payload may inflate to. A real trimmed report is far smaller. */
const MAX_JSON_BYTES = 64 * 1024
const TTL_SECONDS = 90 * 24 * 60 * 60
// Bump whenever Report's shape changes: tokens live 90 days and outlive deploys, and older versions then fail as malformed.
const VERSION = 1

export type ShareFailure = 'malformed' | 'too-large' | 'bad-signature' | 'expired'
export type DecodedShare =
  | { ok: true; report: Report; checkedAt: Date; expiresAt: Date }
  | { ok: false; reason: ShareFailure }
type Options = { now?: number; secret?: string }

/**
 * Next bundles each route on its own, so one server process loads several copies of this module.
 * The fallback key lives on globalThis so a link made by the check action opens on the report page and its image.
 */
const FALLBACK_KEY = Symbol.for('meta-checker.share-fallback-key')
const SECRET = loadSecret()

function loadSecret(): string | Buffer {
  const secret = process.env.META_CHECKER_SHARE_SECRET
  if (secret && secret.length >= 32) return secret
  console.warn(
    'META_CHECKER_SHARE_SECRET is missing or shorter than 32 characters, so share links use a random key ' +
      'and will stop working after a restart.',
  )
  const store = globalThis as { [FALLBACK_KEY]?: Buffer }
  return (store[FALLBACK_KEY] ??= randomBytes(32))
}

/** A share token for the report, or null when the report is too big to fit even at the tightest caps. */
export function encodeShare(report: Report, { now = Date.now(), secret }: Options = {}): string | null {
  const key = secret ?? SECRET
  const exp = Math.floor(now / 1000) + TTL_SECONDS
  for (const caps of CAPS) {
    const json = JSON.stringify({ v: VERSION, exp, report: trim(report, caps) })
    // A token the reader would refuse for inflating too far is no use to anyone.
    if (Buffer.byteLength(json) > MAX_JSON_BYTES) continue
    const payload = deflateRawSync(json).toString('base64url')
    const token = `${payload}.${sign(payload, key)}`
    if (token.length <= MAX_TOKEN_CHARS) return token
  }
  return null
}

/** Reads a share token. Checks run cheapest first, and nothing unsigned is ever inflated. Never throws. */
export function decodeShare(token: string, { now = Date.now(), secret }: Options = {}): DecodedShare {
  if (token.length > MAX_TOKEN_CHARS) return { ok: false, reason: 'too-large' }
  const parts = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(token)
  if (!parts) return { ok: false, reason: 'malformed' }
  const [, payload, sig] = parts

  // Compare the signature text itself, so each payload has exactly one valid signature.
  const expected = Buffer.from(sign(payload, secret ?? SECRET))
  const given = Buffer.from(sig)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'bad-signature' }

  let json: string
  try {
    json = inflateRawSync(Buffer.from(payload, 'base64url'), { maxOutputLength: MAX_JSON_BYTES }).toString('utf8')
  } catch (error) {
    const tooLarge = (error as { code?: unknown }).code === 'ERR_BUFFER_TOO_LARGE'
    return { ok: false, reason: tooLarge ? 'too-large' : 'malformed' }
  }

  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (!isRecord(data) || data.v !== VERSION || typeof data.exp !== 'number' || !Number.isFinite(data.exp)) {
    return { ok: false, reason: 'malformed' }
  }
  if (!isRecord(data.report)) return { ok: false, reason: 'malformed' }
  if (data.exp * 1000 <= now) return { ok: false, reason: 'expired' }
  // The signature proves this server wrote the report, so its shape is trusted from here.
  // A token is made right after its check, so the check happened one lifetime before expiry.
  return {
    ok: true,
    report: data.report as Report,
    checkedAt: new Date((data.exp - TTL_SECONDS) * 1000),
    expiresAt: new Date(data.exp * 1000),
  }
}

function sign(payload: string, key: string | Buffer): string {
  return createHmac('sha256', key).update(payload).digest('base64url')
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Tighter and tighter caps, tried in order. None reaches zero, so trimming never changes what the report says:
 * every Missing, Empty, duplicate count, broken or skipped link and total stays as it was. Only text gets shorter,
 * and only the headings list loses items, which the report covers with "N more headings are not shown".
 */
const CAPS = [
  { text: 300, headings: 40 },
  { text: 120, headings: 15 },
  { text: 60, headings: 5 },
] as const
type Caps = (typeof CAPS)[number]

/** At most `max` code points, ending in an ellipsis when cut, and never splitting a character. Never empty. */
function cut(text: string, max: number): string {
  if (text.length <= max) return text
  const chars = [...text]
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`
}

/** Like `cut`, but keeps the whole origin, so the host shown stays right. Only for URLs shown as plain text. */
function cutUrl(url: string, max: number): string {
  if (url.length <= max) return url
  const origin = URL.parse(url)?.origin
  if (!origin || origin === 'null' || !url.startsWith(origin)) return cut(url, max)
  const rest = url.slice(origin.length)
  return origin + cut(rest, Math.max(2, max - origin.length))
}

/**
 * A copy with long text shortened and the headings list capped. Titles and descriptions stay whole, because the
 * report shows their length, and so do broken and skipped link URLs. Lists the report counts or shows in full keep
 * every item.
 */
function trim(report: Report, caps: Caps): Report {
  const { page, links } = report
  const text = (value: string) => cut(value, caps.text)
  const url = (value: string) => cutUrl(value, caps.text)
  return {
    requestedUrl: url(report.requestedUrl),
    finalUrl: url(report.finalUrl),
    status: report.status,
    redirects: report.redirects.map((hop) => ({ url: url(hop.url), status: hop.status })),
    contentType: report.contentType === null ? null : cut(report.contentType, Math.min(caps.text, 100)),
    speed: { ...report.speed },
    page: page && {
      titles: page.titles,
      descriptions: page.descriptions,
      canonicals: page.canonicals.map(text),
      robots: { tags: page.robots.tags.map(text), index: page.robots.index, follow: page.robots.follow },
      headings: page.headings.slice(0, caps.headings).map((heading) => ({ level: heading.level, text: text(heading.text) })),
      headingCount: page.headingCount,
      og: {
        title: page.og.title.map(text),
        description: page.og.description.map(text),
        image: page.og.image.map(text),
        url: page.og.url.map(text),
        type: page.og.type.map(text),
      },
    },
    // Broken and skipped links are kept whole: a cut URL would be a link to the wrong page.
    links: links && { ...links, broken: [...links.broken], skipped: [...links.skipped] },
  }
}
