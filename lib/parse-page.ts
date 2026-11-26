import { html as htmlSpec, parse, type DefaultTreeAdapterMap } from 'parse5'

type Node = DefaultTreeAdapterMap['node']
type Element = DefaultTreeAdapterMap['element']

export type Heading = { level: 1 | 2 | 3 | 4 | 5 | 6; text: string; length: number }

export type PageFacts = {
  titles: string[]
  descriptions: string[]
  canonicals: string[]
  robots: { tags: string[]; index: boolean; follow: boolean }
  headings: Heading[]
  headingCount: number
  og: Record<'title' | 'description' | 'image' | 'url' | 'type', string[]>
  links: string[]
  linkCount: number
}

const MAX_HEADINGS = 200
const MAX_HEADING_TEXT = 300
const MAX_LINKS = 5000
const META_SNIFF_BYTES = 1024

const OG_KEYS = ['title', 'description', 'image', 'url', 'type'] as const
type OgKey = (typeof OG_KEYS)[number]
const OG_URL_KEYS: ReadonlySet<OgKey> = new Set(['image', 'url'])

export function decodeHtml(bytes: Uint8Array, contentType: string | null): string {
  const label = bomEncoding(bytes) ?? charsetFrom(contentType) ?? metaCharset(bytes) ?? 'utf-8'
  return decoderFor(label).decode(bytes)
}

function bomEncoding(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8'
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be'
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le'
  return null
}

function charsetFrom(value: string | null): string | null {
  const match = value?.match(/charset\s*=\s*["']?([^"';\s]+)/i)
  return match ? match[1] : null
}

function metaCharset(bytes: Uint8Array): string | null {
  // latin1 maps each byte to one character, so ASCII markup survives whatever the real encoding is.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, META_SNIFF_BYTES))
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const direct = tag.match(/\bcharset\s*=\s*["']?([^"'\s/>;]+)/i)
    if (direct && !/\bcontent\s*=/i.test(tag.slice(0, direct.index))) return direct[1]
    if (/\bhttp-equiv\s*=\s*["']?content-type/i.test(tag)) {
      const content = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
      const charset = charsetFrom(content ? (content[1] ?? content[2] ?? content[3]) : null)
      if (charset) return charset
    }
  }
  return null
}

function decoderFor(label: string): TextDecoder {
  try {
    return new TextDecoder(label)
  } catch {
    return new TextDecoder('utf-8')
  }
}

export function parsePage(html: string, pageUrl: string): PageFacts {
  const elements = htmlElements(parse(html))
  const baseHref = elements.find((el) => el.tagName === 'base' && attr(el, 'href') !== null)
  const baseUrl = baseHref ? (tryUrl(attr(baseHref, 'href')!.trim(), pageUrl)?.href ?? pageUrl) : pageUrl
  const resolve = (raw: string) => resolveHref(raw, baseUrl)

  const facts: PageFacts = {
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
  const links = new Set<string>()

  for (const el of elements) {
    switch (el.tagName) {
      case 'title':
        facts.titles.push(collapse(textOf(el)))
        break
      case 'meta': {
        const name = (attr(el, 'name') ?? '').trim().toLowerCase()
        const property = (attr(el, 'property') ?? '').trim().toLowerCase()
        const content = attr(el, 'content') ?? ''
        if (name === 'description') facts.descriptions.push(collapse(content))
        if (name === 'robots') facts.robots.tags.push(content.trim())
        const ogKey = [property, name].find((k) => k.startsWith('og:'))?.slice(3)
        if (ogKey && isOgKey(ogKey)) {
          facts.og[ogKey].push(OG_URL_KEYS.has(ogKey) ? resolve(content) : collapse(content))
        }
        break
      }
      case 'link':
        if (tokens(attr(el, 'rel') ?? '', /\s+/).includes('canonical')) {
          facts.canonicals.push(resolve(attr(el, 'href') ?? ''))
        }
        break
      case 'a': {
        // A blank href records '' like every other URL field, and '' is not an http(s) link.
        const href = (attr(el, 'href') ?? '').trim()
        const url = href === '' ? null : tryUrl(href, baseUrl)
        if (url && (url.protocol === 'http:' || url.protocol === 'https:')) {
          url.hash = ''
          links.add(url.href)
        }
        break
      }
      default: {
        const level = headingLevel(el.tagName)
        if (level) {
          facts.headingCount++
          if (facts.headings.length < MAX_HEADINGS) facts.headings.push(heading(level, el))
        }
      }
    }
  }

  const robotTokens = facts.robots.tags.flatMap((tag) => tokens(tag, /,/))
  facts.robots.index = !robotTokens.some((t) => t === 'noindex' || t === 'none')
  facts.robots.follow = !robotTokens.some((t) => t === 'nofollow' || t === 'none')
  facts.links = [...links].slice(0, MAX_LINKS)
  facts.linkCount = links.size
  return facts
}

/** HTML-namespace elements in document order. Template content is a separate fragment, so it is never visited. */
function htmlElements(root: Node): Element[] {
  const out: Element[] = []
  const stack: Node[] = [root]
  while (stack.length) {
    const node = stack.pop()!
    if ('tagName' in node && node.namespaceURI === htmlSpec.NS.HTML) out.push(node)
    if ('childNodes' in node) {
      for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push(node.childNodes[i])
    }
  }
  return out
}

function attr(el: Element, name: string): string | null {
  return el.attrs.find((a) => a.name === name && !a.namespace)?.value ?? null
}

function textOf(node: Node): string {
  if (node.nodeName === '#text' && 'value' in node) return node.value
  if (!('childNodes' in node)) return ''
  return node.childNodes.map(textOf).join('')
}

function collapse(text: string): string {
  return text.replace(/[\t\n\f\r ]+/g, ' ').trim()
}

function tokens(value: string, separator: RegExp): string[] {
  return value
    .split(separator)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
}

function tryUrl(href: string, base: string): URL | null {
  try {
    return new URL(href, base)
  } catch {
    return null
  }
}

function resolveHref(raw: string, base: string): string {
  const href = raw.trim()
  if (href === '') return ''
  return tryUrl(href, base)?.href ?? href
}

function isOgKey(key: string): key is OgKey {
  return (OG_KEYS as readonly string[]).includes(key)
}

function headingLevel(tagName: string): Heading['level'] | null {
  const match = /^h([1-6])$/.exec(tagName)
  return match ? (Number(match[1]) as Heading['level']) : null
}

function heading(level: Heading['level'], el: Element): Heading {
  const points = [...collapse(textOf(el))]
  const text = points.length > MAX_HEADING_TEXT ? `${points.slice(0, MAX_HEADING_TEXT).join('')}…` : points.join('')
  return { level, text, length: points.length }
}
