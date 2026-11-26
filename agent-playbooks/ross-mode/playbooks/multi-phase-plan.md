### Multi-phase plan

Starts with scouts: yes.

Translated from pstack `playbooks/multi-phase-plan.md`. Changed: pstack's explorer agents → Ross - Scout agents. The plan lives at `$PASEO_HOME/plans/<repo>/<slug>.md`, and a `worker` writes and edits it, because the lead writes no files. The execution playbook is always **Orchestrate** (`playbooks/orchestrate.md`). Owners stop at merge-ready and I merge, so the skeleton's `Verdict and merge` and `Merge.` become `Verdict and handoff` and `Merge-ready.`, and a dependent PR starts after I merge its parent. `/loop 1h` → foreground waits and a Paseo heartbeat, per Orchestrate. Control skills → the repo's `verify-<app>` skill, else the Paseo browser tools. Each live lane runs in its own Paseo worktree at the PR head instead of a cloud VM. The blocking rule from `autopilot-full.md` and the patch-id rule from `shipping.md` are inlined. `show-me-your-work` → `practices/decision-log.md`. `scripts/check-plan.mjs` is ported with the same renames. Added: Orchestrate also sets the verdict as the commit status `ross-mode/verdict` with `scripts/verdict-status.sh`. Added: a skill variant of the skeleton for a program with no running app, which `check-plan.mjs` also checks. Not ported: `/no-comments`. Dropped: the autopilot-full and autopilot-stack choice, the `swarm workers` model slot, Origin, `gt`, the review bot, `/deslop`, squash-merge, stacks, `--auto`, retargeting, and cloud VMs.

Runs when I say "plan this", "write a plan", "break this into PRs", or hand you work that spans several PRs or phases.

**You own the plan, not the code. The plan is a checklist an owner runs box by box and I audit from the evidence.** The plan is the deliverable. Don't implement.

0. When the brief doesn't say what is being built and what done looks like, stop and ask me once. What is being built is an app change, or a skill, playbooks, docs, or scripts. Give two or three concrete options. In an Autonomous run, or when my prompt says "don't stop", pick the likeliest option and log it instead of asking.
1. When the change is one or two files with an obvious approach, skip the plan. Say so and stop.
2. Settle open questions by prototype before the plan is written. Run the **Prototype** playbook (`playbooks/prototype.md`) for each. Keep the branch, the SHA, and the screenshots for Appendix A. For a scratch-folder prototype, keep the folder path, and have a `worker` copy its evidence into `$PASEO_HOME/plans/<repo>/media/`, because a reboot wipes `/tmp`. Ask me only about a product or preference call that no run can settle, and give options. Principle: **Never Block on the Human** (`principles/never-block-on-the-human.md`).
3. Explore with `scout` agents (see **Subagents** in the router), one per question, in parallel. Each returns file pointers, conventions, test commands, and entry points. No inlined dumps. Principle: **Guard the Context Window** (`principles/guard-the-context-window.md`).
4. Find the program's GitHub issue, or create it with `~/.claude/skills/ross-mode/scripts/gh-post.sh issue`, as Opening a PR step 1 does. Hand the plan and that issue's number, for **How to read this**, to a `worker` agent (see **Subagents** in the router). Choose the **Skill variant** below when the program ships a skill, playbooks, docs, or scripts with no running app. Otherwise use the app skeleton. Before the worker writes the plan, it runs `git init` in `$PASEO_HOME/plans/<repo>/` when that folder isn't a repo yet. It copies the skeleton below into `$PASEO_HOME/plans/<repo>/<slug>.md` and fills every placeholder from what steps 2 and 3 found. `<repo>` is the main checkout's folder name, as in `practices/decision-log.md`, and `<slug>` is the program's name in lowercase and dashes. Keep every heading and every sub-block in the order shown. After it writes the plan, it commits the plan file and its `media/` folder. One section per PR. One PR is one change with its own evidence. **How to read this** names `playbooks/orchestrate.md` as the execution playbook. Principle: **Sequence Verifiable Units** (`principles/sequence-verifiable-units.md`).
5. The worker writes under `practices/technical-writing.md` in full, then `practices/unslop.md`. The body is one Diátaxis mode, how-to. Appendices hold explanation and reference. Each heading states the task or the finding. No long dashes. No mid-sentence colons.
6. Run `node ~/.claude/skills/ross-mode/scripts/check-plan.mjs <plan path>`. Have the worker fix every line it prints, then run it again until it prints `0 problems`. Principle: **Encode Lessons in Structure** (`principles/encode-lessons-in-structure.md`).
7. Hand back. Post the plan path and the script's output, then stop. I start the **Orchestrate** playbook with the plan path. When my prompt carries an override such as "don't stop", go straight into Orchestrate (`playbooks/orchestrate.md`) with the plan path instead, and add its steps to your todo list, copied in verbatim.

