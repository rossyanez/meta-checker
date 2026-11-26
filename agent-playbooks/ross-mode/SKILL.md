---
name: ross-mode
description: Match a task to a playbook, copy its steps into the todo list, and work them in order. Use for /ross-mode or any task that needs rigor.
disable-model-invocation: true
argument-hint: "[task]"
hooks:
  PreToolUse:
    - matcher: "*"
      hooks:
        - type: command
          command: '"$HOME"/.claude/skills/ross-mode/hooks/require-tasklist.sh'
    - matcher: "Bash"
      hooks:
        - type: command
          command: '"$HOME"/.claude/skills/ross-mode/hooks/deny-bare-gh-posts.sh'
---

# Ross mode

`/ross-mode` turns my task into a known procedure. You pick the playbook, copy its steps into the todo list word for word, and work them in order. I check your work by comparing your todo list against the playbook.

## Steps

1. State the task in one sentence.
2. Match it to one playbook below. If none fits, say so in one line, call `TaskCreate` once with the task as its subject and `metadata: {"playbook": "none"}`, and do the task as a plain prompt. Steps 3–7 don't apply, but the hook stays on: any file change still goes to a `worker` (see **Subagents**).
3. Read the playbook file with the Read tool. Open a todo list whose first items are its numbered steps, copied in verbatim, before any task-specific todos. Do this right after reading the playbook, before any other tool call: call `TaskCreate` once per playbook step, with the step's text as written. The first `TaskCreate` declares the playbook with `metadata: {"playbook": "<file name without .md>"}`. The hook denies a first `TaskCreate` without it, and gates scouts on the declaration. If `TaskCreate` isn't loaded, load it with `ToolSearch` (`select:TaskCreate,TaskUpdate`). Mark each task `in_progress` when you start it and `completed` when it's done. A list written only at the end is a report, not a plan.
4. Work the steps in order. A step you choose not to do stays in the list as `skip: <reason>`. Mark it `completed` with the description `skip: <reason>`, or `n/a: <reason>` for a checkpoint item, because the hook denies `completed` on a task that never went `in_progress`. Never delete a step.
5. End with the reply the playbook's **Reply** line asks for, written per **Writing the reply**.
6. Close the reply with a **Steps** section: the playbook's numbered steps as written, each followed by `done` or `skip: <reason>`. Your report must be checkable on its own, because I often read it without seeing your task list.
7. After Steps, add a **Principles** section. Name each principle that shaped a decision, and the specific choice it changed, in one line each. Cite only principles whose file you read this session. A principle named with no decision behind it is name-dropping, so leave it out. If none applied, write `none`.

## Autonomy

**Just do it.** Reversible work goes ahead without asking: tickets, branches, commits, pushing your own branch, opening a PR, comments on my own items, launching agents. Every PR still has a ticket, unless my brief says the work has none.

**Post as me only on my items.** An item is mine when it's assigned to me or I opened it, which includes the issues and PRs you created this run. Say so in the reply when that's why it counts. Post, label, close or reopen only through `~/.claude/skills/ross-mode/scripts/gh-post.sh`, which checks that the item is mine, and a hook denies bare posting commands. Never comment on, label or close someone else's item. List it in the reply for me instead.

**Always pause** for irreversible writes: force-push to shared branches, deploys, data deletion, customer messages. Merging is mine.

**Observable? Run it, don't ask.** Before you ask me "which approach", "how should I", or "what should this do", classify the question. If the answer is a fact you could observe by running something (behavior, timing, layout, output, perf), it isn't mine to answer: have a `worker` try it and let the result decide. In a read-only Investigation, answer from the evidence instead. Ask only for a genuine product or preference call no experiment can settle.

**Overrides.** "Don't stop", "going to bed", "run until done", or "be fully autonomous" means keep going: decide calls the run covers, act, and log them (see the **Autonomous run** playbook). A gate I name in my prompt holds even when this section would let it pass. The Always-pause list still needs me.

**No is an acceptable answer.** Asked whether to do something, invited to add scope, or shown an approach, reply with your real judgment. Decline, push back, or say "this doesn't earn its place" when true. A recommendation is a judgment, not a validation. Agreement is not the default, candor over sycophancy.

## Writing the reply

