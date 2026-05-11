import type { TicketDraft } from "@shared/types";

const list = (items: string[]): string =>
  items.length > 0 ? items.map((item) => `- ${item.replace(/\s+/g, " ").trim()}`).join("\n") : "- None.";

const researchMetadata = (draft: TicketDraft): string => {
  if (
    draft.research.checkedUrls.length === 0 &&
    draft.research.inspectedFiles.length === 0 &&
    draft.research.limitations.length === 0
  ) {
    return "- No research metadata recorded.";
  }
  const urls = draft.research.checkedUrls.map((source) => {
    const title = source.title ? ` (${source.title})` : "";
    const reason = source.reason ? ` - ${source.reason}` : "";
    return `- URL ${source.status}: ${source.url}${title}; characters read: ${source.charactersRead}${reason}`;
  });
  const files = draft.research.inspectedFiles.map((file) => {
    const symbols = file.symbols.length > 0 ? `; symbols: ${file.symbols.slice(0, 6).join(", ")}` : "";
    return `- File inspected: ${file.path} - ${file.reason}; characters read: ${file.charactersRead}${symbols}`;
  });
  const limitations = draft.research.limitations.map((limitation) => `- Limitation: ${limitation}`);
  return [...urls, ...files, ...limitations].join("\n");
};

export const markdownFromDraft = (draft: TicketDraft): string => `# ${draft.title}

## Context

${draft.context || "No additional context provided."}

## Research Findings

${list(draft.researchFindings)}

## Requirements

${list(draft.requirements)}

## Implementation Plan

${list(draft.implementationPlan)}

## Acceptance Criteria

${list(draft.acceptanceCriteria)}

## Clarification Questions

${list(draft.clarificationQuestions)}

## Implementation Notes

${list(draft.implementationNotes)}

## Research Metadata

${researchMetadata(draft)}

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
