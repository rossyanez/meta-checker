### Sprint priorities

Starts with scouts: no.

Added, with no pstack counterpart. Two mechanics come from Lauren Tan's noodle scheduler. Every pick cites the rule that placed it, and an item that keeps slipping gets split instead of pushed. One comes from Anthropic's Claude Code best practices. A correction I make twice becomes a written rule.

Runs when I ask what to work on, which ticket comes first, or what's in my sprint.

1. **Tickets.** Run `~/.claude/skills/ross-mode/scripts/sprint-tickets.sh`. It prints each current sprint holding my open issues, my carryovers from ended sprints, and my other open assigned issues as the backlog. If it fails, report its error and stop.
2. **Corrections.** Read the rows in `$PASEO_HOME/audit/*/sprint-priorities.tsv`. A correction outranks the rubric. One that names a ticket lapses once that ticket is gone from step 1's output. A reason that appears in two rows, and that the rubric doesn't already say, is a rule I keep restating, so propose it as a rubric edit in the reply.
3. **Read** each sprint ticket with `gh issue view <url> --comments`. Read the same way each other ticket whose status says I started it, or that came back to me from QA or UAT. If no current sprint holds my tickets, read up to 5 backlog items that step 6 qualifies instead. If none qualify, say so, ask me to get a priority from the lead, and stop. Note what each ticket needs from another ticket, such as an API, a page, or a design, and whether that ticket is open. Note any person or ticket it says is waiting on it, whether its Done when can be checked, and any reference it lacks.
4. **Rank** what step 3 read by the rubric. The first rule that separates two tickets decides. Each ticket names the rule that placed it. If no current sprint holds my tickets, say so in one line first.
5. **Slipped.** A carryover whose status is still a not-started one, such as Backlog or New, slipped. Give the slipped ones one line: their count, their sprints, and a suggestion to raise them with the lead. Name only a slipped ticket that a sprint ticket depends on.
6. **Important backlog.** List up to 5 backlog items. One qualifies with a label starting `priority:p0` or `priority:p1`, a Priority of Critical or High, or a sprint ticket that depends on it. Leave out the rest. Skip this step when step 4 ranked the backlog.

When I correct the ranking, log each correction before you re-rank: `cd -P ~/.claude/skills/ross-mode && scripts/log.sh sprint-priorities correction "<what moved>" "<my reason>" "<ticket url or none>" logged`. Never relabel, reassign, or edit a team ticket.

**Rubric.**

1. **Finish before you start.** A ticket of mine in progress, or sent back to me from QA or UAT, goes first, whatever its sprint. A ticket waiting in QA, UAT, or a release queue waits on someone else, so count it and don't rank it.
2. **Unblock a teammate.** A ticket whose body or comments say another person's work waits on it.
3. **Dependencies.** A ticket another of mine builds on goes before it. A ticket waiting on someone else's open ticket goes after the ones that aren't, unless its UI can be built ahead of the API.
4. **The lead's call.** A Priority field or a `priority:*` label, then the earliest target date.
5. **Risk early.** A ticket with an open question, a missing design, or a new area goes earlier, so I can ask about it while the sprint has time left.
6. **The author's order.** A `#N` in the title, then the issue number.

**Reply:** each sprint's name, dates, and days left; the ranked tickets, each with the rule that placed it and the first thing to do; the slipped line and the count waiting on others; **Ask your lead**, listing missing designs, unclear Done when, and conflicts; Important backlog; corrections applied and any rubric edit proposed.
