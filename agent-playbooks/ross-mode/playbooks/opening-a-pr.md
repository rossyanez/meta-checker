### Opening a PR

Starts with scouts: no.

Ported from pstack `playbooks/opening-a-pr.md`. Translated: `/deslop` → a Ross - Reviewer pass; `/technical-writing` → `practices/technical-writing.md`; `/unslop` → `practices/unslop.md`. Origin, built-in PR tools, and stacked-PR tools are dropped; `gh` only. Not ported: `/no-comments`. Added (Ross's rule): every PR has a ticket. Added: the base can come from my brief, and the PR body's issue line is `Closes`, `Refs` or none. Added: screenshots as proof for a change that shows on screen, uploaded to the `pr-assets` branch by `scripts/pr-screenshots.sh`.

Runs at the end of Bug fix, Feature, Refactoring, and the other playbooks that ship, or on its own for finished work.

1. **Ticket.** Find the GitHub issue this work belongs to. If there is none and my brief doesn't say the work has none, draft one: a title, a **What** section, and **Acceptance criteria**. Create it with `~/.claude/skills/ross-mode/scripts/gh-post.sh issue <owner>/<repo> <title> -`, with the body on stdin.
2. **Branch.** Take the base from the first of these that names one. First, my brief: an explicit base or an integration branch, such as `feat/signup-r1`. Next, the repo's AGENTS.md or CLAUDE.md and the files they `@`-import. A rule written in those files wins over a `- Base branch: <name>` line in AGENTS.md's `## Setup` section. That line is the rule only when no other is written. Follow the rule as written, including any precedence it gives the ticket. Last, `main`. Fetch the base and branch off its remote ref, such as `origin/develop`. Name the branch `<type>/<short-slug>`, such as `feat/ross-mode-reviewer`. Never commit to the base branch. Use a Paseo worktree workspace only when two writers run at the same time.
3. **Commits.** Plan the commits from only the files that belong to this ticket. Leave unrelated changes uncommitted and list them in your reply. Keep them small and ordered: each one landable, ordered to tell the story. Titles use Conventional Commits, `type(scope): subject`, with `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, or `perf` as the type and the changed area as the scope. Keep the subject short and imperative, with no trailing period. A commit body doesn't restate its subject. Write titles and bodies under `practices/technical-writing.md`, then `practices/unslop.md`. Then hand a `worker` each commit's files, title, and body, in order, and have it stage the files by path and commit them as written. Check its result with `git log` and `git show --stat`. Principle: **Laziness Protocol** (`principles/laziness-protocol.md`).
4. **Review.** If this run hasn't already had a Ross - Reviewer check this exact diff, launch one now (see **Subagents** in the router). Have a `worker` fix every `critical` and commit it, with the title and body you write, before going on. For a `warning` or `nit` you don't fix, say why in the PR.
5. **PR body.** A briefing, not a lab notebook. A reviewer who has the diff should learn why the change exists, what it leaves out, what it could break, and how you proved it works, in under a minute. Use short, simple sentences. Write it under `practices/technical-writing.md` (every layer except Diátaxis), then apply `practices/unslop.md`. Put each section under a `##` heading, in this order, and drop a section that has nothing to say:
   - `## Why`: the problem and the approach, in one to three short sentences.
   - `## What changed`: one to three short bullets. Name a path only when it carries the change.
   - `## Scope`: what the PR covers and what it deliberately leaves out, in one to three short items.
   - `## Tradeoffs`: only rejected alternatives a reviewer would otherwise ask about.
   - `## Blast Radius`: one or two sentences on who or what the change touches, and why that's safe or risky.
   - `## Verification`: one to three bullets, each naming a real run and its outcome. When the change shows on screen, such as a page, a UI or rendered output, add a before and after pair of screenshots. The worker who makes the last change takes both and gives their paths in Proof. The before shot comes from the base branch, and the after shot from the change that goes into the final commit. A new visual has no before shot. If a fix from step 4's review changes the visual, the fixing worker retakes the after shot. Upload the shots with `~/.claude/skills/ross-mode/scripts/pr-screenshots.sh <png>...` and paste each line it prints under the bullet it proves. Never screenshot terminal output. Quote the command and its result.

   End the body with one issue line. A keyword rule in the repo's AGENTS.md or CLAUDE.md, or a file they `@`-import, wins. Otherwise pick the first that fits:
   - `Closes #<issue>` when the PR completes the issue and its base is the repo's standing base, the branch its rule names for ordinary work, such as `develop`, or `main` when it names none.
   - `Refs #<issue>` when the PR does part of the issue or targets any other base, such as an integration branch from my brief or the ticket. Some repos act on closing keywords themselves, such as a workflow that labels and closes issues on deploy.
   - No keyword when my brief says the work has no issue, so step 1 makes none. Write `Follow-up to #<n>` when it follows earlier work, or nothing.

   Keep the whole body under about 40 lines.
6. **Open it.** Push the branch and run `~/.claude/skills/ross-mode/scripts/gh-post.sh pr <owner>/<repo> - --base <step 2's base as a branch name, such as develop> --title <title>` with no `--draft`, with step 5's body on stdin. Run `gh pr view <number>` before you say anything about its status. Principle: **Prove It Works** (`principles/prove-it-works.md`).
7. **Hand off.** Post the PR URL. Don't merge it, and don't watch CI unless an Autonomous run's finish condition needs CI green. I merge.

**Reply:** the issue and PR URLs, the issue line step 5 chose and why, the commits in order, and any unrelated changes you left uncommitted.
