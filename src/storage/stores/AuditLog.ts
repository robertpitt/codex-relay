/**
 * Append-only audit log storage.
 */
import { Context, Effect, FileSystem, Layer, Path } from "effect";
import type { RelayAuditEvent } from "@shared/schemas";
import { auditLogPath } from "../paths";
import { mapStoreWriteError, type StoreEffect } from "./effects";

export type AuditLogService = {
  readonly append: (projectPath: string, event: RelayAuditEvent) => StoreEffect<void, FileSystem.FileSystem | Path.Path>;
};

export const AuditLog = Context.Service<AuditLogService>("relay/storage/AuditLog");

export const makeFileSystemAuditLog = (): AuditLogService => ({
  append: (projectPath, event) =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const target = auditLogPath(path, projectPath);
      yield* fs.makeDirectory(path.dirname(target), { recursive: true });
      yield* fs.writeFileString(target, `${JSON.stringify(event)}\n`, { flag: "a" });
    }).pipe(Effect.mapError(mapStoreWriteError(projectPath, "Append Relay audit event")))
});

export const FileSystemAuditLogLive = Layer.succeed(AuditLog)(makeFileSystemAuditLog());
