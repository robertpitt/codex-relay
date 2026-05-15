import { Context, Effect, Layer, Path } from "effect";
import type { AgentTicketUpdateInput, CreateDraftInput, StartRunInput, TicketRedraftInput } from "@shared/schemas";
import type { BackendIoServices, BackendServicesBase } from "../../../runtime";
import { WorkEngine, type WorkEngineService } from "../engine";
import { WorkLedger } from "../ledger";
import { WorkScheduler } from "../scheduler";
import {
  snapshotToWorkHandle,
  workKindFor,
  type WorkError,
  type WorkHandle,
  type WorkSubmitInput
} from "../domain";

type TicketWorkServices =
  | BackendServicesBase
  | BackendIoServices
  | Context.Service.Identifier<typeof WorkEngine>
  | Context.Service.Identifier<typeof WorkLedger>
  | Context.Service.Identifier<typeof WorkScheduler>
  | Context.Service.Identifier<typeof TicketWorkService>;

type TicketWorkEffect<A> = Effect.Effect<A, WorkError, TicketWorkServices>;

export type TicketWorkService = {
  readonly submitDraft: (
    input: CreateDraftInput,
    options: { readonly runId: string; readonly ticketId: string }
  ) => TicketWorkEffect<WorkHandle>;
  readonly submitRedraft: (
    input: TicketRedraftInput,
    options: { readonly runId: string }
  ) => TicketWorkEffect<WorkHandle>;
  readonly submitUpdate: (
    input: AgentTicketUpdateInput,
    options: { readonly runId: string }
  ) => TicketWorkEffect<WorkHandle>;
  readonly submitImplementation: (
    input: StartRunInput,
    options: { readonly runId: string; readonly resume: boolean }
  ) => TicketWorkEffect<WorkHandle>;
};

export const TicketWorkService = Context.Service<TicketWorkService>("relay/TicketWorkService");

const resolvePath = (target: string): Effect.Effect<string, never, Path.Path> =>
  Path.Path.use((path) => Effect.succeed(path.resolve(target)));

const keyPart = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

const idempotencyKey = (parts: readonly unknown[]): string => parts.map(keyPart).join(":");

const submitTicketWork = (
  engine: WorkEngineService,
  input: Omit<WorkSubmitInput, "kind">
): TicketWorkEffect<WorkHandle> => {
  const kind = workKindFor(input.subject, input.action);
  return engine.submit({ ...input, kind });
};

const submitDraft: TicketWorkService["submitDraft"] = (input, options) =>
  Effect.gen(function*() {
    const projectPath = yield* resolvePath(input.projectPath);
    const engine = yield* WorkEngine;
    return yield* submitTicketWork(engine, {
      workId: options.runId,
      projectPath,
      ticketId: options.ticketId,
      runId: options.runId,
      subject: "ticket",
      action: "draft",
      idempotencyKey: idempotencyKey(["ticket.draft", projectPath, options.ticketId, options.runId]),
      executor: "agent",
      providerId: "codex",
      requiredCapabilities: ["agent.structured-output"],
      payload: { ...input, projectPath, runId: options.runId, ticketId: options.ticketId },
      metadata: { providerId: "codex" }
    });
  });

const submitRedraft: TicketWorkService["submitRedraft"] = (input, options) =>
  Effect.gen(function*() {
    const projectPath = yield* resolvePath(input.projectPath);
    const engine = yield* WorkEngine;
    return yield* submitTicketWork(engine, {
      workId: options.runId,
      projectPath,
      ticketId: input.ticketId,
      runId: options.runId,
      subject: "ticket",
      action: "redraft",
      idempotencyKey: idempotencyKey(["ticket.redraft", projectPath, input.ticketId, options.runId]),
      executor: "agent",
      providerId: "codex",
      requiredCapabilities: ["agent.structured-output"],
      payload: { ...input, projectPath, runId: options.runId },
      metadata: { providerId: "codex" }
    });
  });

const submitUpdate: TicketWorkService["submitUpdate"] = (input, options) =>
  Effect.gen(function*() {
    const projectPath = yield* resolvePath(input.projectPath);
    const engine = yield* WorkEngine;
    return yield* submitTicketWork(engine, {
      workId: options.runId,
      projectPath,
      ticketId: input.ticketId,
      runId: options.runId,
      subject: "ticket",
      action: "update",
      idempotencyKey: idempotencyKey(["ticket.update", projectPath, input.ticketId, options.runId]),
      executor: "agent",
      providerId: "codex",
      requiredCapabilities: ["agent.structured-output"],
      payload: { ...input, projectPath, runId: options.runId },
      metadata: { providerId: "codex" }
    });
  });

const submitImplementation: TicketWorkService["submitImplementation"] = (input, options) =>
  Effect.gen(function*() {
    const projectPath = yield* resolvePath(input.projectPath);
    const engine = yield* WorkEngine;
    return yield* submitTicketWork(engine, {
      workId: options.runId,
      projectPath,
      ticketId: input.ticketId,
      runId: options.runId,
      subject: "ticket",
      action: "implement",
      idempotencyKey: idempotencyKey(["ticket.implementation", projectPath, input.ticketId, options.runId]),
      executor: "agent",
      providerId: "codex",
      requiredCapabilities: ["agent.code-edit", "agent.resume"],
      payload: { ...input, projectPath, runId: options.runId, resume: options.resume },
      metadata: { providerId: "codex", resume: options.resume }
    });
  });

export const TicketWorkServiceLive = Layer.succeed(TicketWorkService)({
  submitDraft,
  submitRedraft,
  submitUpdate,
  submitImplementation
});

export { snapshotToWorkHandle };
