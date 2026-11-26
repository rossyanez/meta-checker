#!/bin/bash
# PreToolUse hook for ross-mode: block tool calls until TaskCreate opens the todo list.
# Fails open (no output) on malformed input so a broken hook can't brick a session.

input=$(cat)
tool=$(jq -r '.tool_name // empty' <<<"$input" 2>/dev/null) || exit 0
session=$(jq -r '.session_id // empty' <<<"$input" 2>/dev/null) || exit 0
[[ -n $tool && -n $session && $session != */* ]] || exit 0

marker_dir="${TMPDIR:-/tmp}/ross-mode"
marker="$marker_dir/$session"

skill_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
pending="$marker.scouts-pending"

deny() {
  jq -cn --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

# The lead delegates code changes; it never writes files, before or after TaskCreate.
# Write/Edit into Claude Code's own memory (~/.claude/projects/*/memory/) is the one exception,
# allowed even while scouts are pending.
# The Bash check is a blocklist against the lead's shortest path, bypassable on purpose
# (rm, python3 script.py, ...): it catches interpreters fed a heredoc or stdin script,
# sed -i / perl -i, > or >> redirects to anything but /dev/null or /tmp/, and these as
# commands: tee to anything but /tmp/, patch, git apply / restore (not --staged/-S alone),
# git checkout --, cp / mv / install / git mv to anything but /tmp/, tar -x, and
# git archive / init / worktree add / merge (not merge-base or merge-tree).
# Heredoc bodies are stripped and quoted strings become Q first, so commit and PR bodies
# pass but a quoted target still counts (and a quoted /tmp/ target is denied).
write_reason="ross-mode: the lead doesn't write files. Delegate this change to Ross - Worker with mcp__paseo__create_agent (see Subagents in ~/.claude/skills/ross-mode/SKILL.md)."
case $tool in
  Edit|Write|MultiEdit|NotebookEdit)
    # Resolve the parent dir: the file may not exist yet, and realpath stops ../ and symlinked-dir
    # escapes. realpath doesn't follow the target itself, so a symlinked target is denied outright.
    file=$(jq -r '.tool_input.file_path // empty' <<<"$input")
    parent=$(realpath "$(dirname "$file")" 2>/dev/null)
    [[ ($tool == Write || $tool == Edit) && $file == /* && ! -L $file && -n $parent &&
       $parent/ == "$(realpath "$HOME" 2>/dev/null)"/.claude/projects/*/memory/* ]] && exit 0
    deny "$write_reason"
    ;;
  Bash)
    cmd=$(jq -r '.tool_input.command // empty' <<<"$input" | perl -0pe '
      s/<<-?\s*([\x27"]?)(\w+)\1([^\n]*\n).*?^\s*\2\s*$/<<$3/gms;
      s/"(?:\\.|[^"\\])*"|\x27[^\x27]*\x27/Q/gs')
    if perl -ne 'BEGIN { $s = 1 } $s = 0 if
      /\b(python3?|node|ruby|perl)\s+(-(\s|$)|<)/ ||
      /\b(sed|perl)\b[^|;&]*\s-[a-zA-Z]*i/ ||
      /\bgit\s+checkout\b[^|;&]*\s--(\s|$)/ ||
      />>?+\s*(?!\/dev\/null|\/tmp\/|&)\S/ ||
      grep {
        /^\s*tee\s+(-a\s+)?+(?!\/dev\/null|\/tmp\/)\S/ ||
        /^\s*(patch|git\s+apply)\b/ ||
        /^\s*git\s+restore\b/ && (!/\s(--staged|-S)\b/ || /\s(--worktree|-W)\b/) ||
        /^\s*(git\s+mv|cp|mv|install)\s/ && !/\s\/tmp\/\S*\s*$/ ||
        /^\s*tar\s/ && /\s-[a-zA-Z]*x|\s--(extract|get)\b|^\s*tar\s+[a-zA-Z]*x/ ||
        /^\s*git\s+(archive\b|init\b|worktree\s+add\b|merge(\s|$))/
      } split /[;&|()]/, s/\d*>&\d+//gr;
      END { exit $s }' <<<"$cmd"; then
      [[ $(jq -r '.tool_input.command' <<<"$input") == *.claude/projects/*/memory/* ]] &&
        write_reason+=" For memory files, use Write or Edit."
      deny "$write_reason"
    fi
    ;;
esac

case $tool in
  Read) path=$(jq -r '.tool_input.file_path // empty' <<<"$input") ;;
  Glob|Grep) path=$(jq -r '.tool_input.path // empty' <<<"$input") ;;
esac
in_skill=
if [[ $tool == Read || $tool == Glob || $tool == Grep ]]; then
  # Relative or missing paths resolve against the session cwd; realpath stops ../ escapes.
  cwd=$(jq -r '.cwd // empty' <<<"$input")
  [[ -z $path ]] && path=$cwd
  [[ $path == /* ]] || path="$cwd/$path"
  resolved=$(realpath "$path" 2>/dev/null)
  [[ -n $resolved && ( $resolved == "$skill_dir" || $resolved == "$skill_dir"/* ) ]] && in_skill=1
fi

# The first TaskCreate declares the lead's playbook in metadata.playbook: a playbooks/ file name
# without .md (not autonomous-run), or "none". A playbook arms "scouts pending" until a Ross - Scout
# launches, unless its file has the line "Starts with scouts: no.", so an unmarked file gates. Later
# TaskCreates and playbook Reads change nothing. If the marker can't be written, nothing gates.
if [[ $tool == TaskCreate ]]; then
  [[ -e $marker ]] && exit 0
  mkdir -p "$marker_dir" 2>/dev/null && [[ -w $marker_dir ]] || exit 0
  playbook=$(jq -r '.tool_input.metadata.playbook // empty' <<<"$input" 2>/dev/null)
  if [[ $playbook != none ]] &&
     ! [[ $playbook =~ ^[a-z0-9-]+$ && $playbook != autonomous-run && -f $skill_dir/playbooks/$playbook.md ]]; then
    names=$(cd "$skill_dir/playbooks" && ls *.md | sed 's/\.md$//' | grep -vx autonomous-run | paste -sd, - | sed 's/,/, /g')
    deny "ross-mode: declare your playbook on your first TaskCreate. Add metadata {\"playbook\": \"<name>\"}, where <name> is one of: $names, or \"none\" if no playbook fits. An Autonomous run declares its work's playbook, such as feature or bug-fix."
  fi
  [[ $playbook != none ]] && ! grep -qxF 'Starts with scouts: no.' "$skill_dir/playbooks/$playbook.md" &&
    printf '%s' "$playbook" >"$pending"
  touch "$marker"
  exit 0
fi

if [[ -e $marker ]]; then
  # Finishing a task takes an explicit start: completed needs an in_progress for that task earlier in
  # this session (back to back still passes). A completed whose description starts with "skip:" or
  # "n/a:" is the escape. Each in_progress appends its taskId to $marker.started; a missing taskId or
  # an unwritable marker dir fails open.
  if [[ $tool == TaskUpdate ]]; then
    task=$(jq -r '.tool_input.taskId // empty' <<<"$input")
    case $(jq -r '.tool_input.status // empty' <<<"$input") in
      in_progress) [[ -n $task ]] && { printf '%s\n' "$task" >>"$marker.started"; } 2>/dev/null ;;
      completed)
        desc=$(jq -r '.tool_input.description // empty' <<<"$input")
        [[ -n $task && $desc != skip:* && $desc != n/a:* && -w $marker_dir ]] &&
          ! grep -qxF -- "$task" "$marker.started" 2>/dev/null &&
          deny "ross-mode: task #$task never went in_progress. Set it in_progress when you start the work and completed when it's done. To skip a step, complete it with a description (not the subject) starting \"skip: <reason>\", or \"n/a: <reason>\" for a checkpoint item (SKILL.md step 4)." ;;
    esac
  fi
  [[ -e $pending ]] || exit 0
  if [[ $tool == mcp__paseo__create_agent ]] &&
     jq -e '.tool_input.initialPrompt // "" | contains("agents/ross-scout.md")' <<<"$input" >/dev/null; then
    mv "$pending" "$marker.scouted"
    exit 0
  fi
  case $tool in ToolSearch|TaskCreate|TaskUpdate|TaskList|TaskGet|Skill|mcp__paseo__*) exit 0 ;; esac
  [[ -n $in_skill ]] && exit 0
  # Reading the ticket isn't exploring code. Allow Read of a file named AGENTS.md or CLAUDE.md and
  # the files they @-import (Autonomous run step 1 finds the base branch there), and Bash whose every
  # segment is cd, echo, gh issue|pr view|list, git fetch with no options, or
  # ~/.claude/skills/ross-mode/scripts/log.sh (Autonomous run steps 1-2). $cmd has quotes as Q, so a
  # fetch argument with Q, a quote, or any glob or expansion character is denied. Command
  # substitution is checked on the raw command.
  [[ $tool == Read && ${resolved##*/} =~ ^(AGENTS|CLAUDE)\.md$ ]] && exit 0
  # Follow @-imports, transitively and outside code, from each AGENTS.md and CLAUDE.md in the file's
  # folder, the cwd, and their parents. Paths compare by realpath; the seen set ends cycles.
  [[ $tool == Read && -n $resolved ]] && perl -MCwd=realpath -MFile::Basename=dirname -e '
    my ($target, @dirs) = @ARGV; my (@queue, %seen);
    for my $d (grep { m{^/} } @dirs) {
      while (1) { push @queue, grep { -f } "$d/AGENTS.md", "$d/CLAUDE.md"; last if $d eq "/"; $d = dirname $d }
    }
    while (defined(my $f = shift @queue)) {
      my $file = realpath($f) or next;
      next unless -f $file;
      next if $seen{$file}++;
      open my $fh, "<", $file or next;
      my $text = do { local $/; <$fh> };
      $text =~ s/^```.*?^```//msg;
      $text =~ s/`[^`\n]*`//g;
      for my $p ($text =~ /(?:^|(?<=\s))@(\S+)/mg) {
        $p =~ s/[,.;:)]+$//;
        $p =~ s{^~/}{$ENV{HOME}/};
        my $real = realpath($p =~ m{^/} ? $p : dirname($file) . "/$p") or next;
        exit 0 if $real eq $target;
        push @queue, $real;
      }
    }
    exit 1' "$resolved" "$(dirname "$resolved")" "$(realpath "$cwd" 2>/dev/null)" && exit 0
  if [[ $tool == Bash ]] && ! jq -r '.tool_input.command' <<<"$input" | grep -q '\$(\|`' &&
     perl -0ne 's/\d*>&\d+//g; exit !!grep { !/^\s*$/ && !/^\s*(cd|echo)(\s|$)/ &&
       !/^\s*gh\s+(issue|pr)\s+(view|list)(\s|$)/ && !/^\s*git\s+fetch(\s+(?!-|\S*Q)[\w.\/:@+^~-]+)*\s*$/ &&
       !/^\s*(~|\$HOME)\/\.claude\/skills\/ross-mode\/scripts\/log\.sh(\s|$)/ } split /[;&|\n]+/' <<<"$cmd"; then
    exit 0
  fi
  deny "ross-mode: you declared $(<"$pending"), which starts with scouts. Launch Ross - Scout with mcp__paseo__create_agent (start the prompt with the sentence from its profile notes, see Subagents in ~/.claude/skills/ross-mode/SKILL.md) before reading code yourself. Meanwhile you can Read AGENTS.md, CLAUDE.md and the files they @-import, and only cd, echo, gh issue|pr view|list, git fetch without options, and ~/.claude/skills/ross-mode/scripts/log.sh run in Bash (no pipes)."
fi
[[ $tool == ToolSearch || -n $in_skill ]] && exit 0

# If the marker can't be written, TaskCreate can never clear a deny, so fail open.
mkdir -p "$marker_dir" 2>/dev/null && [[ -w $marker_dir ]] || exit 0

deny "ross-mode: open the todo list first. Call TaskCreate once per playbook step (load it with ToolSearch select:TaskCreate,TaskUpdate). The first TaskCreate declares your playbook in metadata, as {\"playbook\": \"<name>\"}. Until then only ToolSearch, TaskCreate, and Read/Glob/Grep on $skill_dir are allowed."
