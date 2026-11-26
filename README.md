# Meta Checker

A free SEO tool. Enter a web address and the report shows:

- **Summary.** The status code, the final URL and every redirect on the way.
- **Title and meta description.** Each with its length in characters.
- **Canonical and robots.** Including whether search engines may index the page and follow its links.
- **Headings outline.** H1 to H6 in page order, indented by level.
- **Open Graph.** `og:title`, `og:description`, `og:image`, `og:url` and `og:type`.
- **Broken links.** Up to 50 links on the page are checked, and any that fail are listed with their status. Links to private addresses are listed as skipped, not broken.
- **Speed.** Time to first byte and HTML size.

Each tag is marked Missing, Empty, or found more than once (the first one counts).

The checker only fetches public web pages. See [Security](#security).

**Live:** coming soon at rossyanez.com/tools/meta-checker

## Status

Being built in public, one ticket at a time. See the [issues](../../issues) and [pull requests](../../pulls?q=is%3Apr).

## How my agents built this

Every change in this repo went through the same pipeline, and each step leaves evidence you can click:

1. **Ticket.** Each piece of work starts as a GitHub issue with a clear scope.
2. **Todo list.** A coding agent (Claude Code) picks the matching playbook and copies its steps into a todo list, word for word. A hook blocks it from working until that list exists.
3. **Failing test first.** Tests are written before the code and must fail first. The PR shows the red run, then the green one.
4. **Fix.** The agent builds the change in small, verified commits.
5. **Independent review.** A separate agent that wrote none of the code reviews the PR. It often fails it first; the coding agent fixes the findings until it passes.
6. **Required checks.** The verdict is posted as the `ross-mode/verdict` status. `master` is protected: a pull request needs CI (tests, lint, secret scan) and a passing verdict before it can merge, and force-pushes are blocked.
7. **A human merges.** Agents stop at merge-ready. I review and merge every PR myself.

The agent playbooks are based on Lauren Tan's open-source [pstack](https://github.com/cursor/plugins/tree/main/pstack) (MIT).

## Run locally

Needs Node 24.

```sh
npm ci
npm run dev        # http://localhost:3000/tools/meta-checker
npm test           # unit tests (Vitest)
npm run lint       # ESLint and type check
npx playwright install chromium
npm run test:e2e   # builds the app and runs the browser smoke test
```

With Docker:

```sh
docker build -t meta-checker .
docker run --rm -p 3000:3000 meta-checker   # http://localhost:3000/tools/meta-checker
```

## Security

The checker fetches addresses that visitors type, so it guards what it connects to and how often it runs.

- **Public addresses only.** Every request, redirect hop and link check must use `http` or `https`, port 80 or 443, no username or password, and a host that is not `localhost`. Every address the host resolves to must be global unicast: private, loopback, link-local, carrier-grade NAT, NAT64, multicast, reserved and cloud metadata addresses are refused. The check runs inside the connection's own DNS lookup, so the address checked is the address connected to (no DNS rebinding window). Refused pages show an error; refused links are listed as skipped.
- **Size and time limits.** A page may be at most 5 MB. Connecting may take 3 seconds, the page 10 seconds in total (a slow trickle included), and each link 5 seconds.
- **Rate limit.** Each visitor gets 10 checks a minute. The count is kept in memory for one server instance: a restart resets it, and several instances each count separately. IPv6 visitors are counted by their /64.
- **Visitor address.** `npm start` and the Docker image start the server with `node -r ./lib/peer-address.cjs`. That preload stamps each request with the address of the socket it came in on. Next only fills `X-Forwarded-For` when the client sent none, so without it a visitor could hide their address by sending that header. Keep the preload if you start `server.js` another way; without it every visitor shares one bucket.
- **Behind a proxy.** Set `TRUSTED_PROXY_HOPS` to the number of proxies that append to `X-Forwarded-For` in front of the app. The default, 0, trusts no forwarded header. Behind Coolify's Traefik, that is one proxy hop, so set `TRUSTED_PROXY_HOPS=1`. The server refuses to start if the value is not a whole number.
- **Tests only.** `META_CHECKER_TEST_ALLOW_LOOPBACK=1` lets the end-to-end tests reach their local fixture server. Never set it in production.
- **Lint.** `fetch`, `undici` and Node's socket modules are allowed only in `lib/fetcher.ts` and `lib/destination.ts`, so a new request can't skip the checks.

## License

MIT
