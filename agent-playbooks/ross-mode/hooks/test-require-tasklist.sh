#!/bin/bash
# Pipes PreToolUse fixtures into require-tasklist.sh and checks allow/deny.
# Usage: hooks/test-require-tasklist.sh
# HOOK=<path> runs it against another hook, which must sit in this directory (it finds the skill from its own path).

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
hook=${HOOK:-$here/require-tasklist.sh}
skill_dir=$(cd "$here/.." && pwd -P)
export TMPDIR=$(mktemp -d)
# The fake home sits beside the test, never under /tmp, where the hook allows redirects.
home=$(mktemp -d "$here/.test-home.XXXXXX")
trap 'rm -rf "$TMPDIR" "$home"' EXIT
run_id=$$
fails=0

# check <name> <allow|deny> <stdin>
check() {
  local name=$1 want=$2 out got
  out=$(printf '%s' "$3" | "$hook")
  if [[ -z $out ]]; then got=allow
  elif [[ $(jq -r '.hookSpecificOutput.permissionDecision' <<<"$out") == deny ]]; then got=deny
  else got="unexpected"; fi
  if [[ $got == "$want" ]]; then echo "PASS  $name -> $got"
  else echo "FAIL  $name -> $got (want $want)"; fails=$((fails + 1)); fi
  [[ -n $out ]] && echo "      $out"
}

# event <session> <tool> <tool_input-json>. EVENT_CWD=<dir> sets the session cwd (default: the skill dir).
event() {
  jq -nc --arg s "$1-$run_id" --arg t "$2" --argjson i "$3" --arg cwd "${EVENT_CWD:-$skill_dir}" \
    '{session_id:$s, transcript_path:"/dev/null", cwd:$cwd, hook_event_name:"PreToolUse", tool_name:$t, tool_input:$i, tool_use_id:"toolu_1"}'
}

# bash_case <allow|deny> <command>: a Bash call in the write session, which has already called TaskCreate.
bash_case() { check "Bash: ${2%%$'\n'*}" "$1" "$(event write Bash "$(jq -nc --arg c "$2" '{command:$c}')")"; }

# declared <playbook> <subject>: TaskCreate input with the playbook declaration.
declared() { jq -nc --arg p "$1" --arg s "$2" '{subject:$s,description:"d",metadata:{playbook:$p}}'; }

echo "== skipping session (no TaskCreate)"
check "Bash before TaskCreate"   deny "$(event skip Bash '{"command":"cat playbooks/feature.md"}')"
check "Edit before TaskCreate"   deny "$(event skip Edit '{"file_path":"/tmp/x","old_string":"a","new_string":"b"}')"
check "MCP tool before TaskCreate" deny "$(event skip mcp__x__y '{}')"
check "Read outside skill dir"   deny "$(event skip Read '{"file_path":"/etc/hosts"}')"
check "Read ../ escape"          deny "$(event skip Read "$(jq -nc --arg p "$skill_dir/../../../../../../../etc/passwd" '{file_path:$p}')")"
check "Glob outside skill dir"   deny "$(event skip Glob '{"pattern":"*","path":"/tmp"}')"
check "Grep sibling-prefix dir"  deny "$(event skip Grep "$(jq -nc --arg p "${skill_dir}-evil" '{pattern:"x",path:$p}')")"

echo "== compliant session"
check "ToolSearch"               allow "$(event ok ToolSearch '{"query":"select:TaskCreate,TaskUpdate"}')"
check "Read playbook"            allow "$(event ok Read "$(jq -nc --arg p "$skill_dir/playbooks/bug-fix.md" '{file_path:$p}')")"
check "Glob skill dir"           allow "$(event ok Glob "$(jq -nc --arg p "$skill_dir" '{pattern:"**/*.md",path:$p}')")"
check "Grep relative to cwd"     allow "$(event ok Grep '{"pattern":"Reply","path":"playbooks"}')"
check "TaskCreate"               allow "$(event ok TaskCreate "$(declared bug-fix 'step 1')")"
check "Bash after TaskCreate"    allow "$(event ok Bash '{"command":"ls"}')"
check "Edit after TaskCreate"    deny  "$(event ok Edit '{"file_path":"/tmp/x","old_string":"a","new_string":"b"}')"
check "TaskUpdate after TaskCreate" allow "$(event ok TaskUpdate '{"taskId":"1","status":"in_progress"}')"

