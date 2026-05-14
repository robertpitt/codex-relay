import { Effect, Layer } from "effect";
import { relayRpcGroup, type RelayRpcError } from "@shared/rpc";
import type { ProjectEditorId, ProjectOpenInEditorInput, ProjectOpenInEditorResult, TicketDraftStartResult, TicketSuggestionsGenerateResult } from "@shared/types";
import { errorMessage } from "../../domain";
import { isTicketNotFoundError, Storage } from "../../storage";
import { CommandExecutor, pathResolve } from "../../io";
import { ElectronDialog, ElectronShell } from "../../platform/electron";
import { fromPromise } from "../../runtime";
import {
  approveCodexAction,
  cancelCodexRun,
  cancelTicketUpdateRun,
  createDraftIntake,
  generateTicketSuggestions,
  getCodexStatus,
  maybeResumeTicketDraftAfterClarification,
  preflightCodexRun,
  readCodexLatestRunSummary,
  readCodexRunEvents,
  reconcileTicketQueueState,
  resumeCodexRun,
  sendRepositoryChatMessage,
  startCodexRun,
  startTicketDraftRun,
  startTicketRedraftRun,
  startTicketUpdateRun,
  ticketDraftErrorToPayload
} from "../codex";
import { readCachedGitMetadata } from "../git";
import { logError, logWarn } from "../logger";
import { readRegistry, removeProjectPath, upsertProjectPath } from "../registry";

type SpawnedEditorProcess = {
  once: {
    (event: "spawn", listener: () => void): SpawnedEditorProcess;
    (event: "error", listener: (error: Error) => void): SpawnedEditorProcess;
  };
  unref: () => unknown;
};

type SpawnEditorProcess = (command: string, args: readonly string[]) => SpawnedEditorProcess;

export const projectEditorCommands: Record<ProjectEditorId, string> = {
  vscode: "code",
  cursor: "cursor"
};

const projectEditorLabels: Record<ProjectEditorId, string> = {
  vscode: "VS Code",
  cursor: "Cursor"
};

const isProjectEditorId = (value: unknown): value is ProjectEditorId =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(projectEditorCommands, value);

export const relayRpcErrorFromUnknown = (error: unknown): RelayRpcError => ({
  code: "relay_rpc_error",
  message: errorMessage(error)
});

const withRpcError = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, RelayRpcError, R> =>
  effect.pipe(Effect.mapError(relayRpcErrorFromUnknown));

