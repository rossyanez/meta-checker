# Agent playbooks

This folder holds a copy of `ross-mode`, the Claude Code skill whose agents build this repo, and the three role briefs those agents run under. Private paths, names and other repos are removed. Every rule is otherwise the one the agents follow. The copy lives here, not in `.claude/skills/`, so it never shadows the installed skill during a run.

## How a task moves from prompt to merge

1. The router, `ross-mode/SKILL.md`, matches the task to one playbook in `ross-mode/playbooks/`, such as `feature.md` or `bug-fix.md`.
2. The lead agent copies the playbook's numbered steps into its todo list, word for word, one `TaskCreate` per step. The first `TaskCreate` names the playbook. Until it does, the `require-tasklist` hook denies every tool call except `ToolSearch`, `TaskCreate` and reads inside the skill folder, so the lead can't edit a file or launch an agent first. The same hook keeps denying file writes from the lead for the rest of the run, holds back code reading until a scout launches for playbooks that start with scouts, and refuses to mark a task done that never started.
3. In feature and bug work, the lead names the test seams in its handover, and the worker writes the failing test first, as `ross-mode/practices/tdd.md` describes.
4. Paseo agents do the work. A worker makes the edits and a reviewer checks them, each started from its role brief in `agents/`. A scout reads code before the design when the playbook asks for one. The `deny-worker-installs` hook stops a worker session from installing software with `brew`, global `npm` or `pip`.
5. A reviewer that wrote none of the code gives the verdict, `PASS`, `PASS+NOTES` or `FAIL`. The lead posts it as a PR comment and sets it as the `ross-mode/verdict` commit status on the PR's head with `ross-mode/scripts/verdict-status.sh`. That script refuses a SHA that isn't the current head, so an old verdict never labels new code.
6. In this repo, branch protection on `master` requires the `ross-mode/verdict` status plus the `test`, `lint` and `gitleaks` CI checks.
7. A human merges. No playbook merges.

Posting to GitHub goes through one door. The `deny-bare-gh-posts` hook denies `gh issue` and `gh pr` commands that comment, create, edit, close or review, and most `gh api` writes. Agents post through `ross-mode/scripts/gh-post.sh`, which first checks that the issue or PR was opened by the owner or is assigned to them.

## How to try it

The hooks need `bash`, `jq` and `perl`. The playbooks launch agents through Paseo. Each role needs a Paseo profile, named as in the Subagents table of `SKILL.md`, whose notes give the sentence that starts its task prompt.

1. Copy `ross-mode/` to `~/.claude/skills/ross-mode/`. The hooks and playbooks call scripts at that path.
2. Set `ross` in `scripts/gh-post.sh` to your GitHub login.
3. Wire the hooks. `require-tasklist.sh` and `deny-bare-gh-posts.sh` are declared in the frontmatter of `SKILL.md`, so they arm when `/ross-mode` loads. `deny-worker-installs.sh` runs in every session, so it goes in `~/.claude/settings.json`, next to the variable that turns on the todo tools:

```json
{
	"env": {
		"CLAUDE_CODE_ENABLE_TODO_TOOLS": "1"
	},
	"hooks": {
		"PreToolUse": [
			{
				"matcher": "Bash",
				"hooks": [
					{
						"type": "command",
						"command": "\"$HOME\"/.claude/skills/ross-mode/hooks/deny-worker-installs.sh"
					}
				]
			}
		]
	}
}
```

4. Run `/ross-mode <task>` in Claude Code.

Each hook and script has a `test-*.sh` beside it. CI runs them all on every pull request.

## What changed from pstack

pstack targets Cursor. This copy runs on Claude Code, with Paseo agents in place of Cursor's subagents and cloud workers. Each playbook's opening lines say what it ported, translated, added or dropped. Across them, the main changes are these:

- Workers, reviewers and scouts are Paseo agents launched from named profiles, and each writing agent gets its own Paseo worktree. Paseo heartbeats replace `/loop`.
- Hooks enforce the todo list, the lead's no-write rule and the posting rule, where pstack states them as instructions.
- Orchestrate also sets the verdict as the `ross-mode/verdict` commit status, so branch protection can require it.
- GitHub work uses `gh` only. Stacked-PR tools, squash-merge, `--auto` and cloud VMs are dropped, and agents stop at merge-ready.
- Some pieces are new, such as the `sprint-priorities` playbook and screenshots as proof in Opening a PR.

## Credit

The playbooks, principles and practices are adapted from [pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan, released under the MIT licence. `LICENSE-pstack` carries its notice.

## Scripts left out

This copy carries only the scripts that the hooks and the posting, verdict and plan steps need. Those are `gh-post.sh`, `verdict-status.sh` and `check-plan.mjs`. Some playbooks name other scripts, which stay out. The sentences that name them still describe how the original setup runs.

- `doctor.sh` checks the local install for the Setup playbook. It is tied to the owner's machine.
- `log.sh` appends decision-log rows under `$PASEO_HOME/audit/`.
- `pr-screenshots.sh` uploads PR screenshots to a `pr-assets` branch.
- `sprint-tickets.sh` reads the owner's GitHub Project sprints. It is tied to the owner's account.
- `worktree-audit.sh` lists branches and worktrees for the Cleanup playbook.
- `resume-after-limit.py` resumes agents after a usage limit. It is tied to a scheduler on the owner's machine, and it records each resume through `log.sh`.
