#!/usr/bin/env bash
# Runs verdict-status.sh against a gh stub that answers the PR's head SHA and records each API call,
# and checks the exit code, the messages and the status it POSTs.
# Usage: scripts/test-verdict-status.sh
# VERDICT_STATUS=<path> runs it against another copy of the script.

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
script=${VERDICT_STATUS:-$here/verdict-status.sh}
tmp=$(cd "$(mktemp -d)" && pwd -P)
trap 'rm -rf "$tmp"' EXIT
bin="$tmp/bin"
fails=0
mkdir -p "$bin"

head=abcdef0123456789abcdef0123456789abcdef01
other=1234567890123456789012345678901234567890
url=https://github.com/acme/web/pull/7#issuecomment-1

# gh stub: only the exact head lookup for PR 7 prints the head from $tmp/head, and it fails when $tmp/view-fails
# exists. api records its args, and fails when $tmp/api-fails exists.
cat > "$bin/gh" <<EOF
#!/bin/sh
case "\$*" in
	"pr view 7 --json headRefOid -q .headRefOid")
		[ -e "$tmp/view-fails" ] && { echo "gh stub: no such PR" >&2; exit 1; }
		cat "$tmp/head" ;;
	api*)
		printf '%s\n' "\$@" >> "$tmp/calls"
		[ -e "$tmp/api-fails" ] && { echo "gh stub: HTTP 422" >&2; exit 1; }
		echo '{}' ;;
	*) echo "gh stub: unexpected: \$*" >&2; exit 1 ;;
esac
EOF
chmod +x "$bin/gh"

# run [--view-fails] [--api-fails] <args>...: runs the script with a fresh call log, making that gh call fail;
# sets rc, out, err.
run() {
	rm -f "$tmp/calls" "$tmp/view-fails" "$tmp/api-fails"
	while [[ ${1:-} == --*-fails ]]; do
		touch "$tmp/${1#--}"
		shift
	done
	echo "$head" > "$tmp/head"
	out=$(PATH="$bin:$PATH" "$script" "$@" 2>"$tmp/err")
	rc=$?
	err=$(cat "$tmp/err")
}
fail() { echo "FAIL  $1"; [ -n "$err" ] && printf '%s\n' "$err" | sed 's/^/      /'; fails=$((fails + 1)); }
calls() { cat "$tmp/calls" 2>/dev/null; }

# posts <name> <state> <description> [url]: passes when the last run exited 0 and POSTed exactly that status to the full head.
posts() {
	local want
	want=$(printf '%s\n' api -X POST "repos/{owner}/{repo}/statuses/$head" -f "state=$2" -f context=ross-mode/verdict -f "description=$3")
	[ -n "${4:-}" ] && want=$(printf '%s\n' "$want" -f "target_url=$4")
	if [[ $rc == 0 && "$(calls)" == "$want" ]]; then echo "PASS  $1"
	else fail "$1: exit $rc, calls:"; calls | sed 's/^/      /'; fi
}
# refused <name> <exit code> [stderr text]: passes when the last run exited with that code, made no API call,
# and printed the text on stderr.
refused() {
	if [[ $rc != "$2" ]]; then fail "$1: exit $rc, want $2"
	elif [ -e "$tmp/calls" ]; then fail "$1: called the API"
	elif [ -n "${3:-}" ] && ! grep -qF -- "$3" "$tmp/err"; then fail "$1: stderr lacks \"$3\""
	else echo "PASS  $1"; fi
}

run 7 abcdef0 pending
posts "pending is pending, at the full head from a 7-char prefix" pending "Verdict running at abcdef0"
run 7 abcdef0 PASS "$url"
posts "PASS is success, with the comment as target_url" success "PASS at abcdef0" "$url"
run 7 "$head" PASS+NOTES "$url"
posts "PASS+NOTES is success" success "PASS+NOTES at abcdef0" "$url"
run 7 ABCDEF0 FAIL "$url"
posts "FAIL is failure, and an uppercase sha matches" failure "FAIL at abcdef0" "$url"
run 7 abcdef0 PASS
posts "no comment URL sends no target_url" success "PASS at abcdef0"
if printf '%s\n' "$out" | grep -qF "ross-mode/verdict success at $head"; then echo "PASS  prints the status it set"
else fail "prints the status it set: stdout \"$out\""; fi

run 7 1234567 PASS "$url"
refused "a sha that isn't the head is refused" 2 "stale"
if grep -qF 1234567 "$tmp/err" && grep -qF "$head" "$tmp/err"; then echo "PASS  the refusal names both SHAs"
else fail "the refusal names both SHAs"; fi
run 7 "$other" FAIL
refused "a full sha that isn't the head is refused" 2

run --view-fails 7 abcdef0 PASS
refused "gh pr view failure stops before the API" 2 "can't read the head"
run --api-fails 7 abcdef0 PASS
if [[ $rc != 0 ]] && ! printf '%s\n' "$out" | grep -qF ross-mode/verdict; then echo "PASS  gh api failure exits non-zero with no success line"
else fail "gh api failure exits non-zero with no success line: exit $rc, stdout \"$out\""; fi

run
refused "no args is a usage error" 2
run 7 abcdef0
refused "a missing verdict is a usage error" 2
run 7 abcdef0 success
refused "a verdict outside the four words is refused" 2
run 7 abcdefg PASS
refused "a non-hex sha is refused" 2
run 7 abcde PASS
refused "a sha under 7 chars is refused" 2
run 0 abcdef0 PASS
refused "PR 0 is refused" 2
run x7 abcdef0 PASS
refused "a non-numeric PR is refused" 2
run 7 abcdef0 PASS http://example.com/x
refused "a non-https comment URL is refused" 2

if [[ $fails -gt 0 ]]; then
	echo "$fails failed"
	exit 1
fi
echo "all passed"
