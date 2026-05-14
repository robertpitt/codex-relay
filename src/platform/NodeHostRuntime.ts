/**
 * Node/Electron implementation of Relay's host runtime service.
 */
import { createRequire } from "node:module";
import os from "node:os";
import { Effect, Layer } from "effect";
import { HostRuntime } from "../io/HostRuntime";

const environmentRecord = (): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  return env;
};

const defaultRequireFrom = (): string =>
  typeof __filename === "string" ? __filename : `${process.cwd().replace(/\/+$/g, "")}/package.json`;

export const NodeHostRuntimeLive = Layer.succeed(HostRuntime)({
  homeDirectory: Effect.sync(() => os.homedir()),
  cwd: Effect.sync(() => process.cwd()),
  platform: Effect.sync(() => ({ platform: process.platform, arch: process.arch })),
  env: Effect.sync(environmentRecord),
  envVar: (name) => Effect.sync(() => (typeof process.env[name] === "string" ? process.env[name] : undefined)),
  resolvePackageJson: (specifier, fromPackageJsonPath) =>
    Effect.try({
      try: () => createRequire(fromPackageJsonPath ?? defaultRequireFrom()).resolve(specifier),
      catch: (error) => error
    })
});
