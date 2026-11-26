// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { isPublicAddress } from './destination'

// The blocked side is covered through fetchPage in fetcher.test.ts. Reaching a public address there would
// need the internet, so the allowed side is checked here.
describe('isPublicAddress', () => {
  test.each(['93.184.215.14', '8.8.8.8', '2606:4700:4700::1111', '::ffff:93.184.215.14', '::ffff:5db8:d70e'])(
    '%s is public',
    (address) => {
      expect(isPublicAddress(address)).toBe(true)
    },
  )

  test.each(['not an address', '', '10.0.0.1', '::ffff:10.0.0.1', '::a00:1', '64:ff9b::808:808'])(
    '%j is not public',
    (address) => {
      expect(isPublicAddress(address)).toBe(false)
    },
  )
})
