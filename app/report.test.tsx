import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import type { Report as CheckReport } from '../lib/check'
import type { PageFacts } from '../lib/parse-page'
import { Report } from './report'

afterEach(cleanup)

const emptyPage: PageFacts = {
  titles: [],
  descriptions: [],
  canonicals: [],
  robots: { tags: [], index: true, follow: true },
  headings: [],
  headingCount: 0,
  og: { title: [], description: [], image: [], url: [], type: [] },
  links: [],
  linkCount: 0,
}

function buildReport(page: Partial<PageFacts> | null, overrides: Partial<CheckReport> = {}): CheckReport {
  return {
    requestedUrl: 'https://example.com/',
    finalUrl: 'https://example.com/',
    status: 200,
    redirects: [],
    contentType: 'text/html; charset=utf-8',
    speed: { ttfbMs: 123, htmlBytes: 2560 },
    page: page && { ...emptyPage, ...page },
    links: page && { found: 0, checked: 0, broken: [] },
    ...overrides,
  }
}

const section = (name: string) => within(screen.getByRole('region', { name }))

describe('Report', () => {
  test('has one heading per section', () => {
    render(<Report report={buildReport({})} />)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Summary',
      'Title',
      'Meta description',
      'Canonical',
      'Robots',
      'Headings outline',
      'Open Graph',
      'Broken links',
      'Speed',
    ])
  })

  test('summary shows the status code, final URL and redirect chain', () => {
    render(
      <Report
        report={buildReport(
          {},
          {
            requestedUrl: 'http://example.com/',
            finalUrl: 'https://example.com/home',
            status: 200,
            redirects: [
              { url: 'http://example.com/', status: 301 },
              { url: 'https://example.com/', status: 302 },
            ],
          },
        )}
      />,
    )
    const summary = section('Summary')
    expect(summary.getByText('Status code').nextElementSibling?.textContent).toBe('200')
    expect(summary.getByText('Final URL').nextElementSibling?.textContent).toBe('https://example.com/home')
    expect(summary.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '301 http://example.com/',
      '302 https://example.com/',
      '200 https://example.com/home',
    ])
  })

  test('summary says when there were no redirects', () => {
    render(<Report report={buildReport({})} />)
    expect(section('Summary').getByText('No redirects')).toBeTruthy()
  })

  test('missing tags say Missing', () => {
    render(<Report report={buildReport({})} />)
    for (const name of ['Title', 'Meta description', 'Canonical', 'Robots', 'Headings outline']) {
      expect(section(name).getByText('Missing')).toBeTruthy()
    }
    expect(section('Open Graph').getAllByText('Missing')).toHaveLength(5)
  })

  test('empty tags say Empty', () => {
    render(
      <Report
        report={buildReport({
          titles: [''],
          descriptions: [''],
          canonicals: [''],
          og: { ...emptyPage.og, image: [''] },
        })}
      />,
    )
    for (const name of ['Title', 'Meta description', 'Canonical']) {
      expect(section(name).getByText('Empty')).toBeTruthy()
    }
    expect(section('Open Graph').getAllByText('Empty')).toHaveLength(1)
  })

  test('a single title shows its value and its length in characters', () => {
    render(<Report report={buildReport({ titles: ['Café 🚀'], descriptions: ['A short description.'] })} />)
    expect(section('Title').getByText('Café 🚀')).toBeTruthy()
    expect(section('Title').getByText('6 characters')).toBeTruthy()
    expect(section('Meta description').getByText('20 characters')).toBeTruthy()
  })

  test('duplicates list every value and say the first one counts', () => {
    render(
      <Report
        report={buildReport({
          titles: ['First Title', 'Second Title'],
          canonicals: ['https://example.com/a', '', 'https://example.com/b'],
        })}
      />,
    )
    const title = section('Title')
    expect(title.getByText('Found 2, the first one counts')).toBeTruthy()
    expect(title.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'First Title11 characters',
      'Second Title12 characters',
    ])
    const canonical = section('Canonical')
    expect(canonical.getByText('Found 3, the first one counts')).toBeTruthy()
    expect(canonical.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'https://example.com/a',
      'Empty',
      'https://example.com/b',
    ])
  })

  test('robots shows the tags and whether indexing and following are allowed', () => {
    render(<Report report={buildReport({ robots: { tags: ['noindex, follow'], index: false, follow: true } })} />)
    const robots = section('Robots')
    expect(robots.getByText('noindex, follow')).toBeTruthy()
    expect(robots.getByText('Indexing').nextElementSibling?.textContent).toBe('Blocked')
    expect(robots.getByText('Following links').nextElementSibling?.textContent).toBe('Allowed')
  })

  test('open graph lists each property', () => {
    render(
      <Report
        report={buildReport({
          og: {
            title: ['Social title'],
            description: [],
            image: ['https://example.com/card.png'],
            url: [],
            type: ['article', 'website'],
          },
        })}
      />,
    )
    const og = section('Open Graph')
    expect(og.getByText('og:title')).toBeTruthy()
    expect(og.getByText('Social title')).toBeTruthy()
    expect(og.getByText('https://example.com/card.png')).toBeTruthy()
    expect(og.getByText('Found 2, the first one counts')).toBeTruthy()
  })

  test('headings outline shows each level and says how many were left out', () => {
    render(
      <Report
        report={buildReport({
          headings: [
            { level: 1, text: 'Main', length: 4 },
            { level: 2, text: 'Part', length: 4 },
            { level: 3, text: '', length: 0 },
          ],
          headingCount: 253,
        })}
      />,
    )
    const outline = section('Headings outline')
    expect(outline.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['H1Main', 'H2Part', 'H3Empty'])
    expect(outline.getByText('250 more headings are not shown.')).toBeTruthy()
  })

  test('broken links lists each broken URL with its status or error', () => {
    render(
      <Report
        report={buildReport(
          { linkCount: 60 },
          {
            links: {
              found: 60,
              checked: 50,
              broken: [
                { url: 'https://example.com/gone', status: 404 },
                { url: 'https://example.org/down', status: null, error: 'network' },
                { url: 'https://example.org/slow', status: null, error: 'timeout' },
              ],
            },
          },
        )}
      />,
    )
    const links = section('Broken links')
    expect(links.getByText('Checked 50 of 60 links')).toBeTruthy()
    expect(links.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'https://example.com/gone404',
      'https://example.org/downNo response',
      'https://example.org/slowTimed out',
    ])
    expect(links.getByRole('link', { name: 'https://example.com/gone' }).getAttribute('href')).toBe(
      'https://example.com/gone',
    )
  })

  test('says when no broken links were found', () => {
    render(<Report report={buildReport({}, { links: { found: 3, checked: 3, broken: [] } })} />)
    expect(section('Broken links').getByText('Checked 3 of 3 links')).toBeTruthy()
    expect(section('Broken links').getByText('No broken links found')).toBeTruthy()
  })

  test('speed shows time to first byte and HTML size in KB', () => {
    render(<Report report={buildReport({})} />)
    const speed = section('Speed')
    expect(speed.getByText('Time to first byte').nextElementSibling?.textContent).toBe('123 ms')
    expect(speed.getByText('HTML size').nextElementSibling?.textContent).toBe('2.5 KB')
  })

  test('a non-HTML response says what came back and skips the tag sections', () => {
    render(<Report report={buildReport(null, { contentType: 'application/pdf' })} />)
    expect(screen.getByText(/application\/pdf/).textContent).toBe(
      'The address returned application/pdf, not an HTML page, so there are no tags to check.',
    )
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Summary', 'Speed'])
  })
})
