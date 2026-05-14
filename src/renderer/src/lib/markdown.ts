import type { TicketDraft, TicketDraftSubticket } from "@shared/schemas";

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

const draftGoal = (draft: TicketMarkdownDraft): string =>
  draft.requirements.find((item) => item.trim().length > 0) ?? `Deliver ${draft.title}.`;

const draftDecisionList = (draft: TicketMarkdownDraft): string[] => [
  ...(draft.assumptions ?? []),
  ...(draft.clarificationQuestions ?? [])
];

const draftImplementationNotes = (draft: TicketMarkdownDraft): string[] => [
  ...(draft.researchFindings ?? []).map((finding) => `Codebase finding: ${finding}`),
  ...(draft.implementationPlan ?? []).map((step) => `Implementation: ${step}`),
  ...(draft.implementationNotes ?? [])
];

export const markdownFromDraft = (draft: TicketMarkdownDraft): string => `# ${draft.title}

## Context

${draft.context || "No additional context provided."}

## Goal

${draftGoal(draft)}

## Decisions / Assumptions

${list(draftDecisionList(draft))}

## Requirements

${list(draft.requirements)}

## Acceptance Criteria

${list(draft.acceptanceCriteria)}

## Test Plan

${list(draft.testPlan)}

## Implementation Notes

${list(draftImplementationNotes(draft))}

## Codex Handoff

No Codex run has been started.
`;

export const markdownFromSubticketDraft = (draft: TicketDraftSubticket, parentTitle: string): string => `# ${draft.title}

## Context

Parent epic: ${parentTitle}

${draft.context || "No additional context provided."}

## Goal

${draftGoal(draft)}

## Decisions / Assumptions

${list(draftDecisionList(draft))}

## Requirements

${list(draft.requirements)}

## Acceptance Criteria

${list(draft.acceptanceCriteria)}

## Test Plan

${list(draft.testPlan)}

## Implementation Notes

${list(draftImplementationNotes(draft))}

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
