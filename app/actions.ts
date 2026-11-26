'use server'

import { headers } from 'next/headers'
import { checkUrl, MESSAGES, type CheckResult } from '../lib/check'
import { createRateLimiter } from '../lib/rate-limit'
import { visitorKey } from '../lib/visitor'

const limit = createRateLimiter()

export async function checkAction(prev: CheckResult | null, formData: FormData): Promise<CheckResult> {
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
    return await checkUrl(typeof url === 'string' ? url : '')
  } catch (error) {
    // A bug should cost the user one friendly message, not the whole page.
    console.error('checkAction failed', error)
    return { kind: 'error', reason: 'unexpected', message: MESSAGES.unexpected }
  }
}
