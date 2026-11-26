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

export async function fetchPage(
  url: string,
  opts: { timeoutMs?: number; maxRedirects?: number } = {},
): Promise<{ ok: true; page: FetchedPage } | { ok: false; reason: FetchFailure }> {
  void url
  void opts
  throw new Error('not implemented')
}

export async function probeLink(url: string, opts: { timeoutMs?: number } = {}): Promise<LinkProbe> {
  void url
  void opts
  throw new Error('not implemented')
}
