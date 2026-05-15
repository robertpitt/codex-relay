import { Context, Effect, Layer, Path, Scope } from "effect";
import type { RendererRunEvent } from "@shared/schemas";
import { electronError, type ElectronError } from "./Errors";
import { ElectronApp } from "./ElectronApp";
import { BrowserWindows, secureWebPreferences, type ElectronBrowserWindow } from "./BrowserWindows";

export type ElectronMainWindowOptions = {
  readonly onRendererError?: ((scope: string, error: Error) => void | Promise<void>) | undefined;
};

type ElectronMainWindowPaths = {
  readonly preloadPath: string;
  readonly rendererHtmlPath: string;
  readonly rendererUrl?: string | undefined;
};

export type ElectronWindowService = {
  readonly createMainWindow: (options: ElectronMainWindowOptions) => Effect.Effect<void, ElectronError>;
  readonly hasOpenWindows: () => Effect.Effect<boolean>;
  readonly focusMainWindow: () => Effect.Effect<void>;
  readonly sendRunEvent: (event: RendererRunEvent) => Effect.Effect<void>;
  readonly destroyAll: () => Effect.Effect<void>;
};

export const ElectronWindow = Context.Service<ElectronWindowService>("relay/ElectronWindow");

let mainWindow: ElectronBrowserWindow | null = null;

export const currentMainWindow = (): ElectronBrowserWindow | null => mainWindow;

const destroyWindow = (window: ElectronBrowserWindow): Effect.Effect<void> =>
  Effect.sync(() => {
    if (!window.isDestroyed()) window.destroy();
    if (mainWindow === window) mainWindow = null;
  });

const mainWindowPaths = (): Effect.Effect<ElectronMainWindowPaths, never, Path.Path | Context.Service.Identifier<typeof ElectronApp>> =>
  Effect.gen(function*() {
    const path = yield* Path.Path;
    const electronApp = yield* ElectronApp;
    const appPath = yield* electronApp.appPath;
    return {
      preloadPath: path.join(appPath, "out/preload/index.cjs"),
      rendererHtmlPath: path.join(appPath, "out/renderer/index.html"),
      rendererUrl: yield* electronApp.envVar("ELECTRON_RENDERER_URL")
    };
  });

const createWindow = (
  browserWindows: BrowserWindows["Service"],
  scope: Scope.Scope,
  { preloadPath, rendererHtmlPath, rendererUrl }: ElectronMainWindowPaths,
  { onRendererError }: ElectronMainWindowOptions
): Effect.Effect<void, ElectronError> =>
  Effect.gen(function*() {
    const window = yield* browserWindows.make({
      width: 1440,
      height: 980,
      minWidth: 1024,
      minHeight: 720,
      title: "Relay",
      backgroundColor: "#f6f4ef",
      show: false,
      webPreferences: secureWebPreferences({ preload: preloadPath })
    }).pipe(Effect.provideService(Scope.Scope, scope));

    mainWindow = window;

    window.once("ready-to-show", () => {
      if (!window.isDestroyed()) window.show();
    });

    window.webContents.on("render-process-gone", (_event, details) => {
      void onRendererError?.("renderer", new Error(`${details.reason} (${details.exitCode})`));
    });

    window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
      void onRendererError?.("renderer", new Error(`${errorCode} ${errorDescription} ${validatedURL}`));
    });

    window.on("closed", () => {
      if (mainWindow === window) mainWindow = null;
    });

    yield* Effect.tryPromise({
      try: () => rendererUrl ? window.loadURL(rendererUrl) : window.loadFile(rendererHtmlPath),
      catch: (cause) => electronError("BrowserWindow.load", cause)
    }).pipe(Effect.catch((error: ElectronError) => Effect.andThen(destroyWindow(window), Effect.fail(error))));

    if (!window.isDestroyed() && !window.isVisible()) {
      window.show();
    }
  });

export const ElectronWindowLive = Layer.effect(
  ElectronWindow,
  Effect.gen(function*() {
    const browserWindows = yield* BrowserWindows;
    const scope = yield* Effect.scope;
    const paths = yield* mainWindowPaths();

    return {
      createMainWindow: (options) => createWindow(browserWindows, scope, paths, options),
      hasOpenWindows: () => Effect.map(browserWindows.all, (windows) => windows.length > 0),
      focusMainWindow: () =>
        Effect.sync(() => {
          if (!mainWindow) return;
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        }),
      sendRunEvent: (event: RendererRunEvent) =>
        Effect.sync(() => {
          mainWindow?.webContents.send("codex:runEvent", event);
        }),
      destroyAll: () =>
        Effect.andThen(browserWindows.destroyAll, Effect.sync(() => {
          mainWindow = null;
        }))
    };
  })
);
