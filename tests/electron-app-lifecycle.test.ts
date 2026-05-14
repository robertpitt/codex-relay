import test from "node:test";
import { Deferred, Effect, Logger, Queue } from "effect";
import {
  makeElectronAppService,
  type ElectronAppLifecycleEvent,
  type ElectronAppService
} from "../src/platform/electron/ElectronApp";
import type { ProcessLifecycleEvent, ProcessLifecycleService } from "../src/platform/ProcessLifecycle";

type ElectronAppLifecycleTestServices = {
  readonly processEvents: Queue.Dequeue<ProcessLifecycleEvent>;
  readonly electronEvents: Queue.Dequeue<ElectronAppLifecycleEvent>;
  readonly platform?: NodeJS.Platform;
  readonly quit?: ElectronAppService["quit"];
};

const makeElectronAppLifecycleTestService = async ({
  processEvents,
  electronEvents,
  platform = "linux",
  quit = () => Effect.void
}: ElectronAppLifecycleTestServices): Promise<ElectronAppService> => {
  const shutdown = await Effect.runPromise(Deferred.make<void>());
  const processLifecycle: ProcessLifecycleService = {
    events: () => Effect.succeed(processEvents)
  };

  return makeElectronAppService(
    {
      getPath: () => Effect.succeed(""),
      whenReady: () => Effect.void,
      lifecycleEvents: () => Effect.succeed(electronEvents),
      onActivate: () => Effect.void,
      onBeforeQuit: () => Effect.void,
      onWindowAllClosed: () => Effect.void,
      quit,
      platform
    },
    processLifecycle,
    shutdown
  );
};

test("ElectronApp routes lifecycle events and owns shutdown signalling", { timeout: 1000 }, async () => {
  const processEvents = await Effect.runPromise(Queue.unbounded<ProcessLifecycleEvent>());
  const electronEvents = await Effect.runPromise(Queue.unbounded<ElectronAppLifecycleEvent>());
  const activated = await Effect.runPromise(Deferred.make<void>());
  const quit = await Effect.runPromise(Deferred.make<void>());
  const electronApp = await makeElectronAppLifecycleTestService({
    processEvents,
    electronEvents,
    quit: () => Deferred.succeed(quit, undefined).pipe(Effect.asVoid)
  });

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function*() {
        yield* electronApp.startLifecycleSupervision({
          onActivate: () => Deferred.succeed(activated, undefined).pipe(Effect.asVoid)
        });

        yield* Queue.offer(electronEvents, { type: "activate" });
        yield* Deferred.await(activated);

        yield* Queue.offer(electronEvents, { type: "windowAllClosed" });
        yield* Deferred.await(quit);

        yield* Queue.offer(electronEvents, { type: "beforeQuit" });
        yield* electronApp.awaitShutdown();
      }).pipe(Effect.provide(Logger.layer([])))
    )
  );
});

test("ElectronApp keeps supervising after a lifecycle handler fails", { timeout: 1000 }, async () => {
  const processEvents = await Effect.runPromise(Queue.unbounded<ProcessLifecycleEvent>());
  const electronEvents = await Effect.runPromise(Queue.unbounded<ElectronAppLifecycleEvent>());
  const electronApp = await makeElectronAppLifecycleTestService({
    processEvents,
    electronEvents
  });

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function*() {
        yield* electronApp.startLifecycleSupervision({
          onActivate: () => Effect.fail(new Error("activate failed"))
        });

        yield* Queue.offer(electronEvents, { type: "activate" });
        yield* Queue.offer(electronEvents, { type: "beforeQuit" });
        yield* electronApp.awaitShutdown();
      }).pipe(Effect.provide(Logger.layer([])))
    )
  );
});
