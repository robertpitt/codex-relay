import { Config, Context, Effect, FileSystem, Layer, ManagedRuntime, Path } from "effect";
import type { ConfigProvider } from "effect";
import { IoLive } from "../io";
import { CommandExecutor, HostRuntime, HttpClient, SocketBoundary } from "../io";

export * from "./RelayLog";

export type BackendClockService = {
  readonly nowIso: () => string;
  readonly nowMs: () => number;
};

export const BackendClock = Context.Service<BackendClockService>("relay/BackendClock");

export const BackendClockLive = Layer.succeed(BackendClock)({
  nowIso: () => new Date().toISOString(),
  nowMs: () => Date.now()
});

export type BackendConfigService = {
  readonly gitMetadataCacheTtlMs: number;
  readonly gitCommandTimeoutMs: number;
  readonly codexStatusTimeoutMs: number;
  readonly storageAdapter: "filesystem";
};

export const BackendConfig = Context.Service<BackendConfigService>("relay/BackendConfig");

export const BackendConfigDefaults = {
  gitMetadataCacheTtlMs: 3_000,
  gitCommandTimeoutMs: 5_000,
  codexStatusTimeoutMs: 5_000,
  storageAdapter: "filesystem"
} satisfies BackendConfigService;

export const BackendConfigSpec = Config.all({
  gitMetadataCacheTtlMs: Config.int("RELAY_GIT_METADATA_CACHE_TTL_MS").pipe(
    Config.withDefault(BackendConfigDefaults.gitMetadataCacheTtlMs)
  ),
  gitCommandTimeoutMs: Config.int("RELAY_GIT_COMMAND_TIMEOUT_MS").pipe(
    Config.withDefault(BackendConfigDefaults.gitCommandTimeoutMs)
  ),
  codexStatusTimeoutMs: Config.int("RELAY_CODEX_STATUS_TIMEOUT_MS").pipe(
    Config.withDefault(BackendConfigDefaults.codexStatusTimeoutMs)
  ),
  storageAdapter: Config.literals(["filesystem"], "RELAY_STORAGE_ADAPTER").pipe(
    Config.withDefault(BackendConfigDefaults.storageAdapter)
  )
});

export const loadBackendConfig = (provider?: ConfigProvider.ConfigProvider) =>
  provider ? BackendConfigSpec.parse(provider) : BackendConfigSpec.asEffect();

export const BackendConfigLive = Layer.effect(BackendConfig, loadBackendConfig());

export type BackendLogLevel = "info" | "warn" | "error";

export type BackendServicesBase =
  | Context.Service.Identifier<typeof BackendClock>
  | Context.Service.Identifier<typeof BackendConfig>;
export type BackendIoServices =
  | Context.Service.Identifier<typeof FileSystem.FileSystem>
  | Context.Service.Identifier<typeof Path.Path>
  | Context.Service.Identifier<typeof HostRuntime>
  | Context.Service.Identifier<typeof CommandExecutor>
  | Context.Service.Identifier<typeof HttpClient>
  | Context.Service.Identifier<typeof SocketBoundary>;

export type BackendLoggerService = {
  readonly log: (
    level: BackendLogLevel,
    scope: string,
    message: string,
    meta?: unknown
  ) => Effect.Effect<void, unknown, BackendServicesBase | BackendIoServices>;
};

export const BackendLogger = Context.Service<BackendLoggerService>("relay/BackendLogger");

const safeJson = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return '"[unserializable]"';
  }
};

export const BackendLoggerConsoleLive = Layer.succeed(BackendLogger)({
  log: (level, scope, message, meta) =>
    Effect.gen(function*() {
      const clock = yield* BackendClock;
      const line = `${clock.nowIso()} ${level.toUpperCase()} [${scope}] ${message}${
        meta === undefined ? "" : ` ${safeJson(meta)}`
      }`;
      if (level === "error") {
        console.error(line);
      } else {
        console.log(line);
      }
    })
});

export const BackendServicesBaseLive = Layer.mergeAll(BackendClockLive, BackendConfigLive);

export const BackendRuntimeLive = Layer.mergeAll(BackendServicesBaseLive, BackendLoggerConsoleLive, IoLive);

export type BackendServices = BackendServicesBase | Context.Service.Identifier<typeof BackendLogger> | BackendIoServices;
export type BackendEffect<A, E = unknown, R = BackendServices> = Effect.Effect<A, E, R>;

let backendRuntime = ManagedRuntime.make(BackendRuntimeLive) as ManagedRuntime.ManagedRuntime<BackendServices, unknown>;

export const configureBackendRuntime = <R, E>(runtime: ManagedRuntime.ManagedRuntime<R, E>): void => {
  backendRuntime = runtime as unknown as ManagedRuntime.ManagedRuntime<BackendServices, unknown>;
};

export const disposeBackendRuntime = (): Promise<void> => backendRuntime.dispose();

export const runBackendEffect = <A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> =>
  backendRuntime.runPromise(effect as unknown as Effect.Effect<A, E, BackendServices>);

export const fromPromise = <A>(evaluate: (signal: AbortSignal) => PromiseLike<A>): Effect.Effect<A, unknown> =>
  Effect.tryPromise({
    try: evaluate,
    catch: (cause) => cause
  });

export const fromSync = <A>(evaluate: () => A): Effect.Effect<A, unknown> =>
  Effect.suspend(() => {
    try {
      return Effect.succeed(evaluate());
    } catch (cause) {
      return Effect.fail(cause);
    }
  });
