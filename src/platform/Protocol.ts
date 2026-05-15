import type { RpcMessage } from "effect/unstable/rpc";

export const relayRpcClientMessageChannel = "relay:rpc:client-message";
export const relayRpcServerMessageChannel = "relay:rpc:server-message";
export const relayRunEventChannel = "codex:runEvent";

export type RelayIpcRpcClientPacket = {
  readonly clientId: number;
  readonly message: RpcMessage.FromClientEncoded;
};

export type RelayIpcRpcServerPacket = {
  readonly clientId: number;
  readonly message: RpcMessage.FromServerEncoded;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

export const isRelayIpcRpcClientPacket = (value: unknown): value is RelayIpcRpcClientPacket =>
  isRecord(value) && typeof value.clientId === "number" && isRecord(value.message);

export const isRelayIpcRpcServerPacket = (value: unknown): value is RelayIpcRpcServerPacket =>
  isRecord(value) && typeof value.clientId === "number" && isRecord(value.message);
