// @vitest-environment node
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createRequire } from 'node:module'
import { afterAll, beforeAll, expect, test } from 'vitest'

let server: Server
let url: string

beforeAll(async () => {
  // The preload the app starts with (`node -r ./lib/peer-address.cjs`), loaded before the server is created.
  createRequire(import.meta.url)('./peer-address.cjs')
  server = createServer((req, res) => res.end(JSON.stringify(req.headers)))
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
})
afterAll(() => new Promise<void>((done) => server.close(() => done())))

async function seenBy(headers: Record<string, string>) {
  const response = await fetch(url, { headers })
  return (await response.json()) as Record<string, string>
}

test('every request carries the address of the socket it came in on', async () => {
  expect((await seenBy({}))['x-meta-checker-peer']).toBe('127.0.0.1')
})

test('a peer header sent by the client is overwritten, not trusted or appended to', async () => {
  expect((await seenBy({ 'x-meta-checker-peer': '1.2.3.4' }))['x-meta-checker-peer']).toBe('127.0.0.1')
})

test('X-Forwarded-For is left as the client sent it', async () => {
  const seen = await seenBy({ 'x-forwarded-for': '1.2.3.4' })
  expect(seen['x-forwarded-for']).toBe('1.2.3.4')
  expect(seen['x-meta-checker-peer']).toBe('127.0.0.1')
})
