import type { Metadata } from 'next'
import { TOOL_URL } from '../lib/site'
import { Checker } from './checker'

const title = 'Meta Checker'
const description = 'Free SEO check for any web page: title, meta description, canonical, Open Graph, headings and broken links.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: TOOL_URL },
  openGraph: { title, description, url: TOOL_URL, siteName: 'Ross Yanez', type: 'website' },
}

export default function Home() {
  return (
    <main>
      <h1>Meta Checker</h1>
      <Checker />
    </main>
  )
}
