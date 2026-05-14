import { Schema } from "effect";
import type { SchemaType } from "./common";

export const relayRpcErrorSchema = Schema.Struct({
  code: Schema.Literal("relay_rpc_error"),
  message: Schema.String
});

export type RelayRpcError = SchemaType<typeof relayRpcErrorSchema>;
