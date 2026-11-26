'use server'

import { checkUrl, type CheckResult } from '../lib/check'

export async function checkAction(prev: CheckResult | null, formData: FormData): Promise<CheckResult> {
  const url = formData.get('url')
  return checkUrl(typeof url === 'string' ? url : '')
}
