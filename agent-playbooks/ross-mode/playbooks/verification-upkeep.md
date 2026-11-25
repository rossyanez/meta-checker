### Verification upkeep

Starts with scouts: yes.

Translated from pstack `skills/maintain-verification-skill/SKILL.md`. Changed: scouts are the source readers, a worker makes every edit, and the live pass uses the skill's faked mode unless I name its live mode. Runs on request or from a Paseo schedule.

**You own the honesty of the feature map.** A feature map rots the moment the app changes. The unit of rigor is the feature, not every sentence: cover every feature file from source and exercise every feature live.

End in exactly one outcome, and say which:

- **clean.** Every feature got source and live coverage, and nothing needs shipping. No branch, no PR.
- **changed.** One PR ships proven corrections to the skill.
- **blocked.** Coverage couldn't finish, or a proven fix couldn't ship safely. Say exactly what blocked it.

Edit only the verification skill's own folder: its `SKILL.md`, `features/`, and the scripts it owns. Never edit app code. When the app no longer does what the map says, that's either wrong docs (fix the map) or an app bug (report it, and don't paper over it in the docs).

1. Find the target: `.claude/skills/verify-*/` in this repo. If there are several and my prompt names none, maintain each in turn. If there are none, stop and point me at the **Verification skill** playbook (`playbooks/verification-skill.md`). If I'm away or a schedule started the run, keep a decision log (`practices/decision-log.md`) and wait for every agent in the foreground, as **Subagents** in the router says.
2. Check the index. Read `features/README.md` and list its sibling files. Have a `worker` fix missing, extra, duplicate, or dead entries.
3. Launch one `scout` per feature file, all in parallel (see **Subagents** in the router). This is mandatory, with no skip. Each explains from source how the feature works, flags likely drift with `file:line` citations, and returns one live recipe. Scouts never drive the app.
4. Reconcile. Every feature file has a scout report. Merge overlapping recipes into as few app states as you can. Spot-check the drift scouts cite yourself. Check `git log` since the skill's last change for user-facing features the map is missing, and name a concrete source path before calling one missing.
5. Drive every feature at least once with the skill's own Launch, Doctor, and Drive sections. This is required even when the source looks clean. Hold three rules the whole pass: run Doctor before the first drive and after any failed drive; the evidence captured so far survives every cleanup, checked where the skill says it lives; and nothing a drive started outlives it. A feature you can't reach is `unreachable` only with its missing prerequisite and the route you tried. Principle: **Prove It Works** (`principles/prove-it-works.md`).
6. Sort each finding:
   - **Wrong docs:** the map's description is wrong or missing. A `worker` fixes it.
   - **Harness gap:** the app works, but the skill can't drive it. A `worker` fixes the skill, and you drive the fix live again before it ships.
   - **App bug:** the app is actually broken. List it for me with its evidence. It stays out of this PR.
7. For **changed**, get the diff reviewed by a fresh Paseo `reviewer` agent, then run the **Opening a PR** playbook (`playbooks/opening-a-pr.md`), one PR for the whole pass. Add its steps to your todo list, copied in verbatim. For **clean** or **blocked**, mark this `skip: <outcome>`.

**Reply:** the outcome, each feature with its coverage (source, live, or `unreachable` and why), the drift fixed, the app bugs found, and the PR link if there is one.