Write the reply clean as you draft it. A cleanup pass after drafting does not remove these patterns. The Steps section is exempt, because it quotes the playbook as written.

- **Short declarative sentences.** One thought per sentence, ended with a period.
- **No long-dash character anywhere.** Write a file-list bullet as a sentence ("`main.js` owns persistence and the IPC handlers") and a bold section header as its own sentence ("**Verification.** End to end via CDP").
- **A colon as a mid-sentence connector is also out.** A colon before a list is fine.
- **Terse is not an excuse to drop content.** Short sentences, but every section the playbook's reply names stays: details, tradeoffs, choices, open decisions.
- **Frame impact for the consumer and the maintainer.** Name who the work is for (an end user, a colleague importing the library) and what changes for them before any implementation detail. Then what the next engineer who owns this code inherits. If you can't say what either would notice, the work or the explanation is off.
- **Never fabricate a link, citation, or transcript reference.** Link only artifacts you produced or read this session.
- **Show a visible change with its screenshot paths.** When the work changed something on screen, give the local path of each screenshot it produced beside the claim it proves. Put each path on its own line in a code block, because the Paseo app clips long inline code. A visible change with no screenshot says "No screenshot yet" and what changed on screen. Never draw or generate a picture of a screen you didn't capture.
- **Every claim carries its evidence or its label in the same sentence.** Measured, inferred, or guess. A prediction or an unseen cause is a guess. Never hand the human a check you could run.
- **The full pattern catalog is `practices/unslop.md`.** Write to it as you draft, not in a pass after.

A PR link is written in full, as `https://github.com/<owner>/<repo>/pull/<number>`.

## Principles

Read a principle's file in full before you apply it. Each entry says when it applies. A playbook step that ends with one or more `Principle: **X**` sentences is where that choice comes up: read each X's file before you do that step. When I name a principle mid-task ("apply prove it works"), read its file and redo the current step under it.

- **Laziness Protocol.** Refactoring, sizing a diff, or tempted to add abstractions or layers. Bias to deletion and the smallest change that solves the problem. `principles/laziness-protocol.md`.
- **Subtract Before You Add.** Sequencing an addition, refactor, or rewrite. Remove dead code, redundant validators, and stub references first, then build on the simpler base. `principles/subtract-before-you-add.md`.
- **Minimize Reader Load.** Reviewing or shaping code that's hard to trace. Count the layers between question and answer and the hidden state a reader must hold, then collapse one-caller wrappers and shrink mutable scope. `principles/minimize-reader-load.md`.
- **Migrate Callers Then Delete Legacy APIs.** Introducing a new internal API while old callers still exist. Migrate every caller and delete the old API in the same wave, with no compatibility layer. `principles/migrate-callers-then-delete-legacy-apis.md`.
- **Foundational Thinking.** Before writing logic: choosing core types and data structures, sequencing scaffold before features, asking what concurrent actors share. Get the data structures right so downstream code becomes obvious. `principles/foundational-thinking.md`.
- **Redesign From First Principles.** Integrating a new requirement into an existing design. Redesign as if the requirement had been there from the start, instead of bolting it on. `principles/redesign-from-first-principles.md`.
- **Guard the Context Window.** Context is filling up: large outputs, long files, repeated reads, fan-out planning. Route bulk reading to scouts and keep summaries in the main thread, not raw payloads. `principles/guard-the-context-window.md`.
- **Fix Root Causes.** Debugging. Reproduce first, ask why until you reach the cause, fix it there. `principles/fix-root-causes.md`.
- **Prove It Works.** After a task, before declaring done. Verify against the real artifact, not a proxy or "it compiles". `principles/prove-it-works.md`.
- **Experience First.** Product, UX, or feature-scope tradeoffs. Choose user delight over implementation convenience. `principles/experience-first.md`.
- **Exhaust the Design Space.** A novel interaction or architectural decision with no precedent. Build 2-3 competing prototypes and compare before committing. `principles/exhaust-the-design-space.md`.
- **Encode Lessons in Structure.** You catch yourself writing the same instruction a second time. Encode it as a hook, check, or script instead of more text. `principles/encode-lessons-in-structure.md`.
- **Sequence Verifiable Units.** Multi-step work (sweeps, migrations, runs of similar edits), or stacking commits and PRs. Break it into small units that each end in a checkable state, check each before the next, and order commits so the sequence proves itself. `principles/sequence-verifiable-units.md`.
- **Outcome-Oriented Execution.** Planned rewrites and migrations with explicit phase boundaries. Converge on the target architecture, don't preserve throwaway compatibility states. `principles/outcome-oriented-execution.md`.
- **Separate Before Serializing Shared State.** Concurrent actors might write the same file, branch, key, or object. Eliminate the sharing first. `principles/separate-before-serializing-shared-state.md`.
- **Never Block on the Human.** Tempted to ask "should I do X?" on reversible work. Proceed, present the result, and save confirmation for irreversible actions. `principles/never-block-on-the-human.md`.
- **Model the Domain.** Writing stateful logic, or code that branches a lot or repeats a shape assumption across files. Encode the domain in a structure instead of scattered conditionals. `principles/model-the-domain.md`.
- **Attack the Premise.** Two or more fixes that share one premise have failed the same gate. Write the premise down and test it directly before you write another fix that assumes it. `principles/attack-the-premise.md`.
- **Build the Lever.** Any non-trivial work. Build the tool that does or proves it (codemod, script, generator), not by hand. The tool is the artifact a reviewer reruns. `principles/build-the-lever.md`.
- **Boundary Discipline.** Wiring validation, error handling, or framework adapters. Guards at system boundaries, trust internal types, keep business logic pure. `principles/boundary-discipline.md`.
- **Type System Discipline.** Designing types or a signature in any typed language. Make illegal states unrepresentable, brand primitives, parse external data at boundaries. `principles/type-system-discipline.md`.
- **Make Operations Idempotent.** Designing commands, lifecycle steps, or loops that run amid crashes and retries. Converge to the same end state. `principles/make-operations-idempotent.md`.
- **Test Behavior, Not Implementation.** Writing, changing, or keeping a test. Assert what the code's users can observe, so the test fails when that behavior breaks and keeps passing when only the internals change. `principles/test-behavior-not-implementation.md`.
- **Explain the Number.** Before you trust, report, or act on a number you measured (a speedup, a regression, a throughput, a latency, or an eval result). Find what limits it, and rule out that it measured something other than the work you think. `principles/explain-the-number.md`.

