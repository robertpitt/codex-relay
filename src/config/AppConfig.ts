import { Config, ConfigProvider, Context, Layer } from "effect";

export type BackendConfigService = {
  readonly gitMetadataCacheTtlMs: number;
  readonly gitCommandTimeoutMs: number;
  readonly codexStatusTimeoutMs: number;
  readonly storageAdapter: "filesystem";
};

export const BackendConfigDefaults: BackendConfigService = {
  gitMetadataCacheTtlMs: 3_000,
  gitCommandTimeoutMs: 5_000,
  codexStatusTimeoutMs: 5_000,
  storageAdapter: "filesystem"
};

export const BackendConfig = Context.Service<BackendConfigService>("relay/BackendConfig");

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

export const loadBackendConfig = (
  provider: ConfigProvider.ConfigProvider = ConfigProvider.fromEnv()
) => BackendConfigSpec.parse(provider);

export const BackendConfigLive = Layer.effect(BackendConfig, BackendConfigSpec.asEffect());
