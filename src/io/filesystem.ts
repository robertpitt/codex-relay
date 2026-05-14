import { Effect, FileSystem, PlatformError } from "effect";

export type RelayFileStat = {
  readonly type: FileSystem.File.Type;
  readonly size: number;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
};

const toRelayFileStat = (info: FileSystem.File.Info): RelayFileStat => ({
  type: info.type,
  size: Number(info.size),
  isDirectory: info.type === "Directory",
  isFile: info.type === "File"
});

export const isFileNotFoundError = (error: unknown): boolean => {
  if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT") {
    return true;
  }
  if (typeof error !== "object" || error === null) return false;
  const platformError = error as { _tag?: unknown; reason?: { _tag?: unknown } };
  return platformError._tag === "PlatformError" && platformError.reason?._tag === "NotFound";
};

export const fileExistsEffect = (target: string): Effect.Effect<boolean, PlatformError.PlatformError, FileSystem.FileSystem> =>
  FileSystem.FileSystem.use((fs) => fs.exists(target));

export const readTextFileEffect = (target: string): Effect.Effect<string, PlatformError.PlatformError, FileSystem.FileSystem> =>
  FileSystem.FileSystem.use((fs) => fs.readFileString(target, "utf8"));

export const writeBinaryFileEffect = (
  target: string,
  value: Uint8Array
): Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem> =>
  FileSystem.FileSystem.use((fs) => fs.writeFile(target, value));

export const writeTextFileEffect = (target: string, value: string): Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem> =>
  FileSystem.FileSystem.use((fs) => fs.writeFileString(target, value));

export const appendTextFileEffect = (target: string, value: string): Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem> =>
  FileSystem.FileSystem.use((fs) => fs.writeFileString(target, value, { flag: "a" }));

export const makeDirectoryEffect = (target: string): Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem> =>
  FileSystem.FileSystem.use((fs) => fs.makeDirectory(target, { recursive: true }));

export const readDirectoryEffect = (target: string): Effect.Effect<string[], PlatformError.PlatformError, FileSystem.FileSystem> =>
  FileSystem.FileSystem.use((fs) => fs.readDirectory(target));

export const renamePathEffect = (
  oldPath: string,
  newPath: string
): Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem> =>
  FileSystem.FileSystem.use((fs) => fs.rename(oldPath, newPath));

export const statPathEffect = (target: string): Effect.Effect<RelayFileStat, PlatformError.PlatformError, FileSystem.FileSystem> =>
  FileSystem.FileSystem.use((fs) => Effect.map(fs.stat(target), toRelayFileStat));
