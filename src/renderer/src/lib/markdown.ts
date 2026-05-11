import type { TicketDraft } from "@shared/types";

const list = (items: string[]): string => (items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None.");

export const markdownFromDraft = (draft: TicketDraft): string => `# ${draft.title}

## Context

${draft.context || "No additional context provided."}

## Requirements

${list(draft.requirements)}

## Acceptance Criteria

${list(draft.acceptanceCriteria)}

## Clarification Questions

${list(draft.clarificationQuestions)}

## Implementation Notes

${list(draft.implementationNotes)}

## Codex Handoff

No Codex run has been started.
`;

export const emptyTicketMarkdown = (title: string): string => `# ${title}

## Context


## Requirements

- 

## Acceptance Criteria

- 

## Clarification Questions

- None.

## Implementation Notes

- 

## Codex Handoff

No Codex run has been started.
`;

