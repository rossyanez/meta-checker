#!/bin/bash
# PreToolUse hook: deny bare commands that post to GitHub as Ross, so posts go through scripts/gh-post.sh,
# which checks the item is Ross's. It applies to every session that loads it. Fails open (no output) on
# malformed input, so a broken hook can't brick a session.
# gh pr merge passes (merging is Ross's call, not this rule's). gh-post.sh and verdict-status.sh pass, since
# their gh calls run inside the script. Known gaps: a gh api graphql mutation, a quoted method
# (gh api -X 'DELETE'), gh issue delete or transfer, gh pr ready, and bash -c '...' or any other command
# hidden in a quoted string.
#
# --scan [path...] (default skills): run the same rules, unanchored, over every line of every *.md under
# the paths. Prints file:line: <label>: <text> per hit, exits 1 on any hit.

# One rule per line, <label>|<Perl regex>. The hook matches each against a segment's command after a strip
# that skips VAR=value assignments, any run of shell keywords, { , ! and wrappers (sudo, env, command, exec,
# arch, time, nohup, xargs, and timeout with its duration) with their flags, and a path prefix.
rules='gh issue/pr post|gh\s+(issue|pr)\s+((-R|--repo)(\s+|=)\S+\s+)?(comment|create|edit|close|reopen|review|lock|unlock)(?![\w-])
gh api write|gh\s+api(?![\w-])(?!.*\sgraphql(?![\w-]))(?!.*\s(-X\s*|--method(\s+|=))(?i:GET)(?!\w))(?=.*\s(-X\s*|--method(\s+|=))(?i:POST|PATCH|PUT|DELETE)(?!\w)|.*\s(-[fF]|--field|--raw-field|--input)(?![-]))'

if [[ ${1:-} == --scan ]]; then
  shift
  [[ $# -gt 0 ]] || set -- skills
  RULES=$rules exec perl -MFile::Find -e '
    my @rules = map { [split /\|/, $_, 2] } split /\n/, $ENV{RULES};
    for (@ARGV) { -e or do { print STDERR "deny-bare-gh-posts: no such path: $_\n"; exit 2 } }
    my (@files, $hit);
    find(sub { push @files, $File::Find::name if -f && /\.md\z/ }, @ARGV);
    for my $f (sort @files) {
      open my $fh, "<", $f or next;
      while (my $l = <$fh>) {
        for my $r (@rules) {
          if ($l =~ /$r->[1]/) { chomp $l; print "$f:$.: $r->[0]: $l\n"; $hit = 1; last }
        }
      }
    }
    exit($hit ? 1 : 0);' "$@"
fi

# Split a Bash command on ; && || | & newlines $( ( and backticks, and print the first matching rule's label.
# Heredoc bodies are stripped and quoted strings become Q first, so quoted text and heredoc bodies are ignored,
# except a double-quoted string holding an unescaped $( or backtick, whose substitution bash still runs.
# Any run of shell keywords, { and !, and wrappers (with their flags) before the command is skipped.
label=$(jq -r 'select(.tool_name=="Bash") | .tool_input.command // empty' 2>/dev/null |
  RULES=$rules perl -0ne '
  s/<<-?\s*\\?([\x27"]?)(\w+)\1([^\n]*\n).*?^\s*\2\s*$/<<$3/gms;
  s/"(?:\\.|[^"\\])*"|\x27[^\x27]*\x27/my $s = $&; $s =~ m{^"} && ($s =~ s{\\.}{}gr) =~ m{\$\(|`} ? $s : "Q"/gse;
  my @rules = map { [split /\|/, $_, 2] } split /\n/, $ENV{RULES};
  for my $seg (split /[;&|\n(`]/) {
    $seg =~ s/^\s*(\w+=\S*\s+)*(([{!]|sudo|env|command|exec|arch|if|elif|while|until|then|do|else|time|nohup|xargs|timeout(\s+-[sk]\s+\S+|\s+-\S+)*\s+[\d.]+[smhd]?)(\s+-\S+)*\s+(\w+=\S*\s+)*)*(\S*\/)?//;
    for (@rules) { if ($seg =~ /^$_->[1]/) { print $_->[0]; exit } }
  }')
[[ -n $label ]] || exit 0

jq -cn --arg r "Blocked ($label): post to GitHub as Ross only with ~/.claude/skills/ross-mode/scripts/gh-post.sh, which checks the item is Ross's first. If the item isn't Ross's, don't post; tell Ross in your reply." \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
