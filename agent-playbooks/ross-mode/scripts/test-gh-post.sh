#!/usr/bin/env bash
# Runs gh-post.sh against a gh stub that answers each item's JSON from a fixture and records every write call,
# and checks the exit code, the messages and the calls it makes.
# Usage: scripts/test-gh-post.sh
# GH_POST=<path> runs it against another copy of the script.

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
script=${GH_POST:-$here/gh-post.sh}
tmp=$(cd "$(mktemp -d)" && pwd -P)
trap 'rm -rf "$tmp"' EXIT
bin="$tmp/bin"
fails=0
mkdir -p "$bin" "$tmp/items"

url=https://github.com/o/r/issues/1#issuecomment-9

# Fixtures: o/r#1 Ross opened it, #2 Ross is an assignee only, #3 someone else's with another assignee,
# #4 someone else's with no assignees, #5 has no fixture so the read fails.
item() { printf '%s\n' "$2" > "$tmp/items/o_r_$1.json"; }
item 1 '{"user":{"login":"rossyanez"},"assignees":[]}'
item 2 '{"user":{"login":"user-a"},"assignees":[{"login":"user-b"},{"login":"rossyanez"}],"pull_request":{"url":"x"}}'
item 3 '{"user":{"login":"user-a"},"assignees":[{"login":"user-b"},{"login":"user-c"}]}'
item 4 '{"user":{"login":"user-a"},"assignees":[]}'

# gh stub: `api repos/<o>/<r>/issues/<n>` alone prints the fixture. `api -X ...`, `issue create` and
# `pr create` append their args to $GH_STUB/calls, one per line, with a --body-file path replaced by
# that file's text. Anything else fails with "gh stub: unexpected".
cat > "$bin/gh" <<'EOF'
#!/usr/bin/env bash
log() {
	local prev=
	for a in "$@"; do
		if [[ $prev == --body-file ]]; then cat "$a"; else printf '%s\n' "$a"; fi
		prev=$a
	done >> "$GH_STUB/calls"
}
if [[ $1 == api && $# == 2 && $2 =~ ^repos/([^/]+)/([^/]+)/issues/([0-9]+)$ ]]; then
	f="$GH_STUB/items/${BASH_REMATCH[1]}_${BASH_REMATCH[2]}_${BASH_REMATCH[3]}.json"
	[ -f "$f" ] || { echo "gh stub: HTTP 404" >&2; exit 1; }
	cat "$f"
	exit 0
fi
[[ $1 == api || $2 == create ]] && [ -e "$GH_STUB/write-fails" ] && { log "$@"; echo "gh stub: HTTP 422" >&2; exit 1; }
case "$1 ${2:-}" in
	"api -X") log "$@"; echo '{"html_url":"https://github.com/o/r/issues/1#issuecomment-9"}' ;;
	"issue create") log "$@"; echo https://github.com/o/r/issues/10 ;;
	"pr create") log "$@"; echo https://github.com/o/r/pull/11 ;;
	*) echo "gh stub: unexpected: $*" >&2; exit 1 ;;
esac
EOF
chmod +x "$bin/gh"

# given: the body file's exact text, which every text verb must post as is, with nothing added.
given=$'Looks good.\nSecond line.'
printf '%s' "$given" > "$tmp/body"
# quoted: a body whose first line is a quote, so a line added above it would show.
quoted=$'> A quoted line.\n\nThen the reply.'
printf '%s' "$quoted" > "$tmp/quoted"

# run [--write-fails] <args>...: runs the script with a fresh call log and the caller's stdin, making every
# write call fail with --write-fails; sets rc, out, err.
run() {
	rm -f "$tmp/calls" "$tmp/write-fails"
	[[ ${1:-} == --write-fails ]] && { touch "$tmp/write-fails"; shift; }
	out=$(GH_STUB="$tmp" PATH="$bin:$PATH" "$script" "$@" 2>"$tmp/err")
	rc=$?
	err=$(cat "$tmp/err")
}
fail() { echo "FAIL  $1"; [ -n "$err" ] && printf '%s\n' "$err" | sed 's/^/      /'; fails=$((fails + 1)); }
calls() { cat "$tmp/calls" 2>/dev/null; }

