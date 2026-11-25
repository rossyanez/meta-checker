### Reflect

Starts with scouts: no.

Translated from pstack `skills/reflect`. Changed: the Cursor transcript → this session's Claude Code file plus the Paseo timelines of the agents it launched. `Task` subagents and `pstack-models.mdc` → Ross - Reviewer for the judgment, divergent and synthesizer seats, and a read-only codex agent for pstack's grok tooling seat. The devex tracker → GitHub issues labelled `needs-triage`. Cursor's `create-skill` → the **writing-for-agents** skill. Approved edits → a Ross - Worker, shipped through **Opening a PR**. Not ported: the nested and subagent transcript layouts and the SKILL.md validator line.

Run as `/ross-mode reflect`. Skip when the session is trivial, off-topic, or already covered by a skill the lead followed correctly. One-offs are not learnings.

**Nothing changes before I approve it. A skill edit reaches every future agent.**

1. **Locate the transcript.**
   - Claude Code writes one `<sessionId>.jsonl` per session in `~/.claude/projects/<dir>/`. `<dir>` is this session's working directory with every character that isn't a letter or digit turned into `-`. A session in a Paseo worktree uses the worktree's path.
   - Read only that `<dir>`. Never glob across `~/.claude/projects/*`, because that reads private chats from unrelated projects.
   - `ls -t ~/.claude/projects/<dir>/*.jsonl | head -5`. The newest is normally the live session. Confirm it: its first user message matches this session's. `jq -r 'select(.type=="user") | .message.content | if type=="string" then . else (map(select(.type=="text").text) | first) end' <file> | head -c 300` prints its first 300 characters.
   - List every agent this session launched: its `create_agent` calls, checked against `paseo agent ls`. Their work lives in their Paseo timelines, not in this file.
   - If no file matches, write a tight digest of the session instead.

   Principle: **Prove It Works** (`principles/prove-it-works.md`).
2. **Launch three reviewers in one message.** Each prompt is its practices file, verbatim, with the transcript path and the agent IDs filled in where marked, or the digest.
   - Judgment: a Ross - Reviewer (see **Subagents** in the router), prompt `practices/reflect-judgment-reviewer.md`.
   - Divergent: a Ross - Reviewer, prompt `practices/reflect-divergent-reviewer.md`.
   - Tooling: the codex seat from **Arena** step 1 (`playbooks/arena.md`), prompt `practices/reflect-tooling-reviewer.md`. Start the prompt with "You are read-only. Do not edit, install, delete, commit, or launch agents." This seat runs on a second model family, as pstack's grok seat did.

   Wait for all three in the foreground, as **Subagents** in the router says.
3. **Synthesize.** Launch one Ross - Reviewer. Its prompt is `practices/reflect-synthesizer.md`, verbatim, with each reviewer's full output inlined where marked. Wait in the foreground. It returns an Accepted / Rejected / Backlog list.
4. **Structural enforcement check.** Move any Accepted item that a lint rule, script, hook, metadata flag, or runtime check would enforce more reliably to Backlog.

   Principle: **Encode Lessons in Structure** (`principles/encode-lessons-in-structure.md`).
5. **Approve, then apply.**
   - Present the synthesizer's full Accepted / Rejected / Backlog output, with step 4's moves. Wait for my explicit approval of each Accepted row. I pick the subset and may redirect routings. Nothing changes before that.
   - In an Autonomous run, stop at the proposal and list it in the reply. Approval is mine.
   - File each Backlog item now as an issue in the repo where ross-mode lives: `~/.claude/skills/ross-mode/scripts/gh-post.sh issue <owner>/<skills-repo> <title> - --label needs-triage`. Tickets are reversible, so only the Accepted list waits.
   - Before any edit, create a worktree of that repo. `~/.claude/skills/ross-mode` symlinks into its checkout, so `readlink ~/.claude/skills/ross-mode` and drop the trailing `/skills/ross-mode` to get it. Run `git fetch origin main` there. Then call `create_workspace` with `path` set to that checkout, `isolation: "worktree"`, `mode: "branch-off"` and `baseBranch: "origin/main"`. Approved edits never land in the live checkout.
   - A Ross - Worker makes each approved edit, in that worktree: pass it the `workspaceId`. The lead never writes. A routing path under `~/.claude/skills/ross-mode/...` or `skills/...` maps to the worktree's `skills/...`. Follow each approved row's Routing exactly:
     - Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): the worker makes it as written.
     - Substantive existing-skill edit (a new section, a new pattern table, more than about 10 lines): the worker drafts it per the **writing-for-agents** skill (`~/.claude/skills/writing-for-agents/SKILL.md`).
     - `tune description: <skill path>`: the worker rewrites the description per the same skill's context pointer rules.
     - `new skill via writing-for-agents: <kebab-name>`: the worker creates it per that skill. Do not invent the shape ad hoc.
   - Edits to files in that repo (`skills/`, `agents/*.md`) ship through the **Opening a PR** playbook (`playbooks/opening-a-pr.md`). Run it in that worktree. Its `gh-post.sh issue` and `gh-post.sh pr` take `<owner>/<skills-repo>` as the repo.
   - Edits outside that repo (skills under `~/.agents/skills/`, Paseo profile notes) come to me as proposed diffs. The worker drafts the diff and applies nothing there.

   Principle: **Never Block on the Human** (`principles/never-block-on-the-human.md`).
6. **Summarize for me.** A short list, no preamble:
   - Edits applied: `<skill path>`, with the PR URL. One line each on what changed.
   - Proposed diffs for me: `<skill path>`. One line each.
   - New skills created: `<skill path>`. One line each (rare).
   - Backlog filed: the issue URL and title. One line each.
   - Dropped: one line per rejected finding, with the synthesizer's reason.

**Reply:** before approval, the synthesizer's full Accepted / Rejected / Backlog output with the Backlog issue URLs. After the edits, step 6's list.
