/**
 * Node-backed implementation of Effect's `FileSystem` service.
 */
import { Effect, FileSystem, Layer, Option, PlatformError } from "effect";
import { access, mkdir, open as openFile, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import type { Stats } from "node:fs";
import type { FileHandle } from "node:fs/promises";

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

const sizeToNumber = (size: FileSystem.SizeInput): number => Number(FileSystem.Size(size));

const makeNodeFile = (target: string, handle: FileHandle): FileSystem.File => {
  let position: number | null = null;

  const trackPosition = (bytes: number): void => {
    if (position !== null) position += bytes;
  };

  return {
    [FileSystem.FileTypeId]: FileSystem.FileTypeId,
    fd: FileSystem.FileDescriptor(handle.fd),
    stat: tryFs("stat", target, () => handle.stat().then(toEffectFileInfo)),
    seek: (offset, from) =>
      Effect.sync(() => {
        const value = sizeToNumber(offset);
        position = from === "current" ? (position ?? 0) + value : value;
      }),
    sync: tryFs("sync", target, () => handle.sync()),
    read: (buffer) =>
      tryFs("read", target, async () => {
        const result = await handle.read(buffer, 0, buffer.byteLength, position);
        trackPosition(result.bytesRead);
        return FileSystem.Size(result.bytesRead);
      }),
    readAlloc: (size) =>
      tryFs("readAlloc", target, async () => {
        const buffer = new Uint8Array(sizeToNumber(size));
        const result = await handle.read(buffer, 0, buffer.byteLength, position);
        trackPosition(result.bytesRead);
        if (result.bytesRead === 0) return Option.none<Uint8Array>();
        return Option.some(buffer.slice(0, result.bytesRead));
      }),
    truncate: (length = 0) => tryFs("truncate", target, () => handle.truncate(sizeToNumber(length))),
    write: (buffer) =>
      tryFs("write", target, async () => {
        const result = await handle.write(buffer, 0, buffer.byteLength, position);
        trackPosition(result.bytesWritten);
        return FileSystem.Size(result.bytesWritten);
      }),
    writeAll: (buffer) =>
      tryFs("writeAll", target, async () => {
        let written = 0;
        while (written < buffer.byteLength) {
          const result = await handle.write(buffer, written, buffer.byteLength - written, position);
          if (result.bytesWritten === 0) break;
          written += result.bytesWritten;
          trackPosition(result.bytesWritten);
        }
      })
  };
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
    open: (target, options) =>
      Effect.acquireRelease(
        tryFs("open", target, () => openFile(target, options?.flag ?? "r", options?.mode)),
        (handle) => Effect.promise(() => handle.close()).pipe(Effect.orDie)
      ).pipe(Effect.map((handle) => makeNodeFile(target, handle))),
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
