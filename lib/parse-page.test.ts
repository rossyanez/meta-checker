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
        { level: 1, text: 'Welcome to the example' },
        { level: 2, text: 'What this page covers' },
        { level: 3, text: 'Details' },
        { level: 2, text: 'Contact' },
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
    })
  })

  test('empty page: present tags with no value record an empty string', () => {
    expect(parseFixture('empty.html')).toEqual({
      titles: [''],
      descriptions: [''],
      canonicals: [''],
      robots: { tags: [''], index: true, follow: true },
      headings: [{ level: 1, text: '' }],
      headingCount: 1,
      og: { ...noOg, title: [''], image: [''] },
      links: [],
    })
  })

  test('duplicate page: every occurrence is kept in document order', () => {
    expect(parseFixture('duplicate.html')).toEqual({
      titles: ['First Title', 'Second Title'],
      descriptions: ['First description.', 'Second description.'],
      canonicals: ['https://example.com/first', 'https://example.com/second'],
      robots: { tags: ['noindex', 'nofollow'], index: false, follow: false },
      headings: [
        { level: 1, text: 'One' },
        { level: 1, text: 'Two' },
      ],
      headingCount: 2,
      og: { ...noOg, title: ['First social title', 'Second social title'] },
      links: ['https://example.org/page'],
    })
  })

  test('malformed page: reads what a browser would, skipping SVG and template content', () => {
    expect(parseFixture('malformed.html')).toEqual({
      titles: ['Broken Markup Page'],
      descriptions: ['Uppercase tags and unquoted names.'],
      canonicals: ['https://example.com/malformed-canonical'],
      robots: { tags: ['NOINDEX'], index: false, follow: true },
      headings: [{ level: 2, text: 'Unclosed bold heading' }],
      headingCount: 1,
      og: { ...noOg, title: ['Social title from the body'] },
      links: ['https://example.com/fixtures/complete.html'],
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
      { level: 3, text: 'Third level first' },
      { level: 1, text: 'Main heading with inline markup' },
      { level: 6, text: 'Sixth level' },
      { level: 2, text: 'Part two' },
      { level: 5, text: 'Fifth level' },
      { level: 4, text: 'Fourth level' },
      { level: 2, text: `${long.slice(0, 300)}…` },
    ])
    expect(facts.headingCount).toBe(7)
  })

  test('the heading text cap counts code points, not UTF-16 units', () => {
    const facts = parsePage(`<title>Café 🚀</title><h1>${'🚀'.repeat(301)}</h1>`, 'https://example.com/')
    expect(facts.titles).toEqual(['Café 🚀'])
    expect(facts.headings).toEqual([{ level: 1, text: `${'🚀'.repeat(300)}…` }])
  })

  test('a heading nested thousands of elements deep still parses', () => {
    const depth = 6000
    const html = `<h1>${'<span>'.repeat(depth)}deep${'</span>'.repeat(depth)}</h1>`
    expect(parsePage(html, 'https://example.com/').headings).toEqual([{ level: 1, text: 'deep' }])
  })

  test('heading text leaves out script, style and template content', () => {
    const html =
      '<h2>a<script>var x=1</script>b<style>h2{color:red}</style>c<template><b>hidden</b></template></h2>'
    expect(parsePage(html, 'https://example.com/').headings).toEqual([{ level: 2, text: 'abc' }])
  })

  test('keeps at most 200 headings but counts them all', () => {
    const html = Array.from({ length: 250 }, (_, i) => `<h2>Heading ${i}</h2>`).join('')
    const facts = parsePage(html, 'https://example.com/')
    expect(facts.headings).toHaveLength(200)
    expect(facts.headings[199]).toEqual({ level: 2, text: 'Heading 199' })
    expect(facts.headingCount).toBe(250)
  })

  test('keeps every unique link', () => {
    const html = Array.from({ length: 6000 }, (_, i) => `<a href="/p/${i % 5500}">x</a>`).join('')
    const facts = parsePage(html, 'https://example.com/')
    expect(facts.links).toHaveLength(5500)
    expect(facts.links[5499]).toBe('https://example.com/p/5499')
    expect(facts).not.toHaveProperty('linkCount')
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

  test('an unknown header label is ignored and the meta charset is used', () => {
    const body = bytes('<meta charset="windows-1252">caf', [0xe9])
    expect(decodeHtml(body, 'text/html; charset=foo')).toBe('<meta charset="windows-1252">café')
  })

  test.each(['utf-16', 'UTF-16LE', 'utf-16be'])('a meta that names %s means utf-8', (label) => {
    const body = bytes(`<meta charset="${label}">caf`, [0xc3, 0xa9])
    expect(decodeHtml(body, 'text/html')).toBe(`<meta charset="${label}">café`)
  })

  test('an unknown meta label is skipped for the next meta', () => {
    const body = bytes('<meta charset="bogus"><meta charset="windows-1252">caf', [0xe9])
    expect(decodeHtml(body, null)).toMatch(/café$/)
  })

  test('a meta charset inside a comment is ignored', () => {
    const body = bytes('<!-- <meta charset="shift_jis"> -->caf', [0xc3, 0xa9])
    expect(decodeHtml(body, 'text/html')).toBe('<!-- <meta charset="shift_jis"> -->café')
  })

  test('invalid bytes do not throw', () => {
    expect(decodeHtml(bytes('a', [0xff], 'b'), 'text/html; charset=utf-8')).toBe('a�b')
  })
})
