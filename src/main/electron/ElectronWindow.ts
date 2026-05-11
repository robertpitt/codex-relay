import { BrowserWindow } from "electron";
import { Context, Effect, Layer } from "effect";
import type { RendererRunEvent } from "../../shared/types";

export type ElectronMainWindowOptions = {
  readonly preloadPath: string;
  readonly rendererHtmlPath: string;
  readonly rendererUrl?: string | undefined;
  readonly onRendererError?: ((scope: string, error: Error) => void | Promise<void>) | undefined;
};

export type ElectronWindowService = {
  readonly createMainWindow: (options: ElectronMainWindowOptions) => Effect.Effect<void, unknown>;
  readonly hasOpenWindows: () => Effect.Effect<boolean>;
  readonly focusMainWindow: () => Effect.Effect<void>;
  readonly sendRunEvent: (event: RendererRunEvent) => Effect.Effect<void>;
  readonly destroyAll: () => Effect.Effect<void>;
};

export const ElectronWindow = Context.Service<ElectronWindowService>("relay/ElectronWindow");

let mainWindow: BrowserWindow | null = null;

export const currentMainWindow = (): BrowserWindow | null => mainWindow;

const createWindow = async ({ preloadPath, rendererHtmlPath, rendererUrl, onRendererError }: ElectronMainWindowOptions): Promise<void> => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 1024,
    minHeight: 720,
    title: "Relay",
    backgroundColor: "#f6f4ef",
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    void onRendererError?.("renderer", new Error(`${details.reason} (${details.exitCode})`));
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    void onRendererError?.("renderer", new Error(`${errorCode} ${errorDescription} ${validatedURL}`));
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (rendererUrl) {
    await mainWindow.loadURL(rendererUrl);
  } else {
    await mainWindow.loadFile(rendererHtmlPath);
  }
};

export const ElectronWindowLive = Layer.succeed(ElectronWindow)({
  createMainWindow: (options) => Effect.tryPromise(() => createWindow(options)),
  hasOpenWindows: () => Effect.sync(() => BrowserWindow.getAllWindows().length > 0),
  focusMainWindow: () =>
    Effect.sync(() => {
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }),
  sendRunEvent: (event) =>
    Effect.sync(() => {
      mainWindow?.webContents.send("codex:runEvent", event);
    }),
  destroyAll: () =>
    Effect.sync(() => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.destroy();
      }
      mainWindow = null;
    })
});
