### Investigation

Starts with scouts: yes.

Ported from pstack `playbooks/investigation.md`. Step 1 follows pstack's `how` skill: scouts explore, you write the answer. `unslop` → the router's **Writing the reply**. Not yet ported: the `why` skill.

**You own the answer.** Investigation requests are read-only. They produce a cited explanation or a recommendation, not a code change.

1. Launch `scout` agents to read the code (see **Subagents** in the router). This is mandatory, with no skip, however small the question looks. Your own reading is for checking a scout's claims, not for exploring. First judge the size, and when in doubt, pick simple:
   - **Simple** (one module, one function, a narrow question): launch one scout with the whole question.
   - **Complex** (a flow across several files, services, or layers): split the question into 2 to 4 angles, each a distinct slice, and launch one scout per angle, all in one message so they run in parallel. Give each its angle in the handover.

   For "why was it built this way", tell the scouts to read `git log` and blame for the files involved. Wait for every report before step 2.
2. Write the answer from the scouts' reports, in these sections: Overview, Key Concepts, How It Works, Where Things Live, Gotchas. If the question is a choice between options, write a recommendation with a tradeoffs table instead.
3. Cite a `file:line` or commit for every claim. Open the file:line behind the claims your answer leans on most and check them yourself. Carry each scout's Open Questions into your Gotchas instead of filling the gaps with guesses.

No code changes. If the answer shows a change is needed, stop and tell me which playbook it should go to next.

**Reply:** the investigation output. For "are we sure?" questions, give your real judgment with reasons, and push back if the premise is wrong.
