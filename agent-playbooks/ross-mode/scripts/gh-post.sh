#!/usr/bin/env bash
# Post to GitHub as Ross only on Ross's items.
# An item is Ross's when rossyanez opened it or is one of its assignees. Every verb but issue and pr checks
# that with one GET of repos/<repo>/issues/<n>, which answers for issues and PRs alike, and writes nothing
# when it fails. Every text verb posts the body as given.
# Writes go through the issues endpoints, which GitHub serves for PRs too, except reply.
# Usage:
#   gh-post.sh check <repo> <n>
#   gh-post.sh comment <repo> <n> <body-file>                   prints the comment URL
#   gh-post.sh reply <repo> <pr> <comment-id> <body-file>       prints the reply URL
#   gh-post.sh body <repo> <n> <body-file>
#   gh-post.sh label <repo> <n> +name|-name ...
#   gh-post.sh close|reopen <repo> <n>
#   gh-post.sh issue <repo> <title> <body-file> [gh issue create flags]   prints the URL
#   gh-post.sh pr <repo> <body-file> [gh pr create flags]                 prints the URL
# <repo> is owner/name. <body-file> may be - for stdin, and an empty or blank body is refused. Exit 1 only
# when the item isn't Ross's, 2 on usage errors or a failed gh read or write.
set -euo pipefail

ross=rossyanez

die() { printf 'gh-post: %s\n' "$1" >&2; exit 2; }
usage() { sed -n 's/^#   /  /p' "$0" >&2; exit 2; }

repo() { [[ ${1:-} =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die "repo must be owner/name: ${1:-}"; }
num() { [[ ${1:-} =~ ^[1-9][0-9]*$ ]] || die "not a positive integer: ${1:-}"; }

# check <repo> <n>: exits 1 unless Ross opened the item or is assigned to it.
check() {
	repo "$1"
	num "$2"
	local json who
	json=$(gh api "repos/$1/issues/$2") || die "can't read $1#$2"
	who=$(jq -r --arg r "$ross" \
		'if .user.login == $r or any(.assignees[]?; .login == $r) then "" else
		"author \(.user.login), assignees \([.assignees[]?.login] | if length == 0 then "none" else join(", ") end)" end' \
		<<<"$json") || die "can't parse $1#$2"
	[ -z "$who" ] && return
	printf "gh-post: %s#%s isn't Ross's (%s). Don't post; report it to Ross in your reply.\n" "$1" "$2" "$who" >&2
	exit 1
}

# text <body-file>: the body, refused when empty or blank.
text() {
	[[ $1 == - || -f $1 ]] || die "no body file: $1"
	local body
	body=$(cat -- "$1")
	[[ -n ${body//[[:space:]]/} ]] || die "the body is empty"
	printf '%s' "$body"
}

# no_body_flags <arg>...: refuses a flag that would replace the body.
no_body_flags() {
	local a
	for a in "$@"; do
		case $a in --body | --body=* | --body-file | --body-file=* | -b* | -F*) die "$a would replace the body" ;; esac
	done
}

verb=${1:-}
[ $# -gt 0 ] && shift
case $verb in
	check)
		[ $# -eq 2 ] || usage
		check "$@" ;;
	comment)
		[ $# -eq 3 ] || usage
		body=$(text "$3")
		check "$1" "$2"
		out=$(gh api -X POST "repos/$1/issues/$2/comments" -f "body=$body") || die "comment failed on $1#$2"
		jq -r .html_url <<<"$out" ;;
	reply)
		[ $# -eq 4 ] || usage
		num "$3"
		body=$(text "$4")
		check "$1" "$2"
		out=$(gh api -X POST "repos/$1/pulls/$2/comments/$3/replies" -f "body=$body") || die "reply failed on $1#$2"
		jq -r .html_url <<<"$out" ;;
	body)
		[ $# -eq 3 ] || usage
		body=$(text "$3")
		check "$1" "$2"
		gh api -X PATCH "repos/$1/issues/$2" -f "body=$body" >/dev/null || die "body failed on $1#$2" ;;
	label)
		[ $# -ge 3 ] || usage
		add=()
		del=()
		for l in "${@:3}"; do
			case $l in
				+?*) add+=(-f "labels[]=${l#+}") ;;
				-?*) del+=("$(jq -rn --arg l "${l#-}" '$l | @uri')") ;;
				*) die "a label must start with + or -: $l" ;;
			esac
		done
		check "$1" "$2"
		if [ ${#add[@]} -gt 0 ]; then
			gh api -X POST "repos/$1/issues/$2/labels" "${add[@]}" >/dev/null || die "label failed on $1#$2"
		fi
		for l in ${del[@]+"${del[@]}"}; do
			gh api -X DELETE "repos/$1/issues/$2/labels/$l" >/dev/null || die "label failed on $1#$2"
		done ;;
	close | reopen)
		[ $# -eq 2 ] || usage
		check "$1" "$2"
		state=closed
		[ "$verb" = close ] || state=open
		gh api -X PATCH "repos/$1/issues/$2" -f "state=$state" >/dev/null || die "$verb failed on $1#$2" ;;
	issue | pr)
		if [ "$verb" = issue ]; then
			[ $# -ge 3 ] || usage
			[ -n "$2" ] || die "the issue needs a title"
			src=$3
			cmd=(issue create --repo "$1" --title "$2" --body-file)
			shift 3
		else
			[ $# -ge 2 ] || usage
			src=$2
			cmd=(pr create --repo "$1" --body-file)
			shift 2
		fi
		repo "${cmd[3]}"
		no_body_flags "$@"
		tmp=$(mktemp)
		trap 'rm -f "$tmp"' EXIT
		{ text "$src"; echo; } >"$tmp"
		gh "${cmd[@]}" "$tmp" "$@" || die "$verb failed on ${cmd[3]}" ;;
	*) usage ;;
esac
