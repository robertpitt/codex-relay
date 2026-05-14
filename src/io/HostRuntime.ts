/**
 * Effect service for host runtime facts that vary between Node, Bun, and Electron.
 */
import { Context, Effect } from "effect";

export type RuntimePlatform = {
  readonly platform: NodeJS.Platform;
  readonly arch: NodeJS.Architecture;
};

export type HostRuntimeService = {
  readonly homeDirectory: Effect.Effect<string>;
  readonly cwd: Effect.Effect<string>;
  readonly platform: Effect.Effect<RuntimePlatform>;
  readonly env: Effect.Effect<Record<string, string>>;
  readonly envVar: (name: string) => Effect.Effect<string | undefined>;
  readonly resolvePackageJson: (specifier: string, fromPackageJsonPath?: string) => Effect.Effect<string, unknown>;
};

export const HostRuntime = Context.Service<HostRuntimeService>("relay/HostRuntime");

export const hostHomeDirectory = HostRuntime.use((host) => host.homeDirectory);
export const hostCwd = HostRuntime.use((host) => host.cwd);
export const hostRuntimePlatform = HostRuntime.use((host) => host.platform);
export const hostEnvironment = HostRuntime.use((host) => host.env);
export const hostEnvVar = (name: string) => HostRuntime.use((host) => host.envVar(name));
export const hostResolvePackageJson = (specifier: string, fromPackageJsonPath?: string) =>
  HostRuntime.use((host) => host.resolvePackageJson(specifier, fromPackageJsonPath));
