### Cleanup

Starts with scouts: no.

Translated from pstack `playbooks/worktree-cleanup.md`. Changed: Cursor chats and the pinned sidebar → Paseo agents and workspaces. The audit goes per branch and adds `unpushed` and `empty` buckets. One cleanup touches only the repo it runs in. No scouts: the audit, not code reading, is the evidence. Not ported: step 6 (simulators and Cursor caches) and the transcript fan-out.

Runs after I merge, when I say "you can do the cleanup", or on its own.

1. **Snapshot and audit.**
   - Find the base per **Opening a PR** step 2 (`playbooks/opening-a-pr.md`).
   - Run `git fetch origin`, without `--prune`.
   - Record `df -h /` and `du -sh "$PASEO_HOME/worktrees"` as the "before".
   - Run `~/.claude/skills/ross-mode/scripts/worktree-audit.sh -b origin/<base> "<main checkout>"`. It reads paths from `git worktree list`, so every path you act on comes from git, not your typing.

   Principle: **Encode Lessons in Structure** (`principles/encode-lessons-in-structure.md`).
2. **The bucket is advice. In use wins.**
   - Re-check every `removable` row yourself against `paseo agent ls -g --json` and `paseo workspace ls --json`. A running or initializing agent whose cwd is the row's path, or inside it, holds the row. pstack's audit once marked safe a worktree the user had pinned.
   - A workspace I named to keep wins over any bucket.
   - The audit holds a tip under a day old as `in-use` unless it proves the work finished: a PR merged at that tip, no open PR, Paseo answered with no running or initializing agent in the path, nothing uncommitted, not locked, and the remote branch unmoved. A lead shows on the main checkout's row, so a worktree row counts only agents whose cwd is inside its path.

   Principle: **Prove It Works** (`principles/prove-it-works.md`).
3. **Pause on anything that loses work.** Hold the row and show its evidence:
   - `wip`: `git -C <path> diff`.
   - `unpushed`: `git log --oneline <branch> --not --remotes`.
   - `open-pr`: `gh pr view <number>`.
   - `empty`: hold it, and name its issue if the branch name has one.
   - `review`: say what's odd about it, such as a remote branch that moved past the tip: `git log --oneline <branch>..<remote>/<branch>`.
   - Untracked-only files on a `removable` row are scratch (pstack's `scratch:N`). They go with the folder, so name them.

   Clean, merged and not in use proceeds without asking (**Autonomy** in the router). In an Autonomous run, held rows go in the reply, not a question.
4. **Remove the `removable` rows only.** Every `keep` row stays: the main checkout, the base branch, the default branch and `pr-assets`. `pr-assets` never merges and looks idle, but PR bodies link to its images, so never remove it, locally or on origin. Run git from the main checkout. Per row, in order:
   - A row with a path: re-run `git -C <path> status --porcelain --ignored` right before removing. If it fails or shows any tracked line, hold the row. Name its `??` lines (scratch) and `!!` lines (ignored files, such as `.env`). Both go with the folder: `!!` files even on a plain remove, `??` files only with `--force`.
   - A row with a workspace: archive it with `archive_workspace`, which archives its agents. Paseo removes only worktrees it owns.
   - If the path still exists: `git worktree remove <path>`. Add `--force` only when every line of the re-run is `??` or `!!`. If git refuses, re-audit and treat the row as the new audit says.
   - Then `git branch -D <branch>` if the branch still exists. The audit proved a merged PR's head is this tip, so `-D` is safe where `-d` would refuse a squash merge.
   - Then, if `git ls-remote --heads origin <branch>` shows it, `git push --force-with-lease=<branch>:<tip> origin --delete <branch>`, with `<tip>` from the audit's `tip` column. If git refuses, someone pushed since the audit: hold the row, run `git fetch origin`, and show `git log --oneline <tip>..origin/<branch>`.
   - For `prunable` rows: `git worktree prune`.
5. **Prove it.**
   - Re-run the audit. The removed rows are gone and no held row changed bucket.
   - Record `df -h /` and `du -sh "$PASEO_HOME/worktrees"` as the "after".
6. **Report what's outside this repo.** Copy the audit's `outside this repo (untouched)` section into the reply. Touch none of it: one cleanup touches only the repo it runs in.

This is the one playbook that deletes user state with no code review to catch a slip, so the gates above are the review.

**Reply:** disk before and after, what was removed, each row held back with its reason, and what the audit saw outside this repo, with sizes.
