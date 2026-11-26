'use server'

import { checkUrl, MESSAGES, type CheckResult } from '../lib/check'

export async function checkAction(prev: CheckResult | null, formData: FormData): Promise<CheckResult> {
  try {
    const url = formData.get('url')
    return await checkUrl(typeof url === 'string' ? url : '')
  } catch (error) {
    // A bug should cost the user one friendly message, not the whole page.
    console.error('checkAction failed', error)
    return { kind: 'error', reason: 'unexpected', message: MESSAGES.unexpected }
  }
}
