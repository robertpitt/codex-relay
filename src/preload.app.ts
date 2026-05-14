import { contextBridge, ipcRenderer } from "electron";
import {
  relayRpcClientMessageChannel,
  relayRpcServerMessageChannel,
  type RelayIpcRpcClientPacket,
  type RelayIpcRpcServerPacket
} from "./ipc/protocol";
import type { RendererRunEvent } from "@shared/types";

export type RelayRpcPreloadBridge = {
  readonly send: (packet: RelayIpcRpcClientPacket) => void;
  readonly onMessage: (listener: (packet: RelayIpcRpcServerPacket) => void) => () => void;
  readonly onRunEvent: (listener: (event: RendererRunEvent) => void) => () => void;
};

const bridge: RelayRpcPreloadBridge = {
  send: (packet) => {
    ipcRenderer.send(relayRpcClientMessageChannel, packet);
  },
  onMessage: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, packet: RelayIpcRpcServerPacket): void => listener(packet);
    ipcRenderer.on(relayRpcServerMessageChannel, wrapped);
    return () => ipcRenderer.removeListener(relayRpcServerMessageChannel, wrapped);
  },
  onRunEvent: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: RendererRunEvent): void => listener(payload);
    ipcRenderer.on("codex:runEvent", wrapped);
    return () => ipcRenderer.removeListener("codex:runEvent", wrapped);
  }
};

contextBridge.exposeInMainWorld("relayRpc", bridge);