echo "== the lead doesn't write files"
check "TaskCreate"               allow "$(event write TaskCreate "$(declared none s)")"
check "Write after TaskCreate"   deny  "$(event write Write '{"file_path":"/tmp/x","content":"a"}')"
check "MultiEdit after TaskCreate" deny "$(event write MultiEdit '{"file_path":"/tmp/x","edits":[]}')"
check "NotebookEdit after TaskCreate" deny "$(event write NotebookEdit '{"notebook_path":"/tmp/x.ipynb","new_source":"a"}')"
bash_case deny 'cd "/home/me/My Projects/web-app" && python3 - <<'"'"'EOF'"'"'
p='"'"'vite.config.ts'"'"'
s=open(p).read()
s=s.replace("a","b",1)
open(p,'"'"'w'"'"').write(s)
EOF
git diff'
bash_case deny "node <<EOF
require('fs').writeFileSync('x', 'y')
EOF"
bash_case deny "ruby - < fix.rb"
bash_case deny "perl <<'EOF'
print 1
EOF"
bash_case deny "sed -i '' 's/a/b/' vite.config.ts"
bash_case deny "sed -E -i.bak 's/a/b/' vite.config.ts"
bash_case deny "perl -pi -e 's/a/b/' vite.config.ts"
bash_case deny "cat > vite.config.ts <<'EOF'
export default {}
EOF"
bash_case deny "cat >> NOTES.md <<'EOF'
more
EOF"
bash_case deny "echo hi | tee vite.config.ts"
bash_case deny "echo hi | tee -a NOTES.md"
bash_case deny "patch -p1 < fix.diff"
bash_case deny "git apply fix.diff"
bash_case deny "git checkout -- vite.config.ts"
bash_case deny "git restore vite.config.ts"
bash_case deny "echo 'x' > vite.config.ts"
bash_case deny "printf x >> NOTES.md"
bash_case allow "ls"
bash_case allow "git status"
bash_case allow "git diff"
bash_case allow "cat vite.config.ts"
bash_case allow "grep -rn 'foo > bar' src"
bash_case allow "yarn vitest run 2>&1 | tail -8"
bash_case allow "node -e 'console.log([1,2].map(x => x > 1))'"
bash_case allow "ls > /dev/null 2>&1"
bash_case allow "yarn build >/tmp/build.log 2>&1"
bash_case allow "echo hi | tee /tmp/out.txt"
bash_case allow "git commit -m \"\$(cat <<'EOF'
fix(vite): don't write > files from the lead

It's \"quoted\" and has a -> arrow.
EOF
)\""
bash_case allow "gh pr create --title 'x' --body \"\$(cat <<'EOF'
## Summary
- a > b, and cat > file in prose
EOF
)\""
bash_case allow "gh issue create --title 'x' --body \"\$(cat <<'EOF'
Repro: python3 - <<EOF then sed -i
EOF
)\""

bash_case deny "cat > \"vite.config.ts\" <<'EOF'
export default {}
EOF"
bash_case deny 'echo x > "$f"'
bash_case deny "cat <<'EOF' > \"vite.config.ts\"
export default {}
EOF"
bash_case deny "python3 - <<'EOF' > \"/home/me/My Projects/x.ts\"
print(1)
EOF"
bash_case deny 'echo hi | tee "NOTES.md"'
bash_case deny "cp /tmp/x.ts vite.config.ts"
bash_case deny "cp /tmp/x.ts \"/home/me/My Projects/x.ts\""
bash_case deny "ls && mv /tmp/x.ts src/x.ts"
bash_case deny "true; install -m 644 /tmp/x src/x"
bash_case deny "(cd src || true) | cp a b"
bash_case deny "git mv a.ts b.ts"
# Scratch trees: tar -x, git archive, git init, git worktree add and git merge write files.
bash_case deny "git archive HEAD | tar -x -C scratch"
bash_case deny "tar -xf /tmp/src.tar -C scratch"
bash_case deny "tar xzf src.tgz"
bash_case deny "tar --extract -f a.tar"
bash_case deny "git archive --format=tar -o src.tar HEAD"
bash_case deny "git init scratch"
bash_case deny "cd scratch && git init"
bash_case deny 'git worktree add --detach "$d" origin/main'
bash_case deny "git merge origin/main"
bash_case allow "git merge-base HEAD origin/main"
bash_case allow "git worktree list"
bash_case allow "tar -tf src.tar"
bash_case allow "tar -tf x.tar"
bash_case allow "tar tvf src.tar.xz"
bash_case allow "git log --oneline -3"
bash_case allow "cp a.txt /tmp/a.txt"
bash_case allow "mv /tmp/x /tmp/y"
bash_case allow 'ls -la "My Projects"'
bash_case allow 'grep -n "foo" "a b.md"'
bash_case allow 'cd "/home/me/My Projects/skills-repo" && git status'
bash_case allow "yarn install"
bash_case allow "cd \"/home/me/My Projects/web-app\" && node scripts/finish.mjs --ready-for-review <<'JSON'
{\"summary\": \"x\"}
JSON"
bash_case allow "python3 script.py < input.txt"
# log.sh takes a slug, not a path, so the lead may call it.
bash_case allow 'skills/ross-mode/scripts/log.sh my-run phase "d" "w > x" "e" open'
bash_case allow 'bash ~/.claude/skills/ross-mode/scripts/log.sh my-run phase "d" "w" "e" open'
bash_case allow '~/.claude/skills/ross-mode/scripts/log.sh my-run phase "d" "w" "e" open'
bash_case deny  'skills/ross-mode/scripts/log.sh my-run p d w e open > out.txt'
# doctor.sh only reads, so the lead may run it (Setup step 1).
bash_case allow 'skills/ross-mode/scripts/doctor.sh'
bash_case allow 'bash ~/.claude/skills/ross-mode/scripts/doctor.sh'
bash_case allow '~/.claude/skills/ross-mode/scripts/doctor.sh'
bash_case allow 'cd "/x/y" && ~/.claude/skills/ross-mode/scripts/doctor.sh'
# pr-screenshots.sh pushes to the pr-assets branch and never touches the working tree (Opening a PR step 5).
bash_case allow 'skills/ross-mode/scripts/pr-screenshots.sh a.png'
bash_case allow '~/.claude/skills/ross-mode/scripts/pr-screenshots.sh /tmp/pr-shots/0007-before.png /tmp/pr-shots/0007-after.png'
bash_case deny "python3 <<EOF
print(1)
EOF"
# Possessive >> and tee -a: no backtracking into an allowed target.
bash_case allow "echo hi >> /tmp/log"
bash_case allow "ls 2>>/dev/null"
bash_case allow "echo hi | tee -a /tmp/log"
bash_case deny "echo hi >> NOTES.md"
bash_case deny "echo hi > a"
# tee, patch, git apply and git restore only as a command.
bash_case allow "grep -rn patch src"
bash_case allow "rg tee skills"
bash_case allow "npm version patch"
bash_case allow "git log --grep apply"
bash_case allow "git log -- restore.md"
bash_case deny "ls; patch -p1 < fix.diff"
bash_case deny "(tee NOTES.md)"
bash_case deny "true && git apply fix.diff"
# The heredoc closes only on a line that is exactly the delimiter.
bash_case allow "git commit -m \"\$(cat <<'EOF'
EOF handling fixed; it's \"a > b\" now
EOF
)\""
# git restore --staged only touches the index.
bash_case allow "git restore --staged vite.config.ts"
bash_case deny "git restore -- vite.config.ts"

