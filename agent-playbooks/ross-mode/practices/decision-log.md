# Decision log

Translated from pstack's `show-me-your-work` skill. Changed: the lead writes rows only through `scripts/log.sh`, which the hook lets through; the log lives at `$PASEO_HOME/audit/<repo>/<slug>.tsv`, where `<repo>` is the main checkout's folder name, shared by every worktree; the trail review is one fresh Ross - Reviewer. The cross-model review is the **Interrogate** playbook (`playbooks/interrogate.md`), whose second seat runs on Codex. Not ported: the transcript audit.

Keep one log per run, so I can audit your decisions after I step away.

## The format

One TSV file, one row per decision. Cells stay on one line. Evidence is a pointer, not prose.

- **ts.** Stamped by the script.
- **phase.** The phase or workstream.
- **decision.** What was chosen or done, one line.
- **why.** The reason in plain words. If a principle drove it, say it plainly, not as a tag.
- **evidence.** A pointer that proves it: commit SHA, PR number, `file:line`, a command and its exit code, or a screenshot path. Never a paragraph.
- **result.** The outcome or the finish condition's state: `tests green`, `reverted`, `INCONCLUSIVE`, `open`.

```
ts	phase	decision	why	evidence	result
2026-10-12T22:02:00Z	frame	finish condition: repro passes, all tests green	every iteration needs a check that can fail	prompt	open
2026-10-12T22:40:00Z	fix	worker added the missing permission check	the repro showed the request failed with 403	commit 7c21e0a	repro passes, tests green
2026-10-12T23:15:00Z	fix	discarded the worker's retry wrapper	it hid the error instead of fixing it	worker report, git diff	reverted
```

## Logging a row

```
~/.claude/skills/ross-mode/scripts/log.sh <slug> <phase> <decision> <why> <evidence> <result>
```

The slug is the run's name in lowercase and dashes, such as `fix-311-pcc-field`. Use the same slug all run. Write each row the way you'd tell a teammate what you did: plain words, concrete actions.

Log decision points and checkpoints, not every action: a fork chosen, a unit completed with its verification result, a pivot or revert with its trigger, a blocker surfaced. In a loop, one row per iteration. Skip the trivial and self-evident.

## Rules

- Append-only. A wrong call gets a new row that supersedes it. Never edit or delete a row.
- Before your reply, check the log told the truth: every row maps to a real decision or action, and every evidence pointer resolves and shows what the row claims. A fork or pivot that shaped the work but isn't logged is a gap, so add it. Correct the log with new rows, not the story.

## Review of the trail

Before your reply, launch a fresh Paseo `reviewer` agent (see **Subagents** in the router). Give it the log's path and the diff. Not a redo of the work, a scan for what I should look at:

- Decisions with weak or missing evidence.
- Verification claimed without proof.
- Choices that look risky in hindsight: premature, scope-creeping, or papering over a symptom.
- Gaps I'd miss on a quick skim.

End your reply with an **Attention** section: first the line `reviewed by <profile name>`, then each flag with the row or moment it points to. `No flags` is a valid value.
