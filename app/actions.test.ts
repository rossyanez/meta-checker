// @vitest-environment node
import { expect, test } from 'vitest'
import { checkAction } from './actions'

test('an unexpected throw becomes a friendly error', async () => {
  const broken = {
    get() {
      throw new Error('boom')
    },
  } as unknown as FormData
  expect(await checkAction(null, broken)).toEqual({
    kind: 'error',
    reason: 'unexpected',
    message: 'Something went wrong while reading that page. Try again, or try a different address.',
  })
})

test('a blank address is an invalid-url error', async () => {
  const form = new FormData()
  form.set('url', '  ')
  expect(await checkAction(null, form)).toMatchObject({ kind: 'error', reason: 'invalid-url' })
})
