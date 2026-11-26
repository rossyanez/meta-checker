// Where the checker may connect. The fetcher asks this module before every hop and inside every DNS lookup.
import { promises as dns } from 'node:dns'
import type { LookupFunction } from 'node:net'
import ipaddr from 'ipaddr.js'

export type Resolve = (hostname: string) => Promise<{ address: string; family: 4 | 6 }[]>

/** `allowLoopback` exists only so tests can reach the fixture server on 127.0.0.1 at a random port. */
export type Policy = { resolve: Resolve; allowLoopback: boolean }

/** The `code` of the error the guarded lookup fails with, so the fetcher can tell a refusal from a network error. */
export const BLOCKED_CODE = 'ERR_META_CHECKER_BLOCKED'

const WEB_PORTS = new Set([80, 443])

/**
 * Cloud metadata addresses that ipaddr.js labels plain unicast. The others (169.254.169.254, fd00:ec2::254,
 * 100.100.100.200, 192.0.0.192) already sit in refused ranges; fetcher.test.ts pins every one.
 */
const METADATA = new Set(['168.63.129.16'])

const systemResolve: Resolve = async (hostname) =>
  (await dns.lookup(hostname, { all: true })).map(({ address, family }) => ({ address, family: family === 6 ? 6 : 4 }))

const testLoopback = process.env.META_CHECKER_TEST_ALLOW_LOOPBACK === '1'
if (testLoopback) {
  console.warn('META_CHECKER_TEST_ALLOW_LOOPBACK=1: loopback addresses can be checked. Never set this in production.')
}

export const DEFAULT_POLICY: Policy = { resolve: systemResolve, allowLoopback: testLoopback }

/** Global unicast IPv6. ipaddr.js labels other IPv6 unicast too, such as 4000::1 and 1::. */
const GLOBAL_UNICAST_V6 = ipaddr.IPv6.parseCIDR('2000::/3')

/** IPv4-mapped IPv6 (::ffff:a.b.c.d) becomes the IPv4 inside, so it gets the IPv4 rules. */
function parse(address: string): ipaddr.IPv4 | ipaddr.IPv6 | null {
  // ipaddr.js reads ::a.b.c.d as if it were ::ffff:a.b.c.d. The URL parser writes IPv6 in hex (::102:304),
  // the same form Node's DNS returns, so it is read the way the socket would connect.
  const canonical = address.includes(':') ? URL.parse(`http://[${address}]/`)?.hostname.slice(1, -1) : address
  if (canonical === undefined || !ipaddr.isValid(canonical)) return null
  const raw = ipaddr.parse(canonical)
  // Every address whose first 96 bits are zero stays IPv6, outside 2000::/3, so it is refused.
  if (raw.kind() === 'ipv6' && (raw as ipaddr.IPv6).parts.slice(0, 6).every((part) => part === 0)) return raw
  return ipaddr.process(canonical)
}

/**
 * True only for global unicast. Every range ipaddr.js names (private, loopback, link-local, unique local,
 * carrier-grade NAT, NAT64, 6to4, Teredo, reserved and the rest) is refused, so a range we forgot fails closed.
 * IPv6 must also sit in 2000::/3.
 */
export function isPublicAddress(address: string): boolean {
  const ip = parse(address)
  if (ip === null || ip.range() !== 'unicast' || METADATA.has(ip.toString())) return false
  return ip.kind() === 'ipv4' || (ip as ipaddr.IPv6).match(GLOBAL_UNICAST_V6)
}

function addressAllowed(address: string, port: number, policy: Policy): boolean {
  if (policy.allowLoopback && parse(address)?.range() === 'loopback') return true
  return isPublicAddress(address) && WEB_PORTS.has(port)
}

function portOf(url: URL): number {
  if (url.port !== '') return Number(url.port)
  return url.protocol === 'https:' ? 443 : 80
}

/**
 * The checks that need no DNS: web scheme, no credentials, not localhost, and for an IP literal the address
 * and port. A name's addresses are checked by `guardedLookup` when the connection opens.
 */
export function isAllowedUrl(url: URL, policy: Policy): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (url.username !== '' || url.password !== '') return false
  const host = url.hostname.replace(/\.$/, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return false
  // The URL parser has already turned every IPv4 spelling (2130706433, 0x7f.1, 127.1) into a.b.c.d.
  const literal = host.startsWith('[') ? host.slice(1, -1) : /^\d+\.\d+\.\d+\.\d+$/.test(host) ? host : null
  // An IP literal never reaches the lookup, so it is checked here in full.
  if (literal !== null) return addressAllowed(literal, portOf(url), policy)
  // Under the test policy a name may use any port; the lookup still refuses it unless the answer is loopback.
  return WEB_PORTS.has(portOf(url)) || policy.allowLoopback
}

/**
 * A `lookup` for sockets to `port`. It resolves once with `policy.resolve` and hands the socket only addresses
 * that passed, so the address checked is the address connected to. Any refused address refuses the whole answer.
 */
export function guardedLookup(policy: Policy, port: number): LookupFunction {
  return (hostname, options, callback) => {
    policy.resolve(hostname).then(
      (answers) => {
        if (answers.length === 0 || !answers.every(({ address }) => addressAllowed(address, port, policy))) {
          const error: NodeJS.ErrnoException = new Error(`Refused to connect to ${hostname}: not a public address`)
          error.code = BLOCKED_CODE
          return callback(error, '')
        }
        const family =
          options.family === 4 || options.family === 'IPv4' ? 4 : options.family === 6 || options.family === 'IPv6' ? 6 : 0
        const wanted = family === 0 ? answers : answers.filter((answer) => answer.family === family)
        if (wanted.length === 0) {
          const error: NodeJS.ErrnoException = new Error(`No IPv${family} address for ${hostname}`)
          error.code = 'ENOTFOUND'
          return callback(error, '')
        }
        if (options.all) return callback(null, wanted)
        callback(null, wanted[0].address, wanted[0].family)
      },
      (error: NodeJS.ErrnoException) => callback(error, ''),
    )
  }
}
