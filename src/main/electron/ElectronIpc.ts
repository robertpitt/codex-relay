import { ipcMain } from "electron";
import { Context, Effect, Layer } from "effect";

export type ElectronIpcInvokeHandler = (event: unknown, ...args: unknown[]) => unknown;

export type ElectronIpcService = {
  readonly handle: (channel: string, handler: ElectronIpcInvokeHandler) => Effect.Effect<void>;
  readonly removeHandler: (channel: string) => Effect.Effect<void>;
};

export const ElectronIpc = Context.Service<ElectronIpcService>("relay/ElectronIpc");

export const ElectronIpcLive = Layer.succeed(ElectronIpc)({
  handle: (channel, handler) =>
    Effect.sync(() => {
      ipcMain.handle(channel, handler);
    }),
  removeHandler: (channel) =>
    Effect.sync(() => {
      ipcMain.removeHandler(channel);
    })
});
