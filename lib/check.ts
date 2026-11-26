import { fetchPage, probeLink, type FetchFailure, type FetchedPage, type LinkProbe } from './fetcher'
import { decodeHtml, parsePage, type PageFacts } from './parse-page'

export type Report = {
  requestedUrl: string
  finalUrl: string
  status: number
  redirects: { url: string; status: number }[]
  contentType: string | null
  speed: { ttfbMs: number; htmlBytes: number }
  /** null when the response is not HTML */
  page: PageFacts | null
  links: { found: number; checked: number; broken: LinkProbe[] } | null
}

export type CheckResult = { kind: 'report'; report: Report } | { kind: 'error'; reason: FetchFailure; message: string }

const MESSAGES: Record<FetchFailure, string> = {
  'invalid-url': 'Enter a full web address, like https://example.com.',
  timeout: 'The page took longer than 10 seconds to respond. Check the address or try again later.',
  network: "We couldn't reach that address. Check the spelling, or the site may be down.",
  'too-many-redirects': 'The page redirected more than 10 times, so we stopped following it.',
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
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname ? url.href : null
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
  const page = html === null ? null : parsePage(html, response.finalUrl)
  const links = page && (await checkLinks(page.links, page.links.length, opts))

  return {
    kind: 'report',
    report: {
      requestedUrl: response.requestedUrl,
      finalUrl: response.finalUrl,
      status: response.status,
      redirects: response.redirects,
      contentType: response.contentType,
      speed: { ttfbMs: response.ttfbMs, htmlBytes: response.body.byteLength },
      page,
      links,
    },
  }
}

function failure(reason: FetchFailure): CheckResult {
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
  found: number,
  opts: { linkTimeoutMs?: number; linkCap?: number; concurrency?: number },
): Promise<NonNullable<Report['links']>> {
  const toCheck = urls.slice(0, opts.linkCap ?? LINK_CAP)
  const probes = await mapPool(toCheck, opts.concurrency ?? CONCURRENCY, (url) =>
    probeLink(url, { timeoutMs: opts.linkTimeoutMs }),
  )
  const broken = probes.filter((probe) => probe.status === null || probe.status >= 400)
  return { found, checked: toCheck.length, broken }
}

/** Runs `fn` over `items` with at most `limit` calls in flight. Results keep input order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
