import type { RpcMessage } from "effect/unstable/rpc";

export const relayRpcClientMessageChannel = "relay:rpc:client-message";
export const relayRpcServerMessageChannel = "relay:rpc:server-message";

export type RelayIpcRpcClientPacket = {
  readonly clientId: number;
  readonly message: RpcMessage.FromClientEncoded;
};

export type RelayIpcRpcServerPacket = {
  readonly clientId: number;
  readonly message: RpcMessage.FromServerEncoded;
};
