### Blast radius

Starts with scouts: yes.

Translated from pstack `skills/blast-radius`. Changed: the reading goes to Ross - Scout agents and the proof script to a `worker`. `how` is Ross - Scout's job. `unslop` → the router's **Writing the reply**. Not ported: the `why` skill. Step 5 borrows `arena`'s idea, a second model family, without running the Arena playbook.

Runs when I ask "what could this break" or "blast radius of X", or hand you a small diff I don't trust yet. Its result can feed Opening a PR's `## Blast Radius` section. Read-only for the repo: the proof script lives in `/tmp/` unless I ask to keep it as a test.

**Find what a change breaks somewhere else, before it ships. Listing callers isn't the job. The job is the breakage grep won't show.**

**Don't trust your own writeup.** A blast-radius writeup that sounds right is worthless. It reads as convincing whether or not it's true. So don't hand back the writeup. Find the one or two facts the whole thing depends on and prove them by running code.

**How sure are you?** For each fact the change's safety depends on, get it as far down this list as is cheap, and say where it stopped.

- **Level 1.** You said so. Worthless on its own.
- **Level 2.** You pointed at the line. A real `file:line`, or the library's own source.
- **Level 3.** You showed the bad case can't happen. You walked the failure step by step and it doesn't reach.
- **Level 4.** You ran it. A script or test that calls the real code and fails loud if you're wrong.
- **Level 5.** You reproduced it in the running app.

Level 4 is usually one small script that imports the same library the app ships and calls the exact function you're worried about.

1. **Send scouts.** Launch `scout` agents (see **Subagents** in the router).
   - One reads the change: the diff, the symbols it adds, changes, and deletes, and what it now does differently, including what the diff doesn't spell out. It reads the history with `git log` and `gh pr view`.
   - One per area where grep stops. Library source at its pinned version, and any local patch. When things run: microtasks, teardown, framework lifecycle. What a symbol search misses: the JSON an API returns, a DB column, a wire format, another language reading the same bytes, a feature flag, code three hops downstream.

   Wait for every report. Your own reading checks their claims.
2. **Find the one fact it's safe because of.** Most changes that look risky are safe because of a single fact, like "this call only drops already-dead cache entries and does nothing else". If it holds, most risky cases clear at once. Spend your time here, not on a long list of maybes.
3. **Be honest about each risk.** Give it a real chance of happening and a real cost if it does. Keep the risks you confirmed. List the ones you checked and cleared separately. Cite a real `file:line`. A search that finds nothing is still an answer. Never invent a caller or an API.
4. **Prove the one fact.** Hand a `worker` the fact and a level-4 check: a script or test that runs the real code and fails loud if the fact is false. It goes in `/tmp/` unless I asked for a kept test. Read its real output and paste it. Principle: **Prove It Works** (`principles/prove-it-works.md`).
5. **For a big or wide change, ask a second model family.** Give a Codex agent (as in **Interrogate** step 3, `playbooks/interrogate.md`, with the Ross - Scout brief) the same question, and merge the answers. Different families catch different real bugs. pstack calls this `arena`.

**Reply:** What it does, including the part that isn't obvious. The one fact it's safe because of, the level it reached and its proof, or `unproven`. Risks: how it breaks, `file:line`, how likely and how bad, how to check. Cleared: what you checked and why it's fine. Before you merge: the cheapest test or repro that catches the real bug, with the script. Strip anything private before it goes anywhere public.