**Verification.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Principle: **Prove It Works** (`principles/prove-it-works.md`). That sentence is the verification rule. Every verification block opens with it. The live block is mandatory. Ten lanes at the PR head drive the real surface through its control skill, per the **Swarm** playbook (`playbooks/swarm.md`). Each lane is one box with a concrete scenario, the screenshot it saves, and its pass predicate. One lane is the **Regression lane against trunk.** It runs the same load-bearing scenario on trunk and head. If trunk doesn't have the feature, the lane records that fact and gates the behavior the diff adds plus the end state the user waits for, instead of inventing a trunk result. The perf gate is dual-sided. Trunk and head must both produce the named metric. If trunk lacks the feature, also isolate the work the diff adds and set an absolute budget for that work plus the end-to-end state the user waits for. Don't claim a ratio between unlike scenarios. The perf block names the metric, the interleaved probe, the trunk baseline measured first, and the rule with the number that fails. A PR that changes an interaction is review-gated. I review it in chat with screenshots, plus a 30 to 60 second video when the repo's verify skill can record one, before I merge. Without a recording, the gate says "no video" and why. A PR that changes no interaction writes `**Review gate.** None. <PR id> is not review-gated.` and no boxes under it. A program with no running app uses the **Skill variant** below instead, with one to ten lanes, a perf block that may say it doesn't apply, and output files in place of screenshots. Each lane tests what this PR's head ships, not the finished program. A behavior a later PR adds gets its lane in that PR.

**Control skill.** Pick it by surface. The repo's `verify-<app>` skill comes first (see **Verification skill**, `playbooks/verification-skill.md`). Without one, a browser surface uses the Paseo browser tools. A PR that touches two surfaces gets lanes on both. A surface with neither is a risk in Appendix C, and its live block still names how each lane drives it.

````markdown
# <Program> plan

<Under ten lines. What changes, for whom, the rule the program enforces, and the PR ids in order.>

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `~/.claude/skills/ross-mode/playbooks/orchestrate.md`. The operator is Ross. The program's issue is #<program issue>. Every owner stops at merge-ready, and the operator merges every PR.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop, unless the operator's prompt carries an override such as "don't stop". Otherwise start only when the operator starts Orchestrate with this plan's path.
- [ ] Read these at program start. Re-read them each time an agent finishes and each time a heartbeat fires.
  - [ ] `~/.claude/skills/ross-mode/playbooks/orchestrate.md`
  - [ ] `~/.claude/skills/ross-mode/playbooks/swarm.md`
  - [ ] `<control skill path>`
  - [ ] `~/.claude/skills/ross-mode/playbooks/opening-a-pr.md`
  - [ ] `~/.claude/skills/ross-mode/playbooks/babysit.md`
  - [ ] `~/.claude/skills/ross-mode/playbooks/<each other playbook the program uses>.md`
- [ ] Wait for agents in the foreground. Owners wait for their own CI. Arm a Paseo heartbeat only while the program waits on the operator's merge of a parent, with the heartbeat prompt below, and delete it when that wait ends. Never leave the cadence to memory.
- [ ] Use this heartbeat prompt, verbatim. "Re-read the execution playbook. Audit the program against it and fix drift now. Check every running agent and judge progress by side effects only. Stop a stuck agent and launch its replacement now. Then post a short status message to the operator only when the audit found a tracked change that no earlier status message reported, such as a PR opened, a merge-ready head, a verdict, a merge by the operator, a stuck agent and the action taken, a blocker added or cleared, or a decision only the operator can make. Name every such change and nothing else. Don't repeat a table, the merged list, or an unchanged blocker. If the audit found none, end the turn with no reply text. Either way, log a row in the decision log that names the items reported, or none."
- [ ] On the operator's hold or stop, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR section, per Orchestrate. Each owner runs Feature or Bug fix through Opening a PR and Babysit `drive`, and stops at merge-ready.
- [ ] Follow this dependency graph. Start a dependent PR only after the operator merges its parent. Nothing stacks.
  - [ ] <PR id> and <PR id> are independent and first. Both branch from `<base branch>`.
  - [ ] <PR id> after the operator merges <PR id>.
- [ ] Hold the file boundaries. <PR id or class> touches only `<glob>`.
- [ ] Hold the review gate. <PR ids> change an interaction. They wait for the operator's review in chat with screenshots or output files, and a video or the reason there is no video.

### PR mechanics, for every PR

