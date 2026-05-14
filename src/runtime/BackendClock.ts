import { Context, Layer } from "effect";

export const BackendClock = Context.Service<{
    readonly nowIso: () => string;
    readonly nowMs: () => number;
}>("relay/BackendClock");

export const BackendClockLive = Layer.succeed(BackendClock)({
    nowIso: () => new Date().toISOString(),
    nowMs: () => Date.now()
});