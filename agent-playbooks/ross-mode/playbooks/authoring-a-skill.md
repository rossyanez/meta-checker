### Authoring a skill

Starts with scouts: yes.

Translated from pstack `playbooks/authoring-a-skill.md`. Changed: Cursor's built-in `create-skill` → Claude Code's skill conventions, written into step 2; a Ross - Scout reads first, a Ross - Worker writes, and a Ross - Reviewer validates, because the lead writes no files. Added: the skill's prose follows `practices/unslop.md`, as pstack's router asks of agent-facing prose; the install step goes in the PR body.

**You own the skill's voice.**

1. Launch a `scout` (see **Subagents** in the router) to read the skill if it exists, the files and skills it links to, and any installed skill whose name or job overlaps. Wait for its report.
2. Delegate the writing to a `worker` with Claude Code's skill conventions:
   - A skill is a folder holding `SKILL.md`. It lives in `~/.claude/skills/<name>/` for every project, in `.claude/skills/<name>/` for one repo, or in a repo folder that a symlink installs.
   - The frontmatter has `name` and `description`. `name` uses lowercase letters, digits, and hyphens, and matches the folder. `description` says what the skill does and when to use it, in the words a user would type.
   - Add `disable-model-invocation: true` when only my slash command should start it.
   - Supporting files sit beside `SKILL.md`, which links them by relative path.
3. Validate the skill: frontmatter has `name` and `description`, referenced files exist, cross-skill links resolve. A fresh `reviewer` checks this along with the diff.
4. Test cases if structural, such as a hook or a script the skill ships. Add a test that fails first and runs in CI. Skip if subjective. Principle: **Encode Lessons in Structure** (`principles/encode-lessons-in-structure.md`).
5. Run **Opening a PR** (`playbooks/opening-a-pr.md`). If installing the skill needs a step outside the repo, such as a symlink into `~/.claude/skills`, write it in the PR body for me.

When in doubt, delete. Keep only prose that changes a decision. Tell it to do the thing and skip the reason. Explain only when the rule is confusing without one. Match tone to scope. Point at structural sources (types, READMEs, config) per **Encode Lessons in Structure**. Delegate to other skills by path. Don't restate. Apply `practices/unslop.md` to the prose. A workflow you keep hitting but isn't captured → propose a new skill.

**Reply:** summary of the skill, key design decisions, validation notes, and any install step for me.