- [ ] Use `gh` for every PR operation.
- [ ] Open the PR ready, never draft, per **Opening a PR**, with `~/.claude/skills/ross-mode/scripts/gh-post.sh pr <owner>/<repo> - --base <base branch> --title <title>`.
- [ ] Run the repo's lint and typecheck once before the PR-facing push. Push with hooks on.
- [ ] Get the diff reviewed by the Ross - Reviewer pass in **Opening a PR** before the merge-ready report.
- [ ] Triage every review comment, from people or bots, per **Babysit** step 5.
- [ ] Branch from the base's current remote ref. A rebase needs a force-push, so per **Babysit** the owner reports it, and the operator decides.

### Verdict and handoff, for every PR

- [ ] A full verdict runs once, at the merge-ready head, from agents that wrote none of the PR's code. It starts with `~/.claude/skills/ross-mode/scripts/verdict-status.sh <pr> <head-sha> pending`, run from the PR repo's checkout. It runs the live lanes from the PR's **Verify, live** block, the perf probe from its **Verify, perf** block, and the **Interrogate** playbook on the diff. Another full verdict runs only for new behavior, a redesign, or a large new diff. A rebase, a merge-conflict fix, or a minor fix gets one lane at the new head, and a wording-only change gets none. A one-lane re-verdict also sets `pending`, then its result.
- [ ] Judge every finding by the blocking rule. Block a PR only for a problem you can show, with a failing run at the head or a doc line the PR made wrong. A problem the PR's base already has doesn't block unless the PR copies it or newly reaches it. Only a bug a user would hit, a failed gate, or a wrong shipped doc blocks, and everything else goes in a follow-up. A failure on trunk behavior in a lane marked `Regression lane against trunk.` is recorded against trunk and doesn't block the PR. The verdict is clean when nothing blocks.
- [ ] Post `PASS`, `PASS+NOTES`, or `FAIL` with the head SHA on the PR with `~/.claude/skills/ross-mode/scripts/gh-post.sh comment <owner>/<repo> <pr> -`, which prints the comment's URL, then set it at the same SHA with `~/.claude/skills/ross-mode/scripts/verdict-status.sh <pr> <head-sha> <verdict> <comment-url>`. Green CI and a review alone are not verdicts. A new head needs a fresh verdict, and an older verdict holds only if `git patch-id` at its SHA matches the current head. A new head has no `ross-mode/verdict` status until its verdict sets one. When the patch-id matches, or the new head changes only wording, set the last verdict at the new head with the old comment's URL. Hand a clean PR to the operator at merge-ready. The operator merges it.

### Boot recipe, for every live lane

Each live lane is a Ross - Worker agent that changes no file and commits nothing. Each runs in its own Paseo worktree at the PR head, on its own port. Launch the lanes in waves. Drive through `<control skill>`.

- [ ] Create the worktree with `create_workspace`, `mode: "checkout-pr"` and `prNumber: <n>`, then check that `git rev-parse HEAD` prints `<head SHA>`.
- [ ] <Start the backend and the surface on this lane's port. Wait for ready.>
- [ ] <Deliver input only through the control skill. Name the read-only diagnostics.>
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## <Task as a verb phrase> (<PR id>)

**Depends on.** <PR id, or None.>

**Files.**

- [ ] Edit `<path>`.
- [ ] Create `<path>`.
- [ ] Delete `<path>`.

**Build.**

- [ ] <One change. Name the symbol and the file.>

**You see.**

- [ ] <One observable result, with the exact log line or screen state.>

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] <Test file and the case it gains.> Run `<command>`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run <the same load-bearing scenario> at trunk and head. If trunk lacks the feature, record that and gate <the behavior the diff adds plus the end state the user waits for>. Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 2. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 3. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 4. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 5. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 6. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 7. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 8. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 9. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 10. <Scenario.> Save `<slug>.png`. Pass when <predicate>.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. <What is measured at both trunk and head. If trunk lacks the feature, also name the diff-added work and the end-to-end state the user waits for.>
- [ ] Probe. <The command or procedure, run at trunk and at the head, interleaved. Both sides must produce the metric.>
- [ ] Baseline. Record the trunk <value> first.
- [ ] Rule. <Head against trunk, with the number that fails. If the scenarios differ, add absolute budgets for the diff-added work and the user-visible end state instead of an invalid ratio.>

**Review gate.** The operator reviews before merge.

