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

export function decodeHtml(bytes: Uint8Array, contentType: string | null): string {
  void bytes
  void contentType
  throw new Error('not implemented')
}

export function parsePage(html: string, pageUrl: string): PageFacts {
  void html
  void pageUrl
  throw new Error('not implemented')
}