echo "== memory writes"
mem=$home/.claude/projects/-Users-x-proj/memory
mkdir -p "$mem" "$home/.claude/skills/ross-mode" "$home/elsewhere"
touch "$mem/MEMORY.md"
ln -s "$home/elsewhere" "$mem/link"
# write <allow|deny> <tool> <file_path>: Write/Edit in the write session with HOME=$home.
write() { HOME=$home check "$2 ${3#$home/}" "$1" "$(event write "$2" "$(jq -nc --arg p "$3" '{file_path:$p,content:"x",old_string:"a",new_string:"b"}')")"; }
write allow Write "$mem/new-fact.md"
write allow Edit  "$mem/MEMORY.md"
write deny  MultiEdit "$mem/MEMORY.md"
write deny  Write "$home/.claude/skills/ross-mode/x.md"
write deny  Write "$mem/../../../x.md"
write deny  Write "$mem/link/x.md"
write deny  Write "$home/.claude/projects/-Users-x-proj/notes.md"
write deny  Write "memory/x.md"
ln -s "$home/elsewhere/target.md" "$mem/evil.md"
write deny  Write "$mem/evil.md"
HOME=$home check "memory Write while scouts pending: Read investigation.md" allow \
  "$(event memscout Read "$(jq -nc --arg p "$skill_dir/playbooks/investigation.md" '{file_path:$p}')")"
HOME=$home check "memory Write while scouts pending: TaskCreate" allow "$(event memscout TaskCreate "$(declared investigation s)")"
HOME=$home check "memory Write while scouts pending: Write" allow \
  "$(event memscout Write "$(jq -nc --arg p "$mem/new-fact.md" '{file_path:$p,content:"x"}')")"
# reason <bash command>: the deny reason the hook gives in the write session.
reason() { printf '%s' "$(event write Bash "$(jq -nc --arg c "$1" '{command:$c}')")" | "$hook" | jq -r '.hookSpecificOutput.permissionDecisionReason'; }
if [[ $(reason 'echo x >> ~/.claude/projects/p/memory/MEMORY.md') == *" For memory files, use Write or Edit." ]]
then echo "PASS  Bash memory write: deny points to Write or Edit"
else echo "FAIL  Bash memory write: deny points to Write or Edit"; fails=$((fails + 1)); fi
if [[ $(reason 'echo x > a.md') != *"For memory files"* ]]
then echo "PASS  Bash non-memory write: no memory hint"
else echo "FAIL  Bash non-memory write: no memory hint"; fails=$((fails + 1)); fi
if [[ $(reason "echo x > \"$mem/a.md\"") == *"For memory files"* ]]
then echo "PASS  Bash quoted memory redirect: deny gives the memory hint"
else echo "FAIL  Bash quoted memory redirect: deny gives the memory hint"; fails=$((fails + 1)); fi
bash_case deny  "git restore --staged --worktree a.ts"
bash_case deny  "git restore --staged -W a.ts"
bash_case allow "git restore -S a.ts"
bash_case allow "git restore --staged a.ts"
bash_case allow "cp a.ts /tmp/a.ts 2>&1"
bash_case deny  "cp /tmp/a.ts src/a.ts 2>&1"

