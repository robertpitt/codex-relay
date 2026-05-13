import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentActivityPanel, AgentLogViewer, AgentProgressSummary } from "../src/renderer/src/components/AgentActivity";
import {
  agentEventLabel,
  agentEventText,
  agentEventTone,
  deriveAgentProgress,
  formatElapsedDuration
} from "../src/renderer/src/lib/agentProgress";
import type { RendererRunEvent } from "../src/shared/types";

const baseEvent = {
  projectPath: "/tmp/relay-project",
  ticketId: "tkt_1",
  runId: "run_1"
};

const event = (patch: Partial<RendererRunEvent> & { type: RendererRunEvent["type"]; timestamp: string }): RendererRunEvent =>
  ({
    ...baseEvent,
    ...patch
  }) as RendererRunEvent;

test("agent progress derives elapsed time and count metrics from run events", () => {
  const events: RendererRunEvent[] = [
    event({ type: "run.started", runId: "run_1", threadId: "thread_1", timestamp: "2026-05-11T10:00:00.000Z" }),
    event({ type: "file.change", path: "src/App.tsx", summary: "update src/App.tsx", timestamp: "2026-05-11T10:00:20.000Z" }),
    event({ type: "file.change", path: "src/App.tsx", summary: "update src/App.tsx", timestamp: "2026-05-11T10:00:30.000Z" }),
    event({ type: "web.search", query: "Codex SDK event types", timestamp: "2026-05-11T10:00:40.000Z" }),
    event({ type: "agent.message.delta", text: "Web search: legacy query", timestamp: "2026-05-11T10:00:45.000Z" }),
    event({ type: "run.completed", finalResponse: "Done.", timestamp: "2026-05-11T10:01:05.000Z" })
  ];

  const progress = deriveAgentProgress({ events, status: "completed", now: Date.parse("2026-05-11T10:02:00.000Z") });

  assert.equal(progress.elapsedLabel, "01:05");
  assert.equal(progress.filesEdited, 1);
  assert.equal(progress.webSearches, 2);
  assert.equal(progress.statusLabel, "Completed");
});

test("elapsed duration formatting stays stable across minute and hour boundaries", () => {
  assert.equal(formatElapsedDuration(null), "Unavailable");
  assert.equal(formatElapsedDuration(0), "00:00");
  assert.equal(formatElapsedDuration(61_000), "01:01");
  assert.equal(formatElapsedDuration(3_661_000), "1:01:01");
});

test("agent progress summary renders active elapsed state and unavailable metrics", () => {
  const markup = renderToStaticMarkup(
    <AgentProgressSummary
      events={[]}
      status="drafting"
      startedAt="2026-05-11T10:00:00.000Z"
      metricsAvailable={false}
      now={Date.parse("2026-05-11T10:01:01.000Z")}
    />
  );

  assert.match(markup, /Drafting/);
  assert.match(markup, /01:01/);
  assert.match(markup, /Files Edited/);
  assert.match(markup, /Unavailable/);
});

test("agent activity panel exposes a dedicated log entry point", () => {
  const markup = renderToStaticMarkup(
    <AgentActivityPanel
      events={[
        event({ type: "run.started", runId: "run_1", threadId: "thread_1", timestamp: "2026-05-11T10:00:00.000Z" })
      ]}
      status="running"
      runId="run_1"
      runSummary={null}
      logLoading={false}
      logError={null}
      onOpenLogs={() => undefined}
      onRevealFile={() => undefined}
    />
  );

  assert.match(markup, /Agent Activity/);
  assert.match(markup, /Open Logs/);
  assert.match(markup, /Recent Activity/);
  assert.match(markup, /Run/);
  assert.match(markup, /Run started/);
  assert.doesNotMatch(markup, /Run started \(thread_1\)/);
});

test("agent activity panel keeps run summary timing and token usage behind diagnostics disclosure", () => {
  const markup = renderToStaticMarkup(
    <AgentActivityPanel
      events={[
        event({ type: "run.started", runId: "run_1", threadId: "thread_1", timestamp: "2026-05-11T10:00:00.000Z" }),
        event({ type: "run.completed", finalResponse: "Done.", timestamp: "2026-05-11T10:01:05.000Z" })
      ]}
      status="completed"
      runId="run_1"
      runSummary={{
        schemaVersion: 1,
        ticketId: "tkt_1",
        runId: "run_1",
        threadId: "thread_1",
        startedAt: "2026-05-11T10:00:00.000Z",
        endedAt: "2026-05-11T10:01:05.000Z",
        durationMs: 65_000,
        finalStatus: "completed",
        usage: {
          inputTokens: 1200,
          cachedInputTokens: 400,
          outputTokens: 300,
          reasoningOutputTokens: 50,
          totalTokens: 1500
        },
        eventCount: 2,
        latestEventAt: "2026-05-11T10:01:05.000Z"
      }}
      logLoading={false}
      logError={null}
      onOpenLogs={() => undefined}
      onRevealFile={() => undefined}
    />
  );

  assert.match(markup, /<details class="agent-diagnostics"><summary>Diagnostics<\/summary>/);
  assert.doesNotMatch(markup, /<details class="agent-diagnostics" open="">/);
  assert.match(markup, /Latest run summary/);
  assert.match(markup, /Duration/);
  assert.match(markup, /01:05/);
  assert.match(markup, /Token Usage/);
  assert.match(markup, /1,500/);
  assert.match(markup, /Thread/);
  assert.match(markup, /thread_1/);
});

