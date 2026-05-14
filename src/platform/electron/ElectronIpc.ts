import { ipcMain } from "electron";
import { Context, Effect, Layer } from "effect";

export type ElectronIpcInvokeHandler = (event: unknown, ...args: unknown[]) => unknown;
export type ElectronIpcWebContents = {
  readonly id: number;
  readonly isDestroyed: () => boolean;
  readonly send: (channel: string, payload: unknown) => void;
};
export type ElectronIpcEvent = {
  readonly sender: ElectronIpcWebContents;
};
export type ElectronIpcListener = (event: ElectronIpcEvent, payload: unknown) => void;

export type ElectronIpcService = {
  readonly handle: (channel: string, handler: ElectronIpcInvokeHandler) => Effect.Effect<void>;
  readonly removeHandler: (channel: string) => Effect.Effect<void>;
  readonly on: (channel: string, listener: ElectronIpcListener) => Effect.Effect<() => void>;
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
    }),
  on: (channel, listener) =>
    Effect.sync(() => {
      const wrapped = (event: Electron.IpcMainEvent, payload: unknown): void => {
        listener(event as ElectronIpcEvent, payload);
      };
      ipcMain.on(channel, wrapped);
      return () => ipcMain.removeListener(channel, wrapped);
    })
});
