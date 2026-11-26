import { decodeShare } from '../../../lib/share'
import { ogCard, toolCard } from '../../og-card'

// Decodes the token only. Drawing the card never fetches the checked page.
export const alt = 'Meta Checker report summary'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

type Props = { params: Promise<{ token: string }> }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function shorten(text: string, max: number): string {
  const chars = [...text]
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text
}

export default async function Image({ params }: Props) {
  const shared = decodeShare((await params).token)
  if (!shared.ok) return toolCard()

  const { report } = shared
  const title = report.page?.titles[0]
  // Only counts that keep their real totals in a share token. The broken list can be trimmed, so it is not counted.
  const counts = [
    report.page && plural(report.page.headingCount, 'heading', 'headings'),
    report.links && `${report.links.checked} of ${plural(report.links.found, 'link', 'links')} checked`,
  ].filter((count): count is string => Boolean(count))

  return ogCard([
    <div key="label" style={{ display: 'flex', fontSize: 32, color: '#94a3b8' }}>
      Meta Checker report
    </div>,
    <div key="host" style={{ display: 'flex', fontSize: 64, fontWeight: 700 }}>
      {shorten(new URL(report.finalUrl).hostname, 40)}
    </div>,
    <div key="title" style={{ display: 'flex', fontSize: 40, color: '#cbd5e1' }}>
      {title ? shorten(title, 100) : 'No title tag'}
    </div>,
    <div key="counts" style={{ display: 'flex', gap: 40, fontSize: 32 }}>
      <span>{`HTTP ${report.status}`}</span>
      {counts.map((count) => (
        <span key={count}>{count}</span>
      ))}
    </div>,
  ])
}
