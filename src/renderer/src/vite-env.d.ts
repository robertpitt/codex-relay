/// <reference types="vite/client" />

import type { RendererRunEvent } from "@shared/types";
import type { RelayIpcRpcClientPacket, RelayIpcRpcServerPacket } from "../../ipc/protocol";

declare global {
  interface Window {
    relayRpc?: {
      send: (packet: RelayIpcRpcClientPacket) => void;
      onMessage: (listener: (packet: RelayIpcRpcServerPacket) => void) => () => void;
      onRunEvent: (listener: (event: RendererRunEvent) => void) => () => void;
    };
  }
}