# wrote <name> <want-calls> [want-stdout]: passes when the last run exited 0, made exactly those write calls,
# and printed that stdout.
wrote() {
	if [[ $rc != 0 ]]; then fail "$1: exit $rc"
	elif [[ "$(calls)" != "$2" ]]; then fail "$1: calls:"; calls | sed 's/^/      /'
	elif [[ -n ${3:-} && $out != "$3" ]]; then fail "$1: stdout \"$out\""
	else echo "PASS  $1"; fi
}
# refused <name> <exit code> [stderr text]: passes when the last run exited with that code, made no write call,
# and printed the text on stderr.
refused() {
	if [[ $rc != "$2" ]]; then fail "$1: exit $rc, want $2"
	elif [ -e "$tmp/calls" ]; then fail "$1: made a write call"
	elif [ -n "${3:-}" ] && ! grep -qF -- "$3" "$tmp/err"; then fail "$1: stderr lacks \"$3\""
	else echo "PASS  $1"; fi
}
echo "== ownership"
run check o/r 1
wrote "Ross opened it: check passes" ""
run check o/r 2
wrote "Ross is an assignee only: check passes" ""
run check o/r 3
refused "someone else's item: check exits 1" 1 \
	"gh-post: o/r#3 isn't Ross's (author user-a, assignees user-b, user-c). Don't post; report it to Ross in your reply."
run check o/r 4
refused "no assignees reads none" 1 "(author user-a, assignees none)"
run check o/r 5
refused "a failed read exits 2" 2

echo "== every checked verb refuses someone else's item and writes nothing"
for n in 3 4; do
	run comment o/r $n "$tmp/body" </dev/null; refused "comment on #$n" 1 "isn't Ross's"
	run reply o/r $n 55 "$tmp/body"; refused "reply on #$n" 1 "isn't Ross's"
	run body o/r $n "$tmp/body"; refused "body on #$n" 1 "isn't Ross's"
	run label o/r $n +bug; refused "label on #$n" 1 "isn't Ross's"
	run close o/r $n; refused "close on #$n" 1 "isn't Ross's"
	run reopen o/r $n; refused "reopen on #$n" 1 "isn't Ross's"
done
run comment o/r 5 "$tmp/body"
refused "a failed read stops a comment with exit 2" 2

echo "== write call shapes"
run comment o/r 1 "$tmp/body"
wrote "comment POSTs the body as given to the issue comments" \
	"$(printf '%s\n' api -X POST repos/o/r/issues/1/comments -f "body=$given")" "$url"
run comment o/r 2 "$tmp/quoted"
wrote "a body that starts with a quote line is posted as given" \
	"$(printf '%s\n' api -X POST repos/o/r/issues/2/comments -f "body=$quoted")"
run comment o/r 1 - <<<"From stdin."
wrote "- reads the body from stdin and posts it as given" \
	"$(printf '%s\n' api -X POST repos/o/r/issues/1/comments -f "body=From stdin.")"
run reply o/r 2 55 "$tmp/body"
wrote "reply POSTs the body as given to the review comment's replies" \
	"$(printf '%s\n' api -X POST repos/o/r/pulls/2/comments/55/replies -f "body=$given")" "$url"
run body o/r 1 "$tmp/body"
wrote "body PATCHes the issue body to the body as given" \
	"$(printf '%s\n' api -X PATCH repos/o/r/issues/1 -f "body=$given")"
run label o/r 2 +bug +"needs triage" -"good first issue"
wrote "label adds in one POST and removes one DELETE each" "$(printf '%s\n' \
	api -X POST repos/o/r/issues/2/labels -f 'labels[]=bug' -f 'labels[]=needs triage' \
	api -X DELETE repos/o/r/issues/2/labels/good%20first%20issue)"
