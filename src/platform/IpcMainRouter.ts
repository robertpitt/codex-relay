import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents, type WebFrameMain } from "electron";
import { Context, Effect, Layer, Schema, Scope } from "effect";
import { electronError, electronSecurityError, type ElectronError } from "./Errors";

export type IpcMainRouterWebContents = Pick<WebContents, "id" | "isDestroyed" | "send">;
export type IpcMainRouterFrame = Pick<WebFrameMain, "isDestroyed" | "origin" | "top" | "url">;

export type IpcMainRouterEvent = {
  readonly frameId?: number;
  readonly processId?: number;
  readonly sender: IpcMainRouterWebContents;
  readonly senderFrame?: IpcMainRouterFrame | null;
};

export type IpcMainRouterInvokeEvent = IpcMainRouterEvent;
export type IpcSenderPolicy = (event: IpcMainRouterEvent, channel: string) => Effect.Effect<void, ElectronError>;
export type IpcMainRouterListener = (event: IpcMainRouterEvent, payload: unknown) => void;
export type IpcMainRouterInvokeHandler = (event: IpcMainRouterInvokeEvent, ...args: ReadonlyArray<unknown>) => unknown;

export type IpcChannel<Req, Res> = {
  readonly name: string;
  readonly request: Schema.Decoder<Req>;
  readonly response: Schema.Encoder<unknown>;
};

export type IpcMainRouterOptions = {
  readonly senderPolicy?: IpcSenderPolicy;
};

export type IpcMainRouterService = {
  readonly handle: <Req, Res>(
    channel: IpcChannel<Req, Res>,
    handler: (request: Req, event: IpcMainRouterInvokeEvent) => Effect.Effect<Res, ElectronError>
  ) => Effect.Effect<void, ElectronError, Scope.Scope>;
  readonly on: (
    channel: string,
    listener: IpcMainRouterListener,
    options?: IpcMainRouterOptions
  ) => Effect.Effect<() => void, ElectronError>;
  readonly onScoped: (
    channel: string,
    listener: IpcMainRouterListener,
    options?: IpcMainRouterOptions
  ) => Effect.Effect<void, ElectronError, Scope.Scope>;
  readonly unsafeHandle: (channel: string, handler: IpcMainRouterInvokeHandler) => Effect.Effect<void, ElectronError>;
  readonly unsafeOn: (channel: string, listener: IpcMainRouterListener) => Effect.Effect<() => void, ElectronError>;
  readonly removeHandler: (channel: string) => Effect.Effect<void>;
};

export class IpcMainRouter extends Context.Service<IpcMainRouter, IpcMainRouterService>()(
  "relay/electron/IpcMainRouter"
) {}

export const mainFrameOnly: IpcSenderPolicy = (event, channel) => {
  const frame = event.senderFrame;
  if (frame === undefined) return Effect.void;
  if (frame === null) {
    return Effect.fail(electronSecurityError("ipc.sender", `Rejected IPC on ${channel}: sender frame is unavailable.`));
  }
  if (frame.isDestroyed()) {
    return Effect.fail(electronSecurityError("ipc.sender", `Rejected IPC on ${channel}: sender frame was destroyed.`));
  }
  if (frame.top !== null && frame.top !== frame) {
    return Effect.fail(electronSecurityError("ipc.sender", `Rejected IPC on ${channel}: sender frame is not the top frame.`));
  }
  return Effect.void;
};

export const allowOrigins = (origins: ReadonlySet<string>): IpcSenderPolicy => (event, channel) => {
  const frame = event.senderFrame;
  if (frame === undefined) return Effect.void;
  if (frame === null) return mainFrameOnly(event, channel);
  if (origins.has(frame.origin)) return mainFrameOnly(event, channel);
  return Effect.fail(
    electronSecurityError("ipc.sender", `Rejected IPC on ${channel}: sender origin ${frame.origin} is not trusted.`)
  );
};

const toRouterEvent = (event: IpcMainEvent | IpcMainInvokeEvent): IpcMainRouterEvent => ({
  frameId: event.frameId,
  processId: event.processId,
  sender: event.sender,
  senderFrame: event.senderFrame
});

const registerListener = (
  channel: string,
  listener: IpcMainRouterListener,
  options?: IpcMainRouterOptions
): Effect.Effect<() => void, ElectronError> =>
  Effect.try({
    try: () => {
      const policy = options?.senderPolicy ?? mainFrameOnly;
      const wrapped = (event: IpcMainEvent, payload: unknown): void => {
        const routerEvent = toRouterEvent(event);
        void Effect.runPromise(policy(routerEvent, channel)).then(() => listener(routerEvent, payload), () => undefined);
      };
      ipcMain.on(channel, wrapped);
      return () => ipcMain.removeListener(channel, wrapped);
    },
    catch: (cause) => electronError(`ipcMain.on(${channel})`, cause)
  });

export const IpcMainRouterLive = Layer.succeed(IpcMainRouter)({
  handle: (channel, handler) =>
    Effect.acquireRelease(
      Effect.try({
        try: () => {
          ipcMain.handle(channel.name, async (event, payload: unknown) => {
            const routerEvent = toRouterEvent(event);
            await Effect.runPromise(mainFrameOnly(routerEvent, channel.name));
            const request = Schema.decodeUnknownSync(channel.request)(payload);
            const response = await Effect.runPromise(handler(request, routerEvent));
            return Schema.encodeUnknownSync(channel.response)(response);
          });
        },
        catch: (cause) => electronError(`ipcMain.handle(${channel.name})`, cause)
      }),
      () => Effect.sync(() => ipcMain.removeHandler(channel.name))
    ),
  on: registerListener,
  onScoped: (channel, listener, options) =>
    Effect.acquireRelease(registerListener(channel, listener, options), (removeListener) =>
      Effect.sync(() => {
        removeListener();
      })
    ).pipe(Effect.asVoid),
  unsafeHandle: (channel, handler) =>
    Effect.try({
      try: () => {
        ipcMain.handle(channel, (event, ...args) => handler(toRouterEvent(event), ...args));
      },
      catch: (cause) => electronError(`ipcMain.handle(${channel})`, cause)
    }),
  unsafeOn: (channel, listener) => registerListener(channel, listener),
  removeHandler: (channel) => Effect.sync(() => ipcMain.removeHandler(channel))
});
