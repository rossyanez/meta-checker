import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Report } from '../lib/check'

const result = vi.hoisted(() => ({ shareToken: null as string | null }))

vi.mock('./actions', () => ({
  checkAction: async () => ({ kind: 'report', report: sampleReport(), shareToken: result.shareToken }),
}))

import { Checker } from './checker'

afterEach(cleanup)

function sampleReport(): Report {
  return {
    requestedUrl: 'https://example.com/',
    finalUrl: 'https://example.com/',
    status: 200,
    redirects: [],
    contentType: 'text/html',
    speed: { ttfbMs: 10, htmlBytes: 100 },
    page: null,
    links: null,
  }
}

async function check() {
  render(<Checker />)
  fireEvent.change(screen.getByLabelText('Page URL'), { target: { value: 'https://example.com/' } })
  fireEvent.click(screen.getByRole('button', { name: 'Check' }))
  await screen.findByRole('region', { name: 'Summary' })
}

test('a report too big to share says so instead of offering a link', async () => {
  result.shareToken = null
  await check()

  expect(screen.getByText('This report is too large to share.')).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Share this report' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Want a full audit? Hire me' })).toBeTruthy()
})

test('a shareable report links to its permalink', async () => {
  result.shareToken = 'abc.def'
  await check()

  expect(screen.getByRole('link', { name: 'Share this report' }).getAttribute('href')).toBe('/r/abc.def')
  expect(screen.queryByText('This report is too large to share.')).toBeNull()
})
