### Architect

Starts with scouts: yes.

Translated from pstack `skills/architect`. Changed: `how` → Ross - Scout agents, as in Feature step 1. Phase B runs the **Arena** playbook, and the `architect runners` line → Arena's default seats. A fresh Ross - Reviewer reviews the sketch, or the **Interrogate** playbook (`playbooks/interrogate.md`) on request. A Ross - Worker writes every file, because the lead never writes files. The rationale goes in the PR body's `## Tradeoffs`. Not ported: `why`. Scouts read the git history instead.

Runs on its own for a design that crosses a function or module boundary. Feature step 2, Refactoring step 3 and Bug fix step 3 run steps 1–3 only and write the code themselves.

**Sketch the shape before the code. The sketch is the contract.**

1. **Ground.** Launch Ross - Scout agents to read every system the new code touches (see **Subagents** in the router): one scout for a narrow area, 2 to 4 in parallel for an area that spans several files, services, or layers. When the calling playbook's scouts (Feature step 1 or Refactoring step 1) already covered these systems, their reports are the grounding. Naming a file isn't grounding: each report explains how the touched systems work. If the design redefines ownership or layering, have a scout also read the git history of the existing shape (`git log`, `git blame`, and the PRs behind it), so the rationale becomes a constraint, not a guess. Wait for every report before step 2. Greenfield work still gets one scout, to read the conventions the new code must follow: where it lives, how it's tested, and how CI runs it.
2. **Sketch.** Run the **Arena** playbook (`playbooks/arena.md`) with the design-sketch task and step 1's reports as the shared grounding. Add its steps to your todo list, copied in verbatim. Each runner's prompt is `practices/architect-runner-prompt.md`, with the task, the grounding, and its worktree filled in around it.
   - Design it twice. Require at least two structurally distinct candidates before synthesis, even when the first looks sufficient. Whole-shape alternatives, not point fixes inside one shape.
   - Screen every candidate against `practices/architect-design-red-flags.md` before synthesis. Assume the next contributor is an agent that sees only the files it opened, copies the nearest example, and takes the shortest path that compiles. Prefer the design where a change that looks right from one file is right for the whole repo.
   - Compare viable candidates on interface depth. Prefer the design that hides more complexity behind a smaller, simpler public surface. A rich interface can keep call chains short by concentrating capability instead of scattering it across layers.
   - Arena returns one synthesized design package. Its synthesis note fills the rationale's "Synthesis decision" section.

   Principle: **Exhaust the Design Space**.
3. **Agree (opt-in).** By default, go straight to step 4 with the synthesized design, with no human pause. Opt in to a checkpoint only when my prompt asks for one, such as "architect with checkpoint" or "show me before implementing". Then show me the synthesized design and wait for my sign-off. The synthesis can ship as its own commit, made by a worker, either way, as the "scaffold first" mode. Planned and scoped breakage during fill-in is fine. For adversarial pressure on the design before step 4, have a fresh Ross - Reviewer review the sketch, or run the **Interrogate** playbook (`playbooks/interrogate.md`). If I push back on the shape, at a checkpoint or after the fact, treat it as step 1 evidence: re-ground and re-run step 2 before more code is written. Principle: **Never Block on the Human** (`principles/never-block-on-the-human.md`). Principle: **Foundational Thinking**. Principle: **Outcome-Oriented Execution** (`principles/outcome-oriented-execution.md`).
4. **Implement against the sketch.** Brief a Ross - Worker to replace `not implemented` bodies with code and pseudocode with logic. The synthesized sketch is the contract. The worker reports every deviation from it instead of absorbing it silently. For each deviation, decide whether the sketch was wrong, the requirement was missed, or the implementation is overreaching. If a function needs a parameter the sketch didn't anticipate, ask the same question.
5. **Scrap when the architecture is wrong.** If implementation keeps producing friction the sketch can't absorb, throw the sketch out rather than bolting fixes onto a wrong design. The signal is a pattern, not single instances. Tells:
   - The same shape of workaround appearing repeatedly across unrelated code.
   - Multiple unrelated edge cases that all need special-case branches.
   - Types that need escape hatches (`any`, casts, optional fields always set in practice) to compile.
   - The "we need a lock" reflex when the sketch said the state wasn't shared.
   - Callers having to know the abstraction's internal rules to use it.
   - Two or more independent step 4 deviations of the same shape across the implementation.

   Use judgment. A few edge cases don't condemn an architecture. Some problems are legitimately complex. Complexity in the data is not complexity in the design. When you scrap:
   1. Launch Ross - Scout agents over what's been built, as in step 1.
   2. Redesign as if the new constraints had been day-one assumptions.
   3. Subtract before adding. The new sketch is smaller than the old one before it grows.
   4. Return to step 2 and re-run Arena.

   Principle: **Redesign From First Principles**. Principle: **Fix Root Causes** (`principles/fix-root-causes.md`). Principle: **Subtract Before You Add**.

**Outputs.** The caller's usage is written first and the type sketch derived from it. One file with new types and signatures for small changes. A module map plus type definitions for larger work. The rationale ships alongside, shaped per `practices/architect-rationale-template.md`, including the usage sketch and the synthesis decision. It goes in the PR body's `## Tradeoffs` section.

**Reply:** the usage sketch, the chosen shape and why, a table of the candidates, the synthesis note, whether a checkpoint or a scrap happened, and open decisions.
