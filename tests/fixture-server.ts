import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, resolve } from 'node:path'

// Vitest and Playwright both run from the repo root.
const fixturesDir = resolve('tests/fixtures')

export type FixtureServer = { url: string; close(): Promise<void>; maxInFlight(): number }

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

function send(res: ServerResponse, status: number, body: string | Uint8Array, headers: Record<string, string> = {}) {
  res.writeHead(status, headers)
  res.end(body)
}

const html = (body: string) => `<!doctype html><html><head><title>Fixture</title></head><body>${body}</body></html>`
const htmlType = { 'Content-Type': 'text/html; charset=utf-8' }

/** A local HTTP server with the pages and failure modes the checker tests need. It never reaches the internet. */
export async function startFixtureServer(): Promise<FixtureServer> {
  let inFlight = 0
  let maxInFlight = 0

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const { pathname: path, searchParams } = new URL(req.url ?? '/', 'http://fixture.invalid')

    const fixture = /^\/fixtures\/([\w-]+\.html)$/.exec(path)
    if (fixture) {
      try {
        return send(res, 200, await readFile(join(fixturesDir, fixture[1])), htmlType)
      } catch {
        return send(res, 404, html('<h1>No such fixture</h1>'), htmlType)
      }
    }

    const status = /^\/status\/(\d{3})$/.exec(path)
    if (status) return send(res, Number(status[1]), html(`<h1>Status ${status[1]}</h1>`), htmlType)

    const link = /^\/link\/(\d+)$/.exec(path)
    if (link) {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await sleep(50)
      inFlight--
      return send(res, 200, html(`<h1>Link ${link[1]}</h1>`), htmlType)
    }

    // Answers every method with 200 after the given number of milliseconds.
    const delay = /^\/delay\/(\d+)$/.exec(path)
    if (delay) {
      await sleep(Number(delay[1]))
      return send(res, 200, html(`<h1>Answered after ${delay[1]} ms</h1>`), htmlType)
    }

    // Never answers, like a server that accepts the connection and then stalls.
    if (/^\/hang\/\d+$/.test(path)) return

    switch (path) {
      case '/redirect-to':
        // Redirects to whatever `location` says, so tests can aim a hop anywhere.
        return send(res, 302, '', { Location: searchParams.get('location') ?? '/' })
      case '/huge':
        // More than 5 MB in chunks, with no Content-Length.
        res.writeHead(200, htmlType)
        for (let i = 0; i < 6 * 16; i++) res.write(Buffer.alloc(64 * 1024, 'a'))
        return res.end()
      case '/huge-length':
        // Announces 100 MB, then sends nothing, so only the header can end the request early.
        res.writeHead(200, { ...htmlType, 'Content-Length': String(100 * 1024 * 1024) })
        return res.flushHeaders()
      case '/trickle':
        // Answers at once, then sends one byte every 100 ms and never finishes.
        res.writeHead(200, htmlType)
        while (!res.destroyed) {
          res.write('a')
          await sleep(100)
        }
        return
      case '/redirect/a':
        return send(res, 301, '', { Location: 'b' })
      case '/redirect/b':
        return send(res, 302, '', { Location: '../fixtures/complete.html' })
      case '/redirect/slow-a':
        return send(res, 301, '', { Location: '/redirect/slow-b' })
      case '/redirect/slow-b':
        // A slow hop in the middle of the chain, so time to first byte must include redirect time.
        await sleep(300)
        return send(res, 302, '', { Location: '/fixtures/complete.html' })
      case '/head-hang':
        // HEAD never gets an answer; GET works.
        if (req.method === 'HEAD') return
        return send(res, 200, html('<h1>GET works</h1>'), htmlType)
      case '/redirect/none':
        return send(res, 302, html('<h1>Redirect with no Location</h1>'), htmlType)
      case '/loop':
        return send(res, 302, '', { Location: '/loop' })
      case '/slow':
        await sleep(2000)
        return send(res, 200, html('<h1>Slow</h1>'), htmlType)
      case '/file.pdf':
        return send(res, 200, Buffer.from('%PDF-1.4\n%fixture\n'), { 'Content-Type': 'application/pdf' })
      case '/head-405':
        if (req.method === 'HEAD') return send(res, 405, '')
        return send(res, 200, html('<h1>GET works</h1>'), htmlType)
      case '/no-type':
        return send(res, 200, `\n  ${html('<h1>No content type</h1>')}`)
      case '/echo-headers':
        return send(res, 200, JSON.stringify(req.headers), { 'Content-Type': 'application/json' })
      case '/link-list':
        // One link per `href` query parameter, in order.
        return send(
          res,
          200,
          html(searchParams.getAll('href').map((href) => `<a href="${href}">link</a>`).join('\n')),
          htmlType,
        )
      case '/hanging-links':
        return send(
          res,
          200,
          html(Array.from({ length: 60 }, (_, n) => `<a href="/hang/${n}">Hang ${n}</a>`).join('\n')),
          htmlType,
        )
      case '/many-links':
        return send(
          res,
          200,
          html(Array.from({ length: 60 }, (_, n) => `<a href="/link/${n}">Link ${n}</a>`).join('\n')),
          htmlType,
        )
      default:
        return send(res, 404, html('<h1>Not found</h1>'), htmlType)
    }
  }

  const server = createServer((req, res) => {
    handle(req, res).catch(() => res.destroy())
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    maxInFlight: () => maxInFlight,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections()
        server.close(() => done())
      }),
  }
}

/** The URL of a port that was just opened and closed, so nothing answers on it. */
export async function closedPortUrl(): Promise<string> {
  const server = createServer()
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  await new Promise<void>((done) => server.close(() => done()))
  return `http://127.0.0.1:${port}/`
}
