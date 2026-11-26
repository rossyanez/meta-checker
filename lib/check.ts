import type { FetchFailure, LinkProbe } from './fetcher'
import type { PageFacts } from './parse-page'

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

export function normalizeUrl(input: string): string | null {
  void input
  throw new Error('not implemented')
}

export async function checkUrl(
  input: string,
  opts: { pageTimeoutMs?: number; linkTimeoutMs?: number; linkCap?: number; concurrency?: number } = {},
): Promise<CheckResult> {
  void input
  void opts
  throw new Error('not implemented')
}
