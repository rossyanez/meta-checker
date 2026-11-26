import { fetchPage, probeLink, type FetchFailure, type FetchedPage, type LinkProbe } from './fetcher'
import { LINK_PHASE_MS } from './limits'
import { decodeHtml, parsePage, type PageFacts } from './parse-page'

export type Report = {
  requestedUrl: string
  finalUrl: string
  status: number
  redirects: { url: string; status: number }[]
  contentType: string | null
  speed: { ttfbMs: number; htmlBytes: number }
  /** null when the response is not HTML. The link list stays on the server; `links.found` counts it. */
  page: Omit<PageFacts, 'links'> | null
  /** `stoppedEarly` is true when the phase deadline hit before every link up to the cap was probed. */
  links: { found: number; checked: number; broken: LinkProbe[]; stoppedEarly: boolean } | null
}

export type CheckFailure = FetchFailure | 'unexpected'

export type CheckResult = { kind: 'report'; report: Report } | { kind: 'error'; reason: CheckFailure; message: string }

export const MESSAGES: Record<CheckFailure, string> = {
  'invalid-url': 'Enter a full web address, like https://example.com.',
  timeout: 'The page took longer than 10 seconds to respond. Check the address or try again later.',
  network: "We couldn't reach that address. Check the spelling, or the site may be down.",
  'too-many-redirects': 'The page redirected more than 10 times, so we stopped following it.',
  unexpected: 'Something went wrong while reading that page. Try again, or try a different address.',
}

const LINK_CAP = 50
const CONCURRENCY = 8

export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim()
  if (trimmed === '') return null
  // "example.com:8080" has a colon but no scheme; "mailto:x" and "javascript:x" have one.
  const hasScheme = /^[a-z][a-z\d+.-]*:(?!\d)/i.test(trimmed)
  try {
    const url = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    const isWeb = url.protocol === 'http:' || url.protocol === 'https:'
    // A username or password is never part of a public page's address.
    return isWeb && url.hostname && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

export async function checkUrl(
  input: string,
  opts: {
    pageTimeoutMs?: number
    linkTimeoutMs?: number
    linkPhaseMs?: number
    linkCap?: number
    concurrency?: number
  } = {},
): Promise<CheckResult> {
  const url = normalizeUrl(input)
  if (!url) return failure('invalid-url')
  const fetched = await fetchPage(url, { timeoutMs: opts.pageTimeoutMs })
  if (!fetched.ok) return failure(fetched.reason)

  const { page: response } = fetched
  const html = htmlOf(response)
  const facts = html === null ? null : parsePage(html, response.finalUrl)
  const links = facts && (await checkLinks(facts.links, opts))

  return {
    kind: 'report',
    report: {
      requestedUrl: response.requestedUrl,
      finalUrl: response.finalUrl,
      status: response.status,
      redirects: response.redirects,
      contentType: response.contentType,
      speed: { ttfbMs: response.ttfbMs, htmlBytes: response.body.byteLength },
      page: facts && withoutLinks(facts),
      links,
    },
  }
}

function withoutLinks({ links, ...rest }: PageFacts): Omit<PageFacts, 'links'> {
  void links
  return rest
}

function failure(reason: CheckFailure): CheckResult {
  return { kind: 'error', reason, message: MESSAGES[reason] }
}

/** The decoded body when the response is HTML, else null. */
function htmlOf(response: FetchedPage): string | null {
  const type = response.contentType?.toLowerCase() ?? null
  if (type !== null && !type.includes('text/html') && !type.includes('application/xhtml+xml')) return null
  const html = decodeHtml(response.body, response.contentType)
  if (type === null && !html.trimStart().startsWith('<')) return null
  return html
}

async function checkLinks(
  urls: string[],
  opts: { linkTimeoutMs?: number; linkPhaseMs?: number; linkCap?: number; concurrency?: number },
): Promise<NonNullable<Report['links']>> {
  // One deadline for the whole phase: no new probes start after it, and in-flight ones are aborted.
  const deadline = AbortSignal.timeout(opts.linkPhaseMs ?? LINK_PHASE_MS)
  const toCheck = urls.slice(0, opts.linkCap ?? LINK_CAP)
  const probes = await mapPool(toCheck, opts.concurrency ?? CONCURRENCY, deadline, async (url) => {
    const probe = await probeLink(url, { timeoutMs: opts.linkTimeoutMs, signal: deadline })
    // Cut off by the deadline rather than by the link itself, so it was not checked.
    return deadline.aborted && probe.status === null ? null : probe
  })
  const finished = probes.filter((probe): probe is LinkProbe => probe !== null && probe !== undefined)
  const broken = finished.filter((probe) => probe.status === null || probe.status >= 400)
  return { found: urls.length, checked: finished.length, broken, stoppedEarly: finished.length < toCheck.length }
}

/**
 * Runs `fn` over `items` with at most `limit` calls in flight, starting none after `stop` aborts.
 * Results keep input order; items never started stay undefined.
 */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  stop: AbortSignal,
  fn: (item: T) => Promise<R>,
): Promise<(R | undefined)[]> {
  const results: (R | undefined)[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length && !stop.aborted) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
