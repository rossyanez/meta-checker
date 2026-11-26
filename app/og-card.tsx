import { ImageResponse } from 'next/og'
import type { ReactNode } from 'react'

// Shared look for the Open Graph cards. Uses next/og's bundled font, so nothing is read or fetched at run time.
export const OG_SIZE = { width: 1200, height: 630 }

/** Lines are passed as a list, because the image renderer lays out a fragment's children in a row. */
export function ogCard(lines: ReactNode[]): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: '#0f172a',
          color: '#f8fafc',
          fontSize: 36,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>{lines}</div>
        <div style={{ display: 'flex', fontSize: 28, color: '#94a3b8' }}>rossyanez.com/tools/meta-checker</div>
      </div>
    ),
    OG_SIZE,
  )
}

export function toolCard(): ImageResponse {
  return ogCard([
    <div key="name" style={{ display: 'flex', fontSize: 80, fontWeight: 700 }}>
      Meta Checker
    </div>,
    <div key="pitch" style={{ display: 'flex', fontSize: 40, color: '#cbd5e1' }}>
      Free SEO check: title, meta description, canonical, Open Graph, headings and broken links.
    </div>,
  ])
}
