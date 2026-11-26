// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { decodeHtml, parsePage } from './parse-page'

const fixturesDir = join(import.meta.dirname, '..', 'tests', 'fixtures')

function parseFixture(name: string) {
  const html = readFileSync(join(fixturesDir, name), 'utf8')
  return parsePage(html, `https://example.com/fixtures/${name}`)
}

const noOg = { title: [], description: [], image: [], url: [], type: [] }

describe('parsePage', () => {
  test('complete page: every field has one value', () => {
    expect(parseFixture('complete.html')).toEqual({
      titles: ['Complete Example Page'],
      descriptions: ['A sample page that has every tag the checker reads.'],
      canonicals: ['https://example.com/complete'],
      robots: { tags: ['index, follow'], index: true, follow: true },
      headings: [
        { level: 1, text: 'Welcome to the example', length: 22 },
        { level: 2, text: 'What this page covers', length: 21 },
        { level: 3, text: 'Details', length: 7 },
        { level: 2, text: 'Contact', length: 7 },
      ],
      headingCount: 4,
      og: {
        title: ['Complete Example Page on Social'],
        description: ['Shared description for social cards.'],
        image: ['https://example.com/images/card.png'],
        url: ['https://example.com/complete'],
        type: ['website'],
      },
      links: [
        'https://example.com/fixtures/headings.html',
        'https://example.com/status/404',
        'https://example.com/head-405',
        'https://example.com/fixtures/complete.html',
      ],
      linkCount: 4,
    })
  })

  test('missing page: no head and no tags gives empty lists', () => {
    expect(parseFixture('missing.html')).toEqual({
      titles: [],
      descriptions: [],
      canonicals: [],
      robots: { tags: [], index: true, follow: true },
      headings: [],
      headingCount: 0,
      og: noOg,
      links: [],
      linkCount: 0,
    })
  })

  test('empty page: present tags with no value record an empty string', () => {
    expect(parseFixture('empty.html')).toEqual({
      titles: [''],
      descriptions: [''],
      canonicals: [''],
      robots: { tags: [''], index: true, follow: true },
      headings: [{ level: 1, text: '', length: 0 }],
      headingCount: 1,
      og: { ...noOg, title: [''], image: [''] },
      links: [],
      linkCount: 0,
    })
  })

  test('duplicate page: every occurrence is kept in document order', () => {
    expect(parseFixture('duplicate.html')).toEqual({
      titles: ['First Title', 'Second Title'],
      descriptions: ['First description.', 'Second description.'],
      canonicals: ['https://example.com/first', 'https://example.com/second'],
      robots: { tags: ['noindex', 'nofollow'], index: false, follow: false },
      headings: [
        { level: 1, text: 'One', length: 3 },
        { level: 1, text: 'Two', length: 3 },
      ],
      headingCount: 2,
      og: { ...noOg, title: ['First social title', 'Second social title'] },
      links: ['https://example.org/page'],
      linkCount: 1,
    })
  })

  test('malformed page: reads what a browser would, skipping SVG and template content', () => {
    expect(parseFixture('malformed.html')).toEqual({
      titles: ['Broken Markup Page'],
      descriptions: ['Uppercase tags and unquoted names.'],
      canonicals: ['https://example.com/malformed-canonical'],
      robots: { tags: ['NOINDEX'], index: false, follow: true },
      headings: [{ level: 2, text: 'Unclosed bold heading', length: 21 }],
      headingCount: 1,
      og: { ...noOg, title: ['Social title from the body'] },
      links: ['https://example.com/fixtures/complete.html'],
      linkCount: 1,
    })
  })

  test('relative page: URLs resolve against the first base href', () => {
    const facts = parseFixture('relative.html')
    expect(facts.canonicals).toEqual(['https://example.com/sub/canonical-page'])
    expect(facts.og.image).toEqual(['https://example.com/sub/dir/images/card.png'])
    expect(facts.og.url).toEqual(['https://example.com/shared'])
    expect(facts.links).toEqual([
      'https://example.com/sub/dir/page.html',
      'https://example.org/protocol-relative',
      'https://example.com/padded',
    ])
    expect(facts.linkCount).toBe(3)
  })

  test('relative URLs resolve against the page URL when there is no base', () => {
    const facts = parsePage(
      '<link rel="canonical" href="other"><meta property="og:image" content="/card.png"><a href="next">n</a>',
      'https://example.com/dir/page',
    )
    expect(facts.canonicals).toEqual(['https://example.com/dir/other'])
    expect(facts.og.image).toEqual(['https://example.com/card.png'])
    expect(facts.links).toEqual(['https://example.com/dir/next'])
  })

  test('an href that cannot be parsed records the trimmed raw value', () => {
    const facts = parsePage(
      '<link rel="canonical" href="  http://[broken  "><meta property="og:url" content="http://[bad">',
      'https://example.com/',
    )
    expect(facts.canonicals).toEqual(['http://[broken'])
    expect(facts.og.url).toEqual(['http://[bad'])
  })

  test('headings page: levels in document order, collapsed text, long text capped', () => {
    const facts = parseFixture('headings.html')
    const long = '0123456789'.repeat(1000)
    expect(facts.headings).toEqual([
      { level: 3, text: 'Third level first', length: 17 },
      { level: 1, text: 'Main heading with inline markup', length: 31 },
      { level: 6, text: 'Sixth level', length: 11 },
      { level: 2, text: 'Part two', length: 8 },
      { level: 5, text: 'Fifth level', length: 11 },
      { level: 4, text: 'Fourth level', length: 12 },
      { level: 2, text: `${long.slice(0, 300)}…`, length: 10000 },
    ])
    expect(facts.headingCount).toBe(7)
  })

  test('lengths count code points, not UTF-16 units', () => {
    const facts = parsePage('<title>Café 🚀</title><h1>🚀🚀</h1>', 'https://example.com/')
    expect(facts.titles).toEqual(['Café 🚀'])
    expect(facts.headings).toEqual([{ level: 1, text: '🚀🚀', length: 2 }])
  })

  test('keeps at most 200 headings but counts them all', () => {
    const html = Array.from({ length: 250 }, (_, i) => `<h2>Heading ${i}</h2>`).join('')
    const facts = parsePage(html, 'https://example.com/')
    expect(facts.headings).toHaveLength(200)
    expect(facts.headings[199]).toEqual({ level: 2, text: 'Heading 199', length: 11 })
    expect(facts.headingCount).toBe(250)
  })

  test('keeps at most 5000 links but counts every unique one', () => {
    const html = Array.from({ length: 6000 }, (_, i) => `<a href="/p/${i % 5500}">x</a>`).join('')
    const facts = parsePage(html, 'https://example.com/')
    expect(facts.links).toHaveLength(5000)
    expect(facts.links[4999]).toBe('https://example.com/p/4999')
    expect(facts.linkCount).toBe(5500)
  })

  test('robots: none turns off both, tokens are case-insensitive', () => {
    expect(parsePage('<meta name="robots" content="NONE">', 'https://example.com/').robots).toEqual({
      tags: ['NONE'],
      index: false,
      follow: false,
    })
    expect(
      parsePage('<meta name="Robots" content="max-snippet:10, NoFollow">', 'https://example.com/').robots,
    ).toEqual({ tags: ['max-snippet:10, NoFollow'], index: true, follow: false })
  })
})