run close o/r 1
wrote "close PATCHes state closed" "$(printf '%s\n' api -X PATCH repos/o/r/issues/1 -f state=closed)"
run reopen o/r 2
wrote "reopen PATCHes state open" "$(printf '%s\n' api -X PATCH repos/o/r/issues/2 -f state=open)"
run issue o/r "A title" "$tmp/body" --label needs-triage
wrote "issue runs gh issue create with the body as given and the extras" "$(printf '%s\n' \
	issue create --repo o/r --title "A title" --body-file "$given" --label needs-triage)" \
	https://github.com/o/r/issues/10
run pr o/r - --base main --title "A PR" <<<"PR body."
wrote "pr runs gh pr create with the body as given from stdin and the extras" "$(printf '%s\n' \
	pr create --repo o/r --body-file "PR body." --base main --title "A PR")" \
	https://github.com/o/r/pull/11

echo "== a failed write exits 2, so 1 means only someone else's item"
# failed <name> [stderr text]: passes when the last run exited 2, tried a write, and said so on stderr.
failed() {
	if [[ $rc != 2 ]]; then fail "$1: exit $rc, want 2"
	elif [ ! -e "$tmp/calls" ]; then fail "$1: never tried the write"
	elif ! grep -qF -- "${2:-failed}" "$tmp/err"; then fail "$1: stderr lacks \"${2:-failed}\""
	else echo "PASS  $1"; fi
}
run --write-fails comment o/r 1 "$tmp/body"; failed "comment" "comment failed on o/r#1"
run --write-fails reply o/r 1 55 "$tmp/body"; failed "reply" "reply failed on o/r#1"
run --write-fails body o/r 1 "$tmp/body"; failed "body" "body failed on o/r#1"
run --write-fails label o/r 1 +bug; failed "label add" "label failed on o/r#1"
run --write-fails label o/r 1 -bug; failed "label remove" "label failed on o/r#1"
run --write-fails close o/r 1; failed "close" "close failed on o/r#1"
run --write-fails reopen o/r 1; failed "reopen" "reopen failed on o/r#1"
run --write-fails issue o/r T "$tmp/body"; failed "issue" "issue failed on o/r"
run --write-fails pr o/r "$tmp/body" --title T; failed "pr" "pr failed on o/r"

echo "== an empty or whitespace-only body exits 2 before any gh call"
printf '' > "$tmp/empty"
printf ' \n\t\n\n' > "$tmp/blank"
for b in empty blank; do
	# #3 isn't Ross's, so a check that ran first would exit 1.
	run comment o/r 3 "$tmp/$b"; refused "comment with a $b body" 2 "empty"
	run reply o/r 3 55 "$tmp/$b"; refused "reply with a $b body" 2 "empty"
	run body o/r 3 "$tmp/$b"; refused "body with a $b body" 2 "empty"
	run issue o/r T "$tmp/$b"; refused "issue with a $b body" 2 "empty"
	run pr o/r "$tmp/$b" --title T; refused "pr with a $b body" 2 "empty"
done
run comment o/r 1 - </dev/null; refused "an empty stdin body" 2 "empty"

echo "== body flags in the extras are refused"
for f in --body -b --body-file -F --body=x; do
	run issue o/r T "$tmp/body" "$f" x; refused "issue with $f" 2
	run pr o/r "$tmp/body" "$f" x; refused "pr with $f" 2
done

echo "== usage errors"
run; refused "no args" 2
run post o/r 1; refused "an unknown verb" 2
run check o 1; refused "a repo without a slash" 2
run check o/r/x 1; refused "a repo with two slashes" 2
run check o/r x1; refused "a non-numeric number" 2
run check o/r 0; refused "number 0" 2
run reply o/r 1 abc "$tmp/body"; refused "a non-numeric comment id" 2
run comment o/r 1 "$tmp/missing"; refused "a missing body file" 2
run comment o/r 1; refused "no body file" 2
run label o/r 1; refused "label with no labels" 2
run label o/r 1 bug; refused "a label without + or -" 2
run issue o/r "" "$tmp/body"; refused "an empty issue title" 2

if [[ $fails -gt 0 ]]; then
	echo "$fails failed"
	exit 1
fi
echo "all passed"
