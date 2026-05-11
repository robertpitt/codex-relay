import { app, BrowserWindow, dialog, ipcMain, shell, type MessageBoxOptions, type OpenDialogOptions } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AddProjectResult,
  ClarificationAnswerInput,
  TicketCreateInput,
  TicketDraftResult,
  GitMetadataOptions,
  TicketMoveInput,
  TicketSaveInput
} from "../shared/types";
import {
  createTicketDraft,
  getCodexStatus,
  startCodexRun,
  resumeCodexRun,
  cancelCodexRun,
  approveCodexAction,
  readCodexRunEvents,
  ticketDraftErrorToPayload
} from "./services/codex";
import { readCachedGitMetadata } from "./services/git";
import { getLogPath, logError, logInfo, logWarn } from "./services/logger";
import { readRegistry, removeProjectPath, upsertProjectPath } from "./services/registry";
import {
  createTicket,
  deleteTicket,
  duplicateTicket,
  answerClarificationQuestion,
  initializeProject,
  isTicketNotFoundError,
  moveTicket,
  readBoard,
  readClarificationQuestions,
  readTicket,
  revealTicketFile,
  saveTicket,
  summarizeProject,
} from "./services/storage";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

process.on("uncaughtException", (error) => {
  void logError("process", "uncaught exception", error);
});

process.on("unhandledRejection", (error) => {
  void logError("process", "unhandled rejection", error);
});

const createWindow = async (): Promise<void> => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 1024,
    minHeight: 720,
    title: "Relay",
    backgroundColor: "#f6f4ef",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    void logError("renderer", "render process gone", new Error(`${details.reason} (${details.exitCode})`));
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    void logError("renderer", "failed to load", new Error(`${errorCode} ${errorDescription} ${validatedURL}`));
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
};

const registerIpc = (): void => {
  ipcMain.handle("projects:list", async () => {
    const registry = await readRegistry();
    return Promise.all(
      [...registry.projects]
        .sort((a, b) => a.sidebarPosition - b.sidebarPosition)
        .map((project) => summarizeProject(project.path, project.lastOpenedAt))
    );
  });

  ipcMain.handle("projects:addFolder", async (): Promise<AddProjectResult | null> => {
    const options: OpenDialogOptions = {
      title: "Add Relay Project",
      properties: ["openDirectory", "createDirectory"]
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;

    const projectPath = path.resolve(result.filePaths[0]);
    const summary = await summarizeProject(projectPath);
    let initialized = false;

    if (!summary.relayInitialized) {
      const messageBoxOptions: MessageBoxOptions = {
        type: "question",
        buttons: ["Initialize", "Cancel"],
        defaultId: 0,
        cancelId: 1,
        title: "Initialize Relay Project",
        message: "Relay needs to create a .relay folder in this project.",
        detail: projectPath
      };
      const confirm = mainWindow
        ? await dialog.showMessageBox(mainWindow, messageBoxOptions)
        : await dialog.showMessageBox(messageBoxOptions);
      if (confirm.response !== 0) return null;
      await initializeProject(projectPath);
      initialized = true;
    }

    await upsertProjectPath(projectPath);
    return {
      project: await summarizeProject(projectPath, new Date().toISOString()),
      initialized
    };
  });

  ipcMain.handle("projects:removeFromSidebar", async (_event, projectPath: string) => {
    const registry = await removeProjectPath(projectPath);
    return Promise.all(
      [...registry.projects]
        .sort((a, b) => a.sidebarPosition - b.sidebarPosition)
        .map((project) => summarizeProject(project.path, project.lastOpenedAt))
    );
  });

  ipcMain.handle("projects:read", async (_event, projectPath: string) => summarizeProject(projectPath));

  ipcMain.handle("projects:gitMetadata", async (_event, projectPath: string, options?: GitMetadataOptions) =>
    readCachedGitMetadata(projectPath, options)
  );

  ipcMain.handle("projects:revealInFinder", async (_event, projectPath: string) => {
    await shell.openPath(projectPath);
  });

  ipcMain.handle("board:read", async (_event, projectPath: string) => readBoard(projectPath));

  ipcMain.handle("ticket:createDraft", async (_event, input): Promise<TicketDraftResult> => {
    try {
      return { ok: true, draft: await createTicketDraft(input) };
    } catch (error) {
      return { ok: false, error: ticketDraftErrorToPayload(error) };
    }
  });

  ipcMain.handle("ticket:createManual", async (_event, projectPath: string, input: TicketCreateInput) =>
    createTicket(projectPath, input)
  );

  ipcMain.handle("ticket:read", async (_event, projectPath: string, ticketId: string) => {
    const resolvedProjectPath = path.resolve(projectPath);
    try {
      return await readTicket(resolvedProjectPath, ticketId);
    } catch (error) {
      const meta = { projectPath: resolvedProjectPath, ticketId };
      if (isTicketNotFoundError(error)) {
        await logWarn("ticket:read", "ticket file missing", { ...meta, filePath: error.filePath });
      } else {
        await logError("ticket:read", "ticket read failed", error, meta);
      }
      throw error;
    }
  });

  ipcMain.handle("ticket:save", async (_event, input: TicketSaveInput) => saveTicket(input));

  ipcMain.handle("ticket:move", async (_event, input: TicketMoveInput) => moveTicket(input));

  ipcMain.handle("ticket:clarifications", async (_event, projectPath: string, ticketId: string) =>
    readClarificationQuestions(projectPath, ticketId)
  );

  ipcMain.handle("ticket:answerClarification", async (_event, input: ClarificationAnswerInput) =>
    answerClarificationQuestion(input.projectPath, input.ticketId, input.questionId, input.answer)
  );

  ipcMain.handle("ticket:delete", async (_event, projectPath: string, ticketId: string) => deleteTicket(projectPath, ticketId));

  ipcMain.handle("ticket:duplicate", async (_event, projectPath: string, ticketId: string) => duplicateTicket(projectPath, ticketId));

  ipcMain.handle("ticket:revealFile", async (_event, projectPath: string, ticketId: string) => revealTicketFile(projectPath, ticketId));

  ipcMain.handle("codex:status", async () => getCodexStatus());

  ipcMain.handle("codex:startRun", async (_event, input) => {
    if (!mainWindow) throw new Error("Relay window is not ready.");
    return startCodexRun(mainWindow, input);
  });

  ipcMain.handle("codex:resumeRun", async (_event, input) => {
    if (!mainWindow) throw new Error("Relay window is not ready.");
    return resumeCodexRun(mainWindow, input);
  });

  ipcMain.handle("codex:cancelRun", async (_event, runId: string) => cancelCodexRun(runId));

  ipcMain.handle("codex:approveAction", async (_event, approvalId: string, decision: string) => approveCodexAction(approvalId, decision));

  ipcMain.handle("codex:readRunEvents", async (_event, projectPath: string, ticketId: string, runId: string) =>
    readCodexRunEvents(projectPath, ticketId, runId)
  );
};

app.whenReady().then(async () => {
  await logInfo("app", "Relay starting", { logPath: getLogPath() });
  registerIpc();
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
