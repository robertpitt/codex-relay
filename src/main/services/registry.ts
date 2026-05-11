import { app } from "electron";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppRegistry } from "../../shared/types";
import { appRegistrySchema } from "./schemas";

const defaultRegistry = (): AppRegistry => ({
  schemaVersion: 1,
  projects: [],
  ui: {
    lastProjectPath: null,
    theme: "system"
  }
});

const registryPath = (): string => path.join(app.getPath("userData"), "registry.json");

export const readRegistry = async (): Promise<AppRegistry> => {
  try {
    const raw = await readFile(registryPath(), "utf8");
    return appRegistrySchema.parse(JSON.parse(raw)) as AppRegistry;
  } catch {
    return defaultRegistry();
  }
};

export const writeRegistry = async (registry: AppRegistry): Promise<void> => {
  const target = registryPath();
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await writeFile(tmp, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  await rename(tmp, target);
};

export const upsertProjectPath = async (projectPath: string): Promise<AppRegistry> => {
  const registry = await readRegistry();
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
  await writeRegistry(registry);
  return registry;
};

export const removeProjectPath = async (projectPath: string): Promise<AppRegistry> => {
  const registry = await readRegistry();
  const resolved = path.resolve(projectPath);
  registry.projects = registry.projects.filter((project) => path.resolve(project.path) !== resolved);
  if (registry.ui.lastProjectPath && path.resolve(registry.ui.lastProjectPath) === resolved) {
    registry.ui.lastProjectPath = registry.projects[0]?.path ?? null;
  }
  await writeRegistry(registry);
  return registry;
};
