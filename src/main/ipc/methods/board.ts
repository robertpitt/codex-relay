import { readBoard } from "../../services/storage";
import { fromPromise } from "../../services/runtime";
import { defineRelayIpcMethod, type AnyRelayIpcMethod } from "../RelayIpc";
import { relayIpcChannels } from "../channels";
import { ipcArgs, ipcResult, ipcString } from "../schema";

export const boardIpcMethods = [
  defineRelayIpcMethod({
    channel: relayIpcChannels.boardRead,
    payload: ipcArgs([ipcString]),
    result: ipcResult(),
    handler: (_event, projectPath) => fromPromise(() => readBoard(projectPath))
  })
] satisfies ReadonlyArray<AnyRelayIpcMethod>;
