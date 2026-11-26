'use server'

import { headers } from 'next/headers'
import { checkUrl, MESSAGES, type CheckResult, type Report } from '../lib/check'
import { createRateLimiter } from '../lib/rate-limit'
import { encodeShare } from '../lib/share'
import { visitorKey } from '../lib/visitor'

const limit = createRateLimiter()

/** A check result as the page sees it. `shareToken` is null when the report is too big to share, and the page says so. */
export type CheckActionResult =
  | { kind: 'report'; report: Report; shareToken: string | null }
  | Extract<CheckResult, { kind: 'error' }>

export async function checkAction(prev: CheckActionResult | null, formData: FormData): Promise<CheckActionResult> {
  try {
    const taken = limit(visitorKey(await headers()))
    if (!taken.ok) {
      const seconds = Math.ceil(taken.retryAfterMs / 1000)
      return {
        kind: 'error',
        reason: 'rate-limited',
        message: `Too many checks. Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`,
      }
    }
    const url = formData.get('url')
    const result = await checkUrl(typeof url === 'string' ? url : '')
    return result.kind === 'report' ? { ...result, shareToken: encodeShare(result.report) } : result
  } catch (error) {
    // A bug should cost the user one friendly message, not the whole page.
    console.error('checkAction failed', error)
    return { kind: 'error', reason: 'unexpected', message: MESSAGES.unexpected }
  }
}
