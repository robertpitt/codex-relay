import { Effect, Queue } from "effect";
import { RpcServer } from "effect/unstable/rpc";
import { relayRpcGroup } from "@shared/rpc";
import { ElectronIpc, type ElectronIpcEvent, type ElectronIpcService, type ElectronIpcWebContents } from "../platform/electron";
import { runBackendEffect } from "../runtime";
import {
  relayRpcClientMessageChannel,
  relayRpcServerMessageChannel,
  type RelayIpcRpcClientPacket,
  type RelayIpcRpcServerPacket
} from "./protocol";

export type RelayRpcEffectRunner = <A, E, R>(effect: Effect.Effect<A, E, R>) => Promise<A>;

type ClientRecord = {
  readonly sender: ElectronIpcWebContents;
  readonly rendererClientId: number;
  readonly key: string;
};

const isClientPacket = (value: unknown): value is RelayIpcRpcClientPacket => {
  if (typeof value !== "object" || value === null) return false;
  const packet = value as { readonly clientId?: unknown; readonly message?: unknown };
  return typeof packet.clientId === "number" && typeof packet.message === "object" && packet.message !== null;
};

const clientKey = (event: ElectronIpcEvent, rendererClientId: number): string => `${event.sender.id}:${rendererClientId}`;

export const makeRelayIpcRpcServerProtocol = (
  electronIpc: ElectronIpcService,
  runEffect: RelayRpcEffectRunner = runBackendEffect
): Effect.Effect<RpcServer.Protocol["Service"]> =>
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

      const serverClientIdFor = (event: ElectronIpcEvent, rendererClientId: number): number => {
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

      yield* electronIpc.on(relayRpcClientMessageChannel, (event, payload) => {
        if (!isClientPacket(payload)) return;
        const serverClientId = serverClientIdFor(event, payload.clientId);
        void runEffect(writeRequest(serverClientId, payload.message)).catch(() => {
          removeClient(serverClientId);
          Queue.offerUnsafe(disconnects, serverClientId);
        });
      });

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

export const installRelayIpcTransport = () =>
  Effect.gen(function*() {
    const electronIpc = yield* ElectronIpc;
    const protocol = yield* makeRelayIpcRpcServerProtocol(electronIpc);
    yield* RpcServer.make(relayRpcGroup, { spanPrefix: "RelayRpc" }).pipe(
      Effect.provideService(RpcServer.Protocol, protocol),
      Effect.forkDetach({ startImmediately: true })
    );
  });
