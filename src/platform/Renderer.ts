import { Effect, Scope } from "effect";
import { RpcClient } from "effect/unstable/rpc";
import type { RendererRunEvent } from "@shared/schemas";
import type { RelayIpcRpcClientPacket, RelayIpcRpcServerPacket } from "./Protocol";

export type ElectronPreloadRpcBridge = {
  readonly send: (packet: RelayIpcRpcClientPacket) => void;
  readonly onMessage: (listener: (packet: RelayIpcRpcServerPacket) => void) => () => void;
  readonly onRunEvent: (listener: (event: RendererRunEvent) => void) => () => void;
};

export const electronPreloadRpcBridgeFromWindow = (): ElectronPreloadRpcBridge | null => {
  if (typeof window === "undefined") return null;
  return (window as unknown as { readonly relayRpc?: ElectronPreloadRpcBridge }).relayRpc ?? null;
};

export const makeElectronRpcClientProtocol = (
  bridge: ElectronPreloadRpcBridge
): Effect.Effect<RpcClient.Protocol["Service"], never, Scope.Scope> =>
  RpcClient.Protocol.make((writeResponse) =>
    Effect.gen(function*() {
      const unsubscribe = bridge.onMessage((packet) => {
        void Effect.runPromise(writeResponse(packet.clientId, packet.message)).catch(() => undefined);
      });
      yield* Effect.addFinalizer(() => Effect.sync(unsubscribe));

      return {
        send: (clientId, message) =>
          Effect.sync(() => {
            bridge.send({ clientId, message });
          }),
        supportsAck: false,
        supportsTransferables: false
      };
    })
  );
