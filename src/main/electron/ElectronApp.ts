import { app } from "electron";
import { Context, Effect, Layer } from "effect";

export type ElectronAppPathName = "userData";

export type ElectronAppService = {
  readonly getPath: (name: ElectronAppPathName) => Effect.Effect<string>;
  readonly whenReady: () => Effect.Effect<void, unknown>;
  readonly onActivate: (listener: () => void | Promise<void>) => Effect.Effect<void>;
  readonly onBeforeQuit: (listener: () => void | Promise<void>) => Effect.Effect<void>;
  readonly onWindowAllClosed: (listener: () => void | Promise<void>) => Effect.Effect<void>;
  readonly quit: () => Effect.Effect<void>;
  readonly platform: NodeJS.Platform;
};

export const ElectronApp = Context.Service<ElectronAppService>("relay/ElectronApp");

export const ElectronAppLive = Layer.succeed(ElectronApp)({
  getPath: (name) => Effect.sync(() => app.getPath(name)),
  whenReady: () => Effect.tryPromise(() => app.whenReady().then(() => undefined)),
  onActivate: (listener) =>
    Effect.sync(() => {
      app.on("activate", () => void listener());
    }),
  onBeforeQuit: (listener) =>
    Effect.sync(() => {
      app.on("before-quit", () => void listener());
    }),
  onWindowAllClosed: (listener) =>
    Effect.sync(() => {
      app.on("window-all-closed", () => void listener());
    }),
  quit: () => Effect.sync(() => app.quit()),
  platform: process.platform
});

export const getElectronPath = (name: ElectronAppPathName): string => app.getPath(name);
