import { Storage } from "../../services/storage";
import { defineRelayIpcMethod, type AnyRelayIpcMethod } from "../RelayIpc";
import { relayIpcChannels } from "../channels";
import { ipcArgs, ipcResult, ipcString } from "../schema";

export const boardIpcMethods = [
  defineRelayIpcMethod({
    channel: relayIpcChannels.boardRead,
    payload: ipcArgs([ipcString]),
    result: ipcResult(),
    handler: (_event, projectPath) => Storage.use((storage) => storage.getBoard(projectPath))
  })
] satisfies ReadonlyArray<AnyRelayIpcMethod>;