test("agent activity panel marks token usage unavailable inside diagnostics when absent", () => {
  const markup = renderToStaticMarkup(
    <AgentActivityPanel
      events={[event({ type: "run.failed", message: "The operation was aborted.", timestamp: "2026-05-11T10:00:30.000Z" })]}
      status="cancelled"
      runId="run_1"
      runSummary={{
        schemaVersion: 1,
        ticketId: "tkt_1",
        runId: "run_1",
        threadId: "thread_1",
        startedAt: "2026-05-11T10:00:00.000Z",
        endedAt: "2026-05-11T10:00:30.000Z",
        durationMs: 30_000,
        finalStatus: "cancelled",
        usage: null,
        eventCount: 1,
        latestEventAt: "2026-05-11T10:00:30.000Z"
      }}
      logLoading={false}
      logError={null}
      onOpenLogs={() => undefined}
      onRevealFile={() => undefined}
    />
  );

  assert.match(markup, /Cancelled/);
  assert.match(markup, /<details class="agent-diagnostics"><summary>Diagnostics<\/summary>/);
  assert.match(markup, /Token Usage/);
  assert.match(markup, /Unavailable from this run log/);
});

test("agent log viewer orders events chronologically and labels event types", () => {
  const markup = renderToStaticMarkup(
    <AgentLogViewer
      title="Ticket Logs"
      loading={false}
      error={null}
      events={[
        event({ type: "command.started", command: "npm test", timestamp: "2026-05-11T10:00:30.000Z" }),
        event({ type: "web.search", query: "Relay docs", timestamp: "2026-05-11T10:00:20.000Z" }),
        event({ type: "run.started", runId: "run_1", threadId: "thread_1", timestamp: "2026-05-11T10:00:10.000Z" })
      ]}
      onClose={() => undefined}
    />
  );

  assert.ok(markup.indexOf("run.started") < markup.indexOf("web.search"));
  assert.ok(markup.indexOf("web.search") < markup.indexOf("command.started"));
  assert.match(markup, /Run/);
  assert.match(markup, /Web Search/);
  assert.match(markup, /Command/);
});

test("agent progress utilities describe todo and MCP events", () => {
  const todo = event({
    type: "todo.updated",
    items: [
      { text: "Inspect SDK item stream", completed: true },
      { text: "Persist structured events", completed: false }
    ],
    timestamp: "2026-05-11T10:00:20.000Z"
  });
  const mcp = event({
    type: "mcp.tool_call",
    server: "github",
    tool: "search",
    status: "failed",
    error: "rate limited",
    timestamp: "2026-05-11T10:00:25.000Z"
  });

  assert.equal(agentEventLabel(todo), "Todo");
  assert.match(agentEventText(todo), /Todo list updated: 1\/2 completed/);
  assert.match(agentEventText(todo), /\[x\] Inspect SDK item stream/);
  assert.equal(agentEventTone(todo), "info");

  assert.equal(agentEventLabel(mcp), "MCP Tool");
  assert.equal(agentEventText(mcp), "MCP tool failed: github.search: rate limited");
  assert.equal(agentEventTone(mcp), "danger");

  const markup = renderToStaticMarkup(
    <AgentLogViewer title="Ticket Logs" loading={false} error={null} events={[todo, mcp]} onClose={() => undefined} />
  );

  assert.match(markup, /Todo/);
  assert.match(markup, /MCP Tool/);
  assert.match(markup, /todo.updated/);
  assert.match(markup, /mcp.tool_call/);
  assert.match(markup, /Persist structured events/);
  assert.match(markup, /github.search/);
});

test("agent log viewer distinguishes loading, failed, and empty states", () => {
  const loadingMarkup = renderToStaticMarkup(
    <AgentLogViewer title="Ticket Logs" loading events={[]} error={null} onClose={() => undefined} />
  );
  const errorMarkup = renderToStaticMarkup(
    <AgentLogViewer title="Ticket Logs" loading={false} events={[]} error="Missing log file" onClose={() => undefined} />
  );
  const emptyMarkup = renderToStaticMarkup(
    <AgentLogViewer title="Ticket Logs" loading={false} events={[]} error={null} onClose={() => undefined} />
  );

  assert.match(loadingMarkup, /Loading saved log events/);
  assert.match(errorMarkup, /Unable to load saved log events: Missing log file/);
  assert.match(emptyMarkup, /No detailed log events are available/);
});
