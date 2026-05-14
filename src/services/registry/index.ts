import { Context, Effect, Layer } from "effect";
import type { AppRegistry } from "@shared/types";
import { getElectronPath } from "../../platform/electron";
import { fromPromise, runBackendEffect } from "../../runtime";
import { makeDirectoryEffect, pathDirname, pathJoin, pathResolve, readTextFileEffect, renamePathEffect, writeTextFileEffect } from "../../io";
import { appRegistrySchema, parseSchema } from "../schemas";

const defaultRegistry = (): AppRegistry => ({
  schemaVersion: 1,
  projects: [],
  ui: {
    lastProjectPath: null,
    theme: "system"
  }
});

const registryPath = (): string => pathJoin(getElectronPath("userData"), "registry.json");

const readRegistryPromise = async (): Promise<AppRegistry> => {
  try {
    const raw = await runBackendEffect(readTextFileEffect(registryPath()));
    return parseSchema(appRegistrySchema, JSON.parse(raw));
  } catch {
    return defaultRegistry();
  }
};

const writeRegistryPromise = async (registry: AppRegistry): Promise<void> => {
  const target = registryPath();
  await runBackendEffect(makeDirectoryEffect(pathDirname(target)));
  const tmp = `${target}.tmp`;
  await runBackendEffect(writeTextFileEffect(tmp, `${JSON.stringify(registry, null, 2)}\n`));
  await runBackendEffect(renamePathEffect(tmp, target));
};

const upsertProjectPathPromise = async (projectPath: string): Promise<AppRegistry> => {
  const registry = await readRegistryPromise();
  const resolved = pathResolve(projectPath);
  const existing = registry.projects.find((project) => pathResolve(project.path) === resolved);
  const now = new Date().toISOString();

  if (existing) {
    existing.lastOpenedAt = now;
  } else {
    registry.projects.push({
      path: resolved,
      pinned: true,
      lastOpenedAt: now,
      sidebarPosition: (registry.projects.at(-1)?.sidebarPosition ?? 0) + 1000
    });
  }

  registry.ui.lastProjectPath = resolved;
  await writeRegistryPromise(registry);
  return registry;
};

const removeProjectPathPromise = async (projectPath: string): Promise<AppRegistry> => {
  const registry = await readRegistryPromise();
  const resolved = pathResolve(projectPath);
  registry.projects = registry.projects.filter((project) => pathResolve(project.path) !== resolved);
  if (registry.ui.lastProjectPath && pathResolve(registry.ui.lastProjectPath) === resolved) {
    registry.ui.lastProjectPath = registry.projects[0]?.path ?? null;
  }
  await writeRegistryPromise(registry);
  return registry;
};

export type RegistryStoreService = {
  readonly read: () => Effect.Effect<AppRegistry, unknown>;
  readonly write: (registry: AppRegistry) => Effect.Effect<void, unknown>;
  readonly upsertProjectPath: (projectPath: string) => Effect.Effect<AppRegistry, unknown>;
  readonly removeProjectPath: (projectPath: string) => Effect.Effect<AppRegistry, unknown>;
};

export const RegistryStore = Context.Service<RegistryStoreService>("relay/RegistryStore");

export const RegistryStoreLive = Layer.succeed(RegistryStore)({
  read: () => fromPromise(() => readRegistryPromise()),
  write: (registry) => fromPromise(() => writeRegistryPromise(registry)),
  upsertProjectPath: (projectPath) => fromPromise(() => upsertProjectPathPromise(projectPath)),
  removeProjectPath: (projectPath) => fromPromise(() => removeProjectPathPromise(projectPath))
});

export const readRegistry = (): Promise<AppRegistry> =>
  runBackendEffect(Effect.provide(RegistryStore.use((store) => store.read()), RegistryStoreLive));

export const writeRegistry = (registry: AppRegistry): Promise<void> =>
  runBackendEffect(Effect.provide(RegistryStore.use((store) => store.write(registry)), RegistryStoreLive));

export const upsertProjectPath = (projectPath: string): Promise<AppRegistry> =>
  runBackendEffect(Effect.provide(RegistryStore.use((store) => store.upsertProjectPath(projectPath)), RegistryStoreLive));

export const removeProjectPath = (projectPath: string): Promise<AppRegistry> =>
  runBackendEffect(Effect.provide(RegistryStore.use((store) => store.removeProjectPath(projectPath)), RegistryStoreLive));
