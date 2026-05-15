import { Effect, Path } from "effect";
import type {
  ClarificationAnswerInput,
  EpicSubticketCreateInput,
  EpicSubticketLinkInput,
  EpicSubticketUnlinkInput,
  TicketAttachmentSaveInput,
  TicketCreateInput,
  TicketMoveInput,
  TicketSaveInput
} from "@shared/schemas";
import { errorMessage } from "../domain/errors";
import { isTicketNotFoundError, Storage } from "../storage";

export const createManualTicket = (projectPath: string, input: TicketCreateInput) =>
  Storage.use((storage) => storage.createTicket(projectPath, input));

export const createSubticket = (input: EpicSubticketCreateInput) =>
  Storage.use((storage) => storage.createSubticket(input));

export const linkSubticket = (input: EpicSubticketLinkInput) =>
  Storage.use((storage) => storage.linkSubticket(input.projectPath, input.epicId, input.ticketId));

export const unlinkSubticket = (input: EpicSubticketUnlinkInput) =>
  Storage.use((storage) => storage.unlinkSubticket(input.projectPath, input.epicId, input.ticketId));

export const listTicketReferences = (projectPath: string) =>
  Storage.use((storage) => storage.listTicketReferenceCandidates(projectPath));

export const readTicket = (projectPath: string, ticketId: string) =>
  Effect.gen(function*() {
    const path = yield* Path.Path;
    const resolvedProjectPath = path.resolve(projectPath);
    const storage = yield* Storage;
    return yield* storage.getTicket(resolvedProjectPath, ticketId);
  }).pipe(
    Effect.catch((error: unknown) =>
      Effect.gen(function*() {
        const path = yield* Path.Path;
        const resolvedProjectPath = path.resolve(projectPath);
        const meta = { projectPath: resolvedProjectPath, ticketId };
        if (isTicketNotFoundError(error)) {
          yield* Effect.logWarning("ticket file missing").pipe(
            Effect.annotateLogs({ scope: "ticket:read", ...meta, filePath: error.filePath })
          );
        } else {
          yield* Effect.logError("ticket read failed").pipe(Effect.annotateLogs({
            scope: "ticket:read",
            errorMessage: errorMessage(error),
            stack: error instanceof Error ? error.stack : undefined,
            ...meta
          }));
        }
        return yield* Effect.fail(error);
      })
    )
  );

export const saveTicket = (input: TicketSaveInput) =>
  Storage.use((storage) => storage.saveTicket(input));

export const saveTicketAttachment = (input: TicketAttachmentSaveInput) =>
  Storage.use((storage) => storage.saveTicketAttachment(input));

export const moveTicket = (input: TicketMoveInput) =>
  Storage.use((storage) => storage.moveTicket(input));

export const listClarifications = (projectPath: string, ticketId: string) =>
  Storage.use((storage) => storage.getClarificationQuestions(projectPath, ticketId));

export const answerClarification = (input: ClarificationAnswerInput) =>
  Storage.use((storage) => storage.answerClarificationQuestion(input.projectPath, input.ticketId, input.questionId, input.answer));

export const deleteTicket = (projectPath: string, ticketId: string) =>
  Storage.use((storage) => storage.deleteTicket(projectPath, ticketId));

export const duplicateTicket = (projectPath: string, ticketId: string) =>
  Storage.use((storage) => storage.duplicateTicket(projectPath, ticketId));

export const revealTicketFile = (projectPath: string, ticketId: string) =>
  Storage.use((storage) => storage.revealTicketFile(projectPath, ticketId));
