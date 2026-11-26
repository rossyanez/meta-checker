#!/bin/bash
# PreToolUse hook: deny software installs in Ross - Worker sessions.
# Lead sessions and Ross's own sessions pass. Fails open (no output) on malformed input,
# a missing or unreadable transcript, or bad JSON, so a broken hook can't brick a session.

# One rule per line, <label>|<Perl regex>, matched against a segment's command after a strip that
# skips VAR=value assignments, any run of shell keywords, { , ! and wrappers (sudo, env, command,
# exec, arch, time, nohup, xargs) with their flags, and a path prefix.
rules='brew install/uninstall|brew\s+(install|reinstall|uninstall|remove|rm)(\s|$)
npm global install/uninstall|npm(?=.*\s(-g|--global|--location=global)(\s|$))(\s+-\S+)*\s+(i|install|add|uninstall|un|remove|rm)(\s|$)
pip install/uninstall|(pip(3(\.\d+)?)?|python(3(\.\d+)?)?\s+-m\s+pip)\s+(install|uninstall)(\s|$)'

input=$(cat)

# Split a Bash command on ; && || | & newlines $( ( and backticks, and print the first matching rule's label.
# Heredoc bodies are stripped and quoted strings become Q first, so quoted text and heredoc bodies are ignored,
# except a double-quoted string holding an unescaped $( or backtick, whose substitution bash still runs.
# Any run of shell keywords, { and !, and wrappers (with their flags) before the command is skipped.
label=$(jq -r 'select(.tool_name=="Bash") | .tool_input.command // empty' <<<"$input" 2>/dev/null |
  RULES=$rules perl -0ne '
  s/<<-?\s*\\?([\x27"]?)(\w+)\1([^\n]*\n).*?^\s*\2\s*$/<<$3/gms;
  s/"(?:\\.|[^"\\])*"|\x27[^\x27]*\x27/my $s = $&; $s =~ m{^"} && ($s =~ s{\\.}{}gr) =~ m{\$\(|`} ? $s : "Q"/gse;
  my @rules = map { [split /\|/, $_, 2] } split /\n/, $ENV{RULES};
  for my $seg (split /[;&|\n(`]/) {
    $seg =~ s/^\s*(\w+=\S*\s+)*(([{!]|sudo|env|command|exec|arch|if|elif|while|until|then|do|else|time|nohup|xargs)(\s+-\S+)*\s+(\w+=\S*\s+)*)*(\S*\/)?//;
    for (@rules) { if ($seg =~ /^$_->[1]/) { print $_->[0]; exit } }
  }')
[[ -n $label ]] || exit 0

# A worker's first user entry opens with the sentence from its profile notes. Stream to that entry.
# Paseo wraps a prompt one agent sends another in a <paseo-system ...> tag line,
# so the hook drops a leading tag line and tests the line after it.
transcript=$(jq -r '.transcript_path // empty' <<<"$input")
[[ -f $transcript && -r $transcript ]] || exit 0
first_line=$(jq -nr 'first(inputs | select(.type == "user")) | .message.content
  | if type == "string" then . else map(select(.type == "text") | .text) | join("") end
  | sub("^<paseo-system [^\n]*\n"; "")' \
  "$transcript" 2>/dev/null | head -n 1)
[[ $first_line == "Follow the role brief in "* && ${first_line%%.md*} == */agents/ross-worker ]] || exit 0

jq -cn --arg r "Blocked ($label): Ross - Worker sessions can't install or uninstall software on Ross's Mac. Report what you needed to the lead instead." \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
