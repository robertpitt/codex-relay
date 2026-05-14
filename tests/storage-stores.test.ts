import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RELAY_SCHEMA_VERSION, type RunLogLine } from "../src/shared/schemas";
import { initializeProject, isTicketNotFoundError, makeFileSystemRunLog, readTicket } from "../src/storage";
import { runBackendEffect } from "../src/runtime";

test("split storage facade preserves ticket not-found compatibility", async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), "relay-storage-stores-"));
  try {
    await initializeProject(projectPath);

    await assert.rejects(
      () => readTicket(projectPath, "tkt_missing"),
      (error) => isTicketNotFoundError(error) && error.projectPath === projectPath
    );
  } finally {
    await rm(projectPath, { force: true, recursive: true });
  }
});

test("RunLog store appends and reads JSONL records", async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), "relay-run-log-store-"));
  try {
    const runLog = makeFileSystemRunLog();
    const line: RunLogLine = {
      schemaVersion: RELAY_SCHEMA_VERSION,
      timestamp: "2026-05-13T10:00:00.000Z",
      ticketId: "tkt_1",
      runId: "run_1",
      threadId: "thread_1",
      type: "run.started",
      payload: { runId: "run_1", threadId: "thread_1" }
    };

    assert.deepEqual(await runBackendEffect(runLog.read(projectPath, "tkt_1", "missing")), []);
    await runBackendEffect(runLog.append(projectPath, "tkt_1", "run_1", line));

    assert.deepEqual(await runBackendEffect(runLog.read(projectPath, "tkt_1", "run_1")), [line]);
  } finally {
    await rm(projectPath, { force: true, recursive: true });
  }
});
