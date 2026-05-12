---
schemaVersion: 1
id: tkt_01krf8t7j1vg54c53wfhjsa30t
title: >-
  Draft: I want to remove the Create Ticket dialog and button all together and
  instead...
ticketType: task
status: needs_clarification
position: 20000
priority: medium
effort: medium
labels: []
parentEpicId: null
subticketIds: []
blockedByIds: []
relatedTicketIds: []
createdAt: '2026-05-12T23:37:05.345Z'
updatedAt: '2026-05-12T23:37:27.967Z'
authoringState: needs_input
codexThreadId: null
runStatus: blocked
lastRunId: run_01krf8t7gapss0h9vajv3zhcyn
lastRunStartedAt: null
---
# Draft: I want to remove the Create Ticket dialog and button all together and instead...

## Drafting State

The agent researched this draft but needs user input before it can produce an implementation-ready ticket. Answer the clarification questions below; drafting will resume automatically once every question is answered.

## Original Idea

I want to remove the Create Ticket dialog and button all together and instead I want to replace it with a floating input bar in the bottom center of the screen, like a rounded floating text area, transparent, less transparent on hover, clean bordered when focused, rounded edges with thin border lines, when the user starts typing they will have a some small text like "Type ↓", "Mode ↓", "Priority ↓", 'Effort ↓' (no title or labels)

This will be a much more elgent way of creating tickets.

If the user enteres many lines of text the earch area should grow to around 100 lines but then become scrollable

## Open Clarification Questions

- How should the floating bar submit a ticket idea? Why it matters: The dialog removal leaves no obvious primary action, and implementation needs a clear trigger for creating the draft without conflicting with multi-line text entry. Recommended answer: Use a compact icon submit button inside the floating bar plus Cmd+Enter/Ctrl+Enter as keyboard shortcuts; Enter inserts a newline in the textarea.
- What should the new "Mode" control choose between? Why it matters: Type, Priority, and Effort likely map to existing ticket metadata, but Mode is ambiguous and could mean draft mode, implementation mode, or ticket scope. Recommended answer: Mode selects the drafting scope: Quick bug, Task, Product feature, Rewrite/refactor, and Epic, defaulting to Task.

## Research Metadata

- No research metadata recorded.

## Codex Handoff

Ticket draft generation is blocked on clarification.