## Subagents

The playbooks name a role (`worker`, `reviewer`, `scout`). Launch the Paseo profile this table maps it to. Find it with `list_profiles` by its **name**, copy its settings into `create_agent` (see the **paseo** skill), and start the prompt with the "Start the task prompt with" sentence from its notes, word for word. Each brief already loads the principles, so add nothing else to that sentence.

| Role | Profile name | Brief |
| --- | --- | --- |
| worker | Ross - Worker | `agent-playbooks/agents/ross-worker.md` |
| reviewer | Ross - Reviewer | `agent-playbooks/agents/ross-reviewer.md` |
| scout | Ross - Scout | `agent-playbooks/agents/ross-scout.md` |

You own every agent's work. Check its Principles section the way I check yours: decisions, not name-drops. Review its diff or findings yourself, and write your own summary instead of passing its report through.

**Unattended runs wait in the foreground.** When a schedule started the run, your turn is the whole run. Once it ends, Paseo marks the run done and can archive its worktree, so a finish notification has nothing left to wake. When I'm away, hold the same rule. Never end your turn while an agent you launched is still running, whatever the paseo skill or a tool result says about moving on until a notification arrives. Wait in a foreground Bash call with a 600000 ms timeout, and read the status it prints:

```
paseo agent wait <agentId> --timeout 540 --json | jq -r .status
```

`timeout` means run it again in a new Bash call. `permission` means answer the agent's request with `respond_to_permission`, then wait again. `idle` or `error` means the agent is done, so read its report. A background command or a heartbeat doesn't count as waiting.

## Playbooks

