import { describe, expect, test } from 'vitest'
import { createRateLimiter } from './rate-limit'

function clock(start = 0) {
  let now = start
  return { now: () => now, advance: (ms: number) => (now += ms) }
}

describe('createRateLimiter', () => {
  test('allows max hits per window, then says how long to wait', () => {
    const time = clock()
    const take = createRateLimiter({ max: 2, windowMs: 1_000, maxVisitors: 10, now: time.now })
    expect(take('a')).toEqual({ ok: true })
    time.advance(300)
    expect(take('a')).toEqual({ ok: true })
    expect(take('a')).toEqual({ ok: false, retryAfterMs: 700 })
    time.advance(700)
    expect(take('a')).toEqual({ ok: true })
  })

  test('a refused hit does not extend the wait', () => {
    const time = clock()
    const take = createRateLimiter({ max: 1, windowMs: 1_000, maxVisitors: 10, now: time.now })
    take('a')
    time.advance(500)
    expect(take('a')).toEqual({ ok: false, retryAfterMs: 500 })
    time.advance(500)
    expect(take('a')).toEqual({ ok: true })
  })

  test('tracks at most maxVisitors, so made-up keys cannot grow memory without bound', () => {
    const time = clock()
    const take = createRateLimiter({ max: 1, windowMs: 1_000, maxVisitors: 3, now: time.now })
    for (let i = 0; i < 100; i++) take(`visitor-${i}`)
    expect(take.tracked()).toBe(3)
  })

  test('visitors whose window has passed are forgotten', () => {
    const time = clock()
    const take = createRateLimiter({ max: 1, windowMs: 1_000, maxVisitors: 3, now: time.now })
    take('a')
    take('b')
    time.advance(1_000)
    take('c')
    expect(take.tracked()).toBe(1)
  })
})
