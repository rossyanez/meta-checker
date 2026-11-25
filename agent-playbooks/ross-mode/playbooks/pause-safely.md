### Pause safely

Starts with scouts: no.

Translated from pstack `playbooks/pause-safely.md`. Changed: nested subagents → the Paseo agents and heartbeats you launched. The `/tmp` resume note → `pause` rows in the decision log, which lives in `$PASEO_HOME/audit/<repo>/` and outlives the worktree. The commit stages by path, never `git add -A`. No scouts: pausing reads no code. Not ported: the compaction trigger, because Claude Code compacts on its own and the run keeps going.

**You own a clean stop. Leave a checkpoint a cold-start agent can resume from.** This is explicit only: I ask you to pause or stop. On "keep going", "going to bed, keep going", or "don't stop", do not pause.

1. Stop at a safe boundary. Finish the current atomic step or back out of it. Start nothing new except the step 3 worker. Cancel every Paseo agent you launched that is still running (`cancel_agent`), and delete every heartbeat you created (`delete_heartbeat`).
2. Take no irreversible action to pause. No PR and no push unless you already had one out.
3. Make the work durable. Have a `worker` commit uncommitted edits as one clear `wip:` commit on the current branch so nothing is lost, with the title and body you write in its handover. It stages tracked edits (`git add -u`) and the new files that belong to the work, by path. Check it with `git log`. If the tree is broken, say so in the commit body in one line. Name any other untracked or ignored file that matters, such as `.env`, in step 4. Cleanup holds a branch with unmerged commits, so the commit outlives the worktree folder.
4. Write the resume note off-context, as `pause` rows in the run's decision log (`practices/decision-log.md`). Use the run's slug, or start a log if the run had none. One row per item: intent, what you were doing, progress and what's verified, current state, next steps, key files, and gotchas. The first row's evidence names the branch, the worktree path, and the `wip:` commit SHA, so Session pickup can find the log by branch. Where the log already records an item, point at that row instead of duplicating it.

**Reply:** where you are in the loop, what's on disk versus still in your head (paths, no diff dumps), the commits on the branch and whether the tree is clean, the log's path, and the first action on resume. This is a pause, not a final report.
