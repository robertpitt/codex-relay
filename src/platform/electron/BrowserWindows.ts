import { BrowserWindow, type BrowserWindowConstructorOptions, type WebPreferences } from "electron";
import { Context, Effect, Layer, Scope } from "effect";
import { electronError, type ElectronError } from "./Errors";

export type ElectronBrowserWindow = BrowserWindow;
export type SecureWebPreferences = Omit<
  WebPreferences,
  "allowRunningInsecureContent" | "contextIsolation" | "nodeIntegration" | "sandbox" | "webSecurity"
> & {
  readonly preload: string;
};

export const secureWebPreferences = (preferences: SecureWebPreferences): WebPreferences => ({
  ...preferences,
  allowRunningInsecureContent: false,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true
});

export class BrowserWindows extends Context.Service<BrowserWindows, {
  readonly make: (options: BrowserWindowConstructorOptions) => Effect.Effect<ElectronBrowserWindow, ElectronError, Scope.Scope>;
  readonly all: Effect.Effect<ReadonlyArray<ElectronBrowserWindow>>;
  readonly destroyAll: Effect.Effect<void>;
}>()("relay/electron/BrowserWindows") {}

export const BrowserWindowsLive = Layer.succeed(BrowserWindows)({
  make: (options) =>
    Effect.acquireRelease(
      Effect.try({
        try: () => new BrowserWindow(options),
        catch: (cause) => electronError("BrowserWindow.constructor", cause)
      }),
      (window) =>
        Effect.sync(() => {
          if (!window.isDestroyed()) window.destroy();
        })
    ),
  all: Effect.sync(() => BrowserWindow.getAllWindows()),
  destroyAll: Effect.sync(() => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.destroy();
    }
  })
});
