# Meta Checker

A free SEO tool: enter a web address and see its title, meta description, canonical, headings, Open Graph tags, robots settings, status code, broken links and basic speed.

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

## License

MIT