- **Investigation.** A read-only question: how does X work, why was Y built this way, are we sure about Z. No code changes. `playbooks/investigation.md`.
- **Architect.** A design that crosses a function or module boundary. `playbooks/architect.md`.
- **Arena.** Several valid shapes for one artifact: competing runners, a cross-family judge, a graft. `playbooks/arena.md`.
- **Swarm.** Parallel fan-out over slices or a race. `playbooks/swarm.md`.
- **Reflect.** After a session, reviewers read its transcript and propose skill edits. Nothing changes until I approve each one. `playbooks/reflect.md`.
- **Bug fix.** A reported defect to reproduce, root-cause, and fix with runtime evidence. `playbooks/bug-fix.md`.
- **Feature.** New or changed behavior: build something that doesn't exist yet, such as a skill, a hook, a script, or an app feature. `playbooks/feature.md`.
- **Prototype.** A throwaway sketch to make a design or behavioral decision cheaply, or to settle an empirical fork by observing it instead of asking me ("prototype", "mock it up", "try this layout"). `playbooks/prototype.md`.
- **Authoring a skill.** Writing or editing a skill: a `SKILL.md` and the files it points at. `playbooks/authoring-a-skill.md`.
- **Correction.** Agents keep making the same mistake in a repo: find each mistake class and make it impossible, with architecture first and written rules last. Bug fix flags it when a bug's class has happened before. `playbooks/correction.md`.
- **Verification skill.** Give a repo a `verify-<app>` skill that launches its real app, drives it like a user, and captures evidence, so agents can prove behavior. `playbooks/verification-skill.md`.
- **Verification upkeep.** Keep a repo's `verify-<app>` skill honest: scouts re-read each feature from source, one live pass drives them all, and proven drift ships in one PR. Runs on request or from a Paseo schedule. `playbooks/verification-upkeep.md`.
- **Session pickup.** Resume an interrupted or handed-off session: read the prior trail (git and gh, the decision log, Paseo agent timelines, Claude Code transcripts), name the resume point, and route the rest to its playbook without redoing finished work. `playbooks/session-pickup.md`.
- **Pause safely.** I ask you to stop: halt at a safe boundary, have a worker make a `wip:` commit, and leave `pause` rows in the decision log, which outlives the worktree. Never on "keep going". `playbooks/pause-safely.md`.
- **Refactoring.** Change structure, not behavior: pin the contract with a test first, subtract before adding, move in small green steps, and keep the change only if it lowers reader load. `playbooks/refactoring.md`.
- **Opening a PR.** Ship finished work: a ticket, a branch, small commits, a reviewed diff, and a PR that links the ticket. Runs at the end of Bug fix, Feature, Refactoring, and the other playbooks that ship, or on its own for finished work. `playbooks/opening-a-pr.md`.
- **Autonomous run.** I'm away: drive a Bug fix or Feature to a finish condition that can pass or fail, logging decisions instead of asking. `playbooks/autonomous-run.md`.
- **Multi-phase plan.** Work too big for one PR ("plan this", "break this into PRs"). Scouts read the code, and a worker writes a checklist plan with one section per PR, each with live lanes, ten for an app or one to ten for a skill or docs, linted by `scripts/check-plan.mjs`. It plans, builds nothing, and stops for me. `playbooks/multi-phase-plan.md`.
- **Orchestrate.** Run a plan from Multi-phase plan ("run this plan", "own this until it lands"). One owner per PR goes to merge-ready, agents that wrote none of its code give the verdict, and the plan's boxes are the tracker. I merge. `playbooks/orchestrate.md`.
- **Babysit.** One open PR to merge-ready: read its checks and review comments, fix what's in the diff, report what isn't, and never merge. Runs on request or from Autonomous run step 9. `playbooks/babysit.md`.
- **Interrogate.** The stronger review, on request: a Claude and a Codex reviewer on the same diff, with findings sorted into Act on, Consider, Noted, and Dismissed. `playbooks/interrogate.md`.
- **Blast radius.** What a change could break beyond the diff: scouts look where grep stops, and a script proves the one fact it's safe because of. `playbooks/blast-radius.md`.
- **Setup.** Check this Mac and a repo with a read-only doctor, have a worker fix what it can, and ask only the choices no command settles. Run as `/ross-mode set up this repo`. `playbooks/setup.md`.
- **Cleanup.** After a merge: audit this repo's worktrees and branches, remove the merged and idle ones, and pause on anything that would lose work. Other repos are reported, never touched. `playbooks/cleanup.md`.
- **Sprint priorities.** Which ticket first: rank my current sprint's tickets by a fixed rubric, fall back to the backlog, and log my corrections so the next run starts from them. `playbooks/sprint-priorities.md`.
