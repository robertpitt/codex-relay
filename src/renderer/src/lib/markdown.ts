import type { TicketDraft, TicketDraftSubticket } from "@shared/types";

const list = (items: readonly string[] | undefined): string => {
  if (!items) return "- None.";
  const cleaned = items.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.map((item) => `- ${item}`).join("\n") : "- None.";
};

const cleanMarkdownText = (value: string): string =>
  value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+.*$/gm, " ")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[>*_~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const truncatePreviewText = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value;
  const truncated = value.slice(0, maxLength + 1);
  const wordBoundary = truncated.lastIndexOf(" ");
  const cutoff = wordBoundary >= Math.floor(maxLength * 0.65) ? wordBoundary : maxLength;
  return `${value.slice(0, cutoff).trim().replace(/[.,;:!?-]+$/, "")}...`;
};

type TicketMarkdownDraft = TicketDraftSubticket & { research?: TicketDraft["research"] };

const researchMetadata = (draft: TicketMarkdownDraft): string => {
  if (
    !draft.research ||
    (draft.research.checkedUrls.length === 0 &&
      draft.research.inspectedFiles.length === 0 &&
      draft.research.limitations.length === 0)
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
    const matches =
      file.matches.length > 0 ? `\n  Matched lines:\n${file.matches.map((match) => `  - ${match}`).join("\n")}` : "";
    return `- File inspected: ${file.path} - ${file.reason}; characters read: ${file.charactersRead}${symbols}${matches}`;
  });
  const limitations = draft.research.limitations.map((limitation) => `- Limitation: ${limitation}`);
  return [...urls, ...files, ...limitations].join("\n");
};

export const markdownFromDraft = (draft: TicketMarkdownDraft): string => `# ${draft.title}

## Context

${draft.context || "No additional context provided."}

## Codebase Findings

${list(draft.researchFindings)}

## Requirements

${list(draft.requirements)}

## Implementation Plan

${list(draft.implementationPlan)}

## Test Plan

${list(draft.testPlan)}

## Acceptance Criteria

${list(draft.acceptanceCriteria)}

## Assumptions / Open Questions

${list([...(draft.assumptions ?? []), ...(draft.clarificationQuestions ?? [])])}

## Implementation Notes

${list(draft.implementationNotes)}

## Research Metadata

${researchMetadata(draft)}

## Codex Handoff

No Codex run has been started.
`;

export const markdownFromSubticketDraft = (draft: TicketDraftSubticket, parentTitle: string): string => `# ${draft.title}

## Parent Epic

${parentTitle}

## Context

${draft.context || "No additional context provided."}

## Codebase Findings

${list(draft.researchFindings)}

## Requirements

${list(draft.requirements)}

## Implementation Plan

${list(draft.implementationPlan)}

## Test Plan

${list(draft.testPlan)}

## Acceptance Criteria

${list(draft.acceptanceCriteria)}

## Assumptions / Open Questions

${list([...(draft.assumptions ?? []), ...(draft.clarificationQuestions ?? [])])}

## Implementation Notes

${list(draft.implementationNotes)}

## Codex Handoff

No Codex run has been started.
`;

export const ticketDraftDialogSubtext = (draft: TicketDraft, maxLength = 150): string => {
  const summary = cleanMarkdownText((draft as TicketDraft & { summary?: string | null }).summary ?? "");
  if (summary.length > 0) return summary;

  const bodyMarkdown = markdownFromDraft(draft).replace(/^# .*\n+/, "");
  const bodyText = cleanMarkdownText(bodyMarkdown);
  return truncatePreviewText(bodyText, maxLength);
};
