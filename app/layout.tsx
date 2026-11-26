import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { TOOL_URL } from '../lib/site'
import './globals.css'

export const metadata: Metadata = {
  // Ends in a slash so Next resolves file-based image paths under the basePath.
  metadataBase: new URL(`${TOOL_URL}/`),
  title: 'Meta Checker',
  description: 'Check the title, meta description and other SEO tags of any web page.',
  twitter: { card: 'summary_large_image' },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
