import { shell } from "electron";
import { Context, Effect, Layer } from "effect";

export type ElectronShellService = {
  readonly openPath: (targetPath: string) => Effect.Effect<void, unknown>;
  readonly showItemInFolder: (targetPath: string) => Effect.Effect<void>;
  readonly openExternal: (targetUrl: string) => Effect.Effect<void, unknown>;
};

export const ElectronShell = Context.Service<ElectronShellService>("relay/ElectronShell");

export const ElectronShellLive = Layer.succeed(ElectronShell)({
  openPath: (targetPath) =>
    Effect.tryPromise(async () => {
      const message = await shell.openPath(targetPath);
      if (message) throw new Error(message);
    }),
  showItemInFolder: (targetPath) => Effect.sync(() => shell.showItemInFolder(targetPath)),
  openExternal: (targetUrl) => Effect.tryPromise(() => shell.openExternal(targetUrl).then(() => undefined))
});

export const showElectronItemInFolder = (targetPath: string): void => {
  shell.showItemInFolder(targetPath);
};
