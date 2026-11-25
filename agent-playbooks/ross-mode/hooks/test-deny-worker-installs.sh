#!/bin/bash
# Pipes PreToolUse fixtures into deny-worker-installs.sh and checks allow/deny.
# Usage: hooks/test-deny-worker-installs.sh
# HOOK=<path> runs it against another hook.

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
hook=${HOOK:-$here/deny-worker-installs.sh}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
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

# event <transcript> <tool> <tool_input-json>
event() {
  jq -nc --arg p "$1" --arg t "$2" --argjson i "$3" \
    '{session_id:"s1", transcript_path:$p, cwd:"/tmp", hook_event_name:"PreToolUse", tool_name:$t, tool_input:$i, tool_use_id:"toolu_1"}'
}

# bash_case <transcript> <allow|deny> <command>
bash_case() { check "${1##*/}: $3" "$2" "$(event "$1" Bash "$(jq -nc --arg c "$3" '{command:$c}')")"; }

# transcript <file> <first-user-content-json> [<second-user-content-json>]: queue-operation lines, then user entries.
transcript() {
  local f=$tmp/$1; shift
  {
    echo '{"type":"queue-operation","operation":"enqueue","timestamp":"2026-10-23T00:00:00Z"}'
    echo '{"type":"queue-operation","operation":"dequeue","timestamp":"2026-10-23T00:00:00Z"}'
    for c in "$@"; do
      jq -nc --argjson c "$c" '{type:"user",message:{role:"user",content:$c},uuid:"u"}'
      echo '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"ok"}]}}'
    done
  } >"$f"
  echo "$f"
}

worker_text=$'Follow the role brief in ~/project/agents/ross-worker.md.\n\nRepo: /x. Do the thing.'
worker=$(transcript worker "$(jq -nc --arg t "$worker_text" '[{type:"text",text:$t}]')")
worker_str=$(transcript worker-string "$(jq -nc --arg t "$worker_text" '$t')")
lead=$(transcript lead "$(jq -nc '[{type:"text",text:"<command-message>ross-mode</command-message>\n<command-name>/ross-mode</command-name>\nLaunch a worker with: Follow the role brief in ~/project/agents/ross-worker.md."}]')")
own=$(transcript own "$(jq -nc '[{type:"text",text:"Can you check which wget version I have?"}]')")
second=$(transcript second-user "$(jq -nc '[{type:"text",text:"Hi there."}]')" "$(jq -nc --arg t "$worker_text" '[{type:"text",text:$t}]')")
# first_line <text>: user content, one text block whose first line is <text>.
first_line() { jq -nc --arg t "$1"$'\n\nRepo: /x.' '[{type:"text",text:$t}]'; }
worker_more=$(transcript worker-more "$(first_line 'Follow the role brief in /x/agents/ross-worker.md. Read and apply `/x/fix-root-causes.md`.')")
worker_comma=$(transcript worker-comma "$(first_line 'Follow the role brief in /x/agents/ross-worker.md, with one explicit exception from the lead.')")
reviewer=$(transcript reviewer "$(first_line 'Follow the role brief in /x/agents/ross-reviewer.md. See /x/agents/ross-worker.md.')")
# enveloped <prompt>: user content as Paseo delivers a prompt one agent sends another.
enveloped() {
  jq -nc --arg t $'<paseo-system version="1" kind="agent-message" source-agent-id="a" message-id="m" source-agent-title="t">\n'"$1"$'\n</paseo-system>' \
    '[{type:"text",text:$t}]'
}
owner_text='Load ross-mode first. Read ~/.claude/skills/ross-mode/SKILL.md in full and follow it as the /ross-mode skill for the task below, exactly as if Ross had typed /ross-mode, including its playbook choice and todo list.'
env_worker=$(transcript env-worker "$(enveloped "$worker_text")")
env_owner=$(transcript env-owner "$(enveloped "$owner_text"$'\n\nRun the plan.')")
env_slash=$(transcript env-slash "$(enveloped '/ross-mode run the plan')")

dry_runs=('brew install --dry-run wget' 'npm i -g --dry-run left-pad' 'pip install --dry-run requests')

