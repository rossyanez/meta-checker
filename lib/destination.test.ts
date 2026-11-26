// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { isPublicAddress } from './destination'

// The blocked side is covered through fetchPage in fetcher.test.ts. Reaching a public address there would
// need the internet, so the allowed side is checked here.
describe('isPublicAddress', () => {
  test.each([
    '93.184.215.14',
    '8.8.8.8',
    '2606:4700:4700::1111',
    '2001:4860:4860::8888',
    '::ffff:93.184.215.14',
    '::ffff:5db8:d70e',
  ])(
    '%s is public',
    (address) => {
      expect(isPublicAddress(address)).toBe(true)
    },
  )

  test.each([
    'not an address',
    '',
    '10.0.0.1',
    '::ffff:10.0.0.1',
    '::a00:1',
    '64:ff9b::808:808',
    // Global unicast IPv6 is 2000::/3; ipaddr.js labels these unicast too.
    '4000::1',
    '1::',
    // Any IPv6 whose first 96 bits are zero, however the last 32 are written.
    '::102:304',
    '::1.2.3.4',
    '::7f00:1',
    // Text that is not an IP address, even if a URL parser could read an address out of it.
    'a@[2001:4860::8888',
    '[2001:4860::8888]',
    // A zone id names a local interface; link-local stays refused.
    'fe80::1%lo0',
  ])(
    '%j is not public',
    (address) => {
      expect(isPublicAddress(address)).toBe(false)
    },
  )
})
