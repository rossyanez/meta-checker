### Correction

Starts with scouts: yes.

Ported from pstack `skills/correct/SKILL.md`, as a playbook so the router can pick it and Bug fix can flag it.

**You own the fix to the repo, not to the prompt.** Assume every contributor is an agent that sees only the files it opened, copies the nearest example, and takes the shortest path that compiles. Change the repo so a change that looks right from one file is right for the whole repo.

1. Find the mistake classes. Launch `scout` agents to gather the evidence (see **Subagents** in the router). This is mandatory, with no skip. If I named the mistake, launch one scout to find every past occurrence. If I didn't, launch up to three in parallel, one source each: commits and reverts, PR review comments (`gh`), and agent instruction files plus comments that explain workarounds. One scout also reads the rule table in the repo's agent instruction file: a `nothing` rule that broke again is a repeat and joins the list. Group what they find into classes. A class counts once it has happened twice. List each class with its evidence: a commit, PR, or `file:line` per occurrence.
2. Pick a level for each class, the highest that works, and write why each higher level didn't. Principle: **Encode Lessons in Structure** (`principles/encode-lessons-in-structure.md`).
   - **Level 1, architecture.** Make the mistake impossible: one owner per piece of state, one supported way per task, internals hidden so the wrong import fails, one source of truth instead of hand-synced lists. Delete old ways and dead code an agent would copy.
   - **Level 2, types or a check.** Make the bad state unwritable. If bad code still runs, add a lint, hook, or CI check whose error names the file, type, or function to use instead. If the pattern is already common, fail only when a change adds more.
   - **Level 3, test.** Test the behavior. Fix or delete any test that would still pass if every function it calls returned nothing.
   - **Level 4, docs or agent rules.** Only for judgment calls, because nothing fails when an agent skips them.
3. List the classes, their evidence, and the levels in one short list. It goes in the ticket (Opening a PR step 1) and the reply.
4. Delegate each class to a Paseo `worker` agent, most frequent first, one class per handover (see **Subagents** in the router). This is mandatory, with no skip: the point is that the writer and the reviewer are different agents. Name the check's own test as the seam, or say there's none in the handover (a level 1 or 4 fix often has no check). Principle: **Laziness Protocol** (`principles/laziness-protocol.md`).
5. Prove each new check fails on a real past mistake: have the worker replay that mistake on the fixed tree, and read the failure, with its message naming the fix. Then read it passing without the mistake. Have the worker wire the check into CI with the same command it ran locally. Principle: **Prove It Works** (`principles/prove-it-works.md`).
6. Have a `worker` update the rule table in the repo's agent instruction file (`AGENTS.md` or `CLAUDE.md`): one row per rule, with what enforces it, or `nothing`. A rule already in the table with `nothing` that broke again is a repeat. A repeat that wasn't in step 3's list comes back to me; it doesn't join this change. Drop a row once its mistake can't happen. An exception goes on the offending line, with a reason, an expiry date, and my approval.
7. Get the diff reviewed by a fresh Paseo `reviewer` agent. Have a `worker` fix what it finds, or say why you didn't.
8. Run the **Opening a PR** playbook (`playbooks/opening-a-pr.md`), with one commit per class. Add its steps to your todo list, copied in verbatim.

**Reply:** each class with its evidence, the level you picked, and why a higher level didn't work. Paste each new check's fail-then-pass output verbatim.
