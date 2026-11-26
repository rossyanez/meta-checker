### Swarm

Starts with scouts: no.

Translated from pstack `skills/swarm`. Changed: cloud workers → local Paseo agents. A slice that only reads runs on a Ross - Scout, and a slice that writes runs on a Ross - Worker in its own worktree. A model race puts one arm on the codex seat from **Arena** step 1. `cloud_base_branch` → `create_workspace` `baseBranch`. Dropped: `environment`, `subagent_type`, `run_in_background`, and the `swarm workers` line of `pstack-models.mdc`.

Runs for parallel coverage, races, gauntlets, and exploration partitions. A design or code bakeoff with a base and grafts is the **Arena** playbook instead.

**Fan out, drain, report once.**

1. **Frame.**
   - State the done predicate and the artifact or report the swarm must return.
   - Choose the shape: partition into slices, race N agents on identical briefs, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before launching.
   - Set N from my prompt, or derive it from the shape. N is the total number of agents.
   - Pick each agent's seat. A slice that only reads gets a Ross - Scout. A slice that writes gets a Ross - Worker (see **Subagents** in the router). For a model race, name each arm's seat up front, with one arm on the codex seat from **Arena** step 1 (`playbooks/arena.md`).
   - Give each writing agent its own Paseo worktree: `create_workspace` with `isolation: "worktree"`, `mode: "branch-off"`, and `baseBranch` the branch it must start from. When agents verify or measure commits, each brief names the exact SHAs. A measurement brief also names the method: sample count, what one sample is, and order. The agent records both in its result.
2. **Fan out.** Launch all N agents with `create_agent` in one message. Every brief stands alone: the goal, the scope, the exact slice or race arm, how to verify, and what to report. Reports use `PASS`, `ISSUES`, or `BLOCKED` with evidence. An agent that can prove a defect reports `ISSUES` and lists every issue it can prove, not only the first. Wait for every agent in the foreground, as **Subagents** in the router says. If an agent drops out, go on with N-1 and note it.
3. **Aggregate.** Read the final results. Drop a result that does not record the SHAs and method its brief names, and launch that agent again once. After a second miss, record a gap. A gap does not count as a pass. For coverage, every required slice needs a result. For a race, apply the selection rule declared in step 1. Write your own summary: a compact result table, one-line evidenced issues, and explicit gaps or dropouts.
4. **Report.** Return one consolidated report as the reply.

**Reply:** the result table, the issue one-liners, gaps or dropouts, and the race rule when one was used.
