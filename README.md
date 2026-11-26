# Meta Checker

A free SEO tool. Enter a web address and the report shows:

- **Summary.** The status code, the final URL and every redirect on the way.
- **Title and meta description.** Each with its length in characters.
- **Canonical and robots.** Including whether search engines may index the page and follow its links.
- **Headings outline.** H1 to H6 in page order, indented by level.
- **Open Graph.** `og:title`, `og:description`, `og:image`, `og:url` and `og:type`.
- **Broken links.** Up to 50 links on the page are checked, and any that fail are listed with their status.
- **Speed.** Time to first byte and HTML size.

Each tag is marked Missing, Empty, or found more than once (the first one counts).

Network safety (blocking private addresses, plus rate and size limits) lands in [#3](../../issues/3).

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

## License

MIT
