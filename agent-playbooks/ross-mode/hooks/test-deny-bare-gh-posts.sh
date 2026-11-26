#!/bin/bash
# Pipes PreToolUse fixtures into deny-bare-gh-posts.sh and checks allow/deny, then runs its --scan mode
# on fixture directories.
# Usage: hooks/test-deny-bare-gh-posts.sh
# HOOK=<path> runs it against another hook.

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
hook=${HOOK:-$here/deny-bare-gh-posts.sh}
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

# event <tool> <tool_input-json>
event() {
  jq -nc --arg t "$1" --argjson i "$2" \
    '{session_id:"s1", transcript_path:"/tmp/none.jsonl", cwd:"/tmp", hook_event_name:"PreToolUse", tool_name:$t, tool_input:$i, tool_use_id:"toolu_1"}'
}

# bash_case <allow|deny> <command>
bash_case() { check "$2" "$1" "$(event Bash "$(jq -nc --arg c "$2" '{command:$c}')")"; }

echo "== bare posting commands denied"
for v in comment create edit close reopen review lock unlock; do
  bash_case deny "gh issue $v 1"
  bash_case deny "gh pr $v 1"
done
for c in 'gh api -X POST repos/x/y/issues/1/comments' 'gh api --method PATCH repos/x/y/issues/1' \
  'gh api --method=DELETE repos/x/y/issues/1/labels/bug' 'gh api -X PUT repos/x/y/issues/1/lock' \
  'gh api repos/x/y/issues/1/comments -f body=hi' 'gh api repos/x/y/issues/1/comments -F body=@-' \
  'gh api repos/x/y/issues/1 --input body.json' 'gh api repos/x/y/issues/1/comments --raw-field "body=hi"' \
  'cd x && gh pr comment 1 --body hi' 'url=$(gh issue create --title t --body-file f)' \
  '/opt/homebrew/bin/gh pr comment 1 --body hi' 'GH_REPO=o/r gh issue close 1'; do
  bash_case deny "$c"
done
echo "== a repo flag before the verb"
for c in 'gh issue -R o/r comment 5 --body hi' 'gh pr --repo o/r comment 5 --body hi' \
  'gh pr --repo=o/r comment 5 --body hi' "gh issue -R 'o/r' close 5"; do
  bash_case deny "$c"
done
echo "== attached field flags"
for c in 'gh api repos/x/y/issues/1/comments -fbody=hi' 'gh api repos/x/y/issues/1/comments -Fbody=@f'; do
  bash_case deny "$c"
done
echo "== timeout before the command"
for c in 'timeout 60 gh pr comment 5 -b x' 'timeout -s KILL 5 gh issue close 1' \
  'timeout --signal=KILL 2.5s gh pr comment 1 -b x' 'timeout -k 5 60 gh api -X POST repos/x/y/issues/1/comments'; do
  bash_case deny "$c"
done
out=$(event Bash '{"command":"gh pr comment 1 --body hi"}' | "$hook" | jq -r .hookSpecificOutput.permissionDecisionReason)
want="Blocked (gh issue/pr post): post to GitHub as Ross only with ~/.claude/skills/ross-mode/scripts/gh-post.sh, which checks the item is Ross's first. If the item isn't Ross's, don't post; tell Ross in your reply."
if [[ $out == "$want" ]]; then echo "PASS  the deny reason names gh-post.sh"
else echo "FAIL  the deny reason: $out"; fails=$((fails + 1)); fi

echo "== reads, merges and the scripts allowed"
for c in 'gh pr view 1' 'gh issue list' 'gh pr merge 1 --squash' 'gh pr checks 1' 'gh api repos/x/y/pulls/1' \
  'gh api -X GET search/issues -f q=x' 'gh api --method GET search/issues -f q=x' \
  'gh api -X GET search/issues -fq=x' "gh api repos/x/y/pulls/1 -H 'Accept: x' -q .title" \
  'gh api repos/x/y/pulls/1 --jq .body --paginate' 'gh pr create-fill' 'gh pr view 1 --repo o/r' \
  'timeout 60 gh pr view 1' 'timeout -s KILL 5 gh issue list' \
  "gh api graphql -f query='mutation { x }'" \
  "gh api graphql --paginate -F owner=o -f query='query { x }'" \
  '~/.claude/skills/ross-mode/scripts/gh-post.sh comment o/r 1 -' \
  "\"\$HOME\"/.claude/skills/ross-mode/scripts/gh-post.sh issue o/r 'A title' f --label needs-triage" \
  '~/.claude/skills/ross-mode/scripts/verdict-status.sh 7 abcdef0 PASS https://x' \
  'echo "gh pr comment"' "grep -rn 'gh issue create' skills" 'git commit -m "Wrap gh pr create"' \
  $'cat > body.md <<\'EOF\'\ngh pr comment 1 --body hi\nEOF' 'ghost pr comment' 'gh pr commentary'; do
  bash_case allow "$c"
done
check "Edit tool" allow "$(event Edit '{"file_path":"/tmp/x","old_string":"gh pr comment","new_string":"b"}')"

echo "== fail open"
check "malformed stdin" allow 'not json {'
check "empty stdin" allow ''

echo "== --scan"
mkdir -p "$tmp/bare/sub" "$tmp/marked" "$tmp/clean"
printf '# Steps\n\n1. Post it with `gh pr comment <n> --body-file -`.\n' > "$tmp/bare/sub/x.md"
printf 'Not markdown: gh pr comment 1\n' > "$tmp/bare/sub/x.txt"
printf 'Ross used to run `gh issue create` here. <!-- gh-post: ok -->\n' > "$tmp/marked/x.md"
printf 'Post with `gh-post.sh comment <repo> <n> -`. Read with `gh pr view` and `gh api repos/o/r/pulls/1`.\n' > "$tmp/clean/x.md"

# scan <name> <want-exit> <want-stdout> <path>...
scan() {
  local name=$1 want_rc=$2 want_out=$3 out rc
  shift 3
  out=$("$hook" --scan "$@" 2>&1)
  rc=$?
  if [[ $rc == "$want_rc" && $out == "$want_out" ]]; then echo "PASS  scan: $name"
  else echo "FAIL  scan: $name: exit $rc, output:"; printf '%s\n' "$out" | sed 's/^/      /'; fails=$((fails + 1)); fi
}
scan "a bare command fails and names file, line and rule" 1 \
  "$tmp/bare/sub/x.md:3: gh issue/pr post: 1. Post it with \`gh pr comment <n> --body-file -\`." "$tmp/bare"
scan "the old <!-- gh-post: ok --> marker doesn't exempt a line" 1 \
  "$tmp/marked/x.md:1: gh issue/pr post: Ross used to run \`gh issue create\` here. <!-- gh-post: ok -->" "$tmp/marked"
scan "a clean file passes" 0 "" "$tmp/clean"
scan "several paths, one hit" 1 \
  "$tmp/bare/sub/x.md:3: gh issue/pr post: 1. Post it with \`gh pr comment <n> --body-file -\`." \
  "$tmp/clean" "$tmp/bare"
printf 'Then `gh api -X POST repos/o/r/issues/1/comments -f body=x`.\n' > "$tmp/clean/api.md"
scan "a gh api write fails too" 1 \
  "$tmp/clean/api.md:1: gh api write: Then \`gh api -X POST repos/o/r/issues/1/comments -f body=x\`." "$tmp/clean"

echo
if (( fails )); then echo "$fails FAILED"; exit 1; fi
echo "all passed"
