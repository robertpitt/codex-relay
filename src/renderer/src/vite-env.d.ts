/// <reference types="vite/client" />

import type { RendererRunEvent } from "@shared/schemas";
import type { RelayIpcRpcClientPacket, RelayIpcRpcServerPacket } from "@platform/electron/Protocol";

declare global {
  interface Window {
    relayRpc?: {
      send: (packet: RelayIpcRpcClientPacket) => void;
      onMessage: (listener: (packet: RelayIpcRpcServerPacket) => void) => () => void;
      onRunEvent: (listener: (event: RendererRunEvent) => void) => () => void;
    };
  }
}
