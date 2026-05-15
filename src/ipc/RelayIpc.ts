import { Effect, Queue, Scope } from "effect";
import { Rpc, RpcServer } from "effect/unstable/rpc";
import { relayRpcGroup, type RelayRpcs } from "@shared/rpc";
import {
  IpcMainRouter,
  type IpcMainRouterEvent,
  type IpcMainRouterService,
  type IpcMainRouterWebContents
} from "@platform/IpcMainRouter";
import { runBackendEffect } from "../runtime";
import {
  isRelayIpcRpcClientPacket,
  relayRpcClientMessageChannel,
  relayRpcServerMessageChannel,
  type RelayIpcRpcServerPacket
} from "@platform/Protocol";

export type RelayRpcEffectRunner = <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
export type RelayIpcRouterService = Pick<IpcMainRouterService, "on">;

export type RelayIpcTransportServices =
  | IpcMainRouter
  | Rpc.ToHandler<RelayRpcs>
  | Rpc.Middleware<RelayRpcs>
  | Rpc.ServicesServer<RelayRpcs>
  | Scope.Scope;

type ClientRecord = {
  readonly sender: IpcMainRouterWebContents;
  readonly rendererClientId: number;
  readonly key: string;
};

const clientKey = (event: IpcMainRouterEvent, rendererClientId: number): string => `${event.sender.id}:${rendererClientId}`;

export const makeRelayIpcRpcServerProtocol = (
  ipcRouter: RelayIpcRouterService,
  runEffect: RelayRpcEffectRunner = runBackendEffect
): Effect.Effect<RpcServer.Protocol["Service"]> =>
  makeRelayIpcRpcServerProtocolInternal(ipcRouter, runEffect, () => Effect.void);

const makeRelayIpcRpcServerProtocolScoped = (
  ipcRouter: RelayIpcRouterService,
  runEffect: RelayRpcEffectRunner = runBackendEffect
): Effect.Effect<RpcServer.Protocol["Service"], never, Scope.Scope> =>
  makeRelayIpcRpcServerProtocolInternal(ipcRouter, runEffect, (removeListener) =>
    Effect.addFinalizer(() =>
      Effect.sync(() => {
        removeListener();
      })
    )
  );

const makeRelayIpcRpcServerProtocolInternal = <R>(
  ipcRouter: RelayIpcRouterService,
  runEffect: RelayRpcEffectRunner,
  registerCleanup: (removeListener: () => void) => Effect.Effect<void, never, R>
): Effect.Effect<RpcServer.Protocol["Service"], never, R> =>
  RpcServer.Protocol.make((writeRequest) =>
    Effect.gen(function*() {
      const disconnects = yield* Queue.make<number>();
      const clients = new Map<number, ClientRecord>();
      const clientIds = new Set<number>();
      const clientIdsByKey = new Map<string, number>();
      let nextClientId = 1;

      const removeClient = (serverClientId: number): void => {
        const client = clients.get(serverClientId);
        if (client) clientIdsByKey.delete(client.key);
        clients.delete(serverClientId);
        clientIds.delete(serverClientId);
      };

      const serverClientIdFor = (event: IpcMainRouterEvent, rendererClientId: number): number => {
        const key = clientKey(event, rendererClientId);
        const existing = clientIdsByKey.get(key);
        if (existing !== undefined) {
          clients.set(existing, { sender: event.sender, rendererClientId, key });
          return existing;
        }

        const serverClientId = nextClientId++;
        clientIdsByKey.set(key, serverClientId);
        clients.set(serverClientId, { sender: event.sender, rendererClientId, key });
        clientIds.add(serverClientId);
        return serverClientId;
      };

      const removeListener = yield* ipcRouter.on(relayRpcClientMessageChannel, (event, payload) => {
        if (!isRelayIpcRpcClientPacket(payload)) return;
        const serverClientId = serverClientIdFor(event, payload.clientId);
        void runEffect(writeRequest(serverClientId, payload.message)).catch(() => {
          removeClient(serverClientId);
          Queue.offerUnsafe(disconnects, serverClientId);
        });
      }).pipe(Effect.orDie);
      yield* registerCleanup(removeListener);

      return {
        disconnects,
        send: (serverClientId, message) =>
          Effect.sync(() => {
            const client = clients.get(serverClientId);
            if (!client || client.sender.isDestroyed()) {
              removeClient(serverClientId);
              Queue.offerUnsafe(disconnects, serverClientId);
              return;
            }
            client.sender.send(relayRpcServerMessageChannel, {
              clientId: client.rendererClientId,
              message
            } satisfies RelayIpcRpcServerPacket);
          }),
        end: (serverClientId) =>
          Effect.sync(() => {
            removeClient(serverClientId);
          }),
        clientIds: Effect.sync(() => clientIds),
        initialMessage: Effect.succeedNone,
        supportsAck: false,
        supportsTransferables: false,
        supportsSpanPropagation: false
      };
    })
  );

export const installRelayIpcTransport = (): Effect.Effect<void, never, RelayIpcTransportServices> =>
  Effect.gen(function*() {
    const ipcRouter = yield* IpcMainRouter;
    const protocol = yield* makeRelayIpcRpcServerProtocolScoped(ipcRouter);
    yield* RpcServer.make(relayRpcGroup, { spanPrefix: "RelayRpc" }).pipe(
      Effect.provideService(RpcServer.Protocol, protocol),
      Effect.forkScoped({ startImmediately: true })
    );
  });
