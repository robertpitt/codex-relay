import { app } from "electron";
import { createRequire } from "node:module";
import { Cause, Context, Deferred, Effect, Layer, Queue, Scope } from "effect";
import { ProcessLifecycle, type ProcessLifecycleEvent, type ProcessLifecycleService } from "./ProcessLifecycle";
import { electronError, type ElectronError } from "./Errors";

export type ElectronAppPathName = "home" | "userData";
export type ElectronRuntimePlatform = {
  readonly platform: NodeJS.Platform;
  readonly arch: NodeJS.Architecture;
};
export type ElectronAppLifecycleEvent =
  | { readonly type: "activate" }
  | { readonly type: "beforeQuit" }
  | { readonly type: "windowAllClosed" };

export type ElectronAppLifecycleHandlers = {
  readonly onActivate: () => Effect.Effect<void, unknown>;
};

type ElectronAppNativeService = {
  readonly getPath: (name: ElectronAppPathName) => Effect.Effect<string>;
  readonly appPath: Effect.Effect<string>;
  readonly homeDirectory: Effect.Effect<string>;
  readonly runtime: Effect.Effect<ElectronRuntimePlatform>;
  readonly env: Effect.Effect<Record<string, string>>;
  readonly envVar: (name: string) => Effect.Effect<string | undefined>;
  readonly resolvePackageJson: (specifier: string, fromPackageJsonPath?: string) => Effect.Effect<string, unknown>;
  readonly whenReady: () => Effect.Effect<void, ElectronError>;
  readonly lifecycleEvents: () => Effect.Effect<Queue.Dequeue<ElectronAppLifecycleEvent>, never, Scope.Scope>;
  readonly quit: () => Effect.Effect<void>;
  readonly platform: NodeJS.Platform;
};

export type ElectronAppService = {
  readonly getPath: (name: ElectronAppPathName) => Effect.Effect<string>;
  readonly appPath: Effect.Effect<string>;
  readonly homeDirectory: Effect.Effect<string>;
  readonly runtime: Effect.Effect<ElectronRuntimePlatform>;
  readonly env: Effect.Effect<Record<string, string>>;
  readonly envVar: (name: string) => Effect.Effect<string | undefined>;
  readonly resolvePackageJson: (specifier: string, fromPackageJsonPath?: string) => Effect.Effect<string, unknown>;
  readonly whenReady: () => Effect.Effect<void, ElectronError>;
  readonly startLifecycleSupervision: (handlers: ElectronAppLifecycleHandlers) => Effect.Effect<void, unknown, Scope.Scope>;
  readonly awaitShutdown: () => Effect.Effect<void>;
  readonly quit: () => Effect.Effect<void>;
  readonly platform: NodeJS.Platform;
};

export const ElectronApp = Context.Service<ElectronAppService>("relay/ElectronApp");

const logEventHandlerFailure = (source: string, eventType: string, cause: Cause.Cause<unknown>): Effect.Effect<void> =>
  Effect.logError("lifecycle event handler failed").pipe(
    Effect.annotateLogs({
      scope: "electron:lifecycle",
      source,
      eventType,
      cause: Cause.pretty(cause)
    })
  );

const forkLifecycleEventSupervisor = <Event extends { readonly type: string }>(
  source: string,
  events: Queue.Dequeue<Event>,
  handleEvent: (event: Event) => Effect.Effect<void, unknown>
): Effect.Effect<void, never, Scope.Scope> =>
  Queue.take(events).pipe(
    Effect.flatMap((event) =>
      handleEvent(event).pipe(Effect.catchCause((cause) => logEventHandlerFailure(source, event.type, cause)))
    ),
    Effect.forever,
    Effect.forkScoped,
    Effect.asVoid
  );

const environmentRecord = (): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  return env;
};

const defaultRequireFrom = (): string =>
  typeof __filename === "string" ? __filename : `${app.getAppPath().replace(/\/+$/g, "")}/package.json`;

