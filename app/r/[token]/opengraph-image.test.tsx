// @vitest-environment node
import { describe, expect, test } from 'vitest'
import type { Report } from '../../../lib/check'
import { encodeShare } from '../../../lib/share'
import ToolImage from '../../opengraph-image'
import ReportImage from './opengraph-image'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Width and height from the PNG's IHDR chunk, which always comes first. */
async function pngSize(response: Response) {
  expect(response.headers.get('content-type')).toBe('image/png')
  const bytes = new Uint8Array(await response.arrayBuffer())
  expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE)
  expect(new TextDecoder().decode(bytes.subarray(12, 16))).toBe('IHDR')
  const view = new DataView(bytes.buffer, bytes.byteOffset)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

function tokenFor(title: string): string {
  const report: Report = {
    requestedUrl: 'https://example.com/',
    finalUrl: 'https://example.com/',
    status: 200,
    redirects: [],
    contentType: 'text/html',
    speed: { ttfbMs: 50, htmlBytes: 1000 },
    page: {
      titles: [title],
      descriptions: [],
      canonicals: [],
      robots: { tags: [], index: true, follow: true },
      headings: [],
      headingCount: 3,
      og: { title: [], description: [], image: [], url: [], type: [] },
    },
    links: { found: 12, checked: 12, broken: [{ url: 'https://example.com/x', status: 404 }], skipped: [], stoppedEarly: false },
  }
  return encodeShare(report)!
}

const params = (token: string) => ({ params: Promise.resolve({ token }) })

describe('Open Graph images', () => {
  test.each([
    ['a valid report', () => tokenFor('Example Domain')],
    ['a hostile, very long title', () => tokenFor(`<script>alert(1)</script>"><img src=x onerror=alert(1)>${'🧪'.repeat(200)}`)],
    ['an invalid token', () => 'not-a-token'],
  ])('the report image is a 1200x630 PNG for %s', async (_name, makeToken) => {
    expect(await pngSize(await ReportImage(params(makeToken())))).toEqual({ width: 1200, height: 630 })
  }, 30_000)

  test('a valid report gets its own card, an invalid token gets the generic one', async () => {
    const bytes = async (response: Response) => Buffer.from(await response.arrayBuffer())
    const generic = await bytes(await ToolImage())
    expect((await bytes(await ReportImage(params(tokenFor('Example Domain'))))).equals(generic)).toBe(false)
    expect((await bytes(await ReportImage(params('not-a-token')))).equals(generic)).toBe(true)
  }, 30_000)

  test('the tool image is a 1200x630 PNG', async () => {
    expect(await pngSize(await ToolImage())).toEqual({ width: 1200, height: 630 })
  }, 30_000)
})