echo "== scout-first playbooks"
# read <session> <playbook>: a Read of a playbook in the skill dir.
read_pb() { event "$1" Read "$(jq -nc --arg p "$skill_dir/playbooks/$2" '{file_path:$p}')"; }
# agent <session> <prompt>: a mcp__paseo__create_agent call.
agent() { event "$1" mcp__paseo__create_agent "$(jq -nc --arg p "$2" '{title:"t",initialPrompt:$p}')"; }
explore='{"command":"cd \"/home/me/My Projects/web-app\" && ls && cat package.json | head -60 && git ls-files | grep -iE '"'auth|login'"' | head -100"}'
check "Read investigation.md"    allow "$(read_pb scout investigation.md)"
check "TaskCreate"               allow "$(event scout TaskCreate "$(declared investigation s)")"
check "Bash before scout (replay)" deny "$(event scout Bash "$explore")"
check "Read outside skill dir before scout" deny "$(event scout Read '{"file_path":"/etc/hosts"}')"
check "list_profiles before scout" allow "$(event scout mcp__paseo__list_profiles '{}')"
# scout_bash <allow|deny> <command>: a Bash call while scouts are pending.
scout_bash() { check "pending Bash: ${2%%$'\n'*}" "$1" "$(event scout Bash "$(jq -nc --arg c "$2" '{command:$c}')")"; }
scout_bash allow 'cd "/home/me/My Projects/skills-repo" && gh issue view 6 --comments'
scout_bash allow 'cd "/home/me/My Projects/skills-repo" && gh issue view 5 2>&1; echo "exit=$?"; gh issue view 5 --json number,title,state'
scout_bash allow 'gh pr view 11 --comments'
scout_bash deny  'gh issue view 6 && cat src/a.ts'
scout_bash deny  'gh api repos/x/y/pulls/1/comments'
scout_bash deny  'echo "$(cat src/a.ts)"'
scout_bash deny  'gh issue view 6 & cat src/a.ts'
check "create_agent worker"      allow "$(agent scout 'Follow the role brief in /x/agents/ross-worker.md.')"
check "Bash after worker only"   deny  "$(event scout Bash "$explore")"
check "create_agent scout"       allow "$(agent scout 'Follow the role brief in /x/agents/ross-scout.md.')"
check "Bash after scout"         allow "$(event scout Bash "$explore")"
check "Read investigation.md again" allow "$(read_pb scout investigation.md)"
check "Bash after re-read"       allow "$(event scout Bash "$explore")"
check "msg: Read investigation.md" allow "$(read_pb msg investigation.md)"
check "msg: TaskCreate"          allow "$(event msg TaskCreate "$(declared investigation s)")"
check "msg: Bash gated"          deny  "$(event msg Bash '{"command":"ls"}')"
if printf '%s' "$(event msg Bash '{"command":"ls"}')" | "$hook" | grep -q 'Meanwhile you can Read AGENTS.md, CLAUDE.md and the files they @-import, and only cd, echo, gh issue|pr view|list, git fetch without options, and ~/.claude/skills/ross-mode/scripts/log.sh run in Bash (no pipes).'
then echo "PASS  msg: deny says what's allowed meanwhile"
else echo "FAIL  msg: deny says what's allowed meanwhile"; fails=$((fails + 1)); fi

