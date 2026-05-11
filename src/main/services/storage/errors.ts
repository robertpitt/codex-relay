export class TicketNotFoundError extends Error {
  readonly code = "TICKET_NOT_FOUND";
  readonly projectPath: string;
  readonly ticketId: string;
  readonly filePath: string;

  constructor(projectPath: string, ticketId: string, filePath: string, cause?: unknown) {
    super(`Ticket ${ticketId} was not found in project ${projectPath}.`, { cause });
    this.name = "TicketNotFoundError";
    this.projectPath = projectPath;
    this.ticketId = ticketId;
    this.filePath = filePath;
  }
}

export const isTicketNotFoundError = (error: unknown): error is TicketNotFoundError =>
  error instanceof TicketNotFoundError;
