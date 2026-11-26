// In memory, for one server instance: a restart resets it, and several instances each count on their own.

export const RATE_LIMIT_MAX = 10
export const RATE_LIMIT_WINDOW_MS = 60_000
/** Visitors tracked at once. Past this the longest-idle ones are forgotten, so memory stays bounded. */
export const RATE_LIMIT_MAX_VISITORS = 10_000

export type Take = { ok: true } | { ok: false; retryAfterMs: number }

/** A sliding window per visitor key. `now` is injectable for tests. */
export function createRateLimiter({
  max = RATE_LIMIT_MAX,
  windowMs = RATE_LIMIT_WINDOW_MS,
  maxVisitors = RATE_LIMIT_MAX_VISITORS,
  now = Date.now,
}: { max?: number; windowMs?: number; maxVisitors?: number; now?: () => number } = {}) {
  // Each visitor's allowed hits, oldest first. Map order is by last allowed hit, so the front is the most idle.
  const hits = new Map<string, number[]>()

  function take(key: string): Take {
    const at = now()
    const recent = (hits.get(key) ?? []).filter((hit) => hit > at - windowMs)
    if (recent.length >= max) {
      hits.set(key, recent)
      return { ok: false, retryAfterMs: recent[0] + windowMs - at }
    }
    recent.push(at)
    hits.delete(key)
    hits.set(key, recent)
    forget(at)
    return { ok: true }
  }

  /** Drops visitors from the idle end: all whose window has passed, then any over the cap. */
  function forget(at: number) {
    for (const [key, times] of hits) {
      if (hits.size <= maxVisitors && times[times.length - 1] > at - windowMs) break
      hits.delete(key)
    }
  }

  return Object.assign(take, { tracked: () => hits.size })
}
