#!/usr/bin/env bash
# Runs check-plan.mjs on the skeleton from playbooks/multi-phase-plan.md, as written and with its
# placeholders filled, then on broken copies, and checks each exit code and message.
# Usage: scripts/test-check-plan.sh

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
check_plan="$here/check-plan.mjs"
playbook="$here/../playbooks/multi-phase-plan.md"
tmp=$(cd "$(mktemp -d)" && pwd -P)
trap 'rm -rf "$tmp"' EXIT
fails=0

check() {
	if [ "$2" = 0 ]; then echo "PASS  $1"; else echo "FAIL  $1${3:+ ($3)}"; fails=$((fails + 1)); fi
}

# The skeleton is the body of the playbook's ````markdown fence.
awk '/^````markdown$/ { on = 1; next } /^````$/ { on = 0 } on' "$playbook" >"$tmp/skeleton.md"
sed 's/<[^<>]*>/filled/g' "$tmp/skeleton.md" >"$tmp/valid.md"

# The skill variant is the body of the playbook's ````markdown skill fence. Splice it into the
# skeleton. Its first line goes at the end of How to read this, its Boot recipe replaces the
# skeleton's, and its Verify, live block through its Review gate replace the skeleton's.
awk '/^````markdown skill$/ { on = 1; next } /^````$/ { on = 0 } on' "$playbook" >"$tmp/skill-part.md"
awk -v part="$tmp/skill-part.md" '
	BEGIN { while ((getline l < part) > 0) { if (l ~ /^### Boot recipe/) p = 2; else if (l ~ /^\*\*Verify, live\.\*\*/) p = 3; else if (!p) p = 1; text[p] = text[p] l "\n" } }
	/^## Program checklist$/ { printf "%s", text[1] }
	/^### Boot recipe/ { printf "%s", text[2]; skip = 1; next }
	/^\*\*Verify, live\.\*\*/ { printf "%s\n", text[3]; skip = 1; next }
	skip && (/^## / || /^\*\*Merge-ready\.\*\*/) { skip = 0 }
	!skip
' "$tmp/skeleton.md" >"$tmp/skill.md"
sed 's/<[^<>]*>/filled/g' "$tmp/skill.md" >"$tmp/skill-valid.md"

# run <name> <plan>: sets rc and out.
run() {
	out=$(node "$check_plan" "$2" 2>&1)
	rc=$?
}

# passes <name> <plan>
passes() {
	run "$1" "$2"
	[ "$rc" = 0 ]; check "$1 exits 0" $? "exit=$rc: $out"
	grep -q ' 0 problems$' <<<"$out"; check "$1 reports 0 problems" $? "$out"
}

# fails_with <name> <plan> <fixed string the output must contain>
fails_with() {
	run "$1" "$2"
	[ "$rc" = 1 ]; check "$1 exits 1" $? "exit=$rc: $out"
	grep -qF -- "$3" <<<"$out"; check "$1 says: $3" $? "$out"
}

echo "== the playbook's skeleton passes"
[ -s "$tmp/skeleton.md" ]; check "skeleton found in multi-phase-plan.md" $?
passes "skeleton as written" "$tmp/skeleton.md"
passes "skeleton with placeholders filled" "$tmp/valid.md"

echo "== the playbook's skill variant passes"
grep -qx 'Variant. skill.' "$tmp/skill-part.md"; check "skill variant found in multi-phase-plan.md" $?
passes "skill variant as written" "$tmp/skill.md"
passes "skill variant with placeholders filled" "$tmp/skill-valid.md"
grep -qx 'variant: skill' <<<"$out"; check "skill variant prints variant: skill" $? "$out"
awk '{ print } /^\*\*Verify, perf\.\*\*/ { print ""; print "- [ ] Metric. filled"; print "- [ ] Probe. filled"; print "- [ ] Baseline. filled"; print "- [ ] Rule. filled" }' "$tmp/skill-valid.md" |
	sed 's/ Not applicable\. filled$//' >"$tmp/skill-perf.md"
passes "skill variant with the four perf boxes" "$tmp/skill-perf.md"
awk '/^## Program checklist$/ { print "Variant. app."; print "" } 1' "$tmp/valid.md" >"$tmp/app.md"
passes "skeleton declaring Variant. app." "$tmp/app.md"
grep -qx 'variant: app' <<<"$out"; check "app prints variant: app" $? "$out"

echo "== broken skill plans fail"
sed 's/Three lanes at the PR head/Four lanes at the PR head/' "$tmp/skill-valid.md" >"$tmp/skill-word.md"
fails_with "skill lane word and count differ" "$tmp/skill-word.md" "says Four lanes but has 3"

sed 's/^- \[ \] Lane 3\. /- [ ] Lane 4. /' "$tmp/skill-valid.md" >"$tmp/skill-gap.md"
fails_with "skill lanes not contiguous" "$tmp/skill-gap.md" "lanes are [1,2,4], expected 1 to N, N at most 10"

awk '{ print } /^\*\*Verify, perf\.\*\*/ { print ""; print "- [ ] Metric. filled" }' "$tmp/skill-valid.md" >"$tmp/skill-na-boxes.md"
fails_with "skill perf Not applicable with boxes" "$tmp/skill-na-boxes.md" "perf says Not applicable but has boxes"

sed 's/ Not applicable\. filled$/ Not applicable./' "$tmp/skill-valid.md" >"$tmp/skill-na-bare.md"
fails_with "skill perf Not applicable with no reason" "$tmp/skill-na-bare.md" "perf says Not applicable with no reason"

sed 's/ Not applicable\. filled$/ Not applicable. ./' "$tmp/skill-valid.md" >"$tmp/skill-na-dot.md"
fails_with "skill perf Not applicable with a reason of only a period" "$tmp/skill-na-dot.md" "perf says Not applicable with no reason"

sed 's/"no video"/"no recording"/' "$tmp/skill-valid.md" >"$tmp/skill-gate.md"
fails_with "skill gate without no video" "$tmp/skill-gate.md" 'Review gate lacks "no video"'

sed 's/^Variant\. skill\.$/Variant. docs./' "$tmp/skill-valid.md" >"$tmp/docs.md"
fails_with "an unknown variant" "$tmp/docs.md" 'unknown variant "docs", expected app or skill'

echo "== the app variant stays strict"
awk '/^- \[ \] (Metric|Probe|Baseline|Rule)\. / { next } /^\*\*Verify, perf\.\*\*/ { print $0 " Not applicable. filled"; next } 1' "$tmp/valid.md" >"$tmp/app-na.md"
fails_with "app perf Not applicable" "$tmp/app-na.md" "perf boxes are [], expected [Metric., Probe., Baseline., Rule.]"

sed -E -e 's/Ten lanes at the PR head/Three lanes at the PR head/' -e '/^- \[ \] Lane ([4-9]|10)\. /d' "$tmp/valid.md" >"$tmp/app-three.md"
fails_with "app with three lanes" "$tmp/app-three.md" "lanes are [1,2,3], expected 1 to 10"
fails_with "app with three lanes" "$tmp/app-three.md" 'Verify, live lacks "Ten lanes at the PR head"'

sed -e '/^- \[ \] Record a 30 to 60 second video/d' -e 's/^- \[ \] Post the screenshots and the video, or the no-video reason, in chat\./- [ ] Post the screenshots in chat./' "$tmp/valid.md" >"$tmp/app-gate.md"
fails_with "app gate without video" "$tmp/app-gate.md" 'Review gate lacks "video"'

echo "== broken plans fail"
sed 's/^\*\*Merge-ready\.\*\*/**Merge.**/' "$tmp/valid.md" >"$tmp/merge.md"
fails_with "a **Merge.** block" "$tmp/merge.md" "sub-blocks are [Depends on., Files., Build., You see., Verify, unit., Verify, live., Verify, perf., Review gate.], expected [Depends on., Files., Build., You see., Verify, unit., Verify, live., Verify, perf., Review gate., Merge-ready.]"

sed '/^- \[ \] Lane 10\. /d' "$tmp/valid.md" >"$tmp/nine.md"
fails_with "nine lanes" "$tmp/nine.md" "lanes are [1,2,3,4,5,6,7,8,9], expected 1 to 10"

sed 's/Ten lanes at the PR head/Ten lanes on `claude-opus-5-5` at the PR head/' "$tmp/valid.md" >"$tmp/model.md"
fails_with "a lane model slot" "$tmp/model.md" 'Verify, live lacks "Ten lanes at the PR head"'

sed 's/heartbeat/\/loop 1h/g' "$tmp/valid.md" >"$tmp/loop.md"
fails_with "/loop 1h instead of a heartbeat" "$tmp/loop.md" 'Program checklist lacks "heartbeat"'

sed 's/playbooks\/orchestrate\.md/playbooks\/autopilot-full.md/g' "$tmp/valid.md" >"$tmp/execution.md"
fails_with "another execution playbook" "$tmp/execution.md" 'Program checklist lacks "playbooks/orchestrate.md"'

sed 's/^### Verdict and handoff/### Verdict and merge/' "$tmp/valid.md" >"$tmp/verdict.md"
fails_with "a Verdict and merge heading" "$tmp/verdict.md" 'Program checklist lacks "### Verdict and handoff" in order'

{ cat "$tmp/valid.md"; printf '\nOne approach lost \xe2\x80\x94 it was slow.\n'; } >"$tmp/dash.md"
fails_with "a long dash in prose" "$tmp/dash.md" "long dash"

awk 'NR == 3 { for (i = 1; i <= 10; i++) print "Intro line " i "."; next } 1' "$tmp/valid.md" >"$tmp/intro.md"
fails_with "an intro of ten lines" "$tmp/intro.md" "intro is 10 lines, under ten required"

echo
if (( fails )); then echo "$fails FAILED"; exit 1; fi
echo "all passed"
