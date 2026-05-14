import { shell } from "electron";
import { Context, Effect, Layer } from "effect";
import { electronError, type ElectronError } from "./Errors";

export type ElectronShellService = {
  readonly openPath: (targetPath: string) => Effect.Effect<void, ElectronError>;
  readonly showItemInFolder: (targetPath: string) => Effect.Effect<void>;
  readonly openExternal: (targetUrl: string) => Effect.Effect<void, ElectronError>;
};

export const ElectronShell = Context.Service<ElectronShellService>("relay/ElectronShell");

export const ElectronShellLive = Layer.succeed(ElectronShell)({
  openPath: (targetPath) =>
    Effect.tryPromise({
      try: async () => {
        const message = await shell.openPath(targetPath);
        if (message) throw new Error(message);
      },
      catch: (cause) => electronError("shell.openPath", cause)
    }),
  showItemInFolder: (targetPath) => Effect.sync(() => shell.showItemInFolder(targetPath)),
  openExternal: (targetUrl) =>
    Effect.tryPromise({
      try: () => shell.openExternal(targetUrl).then(() => undefined),
      catch: (cause) => electronError("shell.openExternal", cause)
    })
});

export const showElectronItemInFolder = (targetPath: string): void => {
  shell.showItemInFolder(targetPath);
};
