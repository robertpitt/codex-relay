import { Context, Effect, Layer, Queue, Scope } from "effect";

export type ProcessLifecycleEvent =
  | { readonly type: "uncaughtException"; readonly error: unknown }
  | { readonly type: "unhandledRejection"; readonly error: unknown };

export type ProcessLifecycleService = {
  readonly events: () => Effect.Effect<Queue.Dequeue<ProcessLifecycleEvent>, never, Scope.Scope>;
};

export const ProcessLifecycle = Context.Service<ProcessLifecycleService>("relay/ProcessLifecycle");

export const ProcessLifecycleLive = Layer.succeed(ProcessLifecycle)({
  events: () =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<ProcessLifecycleEvent>();
      const onUncaughtException = (error: unknown): void => {
        Queue.offerUnsafe(queue, { type: "uncaughtException", error });
      };
      const onUnhandledRejection = (error: unknown): void => {
        Queue.offerUnsafe(queue, { type: "unhandledRejection", error });
      };

      yield* Effect.acquireRelease(
        Effect.sync(() => {
          process.on("uncaughtException", onUncaughtException);
          process.on("unhandledRejection", onUnhandledRejection);
        }),
        () =>
          Effect.gen(function*() {
            process.off("uncaughtException", onUncaughtException);
            process.off("unhandledRejection", onUnhandledRejection);
            yield* Queue.shutdown(queue);
          })
      );

      return queue;
    })
});
