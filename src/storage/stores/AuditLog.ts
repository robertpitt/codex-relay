/**
 * Append-only audit log storage.
 */
import { Context, Effect, FileSystem, Layer, Path } from "effect";
import type { RelayAuditEvent } from "@shared/types";
import { auditLogPath } from "../paths";
import { mapStoreWriteError, type StoreEffect } from "./effects";

export type AuditLogService = {
  readonly append: (projectPath: string, event: RelayAuditEvent) => StoreEffect<void, FileSystem.FileSystem | Path.Path>;
};

export const AuditLog = Context.Service<AuditLogService>("relay/storage/AuditLog");

export const makeFileSystemAuditLog = (): AuditLogService => ({
  append: (projectPath, event) => {
    const target = auditLogPath(projectPath);
    return Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.makeDirectory(path.dirname(target), { recursive: true });
      yield* fs.writeFileString(target, `${JSON.stringify(event)}\n`, { flag: "a" });
    }).pipe(Effect.mapError(mapStoreWriteError(target, "Append Relay audit event")));
  }
});

export const FileSystemAuditLogLive = Layer.succeed(AuditLog)(makeFileSystemAuditLog());
