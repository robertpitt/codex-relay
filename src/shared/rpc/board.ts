import { Rpc } from "effect/unstable/rpc";
import { boardSnapshotSchema, relayRpcErrorSchema } from "../schemas";
import { projectPathPayload } from "./common";
import { relayRpcTags } from "./tags";

export class BoardRead extends Rpc.make(relayRpcTags.boardRead, {
  payload: projectPathPayload,
  success: boardSnapshotSchema,
  error: relayRpcErrorSchema
}) {}
