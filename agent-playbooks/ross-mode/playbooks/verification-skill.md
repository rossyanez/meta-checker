### Verification skill

Starts with scouts: yes.

Translated from pstack `skills/create-verification-skill/SKILL.md`. Changed: the skill goes to `.claude/skills/verify-<app>/`; scouts interview the repo and a worker writes the skill; a live mode is read-only unless I say otherwise. `maintain-verification-skill` is ported as **Verification upkeep** (`playbooks/verification-upkeep.md`).

**You own the proof that agents can drive this app.** Every serious project needs a scripted way to drive the real app and prove behavior: launch it, exercise a feature the way a user would, and capture evidence. The skill you produce is read cold, mid-task, by an agent that has never seen the app, so write it for that agent, not for me.

1. Interview the repo, not me. Launch `scout` agents (see **Subagents** in the router), one per question, in parallel. This is mandatory, with no skip.
   - **Surface:** what a user actually touches (web UI, CLI, API, mobile). Pick the primary one and note the rest.
   - **Run:** the repo's own dev command (`paseo.json`, package scripts, README), with ports, env vars, seed data, and auth.
   - **Drive:** existing harnesses first (Playwright or Cypress specs, curl-able endpoints, PTY helpers), then a generic recipe: the Paseo browser tools for web, tmux for CLI, plain HTTP for services.
   - **Observe and isolate:** what evidence can be captured (screenshots, ARIA snapshots, response bodies, logs, exit codes), and whether two instances can run side by side.

   Ask me only what the code can't answer.
2. Decide what the app talks to: faked API answers, a live backend, or both, as my prompt says. A live mode is read-only unless I say otherwise: it never clicks a button that changes data. Credentials come from environment variables the skill names. They never appear in the skill, the evidence, or a log row. If the checkout doesn't build or start as is, fix that first through the **Bug fix** playbook, or report it precisely.
3. Delegate writing the skill to a Paseo `worker` agent (see **Subagents** in the router). This is mandatory, with no skip. It writes `.claude/skills/verify-<app>/SKILL.md` with frontmatter (`name: verify-<app>`, and a `description` that names the app, the surface, and when to reach for it) and these sections, each grounded in what step 1 found, with no placeholders:
   - **Launch:** the exact command, how to tell it's ready (a log line or a port answering), and teardown.
   - **Doctor:** one read-only check that answers "is this instance worth driving?": process up, right build, port owned by this run, auth valid.
   - **Drive:** the harness recipe with real selectors from this repo. Prefer ARIA roles and labels, data attributes, and route paths over coordinates.
   - **Evidence:** what to capture and where it goes. Proof exercises the real user path, captures the action and the resulting state, and checks a second read-only view of any change. A status message alone isn't proof.
   - **Cleanup:** kill only what this run started, never by process name. Keep the evidence.
   - **Helpers:** every script it ships is executable and its invocation is in the skill body.
4. Have the same worker seed the feature map: `features/README.md` (baseline preconditions, driving conventions, proof rules) and one file per user-facing feature, the top 3 to 5 to start. Each feature file has an H1, one paragraph, then exactly these H2s: `Sub-features`, `How to get to it (user POV)`, `Driving it with <harness>`, `Gotchas`.
5. Prove the skill before handing it over. Run its own instructions end to end once: launch, doctor, drive one mapped feature, capture evidence, clean up. Then check the evidence still exists where the skill says. Have the worker fix what fails, and run the skill's cleanup after every failed attempt. A skill that was never executed is a draft, not a deliverable. Principle: **Prove It Works** (`principles/prove-it-works.md`).
6. Get the diff reviewed by a fresh Paseo `reviewer` agent. Have a `worker` fix what it finds, or say why you didn't.
7. Run the **Opening a PR** playbook (`playbooks/opening-a-pr.md`) in the app's repo. Add its steps to your todo list, copied in verbatim.

**Reply:** the skill's path, the features mapped, the proof run's output and evidence paths, and anything unreachable with its missing prerequisite.
