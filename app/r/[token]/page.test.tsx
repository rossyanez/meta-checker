import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import type { Report } from '../../../lib/check'
import { encodeShare } from '../../../lib/share'
import ReportPage, { generateMetadata } from './page'

afterEach(cleanup)

const DAY_MS = 24 * 60 * 60 * 1000
const hostileTitle = '<script>alert(1)</script>'
const hostileDescription = '"><img src=x onerror=alert(1)>'

function buildReport(overrides: Partial<Report> = {}): Report {
  return {
    requestedUrl: 'http://example.com/',
    finalUrl: 'https://www.example.com/landing?x=1',
    status: 200,
    redirects: [{ url: 'http://example.com/', status: 301 }],
    contentType: 'text/html',
    speed: { ttfbMs: 80, htmlBytes: 2048 },
    page: {
      titles: [hostileTitle],
      descriptions: [hostileDescription],
      canonicals: [],
      robots: { tags: [], index: true, follow: true },
      headings: [{ level: 1, text: 'Hello' }],
      headingCount: 1,
      og: { title: [], description: [], image: [], url: [], type: [] },
    },
    links: { found: 0, checked: 0, broken: [], skipped: [], stoppedEarly: false },
    ...overrides,
  }
}

// Tokens are made with the server's own key, the same way the check action makes them.
function tokenFor(report = buildReport(), now = Date.now()): string {
  const token = encodeShare(report, { now })
  if (token === null) throw new Error('expected a token')
  return token
}

const params = (token: string) => ({ params: Promise.resolve({ token }) })

async function renderPage(token: string) {
  return render(await ReportPage(params(token)))
}

describe('report page', () => {
  test('shows the report for the hostname, with its dates', async () => {
    const checked = Date.UTC(2026, 10, 20, 9, 0, 0)
    await renderPage(tokenFor(buildReport(), checked))

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Report for www.example.com')
    expect(screen.getByText('Checked on November 20, 2026')).toBeTruthy()
    expect(screen.getByText('Link expires February 18, 2027')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Summary' }).textContent).toContain('https://www.example.com/landing?x=1')
  })

  test('hostile page text renders as text, never as markup', async () => {
    const { container } = await renderPage(tokenFor())

    expect(screen.getByText(hostileTitle)).toBeTruthy()
    expect(screen.getByText(hostileDescription)).toBeTruthy()
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  test('offers a full audit and a fresh check', async () => {
    await renderPage(tokenFor())

    const cta = screen.getByRole('link', { name: 'Want a full audit? Hire me' })
    expect(cta.getAttribute('href')).toBe('https://rossyanez.com/#contact')
    expect(screen.getByRole('link', { name: 'Check another page' }).getAttribute('href')).toBe('/')
  })

  test.each([
    ['tampered', () => {
      const token = tokenFor()
      return (token[0] === 'A' ? 'B' : 'A') + token.slice(1)
    }],
    ['oversized', () => `${'a'.repeat(7000)}.${'b'.repeat(43)}`],
    ['malformed', () => 'not-a-token'],
  ])('a %s link explains it is broken and offers a fresh check', async (_name, makeToken) => {
    const { container } = await renderPage(makeToken())

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('This report link does not work')
    expect(container.textContent).toContain('The link is broken or was changed. Run a fresh check to see the page now.')
    expect(screen.getByRole('link', { name: 'Check another page' }).getAttribute('href')).toBe('/')
    expect(screen.queryByRole('region', { name: 'Summary' })).toBeNull()
  })

  test('an expired link says so and offers a fresh check', async () => {
    const { container } = await renderPage(tokenFor(buildReport(), Date.now() - 91 * DAY_MS))

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('This report link has expired')
    expect(container.textContent).toContain('Report links last 90 days. Run a fresh check to see the page now.')
    expect(screen.getByRole('link', { name: 'Check another page' }).getAttribute('href')).toBe('/')
    expect(screen.queryByRole('region', { name: 'Summary' })).toBeNull()
  })
})

describe('report page metadata', () => {
  test('is titled by hostname, not by the page title, and is not indexed', async () => {
    const metadata = await generateMetadata(params(tokenFor()))

    expect(metadata.title).toBe('SEO report for www.example.com')
    expect(JSON.stringify(metadata)).not.toContain('alert(1)')
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.openGraph).toMatchObject({ title: 'SEO report for www.example.com' })
    expect(typeof metadata.description).toBe('string')
    expect(metadata.openGraph?.description).toBe(metadata.description)
  })

  test('a broken link is not indexed either', async () => {
    const metadata = await generateMetadata(params('not-a-token'))

    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.title).toBe('Meta Checker report link')
  })
})
