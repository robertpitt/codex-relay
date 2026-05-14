/**
 * Append-only Codex run event log storage.
 */
import { Context, Effect, FileSystem, Layer, Path } from "effect";
import type { RunLogLine } from "@shared/types";
import { isFileNotFoundError, pathJoin } from "../../io";
import { runsPath } from "../paths";
import { mapStoreReadError, mapStoreWriteError, type StoreEffect } from "./effects";

export type RunLogService = {
  readonly append: (
    projectPath: string,
    ticketId: string,
    runId: string,
    line: RunLogLine
  ) => StoreEffect<void, FileSystem.FileSystem | Path.Path>;
  readonly read: (projectPath: string, ticketId: string, runId: string) => StoreEffect<readonly RunLogLine[], FileSystem.FileSystem>;
};

export const RunLog = Context.Service<RunLogService>("relay/storage/RunLog");

const runLogPath = (projectPath: string, ticketId: string, runId: string): string =>
  pathJoin(runsPath(projectPath), ticketId, `${runId}.jsonl`);

const parseRunLogLines = (raw: string): RunLogLine[] =>
  raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RunLogLine);

export const makeFileSystemRunLog = (): RunLogService => ({
  append: (projectPath, ticketId, runId, line) => {
    const target = runLogPath(projectPath, ticketId, runId);
    return Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.makeDirectory(path.dirname(target), { recursive: true });
      yield* fs.writeFileString(target, `${JSON.stringify(line)}\n`, { flag: "a" });
    }).pipe(Effect.mapError(mapStoreWriteError(target, "Append Relay run event")));
  },
  read: (projectPath, ticketId, runId) => {
    const target = runLogPath(projectPath, ticketId, runId);
    return FileSystem.FileSystem.use((fs) =>
      fs.readFileString(target).pipe(
        Effect.map(parseRunLogLines),
        Effect.catchIf(isFileNotFoundError, () => Effect.succeed([]))
      )
    ).pipe(Effect.mapError(mapStoreReadError(target, "Read Relay run events")));
  }
});

export const FileSystemRunLogLive = Layer.succeed(RunLog)(makeFileSystemRunLog());
