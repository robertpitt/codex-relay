---
schemaVersion: 1
id: tkt_01krghmnx1j17v47fth6n6ytc9
title: >-
  Draft: For testing purpose, ceate a ticket but have two random questions asked
  and m...
ticketType: task
status: completed
position: 71000
priority: medium
effort: medium
labels: []
parentEpicId: null
subticketIds: []
blockedByIds: []
relatedTicketIds: []
createdAt: '2026-05-13T11:30:35.041Z'
updatedAt: '2026-05-13T12:10:49.467Z'
authoringState: needs_input
codexThreadId: null
runStatus: blocked
lastRunId: run_01krghmntw7vet9teg2yqxp5jr
lastRunStartedAt: null
---
# Draft: For testing purpose, ceate a ticket but have two random questions asked and m...

## Drafting State

The agent researched this draft but needs user input before it can produce an implementation-ready ticket. Answer the clarification questions below; drafting will resume automatically once every question is answered.

## Original Idea

For testing purpose, ceate a ticket but have two random questions asked and move to clarification so I can see the uI for when a ticket has outstanding questions

## Open Clarification Questions

- Which sample color should this test ticket mention?
- Which placeholder animal name should appear in the example answer?

## Research Metadata

- File inspected: tests/clarification-panel.test.tsx - Matched terms: questions, move, clarification; characters read: 4608; symbols: question, markup, longQuestion
  Matched lines:
  - 4: import { ClarificationPanel } from "../src/renderer/src/components/ClarificationPanel";
  - 5: import type { ClarificationQuestion } from "../src/shared/types";
- File inspected: src/renderer/src/components/ClarificationPanel.tsx - Matched terms: but, questions, clarification; characters read: 3430; symbols: ReactElement, ClarificationPanelVariant, ClarificationPanelProps, ClarificationPanel, headingId, panelClassName
  Matched lines:
  - 3: import type { ClarificationQuestion } from "@shared/types";
  - 6: type ClarificationPanelVariant = "default" | "primary" | "sidebar";
- File inspected: src/main/services/clarificationParser.ts - Matched terms: questions, clarification; characters read: 1722; symbols: RawQuestion, parseQuestion, question, rawQuestion, parseQuestionsJson, parsed
  Matched lines:
  - 1: import type { ClarificationQuestionCreateInput } from "../../shared/types";
  - 5: const parseQuestion = (value: RawQuestion): ClarificationQuestionCreateInput | null => {
- Limitation: Code search stopped after scanning 90 candidate files.

## Codex Handoff

Ticket draft generation is blocked on clarification.
