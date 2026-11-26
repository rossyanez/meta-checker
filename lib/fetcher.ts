export type FetchFailure = 'invalid-url' | 'timeout' | 'network' | 'too-many-redirects'

export type FetchedPage = {
  requestedUrl: string
  finalUrl: string
  status: number
  redirects: { url: string; status: number }[]
  contentType: string | null
  body: Uint8Array
  ttfbMs: number
}

export type LinkProbe = { url: string; status: number | null; error?: 'timeout' | 'network' | 'too-many-redirects' }

const PAGE_TIMEOUT_MS = 10_000
const LINK_TIMEOUT_MS = 5_000
/** HEAD gets this share of a probe's budget, so a hanging HEAD leaves time for the GET. */
const HEAD_SHARE = 2 / 5
const MAX_REDIRECTS = 10
const HEADERS = {
  'User-Agent': 'meta-checker/0.1',
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
}

type Hops = {
  response: Response
  finalUrl: string
  redirects: { url: string; status: number }[]
  ttfbMs: number
}
type RequestFailure = NonNullable<LinkProbe['error']>
type HopsResult = { ok: true; hops: Hops } | { ok: false; reason: RequestFailure }

function parseHttpUrl(input: string, base?: string): URL | null {
  try {
    const url = new URL(input, base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** Why a request threw: the shared budget ran out, or the network failed. */
function failureOf(signal: AbortSignal): 'timeout' | 'network' {
  return signal.aborted ? 'timeout' : 'network'
}

/**
 * The one place this app sends a request. Every redirect hop goes through this loop,
 * so a check on where we connect belongs here. Never throws.
 */
async function request(
  start: URL,
  method: 'GET' | 'HEAD',
  signal: AbortSignal,
  maxRedirects: number,
): Promise<HopsResult> {
  const redirects: Hops['redirects'] = []
  let url = start
  // Like browsers, time to first byte counts from the first request, so redirect time is included.
  const sentAt = performance.now()
  try {
    for (;;) {
      const response = await fetch(url, { method, headers: HEADERS, redirect: 'manual', signal })
      const ttfbMs = Math.round(performance.now() - sentAt)
      const location = response.headers.get('location')
      if (response.status < 300 || response.status > 399 || location === null) {
        return { ok: true, hops: { response, finalUrl: url.href, redirects, ttfbMs } }
      }
      await response.body?.cancel()
      redirects.push({ url: url.href, status: response.status })
      if (redirects.length > maxRedirects) return { ok: false, reason: 'too-many-redirects' }
      const next = parseHttpUrl(location, url.href)
      if (!next) return { ok: false, reason: 'network' }
      url = next
    }
  } catch {
    return { ok: false, reason: failureOf(signal) }
  }
}

export async function fetchPage(
  url: string,
  opts: { timeoutMs?: number; maxRedirects?: number } = {},
): Promise<{ ok: true; page: FetchedPage } | { ok: false; reason: FetchFailure }> {
  const start = parseHttpUrl(url)
  if (!start) return { ok: false, reason: 'invalid-url' }
  const signal = AbortSignal.timeout(opts.timeoutMs ?? PAGE_TIMEOUT_MS)
  const result = await request(start, 'GET', signal, opts.maxRedirects ?? MAX_REDIRECTS)
  if (!result.ok) return result
  const { response, finalUrl, redirects, ttfbMs } = result.hops
  try {
    const body = new Uint8Array(await response.arrayBuffer())
    return {
      ok: true,
      page: {
        requestedUrl: url,
        finalUrl,
        status: response.status,
        redirects,
        contentType: response.headers.get('content-type'),
        body,
        ttfbMs,
      },
    }
  } catch {
    return { ok: false, reason: failureOf(signal) }
  }
}

export async function probeLink(url: string, opts: { timeoutMs?: number } = {}): Promise<LinkProbe> {
  const start = parseHttpUrl(url)
  // The parser only hands over http(s) links, so this guards direct callers.
  if (!start) return { url, status: null, error: 'network' }
  const timeoutMs = opts.timeoutMs ?? LINK_TIMEOUT_MS
  const signal = AbortSignal.timeout(timeoutMs)
  const headSignal = AbortSignal.any([signal, AbortSignal.timeout(Math.round(timeoutMs * HEAD_SHARE))])

  const head = await request(start, 'HEAD', headSignal, MAX_REDIRECTS)
  if (head.ok && head.hops.response.status < 400) return { url, status: head.hops.response.status }
  if (!head.ok && head.reason === 'too-many-redirects') return { url, status: null, error: head.reason }
  // Some servers refuse, hang on or mishandle HEAD, so they get one GET with the budget that is left.
  if (signal.aborted) return { url, status: null, error: 'timeout' }

  const get = await request(start, 'GET', signal, MAX_REDIRECTS)
  if (!get.ok) return { url, status: null, error: get.reason }
  await get.hops.response.body?.cancel().catch(() => {})
  return { url, status: get.hops.response.status }
}