# The first TaskCreate declares the playbook; that alone decides the gate.
check "nometa: TaskCreate"       deny  "$(event nometa TaskCreate '{"subject":"s","description":"s"}')"
r=$(printf '%s' "$(event nometa TaskCreate '{"subject":"s"}')" | "$hook" | jq -r '.hookSpecificOutput.permissionDecisionReason')
if [[ $r == *'"playbook"'* && $r == *none* ]]
then echo "PASS  nometa: deny names the metadata fix"
else echo "FAIL  nometa: deny names the metadata fix"; fails=$((fails + 1)); fi
for pb in autonomous-run nope ../feature; do
  check "declare $pb: TaskCreate" deny "$(event "bad-${pb//\//_}" TaskCreate "$(declared "$pb" s)")"
done
for pb in investigation feature correction verification-skill verification-upkeep; do
  check "$pb: TaskCreate"        allow "$(event "gate-$pb" TaskCreate "$(declared "$pb" s)")"
  check "$pb: Bash gated"        deny  "$(event "gate-$pb" Bash '{"command":"ls"}')"
done
for pb in bug-fix opening-a-pr setup cleanup none; do
  check "$pb: TaskCreate"        allow "$(event "free-$pb" TaskCreate "$(declared "$pb" s)")"
  check "$pb: Bash not gated"    allow "$(event "free-$pb" Bash '{"command":"ls"}')"
done
check "read-after: TaskCreate feature" allow "$(event ra-f TaskCreate "$(declared feature s)")"
check "read-after: Read bug-fix.md" allow "$(read_pb ra-f bug-fix.md)"
check "read-after: Bash still gated" deny "$(event ra-f Bash '{"command":"ls"}')"
check "read-after: TaskCreate bug-fix" allow "$(event ra-b TaskCreate "$(declared bug-fix s)")"
check "read-after: Read feature.md" allow "$(read_pb ra-b feature.md)"
check "read-after: Bash still not gated" allow "$(event ra-b Bash '{"command":"ls"}')"
check "pending: git fetch"       allow "$(event gate-feature Bash '{"command":"git fetch origin main"}')"
check "pending: log.sh"          allow "$(event gate-feature Bash '{"command":"~/.claude/skills/ross-mode/scripts/log.sh s p d w e r"}')"
# The form decision-log.md documents, before and after a scout launches.
log_cmd='~/.claude/skills/ross-mode/scripts/log.sh my-run fix "worker added the check" "the repro showed a 403" "commit 7c21e0a" open'
check "pending: documented log.sh"     allow "$(event gate-feature Bash "$(jq -nc --arg c "$log_cmd" '{command:$c}')")"
check "after scout: documented log.sh" allow "$(event scout Bash "$(jq -nc --arg c "$log_cmd" '{command:$c}')")"
check "pending: git log"         deny  "$(event gate-feature Bash '{"command":"git log"}')"
check "pending: git fetch --upload-pack" deny "$(event gate-feature Bash '{"command":"git fetch --upload-pack=x ."}')"
check "pending: git fetch -q"    deny  "$(event gate-feature Bash '{"command":"git fetch -q origin"}')"
check "pending: /tmp log.sh"     deny  "$(event gate-feature Bash '{"command":"/tmp/ross-mode/scripts/log.sh a b"}')"
check "pending: Read AGENTS.md"  allow "$(event gate-feature Read "$(jq -nc --arg p "$skill_dir/../../AGENTS.md" '{file_path:$p}')")"
mkdir -p "$TMPDIR/home" && echo "# Claude" >"$TMPDIR/home/CLAUDE.md"
check "pending: Read CLAUDE.md"  allow "$(event gate-feature Read "$(jq -nc --arg p "$TMPDIR/home/CLAUDE.md" '{file_path:$p}')")"
check "pending: Read /etc/hosts" deny  "$(event gate-feature Read '{"file_path":"/etc/hosts"}')"
# A symlink named AGENTS.md is judged by what it points to, and only Read gets the AGENTS.md allowance.
mkdir -p "$TMPDIR/code" "$TMPDIR/link"
echo "export const a = 1" >"$TMPDIR/code/a.ts"
ln -s "$TMPDIR/code/a.ts" "$TMPDIR/link/AGENTS.md"
check "pending: Read AGENTS.md symlink to code" deny "$(event gate-feature Read "$(jq -nc --arg p "$TMPDIR/link/AGENTS.md" '{file_path:$p}')")"
check "pending: Glob AGENTS.md path" deny "$(event gate-feature Glob "$(jq -nc --arg p "$skill_dir/../../AGENTS.md" '{pattern:"*",path:$p}')")"
check "pending: Grep AGENTS.md path" deny "$(event gate-feature Grep "$(jq -nc --arg p "$skill_dir/../../AGENTS.md" '{pattern:"x",path:$p}')")"
# files that AGENTS.md or CLAUDE.md @-import, transitively, are readable too; nothing else is.
imp="$TMPDIR/imp-repo"
mkdir -p "$imp/docs" "$imp/src" "$TMPDIR/imp-shared" "$TMPDIR/imp-link"
printf '# Claude\n\n@AGENTS.md\n@docs/base.md\n' >"$imp/CLAUDE.md"
cat >"$imp/AGENTS.md" <<'EOF'
# AGENTS.md

Branch rules live in @docs/rules.md, read them.
Questions go to ross@example.com.
Never import `@docs/code-span.md` from here.

```
@docs/fenced.md
```

@../imp-shared/team.md
EOF
printf '# Rules\n\n@nested.md\n' >"$imp/docs/rules.md"
printf '# Nested\n\n@rules.md\n' >"$imp/docs/nested.md"
for f in docs/base.md docs/code-span.md docs/fenced.md docs/other.md; do printf '# %s\n' "$f" >"$imp/$f"; done
echo "export const a = 1" >"$imp/src/a.ts"
printf '# Team\n' >"$TMPDIR/imp-shared/team.md"
ln -s "$imp/src/a.ts" "$TMPDIR/imp-link/base.md"
check "imports: TaskCreate feature" allow "$(event imp TaskCreate "$(declared feature s)")"
# imp_read <allow|deny> <file_path> [cwd]: a Read while scouts are pending.
imp_read() { check "imports: Read ${2#"$TMPDIR/"}${3:+ (cwd ${3#"$TMPDIR/"})}" "$1" "$(EVENT_CWD=$3 event imp Read "$(jq -nc --arg p "$2" '{file_path:$p}')")"; }
imp_read allow "$imp/docs/base.md"
imp_read allow "$imp/docs/rules.md"
imp_read allow "$imp/docs/nested.md"
imp_read allow "$TMPDIR/imp-shared/team.md" "$imp"
imp_read allow docs/rules.md "$imp"
# docs/other.md walks the rules.md <-> nested.md cycle without finding itself, so this also proves it ends.
imp_read deny "$imp/docs/other.md"
imp_read deny "$imp/src/a.ts"
imp_read deny "$imp/docs/code-span.md"
imp_read deny "$imp/docs/fenced.md"
imp_read deny "$TMPDIR/imp-link/base.md"
check "imports: Glob docs/base.md" deny "$(event imp Glob "$(jq -nc --arg p "$imp/docs/base.md" '{pattern:"*",path:$p}')")"
check "imports: Grep docs/base.md" deny "$(event imp Grep "$(jq -nc --arg p "$imp/docs/base.md" '{pattern:"x",path:$p}')")"
check "pending: cd quoted path && git fetch" allow "$(event gate-feature Bash '{"command":"cd \"/a b/c\" && git fetch origin main"}')"
if printf '%s' "$(event gate-feature Bash '{"command":"ls"}')" | "$hook" | grep -q 'you declared feature'
then echo "PASS  deny names the declared playbook"
else echo "FAIL  deny names the declared playbook"; fails=$((fails + 1)); fi
check "second TaskCreate, no metadata" allow "$(event gate-feature TaskCreate '{"subject":"s","description":"s"}')"

