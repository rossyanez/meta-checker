# Architect runner prompt

Translated from pstack `skills/architect/references/runner-prompt.md` (MIT, https://github.com/cursor/plugins/tree/main/pstack). Changed: the runner works in its own Paseo worktree, the per-runner subdirectory fallback is dropped, and pstack's principle skills → ross-mode principle files where they are ported. Paths are relative to `~/.claude/skills/ross-mode/`. Passed to every runner in **Architect** step 2.

The lead passes this file through to every runner in Architect step 2 and fills in the variable inputs around it: the task, the step 1 grounding, and the runner's own Paseo worktree. Write every output inside that worktree. What matters is independence between candidates.

You are producing one candidate design in Architect's parallel exploration. Read `playbooks/architect.md` in full first. That's the workflow you're inside. Output a candidate design package: type sketch, function signatures, module map, and prose rationale shaped per `practices/architect-rationale-template.md`.

Apply the following discipline. The lead compares candidates on these axes to pick a base.

- Caller's usage first. Write the README-style usage and two or three real call sites before the types, then derive the type sketch from them. The usage is the spec. The two must agree, so reconcile the sketch to the usage, not the reverse.
- Data structures first. Get the core types right and the code becomes obvious. Trace each dominant access pattern through the proposed structure. If the answer is "we'll add a map / index / cache later," the structure is wrong.
- Interface depth. Compare the capability hidden behind the public surface relative to the size of that surface. Prefer a simple interface that pulls complexity into the callee, even when the implementation becomes less simple. Keep transport and wire types off the public API. Parse into domain types behind the interface.
- Shared state: if two actors might both write, ask "what happens?" If the answer isn't "nothing," default to per-actor state with a merge at the read boundary, per **Separate Before Serializing Shared State** (`principles/separate-before-serializing-shared-state.md`).
- Make boundaries visible. `not implemented` errors for bodies, `// TODO` pseudocode for tricky logic, doc comments stating intent and invariants. A reader should trace data from input to output by reading types and signatures alone.
- Encode invariants in types: hard-to-misuse types > runtime checks > prose comments, per **Encode Lessons in Structure** (`principles/encode-lessons-in-structure.md`).
- Validate at boundaries, trust types inside, per **Boundary Discipline** (`principles/boundary-discipline.md`). Business logic as pure functions. The shell stays thin.
- Single source of truth per invariant. Derive instead of sync.
- Idempotent state transitions where applicable, per **Make Operations Idempotent** (`principles/make-operations-idempotent.md`). Ask what happens if the operation runs twice or crashes halfway.
- Short call chains. If tracing the flow needs more than three files, flatten the hierarchy, per **Laziness Protocol** (`principles/laziness-protocol.md`) and **Minimize Reader Load**.

You are one of the parallel runners, each on a different model where the seats allow. Produce the best design your model can make. Don't hedge against the others. Differences between candidates are the signal used to pick a base and graft. Converging on a safe-looking middle defeats the exploration.
