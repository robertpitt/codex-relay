import type { TicketReferenceCandidate } from "@shared/schemas";

export type TicketMentionToken = {
  start: number;
  end: number;
  query: string;
};

const invalidMentionQuery = /[\s\[\](){}<>]/;

const normalizeSearch = (value: string): string => value.trim().replace(/\s+/g, " ").toLowerCase();

export const getActiveTicketMention = (value: string, selectionStart: number, selectionEnd = selectionStart): TicketMentionToken | null => {
  if (selectionStart !== selectionEnd) return null;
  const beforeCursor = value.slice(0, selectionStart);
  const mentionStart = beforeCursor.lastIndexOf("@");
  if (mentionStart < 0) return null;

  const previous = mentionStart > 0 ? value[mentionStart - 1] : "";
  if (previous && /[\w./-]/.test(previous)) return null;

  const query = beforeCursor.slice(mentionStart + 1);
  if (invalidMentionQuery.test(query)) return null;

  return {
    start: mentionStart,
    end: selectionStart,
    query
  };
};

export const filterTicketReferenceCandidates = (
  candidates: TicketReferenceCandidate[],
  query: string,
  limit = 8
): TicketReferenceCandidate[] => {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return candidates.slice(0, limit);

  return candidates
    .map((candidate) => {
      const title = normalizeSearch(candidate.title);
      const path = normalizeSearch(candidate.relativePath);
      const status = normalizeSearch(candidate.columnName || candidate.status);
      const score =
        title.startsWith(normalizedQuery)
          ? 0
          : title.includes(normalizedQuery)
            ? 1
            : path.includes(normalizedQuery)
              ? 2
              : status.includes(normalizedQuery)
                ? 3
                : null;

      return score === null ? null : { candidate, score };
    })
    .filter((item): item is { candidate: TicketReferenceCandidate; score: number } => item !== null)
    .sort((a, b) => a.score - b.score || a.candidate.title.localeCompare(b.candidate.title))
    .slice(0, limit)
    .map((item) => item.candidate);
};

export const escapeMarkdownLinkText = (value: string): string => value.replace(/\\/g, "\\\\").replace(/([\[\]])/g, "\\$1");

export const encodeMarkdownLinkDestination = (value: string): string =>
  value
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => (segment === "." || segment === ".." ? segment : encodeURIComponent(segment)))
    .join("/");

export const formatTicketReferenceMarkdown = (candidate: TicketReferenceCandidate): string => {
  const title = candidate.title.trim() || candidate.id;
  return `[${escapeMarkdownLinkText(title)}](${encodeMarkdownLinkDestination(candidate.linkPath)})`;
};

export const replaceTicketMention = (
  value: string,
  token: TicketMentionToken,
  candidate: TicketReferenceCandidate
): { value: string; cursor: number } => {
  const link = formatTicketReferenceMarkdown(candidate);
  const nextValue = `${value.slice(0, token.start)}${link}${value.slice(token.end)}`;
  return {
    value: nextValue,
    cursor: token.start + link.length
  };
};
