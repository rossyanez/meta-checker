### Interrogate

Starts with scouts: no.

Translated from pstack `skills/interrogate`. Changed: Cursor's Task subagents and model slugs → Paseo `create_agent`, one reviewer per model family, both on the `agents/ross-reviewer.md` brief. The reviewer prompt's rubric → `practices/review-rubric.md`, its code-quality lens → `practices/code-quality-review.md`, the lead's framework → `practices/lead-judgment.md`. No scouts: the reviewers read the code. Not ported: the slug-fallback PR. Dropped: `pstack-models.mdc` (the panel is the table in step 3).

Runs when I say "interrogate", "adversarial review", "multi-model review", or "tear this apart", or when a diff is too risky for one reviewer. Feature and Opening a PR keep their single Ross - Reviewer.

**You are the lead reviewer, not an aggregator. The signal comes from different model families, and the verdict is yours.** Don't apply fixes. The deliverable is the verdict.

A finding is a severity (`critical`, `warning`, or `nit`, as `agents/ross-reviewer.md` reports it), a location, a claim, the evidence, and the reviewers that raised it. Your verdict puts each finding in exactly one bucket: Act on, Consider, Noted, or Dismissed.

1. **Scope.** Review what I point at. Otherwise review the branch's whole change: `git diff origin/<base>...HEAD` and `git log --oneline origin/<base>..HEAD`. Note the context files a reviewer needs to understand the code.
2. **Intent.** Write one paragraph from my message, the commits, the PR body (`gh pr view <n> --json title,body`), and the code. If you can't state it, ask me before step 3. In an Autonomous run, write your best reading and log it instead.
3. **Launch the panel in one message.**

   | Reviewer | Agent | Settings |
   | --- | --- | --- |
   | A | the Ross - Reviewer profile | copy its settings from `list_profiles` |
   | B | `codex/gpt-6-astra` | `modeId: auto`, `thinkingOptionId: xhigh` |

   Both prompts start with the Ross - Reviewer profile's "Start the task prompt with" sentence, word for word. Then add the intent paragraph, the scope (diff range and worktree path), and: "This is an adversarial review. Also apply ~/.claude/skills/ross-mode/practices/code-quality-review.md."

   Before launching, check `list_providers` and `list_models codex`. If the slug is gone, use the closest current Codex model and say so. If no second family is available, run two Ross - Reviewers and say the panel was single-family. Wait for both in the foreground (see **Subagents** in the router). Codex in `auto` mode asks before each network or Paseo call. Answer read-only ones with `respond_to_permission`.
4. **Synthesize.** Merge findings that describe the same issue, and note which reviewers raised each. Two families raising it independently is the strongest signal. A lone finding still gets read, weighted accordingly. Note where they disagree.
5. **Judge.** Read `practices/lead-judgment.md`. Check each finding against the code before you bucket it. Put every finding in one bucket, with its reviewers and a one-line reason:
   - **Act on.** Real correctness, security, or maintainability problems that would block a PR.
   - **Consider.** Legitimate, but unclear it's worth fixing now. My call.
   - **Noted.** Valid, not actionable now.
   - **Dismissed.** Wrong, a nit, or missing context, with the reason.

   Principle: **Prove It Works** (`principles/prove-it-works.md`).

**Reply:** Intent; Reviewers (one bullet each: label, agent, finding count); Act on; Consider; Noted; Dismissed; Agreement map (where the families agreed and split, and what that says).
