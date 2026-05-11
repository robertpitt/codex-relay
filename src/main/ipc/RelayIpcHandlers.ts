import { Effect } from "effect";
import { RelayIpc } from "./RelayIpc";
import { relayIpcMethods } from "./methods";

export const installRelayIpcHandlers = () =>
  Effect.gen(function*() {
    const relayIpc = yield* RelayIpc;
    for (const method of relayIpcMethods) {
      yield* relayIpc.handle(method);
    }
  });
