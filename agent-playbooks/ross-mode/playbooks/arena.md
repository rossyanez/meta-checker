### Arena

Starts with scouts: no.

Translated from pstack `skills/arena`. Changed: Task subagents → Paseo agents. Model slugs and the `pstack-models.mdc` lines → two seats: a Claude seat runs a Ross profile, and the other family is a codex seat. Each runner gets its own Paseo worktree. The judge is codex, because the lead is Claude. A Ross - Worker does the grafting, then commits the result and merges it back, because the lead never writes files. The synthesis note goes in the reply and one decision-log row. Dropped: the `/tmp/arena-<slug>/candidate-<n>/` fallback, `run_in_background`, and the slug alias and rejection rules.

Runs on its own, from Feature step 4, or as Architect step 2.

**The prompt is the contract. The rubric picks the base.**

1. **Frame.** Every candidate gets the same prompt, so the prompt is the contract.
   - State the artifact each candidate produces.
   - Derive the rubric: 3 to 6 concrete, gradeable criteria for success on this task. It is your tool in step 4. Candidates see only the task.
   - Pick the runners. The default is two: one Ross - Worker (see **Subagents** in the router) and one codex seat. A codex seat is `create_agent` with `provider: "codex/gpt-6-astra"`, `settings: {"thinkingOptionId": "high", "modeId": "auto"}`. If that model is gone, run `list_models codex` and use its default. Add runners when the arena covers several design directions. Use the same seat N times when the work is generation-bound rather than judgment-sensitive.
   - Give each runner its own Paseo worktree: `create_workspace` with `isolation: "worktree"`, `mode: "branch-off"`, and `baseBranch` your current branch. Pass its `workspaceId` to the runner's `create_agent`.

   Principle: **Separate Before Serializing Shared State** (`principles/separate-before-serializing-shared-state.md`).
2. **Fan out.** Launch every runner with `create_agent` in one message. Each prompt carries the task, the shared grounding (pasted in, or as an absolute path), and an instruction to produce the artifact in its own worktree with a short rationale naming the alternatives it considered and what it rejected. Wait for every runner in the foreground, as **Subagents** in the router says. If a runner produces nothing, go on with N-1 and note the dropout.
3. **Cross-judge.** Once every runner is done, launch one codex seat as the judge. Tell it it is read-only. The lead is Claude, so codex is the other family. It gets the rubric and each candidate by worktree path, scores each criterion, and recommends a base with its rationale. It works while you do step 4. Launch it only after every runner has finished writing.
4. **Pick a base.** Read every candidate end to end before picking. Score each against the rubric criterion by criterion, not on holistic feel. Wait for the judge in the foreground and compare. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous, so read both rationales before you decide. Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary or the smaller API. Principle: **Laziness Protocol** (`principles/laziness-protocol.md`).
5. **Graft.** Walk each losing candidate once more for what is worth porting into the base, usually one or two things each, not most of it. Brief a Ross - Worker in the base candidate's worktree with each graft and its source path. It folds each one in by hand, so the result stays coherent under one mental model, rather than pasting mechanically. If the candidates converge on one shape, that is strong agreement: note it and ship the consensus shape with no graft. If they wildly diverge, step 1 was under-specified: reframe and re-run rather than averaging the divergence. Principle: **Redesign From First Principles**.
6. **Verify.** Verify the synthesized artifact like any other output. If verification finds a problem the arena missed, either step 1 was wrong (reframe and re-run) or a candidate caught it and the graft missed it (go back to step 5). Report the problem as found. Then have the step-5 Ross - Worker commit the grafted result in the base candidate's worktree and run `git -C <your worktree> merge --ff-only <base branch>`, so the caller's next steps run on the merged result. Then log the synthesis decision as one row per `practices/decision-log.md`. Principle: **Prove It Works** (`principles/prove-it-works.md`).

**Reply:** the synthesized artifact and the worktree it lives in, then the synthesis note: the base and why, the judge's verdict, each graft with its source candidate, what was rejected and why, any convergence or dropouts, and the verification result.