export const openProjectInEditor = async (
  input: ProjectOpenInEditorInput,
  spawnEditorProcess: SpawnEditorProcess
): Promise<ProjectOpenInEditorResult> => {
  const projectPath = typeof input.projectPath === "string" ? input.projectPath.trim() : "";
  if (!projectPath) {
    return { ok: false, message: "Relay could not open the project because the project path is empty." };
  }
  if (!isProjectEditorId(input.editorId)) {
    return { ok: false, message: "Relay could not open the project because the selected editor is not supported." };
  }

  const command = projectEditorCommands[input.editorId];
  const editorLabel = projectEditorLabels[input.editorId];

  try {
    const child = spawnEditorProcess(command, [projectPath]);
    return await new Promise<ProjectOpenInEditorResult>((resolve) => {
      let settled = false;
      const settle = (result: ProjectOpenInEditorResult): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      child.once("spawn", () => {
        child.unref();
        settle({ ok: true });
      });
      child.once("error", (error) => {
        settle({
          ok: false,
          message: `Relay could not open this project in ${editorLabel}. Make sure the \`${command}\` command is available on your PATH. ${
            error.message
          }`
        });
      });
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown launch error.";
    return {
      ok: false,
      message: `Relay could not open this project in ${editorLabel}. Make sure the \`${command}\` command is available on your PATH. ${detail}`
    };
  }
};

const projectSummariesFromRegistry = () =>
  Effect.gen(function*() {
    const registry = yield* fromPromise(() => readRegistry());
    const storage = yield* Storage;
    return yield* Effect.all(
      [...registry.projects]
        .sort((a, b) => a.sidebarPosition - b.sidebarPosition)
        .map((project) => storage.getProjectSummary(project.path, project.lastOpenedAt))
    );
  });

const addProjectFolder = () =>
  Effect.gen(function*() {
    const electronDialog = yield* ElectronDialog;
    const storage = yield* Storage;
    const result = yield* electronDialog.showOpenDialog({
      title: "Add Relay Project",
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const projectPath = pathResolve(result.filePaths[0]);
    const summary = yield* storage.getProjectSummary(projectPath);
    let initialized = false;

    if (!summary.relayInitialized) {
      const confirm = yield* electronDialog.showMessageBox({
        type: "question",
        buttons: ["Initialize", "Cancel"],
        defaultId: 0,
        cancelId: 1,
        title: "Initialize Relay Project",
        message: "Relay needs to create a .relay folder in this project.",
        detail: projectPath
      });
      if (confirm.response !== 0) return null;
      yield* storage.initializeProject(projectPath);
      initialized = true;
    }

    yield* fromPromise(() => upsertProjectPath(projectPath));
    return {
      project: yield* storage.getProjectSummary(projectPath, new Date().toISOString()),
      initialized
    };
  });

export const RelayRpcHandlersLive = relayRpcGroup.toLayer({
  "projects:list": () => withRpcError(projectSummariesFromRegistry()),
  "projects:addFolder": () => withRpcError(addProjectFolder()),
  "projects:removeFromSidebar": ({ projectPath }) =>
    withRpcError(
      Effect.gen(function*() {
        yield* fromPromise(() => removeProjectPath(projectPath));
        return yield* projectSummariesFromRegistry();
      })
    ),
  "projects:read": ({ projectPath }) => withRpcError(Storage.use((storage) => storage.getProjectSummary(projectPath))),
  "projects:gitMetadata": ({ projectPath, options }) =>
    withRpcError(fromPromise(() => readCachedGitMetadata(projectPath, options ?? {}))),
  "projects:revealInFinder": ({ projectPath }) =>
    withRpcError(ElectronShell.use((electronShell) => electronShell.openPath(projectPath))),
  "projects:openInEditor": (input) =>
    withRpcError(CommandExecutor.use((executor) => fromPromise(() => openProjectInEditor(input, executor.spawnDetached)))),

  "board:read": ({ projectPath }) => withRpcError(Storage.use((storage) => storage.getBoard(projectPath))),

  "ticket:intakeDraft": (input) => withRpcError(fromPromise(() => createDraftIntake(input))),
  "ticket:createDraft": (input) =>
    withRpcError(
      fromPromise(async (): Promise<TicketDraftStartResult> => {
        try {
          return { ok: true, ...(await startTicketDraftRun(input)) };
        } catch (error) {
          return { ok: false, error: ticketDraftErrorToPayload(error) };
        }
      })
    ),
  "ticket:redraft": (input) =>
    withRpcError(
      fromPromise(async (): Promise<TicketDraftStartResult> => {
        try {
          return { ok: true, ...(await startTicketRedraftRun(input)) };
        } catch (error) {
          return { ok: false, error: ticketDraftErrorToPayload(error) };
        }
      })
    ),
  "ticket:generateSuggestions": ({ projectPath }) =>
    withRpcError(
      fromPromise(async (): Promise<TicketSuggestionsGenerateResult> => {
        try {
          return { ok: true, suggestions: await generateTicketSuggestions(projectPath) };
        } catch (error) {
          return { ok: false, error: ticketDraftErrorToPayload(error) };
        }
      })
    ),
  "ticket:createManual": ({ projectPath, input }) =>
    withRpcError(
      Effect.gen(function*() {
        const storage = yield* Storage;
        return yield* storage.createTicket(projectPath, input);
      })
    ),
  "ticket:createSubticket": (input) =>
    withRpcError(
      Effect.gen(function*() {
        const storage = yield* Storage;
        return yield* storage.createSubticket(input);
      })
    ),
  "ticket:linkSubticket": (input) =>
    withRpcError(Storage.use((storage) => storage.linkSubticket(input.projectPath, input.epicId, input.ticketId))),
  "ticket:unlinkSubticket": (input) =>
    withRpcError(Storage.use((storage) => storage.unlinkSubticket(input.projectPath, input.epicId, input.ticketId))),
  "ticket:startAgentUpdate": (input) => withRpcError(fromPromise(() => startTicketUpdateRun(input))),
  "ticket:cancelAgentUpdate": ({ runId }) => withRpcError(fromPromise(() => cancelTicketUpdateRun(runId))),
  "ticket:references": ({ projectPath }) =>
    withRpcError(Storage.use((storage) => storage.listTicketReferenceCandidates(projectPath))),
  "ticket:read": ({ projectPath, ticketId }) =>
    withRpcError(
      Effect.gen(function*() {
        const resolvedProjectPath = pathResolve(projectPath);
        const storage = yield* Storage;
        return yield* storage.getTicket(resolvedProjectPath, ticketId);
      }).pipe(
        Effect.catch((error: unknown) =>
          Effect.gen(function*() {
            const resolvedProjectPath = pathResolve(projectPath);
            const meta = { projectPath: resolvedProjectPath, ticketId };
            if (isTicketNotFoundError(error)) {
              yield* fromPromise(() => logWarn("ticket:read", "ticket file missing", { ...meta, filePath: error.filePath }));
            } else {
              yield* fromPromise(() => logError("ticket:read", "ticket read failed", error, meta));
            }
            return yield* Effect.fail(error);
          })
        )
      )
    ),
  "ticket:save": (input) =>
    withRpcError(
      Effect.gen(function*() {
        const storage = yield* Storage;
        const saved = yield* storage.saveTicket(input);
        return yield* fromPromise(() => reconcileTicketQueueState(input.projectPath, saved.frontMatter.id));
      })
    ),
  "ticket:saveAttachment": (input) =>
    withRpcError(Storage.use((storage) => storage.saveTicketAttachment(input))),
  "ticket:move": (input) =>
    withRpcError(
      Effect.gen(function*() {
        const storage = yield* Storage;
        yield* storage.moveTicket(input);
        yield* fromPromise(() => reconcileTicketQueueState(input.projectPath, input.ticketId));
        return yield* storage.getBoard(input.projectPath);
      })
    ),
  "ticket:clarifications": ({ projectPath, ticketId }) =>
    withRpcError(Storage.use((storage) => storage.getClarificationQuestions(projectPath, ticketId))),
  "ticket:answerClarification": (input) =>
    withRpcError(
      Effect.gen(function*() {
        const storage = yield* Storage;
        const answer = yield* storage.answerClarificationQuestion(input.projectPath, input.ticketId, input.questionId, input.answer);
        void maybeResumeTicketDraftAfterClarification(input.projectPath, input.ticketId).catch((error) =>
          logError("codex:draft", "auto-resume after clarification failed", error, {
            projectPath: input.projectPath,
            ticketId: input.ticketId,
            questionId: input.questionId
          })
        );
        return answer;
      })
    ),
  "ticket:delete": ({ projectPath, ticketId }) =>
    withRpcError(Storage.use((storage) => storage.deleteTicket(projectPath, ticketId))),
  "ticket:duplicate": ({ projectPath, ticketId }) =>
    withRpcError(Storage.use((storage) => storage.duplicateTicket(projectPath, ticketId))),
  "ticket:revealFile": ({ projectPath, ticketId }) =>
    withRpcError(Storage.use((storage) => storage.revealTicketFile(projectPath, ticketId))),

  "codex:status": () => withRpcError(fromPromise(() => getCodexStatus())),
  "codex:preflightRun": (input) => withRpcError(fromPromise(() => preflightCodexRun(input))),
  "codex:startRun": (input) => withRpcError(fromPromise(() => startCodexRun(input))),
  "codex:resumeRun": (input) => withRpcError(fromPromise(() => resumeCodexRun(input))),
  "codex:cancelRun": (input) => withRpcError(fromPromise(() => cancelCodexRun(input))),
  "codex:approveAction": ({ approvalId, decision }) =>
    withRpcError(fromPromise(() => approveCodexAction(approvalId, decision))),
  "codex:sendRepositoryChatMessage": (input) =>
    withRpcError(fromPromise(() => sendRepositoryChatMessage(input))),
  "codex:readRunEvents": ({ projectPath, ticketId, runId }) =>
    withRpcError(fromPromise(() => readCodexRunEvents(projectPath, ticketId, runId))),
  "codex:readLatestRunSummary": ({ projectPath, ticketId }) =>
    withRpcError(fromPromise(() => readCodexLatestRunSummary(projectPath, ticketId)))
});

export const RelayRpcHandlersLayer = Layer.mergeAll(RelayRpcHandlersLive);