- [ ] Copy lane <n> screenshots into `<media path>/<pr-id>-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of the change in a lane's worktree with the repo's verify skill. Save it as `<media path>/<pr-id>-review.mp4`. If the verify skill can't record one, write "no video" and why.
- [ ] Post the screenshots and the video, or the no-video reason, in chat. Stop at merge-ready. Wait for the operator.

**Merge-ready.**

- [ ] The coordinator's clean verdict at the exact head SHA.
- [ ] Every review comment triaged per **Babysit**.
- [ ] CI green at that head, per **Babysit** `drive`.
- [ ] The operator merges it.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Reply to the operator with the report Orchestrate names.

## Appendix A. Prototype evidence

<Each open question a prototype answered, with the branch and the SHA, or the scratch folder path and its evidence copied into the plan's media folder, and the artifact links. Each question that stays unproven.>

## Appendix B. Alternatives rejected

<Each approach weighed and why it lost.>

## Appendix C. Risks

<Each risk with the PR it lands in and what the owner watches. A surface with no verify skill and no browser tools goes here.>

## Appendix D. Links and reading list

<Docs to read before editing. The decision log, per `~/.claude/skills/ross-mode/practices/decision-log.md`.>
````

**Skill variant.** Choose it when the program ships a skill, playbooks, docs, or scripts with no running app. It keeps every heading, every sub-block, and the Orchestrate contract. It changes only the blocks below. Put the `Variant. skill.` line in **How to read this**, after the verification rule. Replace the **Boot recipe** body and each PR's **Verify, live**, **Verify, perf**, and **Review gate** blocks with the text below.

- Size the lanes to what proves this PR, from one to ten, and write the count as a word, such as `Two lanes at the PR head`. `check-plan.mjs` checks that the word matches the lanes.
- A lane may run a script or read a file directly instead of driving the skill.
- Add a `Regression lane against trunk.` lane only when trunk has the skill. Otherwise drop lane 3 below and recount.
- Write perf as `Not applicable.` and one line on why, with no boxes. When a wait matters, write the four boxes from the app skeleton instead.
- The review gate copies output files instead of screenshots and says "no video" plainly. A PR that changes no interaction writes `None.` as in the app skeleton.

````markdown skill
Variant. skill.

### Boot recipe, for every live lane

Each live lane is a Ross - Worker agent that changes no repo file and commits nothing. Each runs in its own Paseo worktree at the PR head. A lane needs no port and no backend. Launch the lanes in waves. Drive through `<skill path>` at the PR head, run by headless `claude -p` or `codex exec`.

- [ ] Create the worktree with `create_workspace`, `mode: "checkout-pr"` and `prNumber: <n>`, then check that `git rev-parse HEAD` prints `<head SHA>`.
- [ ] Make a scratch folder `/tmp/swarm-<pr-id>/worker-<n>/`. <Link the worktree's copy of the skill into it, so the PR head's copy loads as a project skill.> A skill with the same name under `~/.claude/skills/` loads instead of the project copy, so the link alone doesn't load the PR head's copy of an installed skill.
- [ ] Deliver input only as a person would type it. From the scratch folder, run `claude -p "<prompt>" --permission-mode auto --output-format json > result.json`, or the same prompt through `codex exec`. When the skill isn't installed under `~/.claude/skills/`, the prompt is the slash command and the lane's request. When it is installed there, the prompt opens with an explicit-load line that names the worktree's copy, `Load <skill name> first. Read <worktree path>/skills/<skill name>/SKILL.md in full and follow it as the skill for the request below. Read or run every file it names under ~/.claude/skills/<skill name>/ from <worktree path>/skills/<skill name>/ instead.`, then the lane's request. An explicit load registers none of the skill's hooks, so a PR that changes a hook gets a lane that runs the hook script directly. If the run stopped on a denied or pending permission, the lane is `BLOCKED`, not `FAIL`.
- [ ] Prove the skill loaded from the PR head before you judge anything. <Name the transcript line that shows the worktree's copy loaded, the base directory for a slash command or the read of the worktree's SKILL.md for an explicit load.> If it doesn't, the lane is `BLOCKED`, not `FAIL`.
- [ ] Use only read-only diagnostics. <Name them, such as `result.json` and the output files.>
- [ ] Save every output file, TXT, CSV, or JSON, to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.<ext>` and return the paths with the report.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Three lanes at the PR head, per the boot recipe.

- [ ] Lane 1. <Scenario, typed as a person would type it to the skill.> Save `<slug>.txt`. Pass when <predicate>.
- [ ] Lane 2. Run `<script>` <with the scenario's arguments>. Save `<slug>.txt`. Pass when <predicate>.
- [ ] Lane 3. Regression lane against trunk. Run <the same load-bearing scenario> at trunk and head. Save `<slug>.txt`. Pass when <predicate>.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Not applicable. <One line on why no number would gate this PR.>

**Review gate.** The operator reviews before merge.

- [ ] Copy lane <n> output files into `<media path>/<pr-id>-review-<slug>.txt`.
- [ ] Write "no video". <Why no recording fits, such as no verify skill records a headless run.>
- [ ] Post the output files and the no-video reason in chat. Stop at merge-ready. Wait for the operator.
````

**Reply:** the plan path, the PR ids with their dependencies and the review-gated set, what the prototypes proved and what stays unproven, and the check script's output.
