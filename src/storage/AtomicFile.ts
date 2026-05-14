/**
 * Atomic file writes built on Effect's `FileSystem` and `Path` services.
 */
import { Effect, FileSystem, Context, Layer, Path } from "effect";
import { ulid } from "ulid";
import { StorageReadError, StorageWriteError, errorMessage } from "../domain/errors";

export type AtomicFileService = {
  readonly exists: (target: string) => Effect.Effect<boolean, StorageReadError, FileSystem.FileSystem>;
  readonly writeText: (target: string, value: string) => Effect.Effect<void, StorageWriteError, FileSystem.FileSystem | Path.Path>;
  readonly writeJson: (target: string, value: unknown) => Effect.Effect<void, StorageWriteError, FileSystem.FileSystem | Path.Path>;
};

export const AtomicFile = Context.Service<AtomicFileService>("relay/AtomicFile");

const tempPathFor = (target: string): string => `${target}.${ulid().toLowerCase()}.tmp`;

const mapReadError = (path: string) => (cause: unknown): StorageReadError =>
  new StorageReadError({
    path,
    message: errorMessage(cause, `Could not read ${path}.`),
    cause
  });

const mapWriteError = (path: string) => (cause: unknown): StorageWriteError =>
  new StorageWriteError({
    path,
    message: errorMessage(cause, `Could not write ${path}.`),
    cause
  });

const exists = (target: string): Effect.Effect<boolean, StorageReadError, FileSystem.FileSystem> =>
  FileSystem.FileSystem.use((fs) => fs.exists(target)).pipe(Effect.mapError(mapReadError(target)));

const writeText = (target: string, value: string): Effect.Effect<void, StorageWriteError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmp = tempPathFor(target);
    yield* fs.makeDirectory(path.dirname(target), { recursive: true });
    yield* fs.writeFileString(tmp, value);
    yield* fs.rename(tmp, target);
  }).pipe(Effect.mapError(mapWriteError(target)));

const writeJson = (target: string, value: unknown): Effect.Effect<void, StorageWriteError, FileSystem.FileSystem | Path.Path> =>
  writeText(target, `${JSON.stringify(value, null, 2)}\n`);

export const AtomicFileLive = Layer.succeed(AtomicFile)({
  exists,
  writeText,
  writeJson
});
