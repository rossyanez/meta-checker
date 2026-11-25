### Setup

Starts with scouts: no.

Translated from pstack `skills/setup-pstack`. Changed: pstack picks a model per role and a reasoning budget; here Paseo profiles pin the models, so the doctor only reports them. Kept: ask only what no command settles, and offer a verify skill once without pushing. Added (mine): the Mac and repo checks in `scripts/doctor.sh`, and the before/after report. Not ported: the per-role model and reasoning-budget picker.

**The doctor settles the facts. Ask me only the choices it can't.**

My answers live in the repo's AGENTS.md, one line each in a `## Setup` section: `- <Question>: <answer>`, such as `- Verify skill: declined` or `- Base branch: develop`. The doctor reads them. A base-branch rule written in AGENTS.md, CLAUDE.md or a file they `@`-import wins over the `- Base branch` line, which counts only when no other rule is written.

1. Run the doctor from the repo's root: `~/.claude/skills/ross-mode/scripts/doctor.sh`. It only reads. Keep its output as the "before".
2. A `worker` fixes the FAILs it can (see **Subagents** in the router).
   - Mac: the symlink (`mac/skill-link`), the hook's executable bit (`mac/hook-exec`), and `CLAUDE_CODE_ENABLE_TODO_TOOLS` merged into the existing `~/.claude/settings.json` without dropping other keys. Merge with jq into a temp file, check it parses, then move it over.
   - A WARN doesn't fail the doctor. A `mac/skill-link` WARN means the checkout the link points to is behind `origin/<base>` as of its last fetch. It goes to me as its fix command, since running it would pull or switch my checkout.
   - Repo: `CLAUDE.md` with the line `@AGENTS.md`, shipped through the **Opening a PR** playbook (`playbooks/opening-a-pr.md`).
   - Never edit `$PASEO_HOME/config.json`. Report a missing profile with the steps to create it in Paseo.
   - A missing tool or `gh auth` goes to me as the command to run: `brew install <x>` or `gh auth login`.

   Principle: **Never Block on the Human** (`principles/never-block-on-the-human.md`).
3. Read AGENTS.md's `## Setup` section first. Ask only these choices, each once, and skip any it already answers. Everything else is a fact the doctor settles.
   - The model for a missing profile. Not recorded: once the profile exists, the doctor sees it.
   - The base branch, only when `repo/base-branch` is INFO and says origin/develop exists. Records `- Base branch: <name>`. When `repo/base-branch` says a written rule wins over the Setup line, ask me once whether that rule stands. Yes has the `worker` delete the Setup line. No leaves both.
   - Whether to make a verify skill, when `repo/verify-skill` is INFO. Yes runs the **Verification skill** playbook (`playbooks/verification-skill.md`). No records `- Verify skill: declined` and moves on without pushing.

   A `worker` writes each new answer as its line, creating the section, or AGENTS.md, if missing. If it creates AGENTS.md, it also adds the line `@AGENTS.md` to CLAUDE.md. It ships through **Opening a PR**, in the same PR as step 2's repo fix. A deleted line ships the same way.
4. Run the doctor again. Keep its output as the "after". Principle: **Prove It Works** (`principles/prove-it-works.md`).

**Reply:** the before and after doctor output, what the worker fixed, what's left for me and why, the choices asked and answered, the ones `## Setup` already answered, and the PR link if a repo fix shipped.