echo "== replays of past mistakes"
# Each replays a session an old hook got wrong. Every TaskCreate declares its playbook in metadata.
# step_text <playbook> <n>: step n of the playbook, as written.
step_text() { grep -m1 "^$2\. " "$skill_dir/playbooks/$1"; }
# bc26db7: Autonomous run hands the gate to the work playbook read after TaskCreate.
check "replay-bc26db7: Read autonomous-run.md" allow "$(read_pb r-a autonomous-run.md)"
check "replay-bc26db7: TaskCreate"   allow "$(event r-a TaskCreate "$(declared feature "$(step_text autonomous-run.md 1)")")"
check "replay-bc26db7: Read feature.md" allow "$(read_pb r-a feature.md)"
check "replay-bc26db7: Bash gated"   deny  "$(event r-a Bash '{"command":"ls"}')"
# 4e32875: the hand-off ends at the first work playbook, even one read before TaskCreate.
check "replay-4e32875: Read autonomous-run.md" allow "$(read_pb r-b autonomous-run.md)"
check "replay-4e32875: Read bug-fix.md" allow "$(read_pb r-b bug-fix.md)"
check "replay-4e32875: TaskCreate"   allow "$(event r-b TaskCreate "$(declared bug-fix "$(step_text bug-fix.md 1)")")"
check "replay-4e32875: Read feature.md" allow "$(read_pb r-b feature.md)"
check "replay-4e32875: Bash not gated" allow "$(event r-b Bash '{"command":"ls"}')"
# peeking at a scout-first playbook, then choosing none, doesn't gate.
check "replay-16: Read feature.md"   allow "$(read_pb r-c feature.md)"
check "replay-16: TaskCreate"        allow "$(event r-c TaskCreate "$(declared none 'Fix the typo in README')")"
check "replay-16: Bash not gated"    allow "$(event r-c Bash '{"command":"ls"}')"
# a paraphrased todo still follows the declared playbook.
check "replay-38-paraphrase: Read feature.md" allow "$(read_pb r-d feature.md)"
check "replay-38-paraphrase: TaskCreate" allow "$(event r-d TaskCreate "$(declared feature 'Send scouts to map the code this change touches')")"
check "replay-38-paraphrase: Bash gated" deny "$(event r-d Bash '{"command":"ls"}')"
# the declared playbook decides, not the last one read. It copies step 2: step 1 of both
# playbooks shares its first six words, which would keep the gate by luck.
check "replay-38-two-reads: Read feature.md" allow "$(read_pb r-e feature.md)"
check "replay-38-two-reads: Read investigation.md" allow "$(read_pb r-e investigation.md)"
check "replay-38-two-reads: TaskCreate" allow "$(event r-e TaskCreate "$(declared feature "$(step_text feature.md 2)")")"
check "replay-38-two-reads: Bash gated" deny "$(event r-e Bash '{"command":"ls"}')"

