import type { RelayColumn, TicketFrontMatter } from "./types";

export type TicketBlockerItem = Pick<
  TicketFrontMatter,
  "id" | "title" | "ticketType" | "status" | "parentEpicId" | "subticketIds" | "blockedByIds"
>;

export type ResolvedTicketBlocker = {
  id: string;
  title: string;
  ticketType: TicketBlockerItem["ticketType"];
  status: string;
  columnName: string;
  terminal: boolean;
  parentEpicId: string | null;
  parentTitle: string | null;
  subticketCount: number;
  contextLabel: string;
  active: boolean;
};

export type TicketBlockerResolution = {
  blockerIds: string[];
  resolvedBlockers: ResolvedTicketBlocker[];
  activeBlockers: ResolvedTicketBlocker[];
  terminalBlockers: ResolvedTicketBlocker[];
  missingBlockerIds: string[];
  selfBlockerIds: string[];
  warnings: string[];
  isBlocked: boolean;
};

export const uniqueTicketIds = (ticketIds: readonly string[] | null | undefined): string[] => {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const ticketId of ticketIds ?? []) {
    const trimmed = ticketId.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    unique.push(trimmed);
  }
  return unique;
};

export const ticketContextLabel = (ticket: TicketBlockerItem, tickets: readonly TicketBlockerItem[]): string => {
  if (ticket.ticketType === "epic") {
    const subticketCount = uniqueTicketIds(ticket.subticketIds).length;
    return subticketCount === 1 ? "Epic, 1 subticket" : `Epic, ${subticketCount} subtickets`;
  }

  if (ticket.parentEpicId) {
    const parent = tickets.find((candidate) => candidate.id === ticket.parentEpicId);
    return parent ? `Subticket of ${parent.title}` : `Subticket of missing epic ${ticket.parentEpicId}`;
  }

  return "Ticket";
};

export const ticketBlockerOptionLabel = (
  ticket: TicketBlockerItem,
  tickets: readonly TicketBlockerItem[],
  columns: readonly RelayColumn[]
): string => `${ticket.title} (${ticketContextLabel(ticket, tickets)}; ${statusName(columns, ticket.status)})`;

export const resolvedBlockerLabel = (blocker: ResolvedTicketBlocker): string =>
  `${blocker.title} (${blocker.contextLabel}; ${blocker.columnName})`;

export const statusName = (columns: readonly RelayColumn[], status: string): string =>
  columns.find((column) => column.id === status)?.name ?? status;

export const isTerminalStatus = (columns: readonly RelayColumn[], status: string): boolean =>
  Boolean(columns.find((column) => column.id === status)?.terminal);

export const resolveTicketBlockers = (
  ticket: Pick<TicketBlockerItem, "id" | "blockedByIds">,
  tickets: readonly TicketBlockerItem[],
  columns: readonly RelayColumn[]
): TicketBlockerResolution => {
  const blockerIds = uniqueTicketIds(ticket.blockedByIds);
  const byId = new Map(tickets.map((candidate) => [candidate.id, candidate]));
  const resolvedBlockers: ResolvedTicketBlocker[] = [];
  const missingBlockerIds: string[] = [];
  const selfBlockerIds: string[] = [];

  for (const blockerId of blockerIds) {
    if (blockerId === ticket.id) {
      selfBlockerIds.push(blockerId);
      continue;
    }

    const blocker = byId.get(blockerId);
    if (!blocker) {
      missingBlockerIds.push(blockerId);
      continue;
    }

    const column = columns.find((candidate) => candidate.id === blocker.status);
    const terminal = Boolean(column?.terminal);
    resolvedBlockers.push({
      id: blocker.id,
      title: blocker.title,
      ticketType: blocker.ticketType,
      status: blocker.status,
      columnName: column?.name ?? blocker.status,
      terminal,
      parentEpicId: blocker.parentEpicId,
      parentTitle: blocker.parentEpicId ? byId.get(blocker.parentEpicId)?.title ?? null : null,
      subticketCount: uniqueTicketIds(blocker.subticketIds).length,
      contextLabel: ticketContextLabel(blocker, tickets),
      active: !terminal
    });
  }

  const activeBlockers = resolvedBlockers.filter((blocker) => blocker.active);
  const terminalBlockers = resolvedBlockers.filter((blocker) => !blocker.active);
  const warnings = [
    ...missingBlockerIds.map((blockerId) => `Missing blocker reference: ${blockerId}`),
    ...selfBlockerIds.map(() => "Ticket cannot block itself.")
  ];

  return {
    blockerIds,
    resolvedBlockers,
    activeBlockers,
    terminalBlockers,
    missingBlockerIds,
    selfBlockerIds,
    warnings,
    isBlocked: activeBlockers.length > 0
  };
};
