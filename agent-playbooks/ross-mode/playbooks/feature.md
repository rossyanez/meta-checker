### Feature

Starts with scouts: yes.

Ported from pstack `playbooks/feature.md`. Changed: `how` → the scouts in step 1. `architect` → Architect steps 1–3 in step 2. `interrogate` → one fresh Ross - Reviewer in step 7, with the **Interrogate** playbook (`playbooks/interrogate.md`) on request.

**You own the design. Plan, review, verify.** Delegate implementation. Stay in the lead.

1. Launch `scout` agents to read the code and docs the feature touches (see **Subagents** in the router). This is mandatory, with no skip, however small the feature looks. Your own reading is for checking a scout's claims, not for exploring. One scout for a narrow area. For an area that spans several files, services, or layers, 2 to 4 scouts in parallel, one angle each. Wait for every report before step 2.
2. Name the data shape first, then sketch two or three designs in a short table with their tradeoffs. Pick one and say why. When the design crosses a function boundary, run steps 1–3 of the **Architect** playbook (`playbooks/architect.md`) instead, and add those steps to your todo list, copied in verbatim. Architect's step 3 hands back here, not to its step 4. Skip its scaffold commit, and hand the synthesized sketch to the step 4 worker as its contract. The worker reports every deviation from the sketch, as in Architect step 4. When the same kind of deviation keeps coming back, run Architect step 5. Principle: **Laziness Protocol** (`principles/laziness-protocol.md`). Principle: **Model the Domain** (`principles/model-the-domain.md`).
3. Write the throughput checkpoint as four todo items. A dimension that doesn't apply keeps its item as `n/a: <reason>` rather than being dropped:
   - **Blocking first steps.** Gates that run before any fan-out.
   - **Independent workstreams.** Disjoint files or layers can run in parallel. Shared writes go one at a time.
   - **Shared mutable state.** Split the target so agents don't share it. Serialize only for a real invariant.
   - **Smallest safe decomposition.** If one worker is best, say why.

   Principle: **Separate Before Serializing Shared State** (`principles/separate-before-serializing-shared-state.md`).
4. Delegate the code to a Paseo `worker` agent with a specific scope: file paths, the data shape from step 2, success criteria, and the test seams to cover (or `none` with the reason). When the implementation admits several valid shapes (error handling, abstraction layer, test structure), delegate through the **Arena** playbook (`playbooks/arena.md`) instead. This is mandatory, with no skip: the point is that the writer and the reviewer are different agents.
5. Verify on the real surface: run it, trigger it, read the actual output. "Inconclusive" or a different surface is not a pass, so flag it. Principle: **Prove It Works** (`principles/prove-it-works.md`).
6. Build in small units, and verify each before starting the next. Principle: **Sequence Verifiable Units** (`principles/sequence-verifiable-units.md`).
7. Get the diff reviewed by a fresh Paseo `reviewer` agent. Have a `worker` fix what it finds, or say why you didn't.
8. Run the **Opening a PR** playbook (`playbooks/opening-a-pr.md`). Add its steps to your todo list, copied in verbatim.

**Reply:** what you built, what you chose and why, the throughput checkpoint, and open decisions. Use a table for the design alternatives.
