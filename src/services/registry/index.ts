import { Context, Effect, FileSystem, Layer, Path } from "effect";
import type { AppRegistry } from "@shared/schemas";
import { appRegistrySchema } from "@shared/schemas";
import { ElectronApp } from "../../platform";
import { runBackendEffect } from "../../runtime";
import { parseSchema } from "../schemas";

const defaultRegistry = (): AppRegistry => ({
  schemaVersion: 1,
  projects: [],
  ui: {
    lastProjectPath: null,
    theme: "system"
  }
});

export type RegistryStoreService = {
  readonly read: () => Effect.Effect<AppRegistry, unknown>;
  readonly write: (registry: AppRegistry) => Effect.Effect<void, unknown>;
  readonly upsertProjectPath: (projectPath: string) => Effect.Effect<AppRegistry, unknown>;
  readonly removeProjectPath: (projectPath: string) => Effect.Effect<AppRegistry, unknown>;
};

export const RegistryStore = Context.Service<RegistryStoreService>("relay/RegistryStore");

export const RegistryStoreLive = Layer.effect(
  RegistryStore,
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const electronApp = yield* ElectronApp;
    const userData = yield* electronApp.getPath("userData");
    const registryPath = (): string => path.join(userData, "registry.json");

    const read = (): Effect.Effect<AppRegistry> =>
      fs.readFileString(registryPath(), "utf8").pipe(
        Effect.map((raw) => parseSchema(appRegistrySchema, JSON.parse(raw))),
        Effect.catch(() => Effect.succeed(defaultRegistry()))
      );

    const write = (registry: AppRegistry): Effect.Effect<void, unknown> =>
      Effect.gen(function*() {
        const target = registryPath();
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        const tmp = `${target}.tmp`;
        yield* fs.writeFileString(tmp, `${JSON.stringify(registry, null, 2)}\n`);
        yield* fs.rename(tmp, target);
      });

    return {
      read,
      write,
      upsertProjectPath: (projectPath) =>
        Effect.gen(function*() {
          const registry = yield* read();
          const resolved = path.resolve(projectPath);
          const existing = registry.projects.find((project) => path.resolve(project.path) === resolved);
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
          yield* write(registry);
          return registry;
        }),
      removeProjectPath: (projectPath) =>
        Effect.gen(function*() {
          const registry = yield* read();
          const resolved = path.resolve(projectPath);
          registry.projects = registry.projects.filter((project) => path.resolve(project.path) !== resolved);
          if (registry.ui.lastProjectPath && path.resolve(registry.ui.lastProjectPath) === resolved) {
            registry.ui.lastProjectPath = registry.projects[0]?.path ?? null;
          }
          yield* write(registry);
          return registry;
        })
    };
  })
);

export const readRegistry = (): Promise<AppRegistry> =>
  runBackendEffect(Effect.provide(RegistryStore.use((store) => store.read()), RegistryStoreLive));

export const writeRegistry = (registry: AppRegistry): Promise<void> =>
  runBackendEffect(Effect.provide(RegistryStore.use((store) => store.write(registry)), RegistryStoreLive));

export const upsertProjectPath = (projectPath: string): Promise<AppRegistry> =>
  runBackendEffect(Effect.provide(RegistryStore.use((store) => store.upsertProjectPath(projectPath)), RegistryStoreLive));

export const removeProjectPath = (projectPath: string): Promise<AppRegistry> =>
  runBackendEffect(Effect.provide(RegistryStore.use((store) => store.removeProjectPath(projectPath)), RegistryStoreLive));
