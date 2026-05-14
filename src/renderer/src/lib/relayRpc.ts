import { Effect, Scope } from "effect";
import { Rpc, RpcClient, RpcMessage, RpcSerialization } from "effect/unstable/rpc";
import { relayRpcGroup, type RelayRpcs } from "@shared/rpc";
import type { RendererRunEvent } from "@shared/types";

type RelayRpcBridgeClientPacket = {
  readonly clientId: number;
  readonly message: RpcMessage.FromClientEncoded;
};

type RelayRpcBridgeServerPacket = {
  readonly clientId: number;
  readonly message: RpcMessage.FromServerEncoded;
};

type RelayRpcBridge = {
  readonly send: (packet: RelayRpcBridgeClientPacket) => void;
  readonly onMessage: (listener: (packet: RelayRpcBridgeServerPacket) => void) => () => void;
  readonly onRunEvent: (listener: (event: RendererRunEvent) => void) => () => void;
};

type RelayRpcFlatClient = RpcClient.RpcClient.Flat<RelayRpcs>;
export type RelayRpcPayload<Tag extends RelayRpcs["_tag"]> = Rpc.PayloadConstructor<Rpc.ExtractTag<RelayRpcs, Tag>>;
export type RelayRpcSuccess<Tag extends RelayRpcs["_tag"]> = Rpc.Success<Rpc.ExtractTag<RelayRpcs, Tag>>;
export type RelayRpcRunner = <Tag extends RelayRpcs["_tag"]>(
  tag: Tag,
  payload: RelayRpcPayload<Tag>
) => Promise<RelayRpcSuccess<Tag>>;

let testRunner: RelayRpcRunner | null = null;
let clientPromise: Promise<RelayRpcFlatClient> | null = null;
let electronBridgeUnsubscribe: (() => void) | null = null;

const relayRpcBridge = (): RelayRpcBridge | null => {
  if (typeof window === "undefined") return null;
  const bridge = (window as unknown as { readonly relayRpc?: RelayRpcBridge }).relayRpc;
  return bridge ?? null;
};

const rpcUrlFromLocation = (): { readonly rpcUrl: string; readonly eventsUrl: string; readonly token: string } | null => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const baseUrl = params.get("relayRpcBaseUrl");
  const token = params.get("relayToken");
  if (!baseUrl || !token) return null;

  const rpcUrl = new URL("/rpc", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
  const eventsUrl = new URL("/events", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  eventsUrl.searchParams.set("token", token);
  return { rpcUrl, eventsUrl: eventsUrl.toString(), token };
};

export const hasRelayRpcTransport = (): boolean => Boolean(relayRpcBridge() || rpcUrlFromLocation());

const relayRpcError = (): Error => new Error("Relay RPC transport is unavailable.");

const normalizeRpcFailure = (error: unknown): Error | unknown => {
  if (error instanceof Error) return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { readonly message?: unknown }).message;
    if (typeof message === "string") return new Error(message);
  }
  return error;
};

const makeElectronRpcClientProtocol = (bridge: RelayRpcBridge): Effect.Effect<RpcClient.Protocol["Service"]> =>
  RpcClient.Protocol.make((writeResponse) =>
    Effect.sync(() => {
      if (!electronBridgeUnsubscribe) {
        electronBridgeUnsubscribe = bridge.onMessage((packet) => {
          void Effect.runPromise(writeResponse(packet.clientId, packet.message)).catch(() => undefined);
        });
      }

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

const makeHttpRpcClientProtocol = (http: {
  readonly rpcUrl: string;
  readonly token: string;
}): Effect.Effect<RpcClient.Protocol["Service"], never, RpcSerialization.RpcSerialization> =>
  RpcClient.Protocol.make((writeResponse) =>
    Effect.gen(function*() {
      const serialization = yield* RpcSerialization.RpcSerialization;
      const parser = serialization.makeUnsafe();

      return {
        send: (clientId, message) => {
          if (message._tag !== "Request") return Effect.void;
          return Effect.tryPromise({
            try: async () => {
              const encoded = parser.encode(message);
              const response = await fetch(http.rpcUrl, {
                method: "POST",
                headers: {
                  "Content-Type": serialization.contentType,
                  "X-Relay-Token": http.token
                },
                body: encoded as BodyInit
              });
              const body = await response.text();
              if (!response.ok) throw new Error(body || `Relay RPC request failed with HTTP ${response.status}.`);
              return parser.decode(body) as RpcMessage.FromServerEncoded[];
            },
            catch: normalizeRpcFailure
          }).pipe(
            Effect.orDie,
            Effect.flatMap((responses) =>
              Effect.forEach(responses, (response) => writeResponse(clientId, response), { discard: true })
            )
          );
        },
        supportsAck: false,
        supportsTransferables: false
      };
    })
  );

const makeClient = async (): Promise<RelayRpcFlatClient> => {
  const bridge = relayRpcBridge();
  const http = rpcUrlFromLocation();
  if (!bridge && !http) throw relayRpcError();

  return Effect.runPromise(
    Effect.gen(function*() {
      const scope = yield* Scope.make();
      const clientEffect = RpcClient.make(relayRpcGroup, { flatten: true, spanPrefix: "RelayRpc" }).pipe(
        Effect.provideService(Scope.Scope, scope)
      );

      if (bridge) {
        const protocol = yield* makeElectronRpcClientProtocol(bridge);
        return yield* clientEffect.pipe(Effect.provideService(RpcClient.Protocol, protocol));
      }

      const protocol = yield* makeHttpRpcClientProtocol(http!).pipe(Effect.provide(RpcSerialization.layerJson));
      return yield* clientEffect.pipe(Effect.provideService(RpcClient.Protocol, protocol));
    })
  );
};

const getRelayRpcClient = (): Promise<RelayRpcFlatClient> => {
  clientPromise ??= makeClient();
  return clientPromise;
};

export const runRelayRpc = async <Tag extends RelayRpcs["_tag"]>(
  tag: Tag,
  payload: RelayRpcPayload<Tag>
): Promise<RelayRpcSuccess<Tag>> => {
  if (testRunner) return testRunner(tag, payload);
  const client = await getRelayRpcClient();
  try {
    const invoke = client as (tag: RelayRpcs["_tag"], payload?: unknown) => unknown;
    const effect = payload === undefined ? invoke(tag) : invoke(tag, payload);
    return await Effect.runPromise(effect as unknown as Effect.Effect<RelayRpcSuccess<Tag>, unknown>);
  } catch (error) {
    throw normalizeRpcFailure(error);
  }
};

export const setRelayRpcRunnerForTests = (runner: RelayRpcRunner | null): (() => void) => {
  testRunner = runner;
  return () => {
    if (testRunner === runner) testRunner = null;
  };
};

export const subscribeRelayRunEvents = (listener: (event: RendererRunEvent) => void): (() => void) => {
  const bridge = relayRpcBridge();
  if (bridge) return bridge.onRunEvent(listener);

  const http = rpcUrlFromLocation();
  if (!http) throw relayRpcError();

  const source = new EventSource(http.eventsUrl);
  const onRunEvent = (event: MessageEvent<string>): void => {
    listener(JSON.parse(event.data) as RendererRunEvent);
  };
  source.addEventListener("run-event", onRunEvent);
  return () => source.close();
};