const makeElectronAppNativeService = (): ElectronAppNativeService => ({
  getPath: (name) => Effect.sync(() => app.getPath(name)),
  appPath: Effect.sync(() => app.getAppPath()),
  homeDirectory: Effect.sync(() => app.getPath("home")),
  runtime: Effect.sync(() => ({ platform: process.platform, arch: process.arch })),
  env: Effect.sync(environmentRecord),
  envVar: (name) => Effect.sync(() => (typeof process.env[name] === "string" ? process.env[name] : undefined)),
  resolvePackageJson: (specifier, fromPackageJsonPath) =>
    Effect.try({
      try: () => createRequire(fromPackageJsonPath ?? defaultRequireFrom()).resolve(specifier),
      catch: (error) => error
    }),
  whenReady: () =>
    Effect.tryPromise({
      try: () => app.whenReady().then(() => undefined),
      catch: (cause) => electronError("app.whenReady", cause)
    }),
  lifecycleEvents: () =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<ElectronAppLifecycleEvent>();
      const onActivate = (): void => {
        Queue.offerUnsafe(queue, { type: "activate" });
      };
      const onBeforeQuit = (): void => {
        Queue.offerUnsafe(queue, { type: "beforeQuit" });
      };
      const onWindowAllClosed = (): void => {
        Queue.offerUnsafe(queue, { type: "windowAllClosed" });
      };

      yield* Effect.acquireRelease(
        Effect.sync(() => {
          app.on("activate", onActivate);
          app.on("before-quit", onBeforeQuit);
          app.on("window-all-closed", onWindowAllClosed);
        }),
        () =>
          Effect.gen(function*() {
            app.off("activate", onActivate);
            app.off("before-quit", onBeforeQuit);
            app.off("window-all-closed", onWindowAllClosed);
            yield* Queue.shutdown(queue);
          })
      );

      return queue;
    }),
  quit: () => Effect.sync(() => app.quit()),
  platform: process.platform
});

export const makeElectronAppService = (
  native: ElectronAppNativeService,
  processLifecycle: ProcessLifecycleService,
  shutdown: Deferred.Deferred<void>
): ElectronAppService => {
  const requestShutdown = (): Effect.Effect<void> => Deferred.succeed(shutdown, undefined).pipe(Effect.asVoid);

  const handleProcessEvent = (event: ProcessLifecycleEvent): Effect.Effect<void> => {
    switch (event.type) {
      case "uncaughtException":
        return Effect.logError("uncaught exception").pipe(Effect.annotateLogs({ scope: "process", error: event.error }));
      case "unhandledRejection":
        return Effect.logError("unhandled rejection").pipe(Effect.annotateLogs({ scope: "process", error: event.error }));
    }
  };

  const handleElectronEvent = (
    handlers: ElectronAppLifecycleHandlers,
    event: ElectronAppLifecycleEvent
  ): Effect.Effect<void, unknown> => {
    switch (event.type) {
      case "activate":
        return handlers.onActivate();
      case "beforeQuit":
        return requestShutdown();
      case "windowAllClosed":
        return native.platform === "darwin" ? Effect.void : native.quit();
    }
  };

  return {
    getPath: native.getPath,
    appPath: native.appPath,
    homeDirectory: native.homeDirectory,
    runtime: native.runtime,
    env: native.env,
    envVar: native.envVar,
    resolvePackageJson: native.resolvePackageJson,
    whenReady: native.whenReady,
    quit: native.quit,
    platform: native.platform,
    startLifecycleSupervision: (handlers) =>
      Effect.gen(function*() {
        const processEvents = yield* processLifecycle.events();
        yield* forkLifecycleEventSupervisor("process", processEvents, handleProcessEvent);

        const electronEvents = yield* native.lifecycleEvents();
        yield* forkLifecycleEventSupervisor("electron", electronEvents, (event) => handleElectronEvent(handlers, event));
      }),
    awaitShutdown: () => Deferred.await(shutdown)
  };
};

export const ElectronAppLive = Layer.effect(
  ElectronApp,
  Effect.gen(function*() {
    const processLifecycle = yield* ProcessLifecycle;
    const shutdown = yield* Deferred.make<void>();
    return makeElectronAppService(makeElectronAppNativeService(), processLifecycle, shutdown);
  })
);
