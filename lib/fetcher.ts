import { Agent, buildConnector, fetch, type Response } from 'undici'
import { BLOCKED_CODE, DEFAULT_POLICY, guardedLookup, isAllowedUrl, type Policy } from './destination'

export type FetchFailure = 'invalid-url' | 'timeout' | 'network' | 'too-many-redirects' | 'blocked' | 'too-large'

export type FetchedPage = {
  requestedUrl: string
  finalUrl: string
  status: number
  redirects: { url: string; status: number }[]
  contentType: string | null
  body: Uint8Array
  ttfbMs: number
}

export type LinkProbe = {
  url: string
  status: number | null
  error?: 'timeout' | 'network' | 'too-many-redirects' | 'blocked'
}

/** How long opening one connection may take, inside the request's total budget. */
const CONNECT_TIMEOUT_MS = 3_000
const PAGE_TIMEOUT_MS = 10_000
const LINK_TIMEOUT_MS = 5_000
/** HEAD gets this share of a probe's budget, so a hanging HEAD fails fast and the GET can run. */
const HEAD_SHARE = 2 / 5
const MAX_REDIRECTS = 10
export const MAX_PAGE_BYTES = 5 * 1024 * 1024
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

/** Why a request threw: the shared budget ran out, the guarded lookup refused, or the network failed. */
function failureOf(error: unknown, signal: AbortSignal): 'timeout' | 'blocked' | 'network' {
  if (signal.aborted) return 'timeout'
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if ((cause as NodeJS.ErrnoException).code === BLOCKED_CODE) return 'blocked'
  }
  return 'network'
}

const agents = new WeakMap<Policy, Agent>()

/**
 * One connection pool per policy. Every socket resolves its host through the policy's guarded lookup, so it
 * connects to the address that was checked. The lookup is built per port, because the port rule needs it.
 */
function agentFor(policy: Policy): Agent {
  let agent = agents.get(policy)
  if (!agent) {
    const connectors = new Map<number, buildConnector.connector>()
    agent = new Agent({
      connect(options, callback) {
        const port = Number(options.port) || (options.protocol === 'https:' ? 443 : 80)
        let connector = connectors.get(port)
        if (!connector) {
          connector = buildConnector({ lookup: guardedLookup(policy, port), timeout: CONNECT_TIMEOUT_MS })
          connectors.set(port, connector)
        }
        connector(options, callback)
      },
    })
    agents.set(policy, agent)
  }
  return agent
}

/**
 * The one place this app sends a request. Every hop is checked before it is sent, and every connection
 * resolves its host through the policy's guarded lookup. Never throws.
 */
async function request(
  start: URL,
  method: 'GET' | 'HEAD',
  signal: AbortSignal,
  maxRedirects: number,
  policy: Policy,
): Promise<HopsResult> {
  const redirects: Hops['redirects'] = []
  let url = start
  // Like browsers, time to first byte counts from the first request, so redirect time is included.
  const sentAt = performance.now()
  try {
    for (;;) {
      if (!isAllowedUrl(url, policy)) return { ok: false, reason: 'blocked' }
      const response = await fetch(url, {
        method,
        headers: HEADERS,
        redirect: 'manual',
        signal,
        dispatcher: agentFor(policy),
      })
      const ttfbMs = Math.round(performance.now() - sentAt)
      const location = response.headers.get('location')
      if (response.status < 300 || response.status > 399 || location === null) {
        return { ok: true, hops: { response, finalUrl: url.href, redirects, ttfbMs } }
      }
      await response.body?.cancel()
      redirects.push({ url: url.href, status: response.status })
      if (redirects.length > maxRedirects) return { ok: false, reason: 'too-many-redirects' }
      // Any scheme parses here, so the check at the top of the loop can refuse a non-web one.
      const next = URL.parse(location, url.href)
      if (!next) return { ok: false, reason: 'network' }
      url = next
    }
  } catch (error) {
    return { ok: false, reason: failureOf(error, signal) }
  }
}

/** The body, or too-large once it passes the cap. The request's signal still bounds a slow trickle. */
async function readBody(
  response: Response,
  signal: AbortSignal,
): Promise<{ ok: true; body: Uint8Array } | { ok: false; reason: FetchFailure }> {
  if (Number(response.headers.get('content-length')) > MAX_PAGE_BYTES) {
    await response.body?.cancel().catch(() => {})
    return { ok: false, reason: 'too-large' }
  }
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    // Leaving the loop early cancels the stream.
    for await (const chunk of response.body ?? []) {
      size += chunk.byteLength
      if (size > MAX_PAGE_BYTES) return { ok: false, reason: 'too-large' }
      chunks.push(chunk)
    }
  } catch (error) {
    return { ok: false, reason: failureOf(error, signal) }
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, body }
}

export async function fetchPage(
  url: string,
  opts: { timeoutMs?: number; maxRedirects?: number; policy?: Policy } = {},
): Promise<{ ok: true; page: FetchedPage } | { ok: false; reason: FetchFailure }> {
  const start = parseHttpUrl(url)
  if (!start) return { ok: false, reason: 'invalid-url' }
  const signal = AbortSignal.timeout(opts.timeoutMs ?? PAGE_TIMEOUT_MS)
  const result = await request(start, 'GET', signal, opts.maxRedirects ?? MAX_REDIRECTS, opts.policy ?? DEFAULT_POLICY)
  if (!result.ok) return result
  const { response, finalUrl, redirects, ttfbMs } = result.hops
  const read = await readBody(response, signal)
  if (!read.ok) return read
  return {
    ok: true,
    page: {
      requestedUrl: url,
      finalUrl,
      status: response.status,
      redirects,
      contentType: response.headers.get('content-type'),
      body: read.body,
      ttfbMs,
    },
  }
}

/** `signal` lets a caller abort the probe early; the probe then reports a timeout. */
export async function probeLink(
  url: string,
  opts: { timeoutMs?: number; signal?: AbortSignal; policy?: Policy } = {},
): Promise<LinkProbe> {
  const start = parseHttpUrl(url)
  // The parser only hands over http(s) links, so this guards direct callers.
  if (!start) return { url, status: null, error: 'network' }
  const timeoutMs = opts.timeoutMs ?? LINK_TIMEOUT_MS
  const policy = opts.policy ?? DEFAULT_POLICY
  // Each attempt has its own timer; the caller's signal can still abort either one.
  const within = (ms: number) => {
    const timer = AbortSignal.timeout(ms)
    return opts.signal ? AbortSignal.any([timer, opts.signal]) : timer
  }

  const head = await request(start, 'HEAD', within(Math.round(timeoutMs * HEAD_SHARE)), MAX_REDIRECTS, policy)
  if (head.ok && head.hops.response.status < 400) return { url, status: head.hops.response.status }
  // A GET would follow the same hops to the same answer.
  if (!head.ok && (head.reason === 'too-many-redirects' || head.reason === 'blocked')) {
    return { url, status: null, error: head.reason }
  }
  if (opts.signal?.aborted) return { url, status: null, error: 'timeout' }
  // Some servers refuse, hang on or mishandle HEAD. The GET gets a full budget of its own, so a slow
  // but working link is not reported broken just because its HEAD was cut short.
  const get = await request(start, 'GET', within(timeoutMs), MAX_REDIRECTS, policy)
  if (!get.ok) return { url, status: null, error: get.reason }
  await get.hops.response.body?.cancel().catch(() => {})
  return { url, status: get.hops.response.status }
}
