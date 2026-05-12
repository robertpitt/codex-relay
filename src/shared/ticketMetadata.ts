import type { TicketChecklistSummary } from "./types";

export const emptyTicketChecklistSummary = (): TicketChecklistSummary => ({
  total: 0,
  completed: 0,
  open: 0
});

export const extractTicketChecklist = (markdown: string): TicketChecklistSummary => {
  const summary = emptyTicketChecklistSummary();
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const match = line.match(/^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])]\s+\S/);
    if (!match) continue;
    summary.total += 1;
    if (match[1].toLowerCase() === "x") {
      summary.completed += 1;
    } else {
      summary.open += 1;
    }
  }
  return summary;
};