echo "== worker session: installs denied"
for c in "${dry_runs[@]}" 'brew uninstall wget' 'npm install --global x' 'npm -g i x' 'pip3 install x' \
  'python3 -m pip install x' 'cd x && brew install y' '/opt/homebrew/bin/brew install y' 'FOO=1 brew install y' \
  'sudo pip install x' 'true; npm i -g x' 'arch -arm64 brew install x'; do
  bash_case "$worker" deny "$c"
done

echo "== worker session: substitutions inside double quotes still run"
for c in 'out="$(pip install x 2>&1)"' 'echo "$(brew install x)"' 'echo "`npm i -g x`"'; do
  bash_case "$worker" deny "$c"
done

echo "== worker session: shell keywords and wrappers before the command"
for c in 'for p in a b; do pip install $p; done' 'if true; then brew install x; fi' '{ brew install x; }' \
  'time brew install x' 'nohup pip install x' 'xargs brew install < list' 'sudo -H pip install x' \
  'env -i brew install x' '! brew install x' 'if true; then :; else brew install x; fi' 'exec brew install x' \
  'command pip install x' 'if brew install x; then :; fi' 'while pip install x; do :; done' \
  'if true; then :; elif brew install x; then :; fi' 'echo "\\$(pip install x)"' 'echo "a\"b $(pip install x)"'; do
  bash_case "$worker" deny "$c"
done

echo "== worker session: everything else allowed"
for c in 'npm install' 'npm i left-pad' 'npm ci' 'brew list' 'brew info wget' 'pip list' \
  'docker build .' 'done_flag=1 dotnet build' 'thenable && elsewhere' 'until false; do brew info x; done' \
  'iffy_tool --run' 'untilted build' \
  'echo "brew install wget"' "grep -r 'pip install' ."; do
  bash_case "$worker" allow "$c"
done
echo "== worker session: quoted text and heredoc bodies ignored"
for c in 'git commit -m "a; brew install wget"' "grep -E 'npm i -g|brew install x' ." \
  "perl -0pi -e 's/x/true; npm i -g x/' f" $'cat > f <<\'EOF\'\npip install x\nEOF' \
  $'git commit -m "$(cat <<\'EOF\'\npip install x\nEOF\n)"' $'cat <<\\EOF > f\npip install x\nEOF' \
  'git commit -m "Deny \`brew install wget\` in workers"' \
  'gh pr create --title x --body "Blocks \`pip install x\` and \`npm i -g y\`"' 'echo "Price: \$(pip install x)"'; do
  bash_case "$worker" allow "$c"
done
# A worker merges when its handover says to (Arena step 6), so the install guard must not catch it.
bash_case "$worker" allow 'git merge origin/main'
check "worker: Edit" allow "$(event "$worker" Edit '{"file_path":"/tmp/x","old_string":"a","new_string":"b"}')"

echo "== worker session, string content"
bash_case "$worker_str" deny 'brew install wget'

echo "== worker sentence with more text on its first line"
bash_case "$worker_more" deny 'brew install wget'
bash_case "$worker_comma" deny 'brew install wget'

echo "== reviewer sentence that mentions ross-worker.md later on its line"
bash_case "$reviewer" allow 'brew install wget'

echo "== Paseo agent-message envelope: the line after the opening tag counts"
bash_case "$env_worker" deny 'brew install wget'
bash_case "$env_owner" allow 'brew install wget'
bash_case "$env_slash" allow 'brew install wget'

echo "== lead, Ross's own session, worker sentence only in the second user entry"
for t in "$lead" "$own" "$second"; do
  for c in "${dry_runs[@]}"; do bash_case "$t" allow "$c"; done
done

echo "== fail open"
bash_case /dev/null allow 'brew install wget'
bash_case "$tmp/missing.jsonl" allow 'brew install wget'
printf 'not json {\n' >"$tmp/bad.jsonl"
bash_case "$tmp/bad.jsonl" allow 'brew install wget'
check "malformed stdin" allow 'not json {'

echo
if (( fails )); then echo "$fails FAILED"; exit 1; fi
echo "all passed"