describe('decodeHtml', () => {
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
  const bytes = (...parts: (string | number[])[]) =>
    new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? ascii(p) : p)))

  test('windows-1252 from the Content-Type header', () => {
    const body = bytes('<title>caf', [0xe9], '</title>')
    expect(decodeHtml(body, 'text/html; charset=windows-1252')).toBe('<title>café</title>')
  })

  test('windows-1252 from a meta charset tag', () => {
    const body = bytes('<meta charset="windows-1252"><title>caf', [0xe9], '</title>')
    expect(decodeHtml(body, 'text/html')).toBe('<meta charset="windows-1252"><title>café</title>')
  })

  test('windows-1252 from a meta http-equiv content-type tag', () => {
    const body = bytes('<meta http-equiv="Content-Type" content="text/html; charset=windows-1252">caf', [0xe9])
    expect(decodeHtml(body, null)).toMatch(/café$/)
  })

  test('the header charset wins over the meta charset', () => {
    const body = bytes('<meta charset="utf-8">caf', [0xe9])
    expect(decodeHtml(body, 'text/html; charset="windows-1252"')).toBe('<meta charset="utf-8">café')
  })

  test('a UTF-8 BOM wins over the header and is not kept', () => {
    const body = bytes([0xef, 0xbb, 0xbf], 'caf', [0xc3, 0xa9])
    expect(decodeHtml(body, 'text/html; charset=windows-1252')).toBe('café')
  })

  test('a meta charset after the first 1024 bytes is ignored', () => {
    const body = bytes(' '.repeat(1100), '<meta charset="windows-1252">caf', [0xc3, 0xa9])
    expect(decodeHtml(body, null)).toMatch(/café$/)
  })

  test('an unknown label or no charset falls back to utf-8', () => {
    const body = bytes('caf', [0xc3, 0xa9])
    expect(decodeHtml(body, 'text/html; charset=not-a-charset')).toBe('café')
    expect(decodeHtml(body, null)).toBe('café')
  })

  test('invalid bytes do not throw', () => {
    expect(decodeHtml(bytes('a', [0xff], 'b'), 'text/html; charset=utf-8')).toBe('a�b')
  })
})
