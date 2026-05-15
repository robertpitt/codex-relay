/**
 * Each Electron app spawns a separate renderer process for each open BrowserWindow (and each web embed).
 * As its name implies, a renderer is responsible for rendering web content. For all intents and purposes,
 * code run in renderer processes should behave according to web standards (insofar as Chromium does, at least).
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  isRelayIpcRpcClientPacket,
  isRelayIpcRpcServerPacket,
  relayRpcClientMessageChannel,
  relayRpcServerMessageChannel,
  relayRunEventChannel,
  type RelayIpcRpcClientPacket,
  type RelayIpcRpcServerPacket
} from "@platform/Protocol";
import type { RendererRunEvent } from "@shared/schemas";


type ElectronPreloadRpcBridge = {
  readonly send: (packet: RelayIpcRpcClientPacket) => void;
  readonly onMessage: (listener: (packet: RelayIpcRpcServerPacket) => void) => () => void;
  readonly onRunEvent: (listener: (event: RendererRunEvent) => void) => () => void;
};

contextBridge.exposeInMainWorld("relayRpc", {
  send: (packet) => {
    if (!isRelayIpcRpcClientPacket(packet)) return;
    ipcRenderer.send(relayRpcClientMessageChannel, packet);
  },
  onMessage: (listener) => {
    const wrapped = (_event: IpcRendererEvent, packet: unknown): void => {
      if (isRelayIpcRpcServerPacket(packet)) listener(packet);
    };
    ipcRenderer.on(relayRpcServerMessageChannel, wrapped);
    return () => ipcRenderer.removeListener(relayRpcServerMessageChannel, wrapped);
  },
  onRunEvent: (listener) => {
    const wrapped = (_event: IpcRendererEvent, payload: RendererRunEvent): void => listener(payload);
    ipcRenderer.on(relayRunEventChannel, wrapped);
    return () => ipcRenderer.removeListener(relayRunEventChannel, wrapped);
  }
} satisfies ElectronPreloadRpcBridge);
