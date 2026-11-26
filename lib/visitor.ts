// Who is asking, for the rate limit. Parsed from headers at the edge of the server action.
import ipaddr from 'ipaddr.js'

/**
 * Set on every request by lib/peer-address.cjs to the socket's remote address, overwriting anything the
 * client sent. Next fills X-Forwarded-For with that address only when the client sent none, so a spoofed
 * header would otherwise hide the real one.
 */
export const PEER_HEADER = 'x-meta-checker-peer'

/** Every request whose address we cannot read shares this one bucket, so a missing address never earns a fresh one. */
export const UNKNOWN_VISITOR = 'unknown'

export function parseTrustedProxyHops(value: string | undefined): number {
  if (value === undefined || value === '') return 0
  if (!/^\d+$/.test(value)) {
    throw new Error(`TRUSTED_PROXY_HOPS must be a whole number of proxies, 0 or more; got ${JSON.stringify(value)}`)
  }
  return Number(value)
}

/** How many proxies in front of the app append to X-Forwarded-For. 0 means the app faces visitors directly. */
export const TRUSTED_PROXY_HOPS = parseTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS)

let warnedNoPeer = false

/**
 * The visitor's rate-limit key. With no trusted proxy it is the socket's address; with N proxies it is the
 * Nth X-Forwarded-For entry from the right, the address the outermost trusted proxy saw.
 */
export function visitorKey(headers: Headers, hops: number = TRUSTED_PROXY_HOPS): string {
  if (hops === 0) {
    const peer = headers.get(PEER_HEADER)
    if (peer === null && !warnedNoPeer) {
      warnedNoPeer = true
      console.warn(`No ${PEER_HEADER} header: start the server with "node -r ./lib/peer-address.cjs".`)
    }
    return keyOf(peer)
  }
  const forwarded = (headers.get('x-forwarded-for') ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)
  return keyOf(forwarded.length >= hops ? forwarded[forwarded.length - hops] : null)
}

/** IPv4 as is (also when mapped into IPv6); IPv6 by its /64, the block one home or server usually gets. */
function keyOf(address: string | null): string {
  if (address === null || !ipaddr.isValid(address)) return UNKNOWN_VISITOR
  const ip = ipaddr.process(address)
  if (ip.kind() === 'ipv4') return ip.toString()
  return `${(ip as ipaddr.IPv6).parts.slice(0, 4).map((part) => part.toString(16)).join(':')}::/64`
}
