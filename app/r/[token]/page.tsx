import type { Metadata } from 'next'
import Link from 'next/link'
import { decodeShare } from '../../../lib/share'
import { HireCta } from '../../hire-cta'
import { Report } from '../../report'

// Opening a report link only reads the token. It never fetches the page again.
type Props = { params: Promise<{ token: string }> }

const day = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' })

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shared = decodeShare((await params).token)
  // Reports describe arbitrary third-party sites, so search engines should never index them.
  const robots = { index: false, follow: false }
  if (!shared.ok) return { title: 'Meta Checker report link', robots }
  const title = `SEO report for ${new URL(shared.report.finalUrl).hostname}`
  const description = 'Title, meta description, canonical, robots, headings, Open Graph, broken links and speed.'
  return { title, description, robots, openGraph: { title, description, type: 'website' } }
}

export default async function ReportPage({ params }: Props) {
  const shared = decodeShare((await params).token)
  if (!shared.ok) {
    const expired = shared.reason === 'expired'
    return (
      <main>
        <h1>{expired ? 'This report link has expired' : 'This report link does not work'}</h1>
        <p>
          {expired
            ? 'Report links last 90 days. Run a fresh check to see the page now.'
            : 'The link is broken or was changed. Run a fresh check to see the page now.'}
        </p>
        <p>
          <Link href="/">Check another page</Link>
        </p>
      </main>
    )
  }

  return (
    <main>
      <h1>{`Report for ${new URL(shared.report.finalUrl).hostname}`}</h1>
      <p className="share-dates">
        <span>{`Checked on ${day.format(shared.checkedAt)}`}</span>
        <span>{`Link expires ${day.format(shared.expiresAt)}`}</span>
      </p>
      <Report report={shared.report} />
      <HireCta />
      <p>
        <Link href="/">Check another page</Link>
      </p>
    </main>
  )
}
