### Session pickup

Starts with scouts: yes.

Translated from pstack `playbooks/session-pickup.md`. Changed: Cursor's `agent-transcripts/` → Claude Code transcripts in `~/.claude/projects/` and Paseo agent timelines. The trail adds the decision log and any handoff notes the repo's AGENTS.md names. A scout reads the trail, and the routed playbook's steps join your todo list. Merging stays mine. Not ported: cloud-agent URLs.

**You own the resume point. Read the prior trail, don't redo it.**

1. Locate the prior trail, and launch a `scout` to read it (see **Subagents** in the router). Keep only its reduced timeline in your context. Have it read each source's last entries first, then scan back for the decision points. The sources:
   - **Git and GitHub.** The branch and worktree (`git worktree list`), commits ahead of the base, and open PRs and issues (`gh pr list`, `gh issue view`).
   - **The decision log.** `$PASEO_HOME/audit/<repo>/*.tsv`, where `<repo>` is the main checkout's folder name. Pause safely leaves `pause` rows that name the branch, so find the run's file by grepping for the branch, else take the newest.
   - **Paseo agent timelines.** `list_agents` with `includeArchived`, `sinceHours: 720`, and the worktree's `cwd`, then `get_agent_activity` or `paseo logs <id>` for each agent.
   - **Claude Code transcripts.** `~/.claude/projects/<path>/*.jsonl`, where `<path>` is the checkout or worktree path with every character other than a letter or digit replaced by `-`. So `/home/me/projects/app` becomes `-home-me-projects-app`. Read only this repo's checkout and its worktrees. Never glob across `~/.claude/projects/*`, which reads private chats from unrelated projects.
   - **Repo handoff notes.** Only when the repo's AGENTS.md names them. A note inside the worktree is gone once Cleanup removes the worktree.

   Principle: **Guard the Context Window** (`principles/guard-the-context-window.md`).
2. Reconstruct operational state. The branch and worktree, what already landed (`git log`, `git diff` against the base), the open todos, the decisions made. The prior trail is authoritative input. Resist the bias to re-derive it.
3. Diff done vs pending. Compare what shipped against what was planned, name the resume point, do not re-run the prior repro or redo completed work. A "let me verify from scratch" pass means you're treating the trail as untrustworthy when it's authoritative.
4. Route the remaining work to the matching playbook and pick the verdict: continue the execution, ship a finished recommendation, ratify or override a prior conclusion, or postmortem a failed run. Read that playbook and add its steps to your todo list, copied in verbatim. Mark each step the trail already covers `skip: done in the prior session (<evidence>)`. The pickup playbook ends here. The routed playbook owns the rest, and merging stays mine.
5. Verify the inherited claims against the original goal on the real artifact. A passing prior self-report is not the proof. Principle: **Prove It Works** (`principles/prove-it-works.md`).

**Reply:** where the prior agent stopped, what you inherited vs redid (ideally nothing redone), the resume point, and the outcome.