echo "== each playbook file says whether it starts with scouts"
# scouts_line <file>: the file's one "Starts with scouts: yes|no." line, or nothing if it has none or several.
scouts_line() { local l; l=$(grep -E '^Starts with scouts: (yes|no)\.$' "$1"); [[ $l != *$'\n'* ]] && printf '%s' "$l"; }
for f in "$skill_dir"/playbooks/*.md; do
  pb=$(basename "$f" .md)
  [[ $pb == autonomous-run ]] && continue
  n=$(grep -cE '^Starts with scouts: (yes|no)\.$' "$f")
  if [[ $n == 1 ]]; then echo "PASS  $pb.md is classified"
  else echo "FAIL  $pb.md is classified ($n lines, want 1)"; fails=$((fails + 1)); fi
  check "file-$pb: TaskCreate" allow "$(event "file-$pb" TaskCreate "$(declared "$pb" s)")"
  case $(scouts_line "$f") in
    *yes.) check "file-$pb: says yes, Bash gated"   deny  "$(event "file-$pb" Bash '{"command":"ls"}')" ;;
    *no.)  check "file-$pb: says no, Bash not gated" allow "$(event "file-$pb" Bash '{"command":"ls"}')" ;;
    *) echo "FAIL  file-$pb: $pb.md is unclassified, so the gate can't be checked"; fails=$((fails + 1)) ;;
  esac
done

# A fixture skill: a new playbook gets its gate from its own line, with no hook edit.
fixture="$TMPDIR/fixture-skill"
mkdir -p "$fixture/hooks" "$fixture/playbooks"
cp "$hook" "$fixture/hooks/require-tasklist.sh"
printf '# Fixture scouts\n\nStarts with scouts: yes.\n' > "$fixture/playbooks/fixture-scouts.md"
printf '# Fixture free\n\nStarts with scouts: no.\n' > "$fixture/playbooks/fixture-free.md"
printf '# Fixture unmarked\n' > "$fixture/playbooks/fixture-unmarked.md"
for pb in fixture-scouts:deny fixture-free:allow fixture-unmarked:deny; do
  hook=$fixture/hooks/require-tasklist.sh check "${pb%:*}: TaskCreate" allow "$(event "${pb%:*}" TaskCreate "$(declared "${pb%:*}" s)")"
  hook=$fixture/hooks/require-tasklist.sh check "${pb%:*}: Bash" "${pb#*:}" "$(event "${pb%:*}" Bash '{"command":"ls"}')"
done

echo "== cleanup: the lead runs every command the playbook names"
check "cleanup: TaskCreate"      allow "$(event cleanup TaskCreate "$(declared cleanup 'Snapshot and audit')")"
check "cleanup: no scout gate"   allow "$(event cleanup Read '{"file_path":"/etc/hosts"}')"
while IFS= read -r c; do
  check "cleanup: Bash: $c" allow "$(event cleanup Bash "$(jq -nc --arg c "$c" '{command:$c}')")"
done <<'CMDS'
~/.claude/skills/ross-mode/scripts/worktree-audit.sh -b origin/develop "/home/me/My Projects/admin-app"
git fetch origin
df -h /
du -sh "$PASEO_HOME/worktrees"
paseo agent ls -g --json
git -C /x diff
git log --oneline b --not --remotes
git worktree remove /x
git branch -D b
git ls-remote --heads origin b
git push origin --delete b
git worktree prune
paseo workspace ls --json
gh pr view 1
git -C /x status --porcelain --ignored
git push --force-with-lease=b:abc origin --delete b
git worktree remove --force /x
git log --oneline abc..origin/b
CMDS
check "cleanup: archive_workspace" allow "$(event cleanup mcp__paseo__archive_workspace '{"workspaceId":"wks_1"}')"

echo "== babysit: the lead runs every command the playbook names"
check "babysit: TaskCreate"      allow "$(event babysit TaskCreate "$(declared babysit 'Find the PR and read its state')")"
check "babysit: no scout gate"   allow "$(event babysit Read '{"file_path":"/etc/hosts"}')"
while IFS= read -r c; do
  check "babysit: Bash: $c" allow "$(event babysit Bash "$(jq -nc --arg c "$c" '{command:$c}')")"
done <<'CMDS'
gh pr view --json number,url,headRefName,baseRefName
gh pr view 12 --json state,mergeable,mergeStateStatus,reviewDecision,headRefOid
gh pr checks 12 --json name,bucket,link
gh pr checks 12 --watch --fail-fast
gh run list --commit 0123abc --json databaseId,status
gh run watch 123
gh run view 123 --log-failed
gh run rerun 123
gh pr view 12 --comments
gh api graphql --paginate -F owner=rossyanez -F repo=skills-repo -F pr=12 -f query='query($owner:String!,$repo:String!,$pr:Int!,$endCursor:String){repository(owner:$owner,name:$repo){pullRequest(number:$pr){reviewThreads(first:100,after:$endCursor){pageInfo{hasNextPage endCursor} nodes{id isResolved first:comments(first:1){nodes{databaseId path line body author{login}}} last:comments(last:1){nodes{author{login} body}}}}}}}'
gh api repos/{owner}/{repo}/contents/.github/workflows
git push
CMDS
check "babysit: Bash: reply heredoc" allow "$(event babysit Bash "$(jq -nc --arg c "$(printf '%s\n' "gh api --method POST repos/{owner}/{repo}/pulls/12/comments/456/replies -F body=@- <<'EOF'" "Not a bug: the caller's check at x.sh:12 rejects it." EOF)" '{command:$c}')")"
check "babysit: Bash: reply heredoc" allow "$(event babysit Bash "$(jq -nc --arg c "$(printf '%s\n' "gh pr comment 12 --body-file - <<'EOF'" "Fixed in abc1234. It's covered by test.sh." EOF)" '{command:$c}')")"

echo "== interrogate: the lead runs every command the playbook names"
check "interrogate: TaskCreate"  allow "$(event interrogate TaskCreate "$(declared interrogate 'Read the diff and the PR')")"
check "interrogate: no scout gate" allow "$(event interrogate Read '{"file_path":"/etc/hosts"}')"
while IFS= read -r c; do
  check "interrogate: Bash: $c" allow "$(event interrogate Bash "$(jq -nc --arg c "$c" '{command:$c}')")"
done <<'CMDS'
git diff origin/main...HEAD
git log --oneline origin/main..HEAD
gh pr view 12 --json title,body
CMDS

echo "== blast-radius: starts with scouts"
check "blast-radius: TaskCreate" allow "$(event blast-radius TaskCreate "$(declared blast-radius 'Send scouts to map the callers')")"
check "blast-radius: Bash gated" deny  "$(event blast-radius Bash '{"command":"ls"}')"

echo "== autonomous-run step 9 hands red CI to Babysit"
s9=$(step_text autonomous-run.md 9)
if [[ $s9 == *playbooks/babysit.md* && $s9 != *"go back to step 4"* ]]
then echo "PASS  autonomous-run step 9 hands red CI to babysit.md"
else echo "FAIL  autonomous-run step 9 hands red CI to babysit.md"; fails=$((fails + 1)); fi

echo "== a task goes in_progress before completed"
check "done: TaskCreate"         allow "$(event done TaskCreate "$(declared none s)")"
check "done: completed, never started" deny "$(event done TaskUpdate '{"taskId":"1","status":"completed"}')"
check "done: in_progress"        allow "$(event done TaskUpdate '{"taskId":"2","status":"in_progress"}')"
check "done: completed after in_progress" allow "$(event done TaskUpdate '{"taskId":"2","status":"completed"}')"
check "done: completed with skip:" allow "$(event done TaskUpdate '{"taskId":"3","status":"completed","description":"skip: covered by step 4"}')"
check "done: completed with n/a:" allow "$(event done TaskUpdate '{"taskId":"4","status":"completed","description":"n/a: one worker"}')"
check "done: skip: not at the start" deny "$(event done TaskUpdate '{"taskId":"5","status":"completed","description":"did it, no skip: here"}')"
check "done: no taskId fails open" allow "$(event done TaskUpdate '{"status":"completed"}')"
check "done: deleted, never started" allow "$(event done TaskUpdate '{"taskId":"7","status":"deleted"}')"
out=$(printf '%s' "$(event done TaskUpdate '{"taskId":"1","status":"completed"}')" | "$hook")
if grep -qF 'task #1' <<<"$out" && grep -qF 'skip:' <<<"$out"
then echo "PASS  completed deny names the task and skip:"
else echo "FAIL  completed deny names the task and skip:"; fails=$((fails + 1)); fi
check "done-x: TaskCreate"       allow "$(event done-x TaskCreate "$(declared none s)")"
check "done-y: TaskCreate"       allow "$(event done-y TaskCreate "$(declared none s)")"
check "done-x: in_progress"      allow "$(event done-x TaskUpdate '{"taskId":"6","status":"in_progress"}')"
check "done-y: completed, started in another session" deny "$(event done-y TaskUpdate '{"taskId":"6","status":"completed"}')"
check "done-scout: TaskCreate feature" allow "$(event done-scout TaskCreate "$(declared feature s)")"
check "done-scout: completed, never started" deny "$(event done-scout TaskUpdate '{"taskId":"1","status":"completed"}')"
check "done-scout: in_progress"  allow "$(event done-scout TaskUpdate '{"taskId":"1","status":"in_progress"}')"
check "done-scout: completed after in_progress" allow "$(event done-scout TaskUpdate '{"taskId":"1","status":"completed"}')"
if (( $(id -u) == 0 )); then echo "SKIP  unwritable marker dir after TaskCreate (root ignores chmod)"
else
  check "done-ro: TaskCreate"      allow "$(event done-ro TaskCreate "$(declared none s)")"
  chmod 555 "$TMPDIR/ross-mode"
  check "done-ro: in_progress, marker dir unwritable" allow "$(event done-ro TaskUpdate '{"taskId":"1","status":"in_progress"}')"
  check "done-ro: completed, marker dir unwritable" allow "$(event done-ro TaskUpdate '{"taskId":"1","status":"completed"}')"
  chmod 755 "$TMPDIR/ross-mode"
fi

echo "== session isolation"
check "A: TaskCreate"            allow "$(event iso-a TaskCreate "$(declared none s)")"
check "A: Bash"                  allow "$(event iso-a Bash '{"command":"ls"}')"
check "B: Bash still blocked"    deny  "$(event iso-b Bash '{"command":"ls"}')"

echo "== fail open"
check "malformed stdin"          allow 'not json {'
check "empty stdin"              allow ''
check "missing session_id"       allow '{"tool_name":"Bash","tool_input":{"command":"ls"}}'
TMPDIR=/dev/null check "unwritable marker dir" allow "$(event ro Bash '{"command":"ls"}')"

echo
if (( fails )); then echo "$fails FAILED"; exit 1; fi
echo "all passed"
