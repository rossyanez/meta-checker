import { cleanup, render } from '@testing-library/react'
import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, test } from 'vitest'
import type { Report as CheckReport } from '../lib/check'
import { decodeShare, encodeShare } from '../lib/share'
import { Report } from './report'

// A shared report must say the same things as the live one: every Missing, Empty, duplicate, broken link and count.
afterEach(cleanup)

const opts = { secret: 's'.repeat(40), now: Date.UTC(2026, 0, 15) }
const noise = (chars: number) => randomBytes(chars).toString('base64url').slice(0, chars)

type Verdicts = { sections: Record<string, string>; headings: { missing: boolean; shown: string[]; hidden: number } }

/** What a report tells its reader, with the page's own text (`.value`) taken out, since only that may be shortened. */
function verdicts(report: CheckReport): Verdicts {
  const { container } = render(<Report report={report} />)
  const copy = container.cloneNode(true) as HTMLElement
  cleanup()
  copy.querySelectorAll('.value').forEach((value) => value.remove())
  const sections: Record<string, string> = {}
  let headings: Verdicts['headings'] = { missing: false, shown: [], hidden: 0 }
  for (const section of copy.querySelectorAll('section')) {
    const name = section.querySelector('h2')!.textContent!
    if (name !== 'Headings outline') {
      sections[name] = section.textContent!
      continue
    }
    const more = /^(\d+) more headings? (is|are) not shown\.$/.exec(
      [...section.querySelectorAll('p')].map((p) => p.textContent).find((text) => text?.includes('not shown')) ?? '',
    )
    headings = {
      missing: section.querySelector(':scope > .state')?.textContent === 'Missing',
      shown: [...section.querySelectorAll('li')].map((li) => li.textContent!),
      hidden: more ? Number(more[1]) : 0,
    }
  }
  return { sections, headings }
}

function expectSameVerdicts(live: CheckReport) {
  const token = encodeShare(live, opts)
  expect(token).not.toBeNull()
  const decoded = decodeShare(token!, opts)
  expect(decoded.ok).toBe(true)
  if (!decoded.ok) throw new Error('expected a decoded report')

  const before = verdicts(live)
  const after = verdicts(decoded.report)
  expect(after.sections).toEqual(before.sections)
  expect(after.headings.missing).toBe(before.headings.missing)
  // Hidden headings are covered by the "N more headings are not shown" line, and the shown ones match the live ones.
  expect(after.headings.shown.length + after.headings.hidden).toBe(live.page!.headingCount)
  expect(after.headings.shown).toEqual(before.headings.shown.slice(0, after.headings.shown.length))
  return decoded.report
}

const hostile = ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>']

describe('a shared report says the same as the live one', () => {
  test('for a large hostile report that needs the tightest caps', () => {
    const live: CheckReport = {
      requestedUrl: `http://example.com/${noise(400)}`,
      finalUrl: `https://www.example.com/${noise(400)}`,
      status: 200,
      redirects: Array.from({ length: 3 }, () => ({ url: `https://example.com/${noise(300)}`, status: 301 })),
      contentType: 'text/html',
      speed: { ttfbMs: 321, htmlBytes: 4_000_000 },
      page: {
        titles: hostile,
        descriptions: [''],
        canonicals: [],
        // Long text in lists that are never shortened, so only the tightest caps fit.
        robots: { tags: ['noindex', hostile[0], ...Array.from({ length: 30 }, () => noise(400))], index: false, follow: true },
        headings: [{ level: 1, text: '' }, ...Array.from({ length: 199 }, (_, i) => ({ level: ((i % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6, text: noise(300) }))],
        headingCount: 640,
        og: {
          title: hostile,
          description: Array.from({ length: 6 }, () => noise(400)),
          image: Array.from({ length: 6 }, () => noise(400)),
          url: [''],
          type: ['website'],
        },
      },
      links: {
        found: 900,
        checked: 50,
        broken: Array.from({ length: 40 }, (_, i) => ({
          url: `https://example.com/archive/2019/a-long-article-slug-that-goes-on/${i}/${noise(6)}`,
          status: i % 4 === 0 ? null : 404,
          ...(i % 4 === 0 ? { error: 'timeout' as const } : {}),
        })),
        skipped: Array.from({ length: 10 }, (_, i) => ({ url: `http://10.0.0.${i}/private/${'section/'.repeat(8)}${noise(6)}`, status: null, error: 'blocked' as const })),
        stoppedEarly: true,
      },
    }

    const shared = expectSameVerdicts(live)
    // Proof the tightest caps ran: plain-text URLs are down to 60 characters. Link URLs are never cut.
    expect([...shared.finalUrl].length).toBeLessThanOrEqual(60)
    expect(shared.links!.broken).toEqual(live.links!.broken)
    expect(shared.links!.skipped).toEqual(live.links!.skipped)
  })

  test('for a report with 50 broken links', () => {
    const live: CheckReport = {
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
      status: 200,
      redirects: [],
      contentType: 'text/html',
      speed: { ttfbMs: 80, htmlBytes: 9000 },
      page: {
        titles: ['Example'],
        descriptions: ['A page with many broken links.'],
        canonicals: ['https://example.com/'],
        robots: { tags: [], index: true, follow: true },
        headings: [{ level: 1, text: 'Links' }],
        headingCount: 1,
        og: { title: [], description: [], image: [], url: [], type: [] },
      },
      links: {
        found: 120,
        checked: 50,
        broken: Array.from({ length: 50 }, (_, i) => ({ url: `https://example.com/missing/page-${i}`, status: 404 })),
        skipped: [],
        stoppedEarly: false,
      },
    }

    expect(expectSameVerdicts(live).links!.broken).toHaveLength(50)
  })
})
