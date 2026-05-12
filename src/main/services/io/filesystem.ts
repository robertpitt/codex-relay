import { Effect, FileSystem, Layer, Option, PlatformError } from "effect";
import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import type { Stats } from "node:fs";

export type RelayFileStat = {
  readonly type: FileSystem.File.Type;
  readonly size: number;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
};

const systemErrorTag = (error: unknown): PlatformError.SystemErrorTag => {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
  switch (code) {
    case "EACCES":
    case "EPERM":
      return "PermissionDenied";
    case "EEXIST":
      return "AlreadyExists";
    case "ENOENT":
      return "NotFound";
    case "ETIMEDOUT":
      return "TimedOut";
    case "EAGAIN":
      return "WouldBlock";
    case "EBUSY":
      return "Busy";
    default:
      return "Unknown";
  }
};

const platformError = (method: string, target: string, error: unknown): PlatformError.PlatformError =>
  PlatformError.systemError({
    _tag: systemErrorTag(error),
    module: "FileSystem",
    method,
    pathOrDescriptor: target,
    description: error instanceof Error ? error.message : undefined,
    cause: error
  });

const tryFs = <A>(method: string, target: string, evaluate: () => PromiseLike<A>): Effect.Effect<A, PlatformError.PlatformError> =>
  Effect.tryPromise({
    try: evaluate,
    catch: (error) => platformError(method, target, error)
  });

const fileType = (info: Stats): FileSystem.File.Type => {
  if (info.isFile()) return "File";
  if (info.isDirectory()) return "Directory";
  if (info.isSymbolicLink()) return "SymbolicLink";
  if (info.isBlockDevice()) return "BlockDevice";
  if (info.isCharacterDevice()) return "CharacterDevice";
  if (info.isFIFO()) return "FIFO";
  if (info.isSocket()) return "Socket";
  return "Unknown";
};

const toEffectFileInfo = (info: Stats): FileSystem.File.Info => ({
  type: fileType(info),
  mtime: Option.some(info.mtime),
  atime: Option.some(info.atime),
  birthtime: Option.some(info.birthtime),
  dev: info.dev,
  ino: Option.some(info.ino),
  mode: info.mode,
  nlink: Option.some(info.nlink),
  uid: Option.some(info.uid),
  gid: Option.some(info.gid),
  rdev: Option.some(info.rdev),
  size: FileSystem.Size(info.size),
  blksize: Option.some(FileSystem.Size(info.blksize)),
  blocks: Option.some(info.blocks)
});

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

export const NodeFileSystemLive = Layer.succeed(
  FileSystem.FileSystem,
  FileSystem.makeNoop({
    access: (target) => tryFs("access", target, () => access(target)),
    exists: (target) =>
      Effect.gen(function*() {
        const result = yield* Effect.result(tryFs("access", target, () => access(target)));
        return result._tag === "Success";
      }),
    makeDirectory: (target, options) => tryFs("makeDirectory", target, () => mkdir(target, options).then(() => undefined)),
    readDirectory: (target) => tryFs("readDirectory", target, () => readdir(target)),
    readFile: (target) => tryFs("readFile", target, () => readFile(target).then((buffer) => new Uint8Array(buffer))),
    readFileString: (target, encoding = "utf8") => tryFs("readFileString", target, () => readFile(target, encoding as BufferEncoding)),
    remove: (target, options) => tryFs("remove", target, () => rm(target, options)),
    rename: (oldPath, newPath) => tryFs("rename", oldPath, () => rename(oldPath, newPath)),
    stat: (target) => tryFs("stat", target, () => stat(target).then(toEffectFileInfo)),
    writeFile: (target, data, options) => tryFs("writeFile", target, () => writeFile(target, Buffer.from(data), options)),
    writeFileString: (target, data, options) => tryFs("writeFileString", target, () => writeFile(target, data, options))
  })
);

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
