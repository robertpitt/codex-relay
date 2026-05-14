import test from "node:test";
import assert from "node:assert/strict";
import { Effect, Logger } from "effect";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runBackendEffect } from "../src/runtime";
import { formatRelayLogLine, logWithRelayAnnotations, relayLogger } from "../src/services/logger";

test("Relay log formatter preserves the existing line shape", () => {
  assert.equal(
    formatRelayLogLine({
      timestamp: "2026-05-11T10:00:00.000Z",
      level: "info",
      scope: "git",
      message: "metadata refreshed",
      meta: { projectPath: "/tmp/repo" }
    }),
    '2026-05-11T10:00:00.000Z INFO [git] metadata refreshed {"projectPath":"/tmp/repo"}'
  );
});

test("Relay Effect logger includes log annotations as structured metadata", async () => {
  const lines: string[] = [];
  const sink = Logger.make<unknown, void>((options) => {
    lines.push(relayLogger.log(options));
  });

  await Effect.runPromise(
    Effect.logInfo("metadata refreshed").pipe(
      Effect.annotateLogs({ scope: "git", projectPath: "/tmp/repo" }),
      Effect.provide(Logger.layer([sink]))
    )
  );

  assert.equal(lines.length, 1);
  assert.match(lines[0], /^.+ INFO \[git\] metadata refreshed /);
  assert.match(lines[0], /"projectPath":"\/tmp\/repo"/);
  assert.doesNotMatch(lines[0], /"scope":"git"/);
});

test("Relay logging helper uses Effect logs without nesting metadata", async () => {
  const lines: string[] = [];
  const sink = Logger.make<unknown, void>((options) => {
    lines.push(relayLogger.log(options));
  });

  await Effect.runPromise(
    logWithRelayAnnotations("info", "app", "Relay starting", { logPath: "/tmp/relay.log" }).pipe(
      Effect.provide(Logger.layer([sink]))
    )
  );

  assert.equal(lines.length, 1);
  assert.match(lines[0], /^.+ INFO \[app\] Relay starting /);
  assert.match(lines[0], /"logPath":"\/tmp\/relay.log"/);
  assert.doesNotMatch(lines[0], /"meta":/);
  assert.doesNotMatch(lines[0], /"scope":"app"/);
});

test("Relay logging helper keeps category scope separate from metadata scope", async () => {
  const lines: string[] = [];
  const sink = Logger.make<unknown, void>((options) => {
    lines.push(relayLogger.log(options));
  });

  await Effect.runPromise(
    logWithRelayAnnotations("info", "codex:draft", "starting ticket draft", { scope: "task", requestId: "tdr_1" }).pipe(
      Effect.provide(Logger.layer([sink]))
    )
  );

  assert.equal(lines.length, 1);
  assert.match(lines[0], /^.+ INFO \[codex:draft\] starting ticket draft /);
  assert.match(lines[0], /"scope":"task"/);
  assert.match(lines[0], /"requestId":"tdr_1"/);
});

test("Relay Effect file logger can acquire and write through the backend file system", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "relay-logger-"));
  const target = path.join(directory, "relay.log");

  await runBackendEffect(
    Effect.scoped(
      Effect.gen(function*() {
        const fileLogger = yield* Logger.toFile(relayLogger, target, { flag: "a", batchWindow: 0 });
        yield* Effect.logInfo("Relay starting").pipe(
          Effect.annotateLogs({ scope: "app", logPath: target }),
          Effect.provide(Logger.layer([fileLogger]))
        );
      })
    )
  );

  const raw = await readFile(target, "utf8");
  assert.match(raw, / INFO \[app\] Relay starting /);
  assert.match(raw, /"logPath":/);
});
