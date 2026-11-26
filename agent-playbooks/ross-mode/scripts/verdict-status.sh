#!/usr/bin/env bash
# Set the Orchestrate verdict as the GitHub commit status ross-mode/verdict on a PR's head, so the PR's checks
# show it next to CI. Run it from a checkout of the PR's repo.
# Usage: verdict-status.sh <pr-number> <sha> <pending|PASS|PASS+NOTES|FAIL> [comment-url]
# The status lands on the SHA the verdict ran at. The script refuses a SHA that isn't the PR's head, so a
# verdict at an old head can't label a new one. A later push leaves the new head with no status until its own
# verdict sets one.
set -euo pipefail

die() { printf 'verdict-status.sh: %s\n' "$1" >&2; exit 2; }

[ $# -ge 3 ] && [ $# -le 4 ] || {
	printf 'usage: verdict-status.sh <pr-number> <sha> <pending|PASS|PASS+NOTES|FAIL> [comment-url]\n' >&2
	exit 2
}
pr=$1
sha=$(printf '%s' "$2" | tr 'A-F' 'a-f')
verdict=$3
url=${4:-}
[[ $pr =~ ^[1-9][0-9]*$ ]] || die "PR number must be a positive integer: $pr"
[[ $sha =~ ^[0-9a-f]{7,40}$ ]] || die "sha must be 7 to 40 hex characters: $2"
[ -z "$url" ] || [[ $url == https://* ]] || die "comment URL must start with https://: $url"
case $verdict in
	pending) state=pending label="Verdict running" ;;
	PASS) state=success label=PASS ;;
	PASS+NOTES) state=success label=PASS+NOTES ;;
	FAIL) state=failure label=FAIL ;;
	*) die "verdict must be pending, PASS, PASS+NOTES or FAIL: $verdict" ;;
esac

head=$(gh pr view "$pr" --json headRefOid -q .headRefOid) || die "can't read the head of PR #$pr"
[[ $head == "$sha"* ]] ||
	die "PR #$pr's head is $head, not $sha. The verdict at $sha is stale. The new head needs its own verdict."

args=(-f "state=$state" -f context=ross-mode/verdict -f "description=$label at ${head:0:7}")
[ -z "$url" ] || args+=(-f "target_url=$url")
gh api -X POST "repos/{owner}/{repo}/statuses/$head" "${args[@]}" >/dev/null
echo "ross-mode/verdict $state at $head"
