import test from "node:test";
import assert from "node:assert/strict";
import { summarizeRunLogLines, summarizeRunUsage } from "../src/services/run-events";
import type { RunLogLine } from "../src/shared/types";

const baseLine = (patch: Partial<RunLogLine> & Pick<RunLogLine, "timestamp" | "type" | "payload">): RunLogLine => ({
  schemaVersion: 1,
  ticketId: "tkt_1",
  runId: "run_1",
  threadId: "thread_1",
  ...patch
});

test("run summaries derive timing, status, thread, and token usage from JSONL events", () => {
  const lines: RunLogLine[] = [
    baseLine({
      timestamp: "2026-05-11T10:00:00.000Z",
      type: "run.started",
      payload: { runId: "run_1", threadId: "thread_1" }
    }),
    baseLine({
      timestamp: "2026-05-11T10:01:05.000Z",
      type: "run.completed",
      payload: {
        finalResponse: "Done.",
        usage: {
          input_tokens: 120,
          cached_input_tokens: 40,
          output_tokens: 30,
          reasoning_output_tokens: 5,
          total_tokens: 150
        }
      }
    })
  ];

  const summary = summarizeRunLogLines("tkt_1", "run_1", lines);

  assert.equal(summary?.threadId, "thread_1");
  assert.equal(summary?.startedAt, "2026-05-11T10:00:00.000Z");
  assert.equal(summary?.endedAt, "2026-05-11T10:01:05.000Z");
  assert.equal(summary?.durationMs, 65_000);
  assert.equal(summary?.finalStatus, "completed");
  assert.deepEqual(summary?.usage, {
    inputTokens: 120,
    cachedInputTokens: 40,
    outputTokens: 30,
    reasoningOutputTokens: 5,
    totalTokens: 150
  });
});

test("run summaries remain readable for usage-absent cancelled logs", () => {
  const lines: RunLogLine[] = [
    baseLine({
      timestamp: "2026-05-11T10:00:00.000Z",
      type: "run.started",
      payload: { runId: "run_1", threadId: "thread_1" }
    }),
    baseLine({
      timestamp: "2026-05-11T10:00:30.000Z",
      type: "run.failed",
      payload: { message: "The operation was aborted." }
    })
  ];

  const summary = summarizeRunLogLines("tkt_1", "run_1", lines);

  assert.equal(summary?.finalStatus, "cancelled");
  assert.equal(summary?.durationMs, 30_000);
  assert.equal(summary?.usage, null);
});

test("run summaries infer failed status for legacy failure logs", () => {
  const lines: RunLogLine[] = [
    baseLine({
      timestamp: "2026-05-11T10:00:00.000Z",
      type: "run.started",
      payload: { runId: "run_1", threadId: "thread_1" }
    }),
    baseLine({
      timestamp: "2026-05-11T10:00:45.000Z",
      type: "run.failed",
      payload: { message: "SDK stream failed." }
    })
  ];

  const summary = summarizeRunLogLines("tkt_1", "run_1", lines);

  assert.equal(summary?.finalStatus, "failed");
  assert.equal(summary?.endedAt, "2026-05-11T10:00:45.000Z");
  assert.equal(summary?.durationMs, 45_000);
});


test("usage summary accepts nested token detail shapes and computes totals when needed", () => {
  assert.deepEqual(
    summarizeRunUsage({
      inputTokens: 10,
      outputTokens: 5,
      inputTokenDetails: { cachedTokens: 2 },
      outputTokenDetails: { reasoningTokens: 3 }
    }),
    {
      inputTokens: 10,
      cachedInputTokens: 2,
      outputTokens: 5,
      reasoningOutputTokens: 3,
      totalTokens: 15
    }
  );
  assert.equal(summarizeRunUsage(undefined), null);
  assert.equal(summarizeRunUsage({ request_id: "not-token-usage" }), null);
});
