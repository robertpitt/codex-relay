import test from "node:test";
import assert from "node:assert/strict";
import { Schema } from "effect";
import {
  agentTicketUpdateSchema,
  projectConfigSchema,
  relayCodexEventSchema,
  rendererRunEventSchema,
  runLogLineSchema,
  ticketDraftSchema,
  ticketFrontMatterSchema,
  ticketSuggestionsResponseSchema
} from "../src/shared/schemas";
import { isRelaySchemaError, parseSchema } from "../src/services/schemas";
import type { TicketDraftSubticket } from "../src/shared/schemas";

const expectSchemaError = (error: unknown, message?: RegExp): true => {
  assert.equal(isRelaySchemaError(error), true);
  if (message) {
    const rendered = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
    assert.match(rendered, message);
  }
  return true;
};

const validDraftBase = (patch: Partial<TicketDraftSubticket> = {}): TicketDraftSubticket => ({
  title: "Draft title",
  priority: "medium",
  labels: ["schema"],
  context: "Context.",
  researchFindings: ["Finding."],
  requirements: ["Requirement."],
  implementationPlan: ["Implementation step."],
  testPlan: ["npm test"],
  acceptanceCriteria: ["Acceptance."],
  clarificationQuestions: [],
  assumptions: [],
  implementationNotes: [],
  ...patch
});

const validProjectConfigInput = (settingsPatch: Record<string, unknown> = {}): Record<string, unknown> => ({
  schemaVersion: 1,
  projectId: "prj_schema",
  name: "Schema Project",
  createdAt: "2026-05-11T09:00:00.000Z",
  updatedAt: "2026-05-11T10:00:00.000Z",
  columns: [{ id: "todo", name: "Todo", position: 1000, terminal: false }],
  settings: {
    defaultModel: null,
    defaultApprovalPolicy: "on-request",
    defaultSandboxMode: "workspace-write",
    allowNonGitCodexRuns: false,
    ticketDraftingEnabled: true,
    codexExecutionEnabled: true,
    ...settingsPatch
  }
});

test("ticket front matter decodes Date timestamps, legacy defaults, and passthrough extras", () => {
  const createdAt = new Date("2026-05-11T09:00:00.000Z");
  const parsed = parseSchema(ticketFrontMatterSchema, {
    schemaVersion: 1,
    id: "tkt_schema_defaults",
    title: "Legacy ticket",
    status: "todo",
    position: 1000,
    priority: "medium",
    createdAt,
    updatedAt: "2026-05-11T09:30:00.000Z",
    runStatus: "idle",
    legacyField: { preserved: true }
  });

  assert.equal(parsed.createdAt, "2026-05-11T09:00:00.000Z");
  assert.equal(parsed.ticketType, "task");
  assert.equal(parsed.effort, "medium");
  assert.equal(parsed.labels.length, 0);
  assert.equal(parsed.parentEpicId, null);
  assert.equal(parsed.subticketIds.length, 0);
  assert.equal(parsed.blockedByIds.length, 0);
  assert.equal(parsed.relatedTicketIds.length, 0);
  assert.equal(parsed.authoringState, "rough");
  assert.equal(parsed.codexThreadId, null);
  assert.equal(parsed.lastRunId, null);
  assert.equal(parsed.lastRunStartedAt, null);
  assert.deepEqual((parsed as typeof parsed & { legacyField: unknown }).legacyField, { preserved: true });

  parsed.labels.push("mutable");
  assert.deepEqual(parsed.labels, ["mutable"]);

  const queued = parseSchema(ticketFrontMatterSchema, {
    ...parsed,
    runStatus: "queued",
    lastRunId: "run_schema_queue",
    lastRunStartedAt: "2026-05-11T09:45:00.000Z"
  });
  assert.equal(queued.runStatus, "queued");
  assert.equal(queued.lastRunStartedAt, "2026-05-11T09:45:00.000Z");
});

test("project settings decode legacy configs with conservative SDK thread option defaults", () => {
  const config = parseSchema(projectConfigSchema, validProjectConfigInput());

  assert.equal(config.settings.defaultModelReasoningEffort, null);
  assert.equal(config.settings.defaultTicketEffort, "medium");
  assert.equal(config.settings.codexNetworkAccessEnabled, false);
  assert.equal(config.settings.codexWebSearchMode, "disabled");
  assert.deepEqual(config.settings.codexAdditionalDirectories, []);
  assert.equal(config.settings.agentConcurrency, 1);
});

test("project settings validate SDK approval, reasoning, and web search enums", () => {
  for (const approvalPolicy of ["untrusted", "on-request", "on-failure", "never"]) {
    const config = parseSchema(projectConfigSchema, validProjectConfigInput({ defaultApprovalPolicy: approvalPolicy }));
    assert.equal(config.settings.defaultApprovalPolicy, approvalPolicy);
  }

  for (const reasoningEffort of [null, "minimal", "low", "medium", "high", "xhigh"]) {
    const config = parseSchema(projectConfigSchema, validProjectConfigInput({ defaultModelReasoningEffort: reasoningEffort }));
    assert.equal(config.settings.defaultModelReasoningEffort, reasoningEffort);
  }

  for (const effort of ["low", "medium", "high", "xhigh"]) {
    const config = parseSchema(projectConfigSchema, validProjectConfigInput({ defaultTicketEffort: effort }));
    assert.equal(config.settings.defaultTicketEffort, effort);
  }

  for (const webSearchMode of ["disabled", "cached", "live"]) {
    const config = parseSchema(projectConfigSchema, validProjectConfigInput({ codexWebSearchMode: webSearchMode }));
    assert.equal(config.settings.codexWebSearchMode, webSearchMode);
  }

  assert.throws(
    () => parseSchema(projectConfigSchema, validProjectConfigInput({ defaultApprovalPolicy: "always" })),
    (error) => expectSchemaError(error)
  );
  assert.throws(
    () => parseSchema(projectConfigSchema, validProjectConfigInput({ defaultModelReasoningEffort: "extreme" })),
    (error) => expectSchemaError(error)
  );
  assert.throws(
    () => parseSchema(projectConfigSchema, validProjectConfigInput({ defaultTicketEffort: "minimal" })),
    (error) => expectSchemaError(error)
  );
  assert.throws(
    () => parseSchema(projectConfigSchema, validProjectConfigInput({ codexWebSearchMode: "enabled" })),
    (error) => expectSchemaError(error)
  );
});

test("schemas preserve passthrough roots, strip default object extras, and reject strict extras", () => {
  const config = parseSchema(projectConfigSchema, {
    schemaVersion: 1,
    projectId: "prj_schema",
    name: "Schema Project",
    createdAt: "2026-05-11T09:00:00.000Z",
    updatedAt: "2026-05-11T10:00:00.000Z",
    columns: [{ id: "todo", name: "Todo", position: 1000, terminal: false, columnExtra: "dropped" }],
    settings: {
      defaultModel: null,
      defaultApprovalPolicy: "on-request",
      defaultSandboxMode: "workspace-write",
      allowNonGitCodexRuns: false,
      ticketDraftingEnabled: true,
      codexExecutionEnabled: true,
      settingsExtra: "dropped"
    },
    rootExtra: "preserved"
  });

  assert.equal((config as typeof config & { rootExtra: unknown }).rootExtra, "preserved");
  assert.equal(config.settings.agentConcurrency, 1);
  assert.equal("columnExtra" in (config.columns[0] as object), false);
  assert.equal("settingsExtra" in (config.settings as object), false);

  assert.throws(
    () =>
      parseSchema(agentTicketUpdateSchema, {
        title: "Strict update",
        priority: "high",
        labels: [],
        authoringState: "reviewing",
        patch: {
          summary: "Updated ticket body.",
          appendMarkdown: "Updated markdown."
        },
        clarificationQuestions: [],
        extra: "rejected"
      }),
    (error) => expectSchemaError(error, /Unexpected key/)
  );

  const explicitConcurrency = parseSchema(projectConfigSchema, {
    ...config,
    settings: {
      ...config.settings,
      agentConcurrency: 2
    }
  });
  assert.equal(explicitConcurrency.settings.agentConcurrency, 2);

  assert.throws(
    () =>
      parseSchema(projectConfigSchema, {
        ...config,
        settings: {
          ...config.settings,
          agentConcurrency: 0
        }
      }),
    (error) => expectSchemaError(error, /integer greater than or equal to 1/)
  );

  assert.throws(
    () =>
      parseSchema(projectConfigSchema, {
        ...config,
        settings: {
          ...config.settings,
          agentConcurrency: 1.5
        }
      }),
    (error) => expectSchemaError(error, /integer greater than or equal to 1/)
  );
});

test("ticket draft schema rejects task drafts with subtickets", () => {
  const subticket = validDraftBase({ title: "Child task" });

  assert.throws(
    () =>
      parseSchema(ticketDraftSchema, {
        ...validDraftBase(),
        ticketType: "task",
        subtickets: [subticket]
      }),
    (error) => expectSchemaError(error, /Only epic ticket drafts can contain subtickets/)
  );

  const epic = parseSchema(ticketDraftSchema, {
    ...validDraftBase({ title: "Parent epic" }),
    ticketType: "epic",
    subtickets: [subticket]
  });

  assert.equal(epic.subtickets.length, 1);
});

test("ticket suggestion schema validates strict suggestion responses", () => {
  const parsed = parseSchema(ticketSuggestionsResponseSchema, {
    suggestions: [
      {
        title: "Add focused ticket generation",
        priority: "medium",
        labels: ["tickets"],
        rationale: "Board-level suggestions help seed draft work.",
        request: "Draft a task for focused ticket suggestion generation."
      }
    ]
  });

  assert.equal(parsed.suggestions.length, 1);
  parsed.suggestions[0].labels.push("mutable");
  assert.deepEqual(parsed.suggestions[0].labels, ["tickets", "mutable"]);

  assert.throws(
    () =>
      parseSchema(ticketSuggestionsResponseSchema, {
        suggestions: [
          {
            title: "Unexpected extra",
            priority: "medium",
            labels: [],
            rationale: "Extras should be rejected.",
            request: "Draft a task.",
            extra: "rejected"
          }
        ]
      }),
    (error) => expectSchemaError(error, /Unexpected key/)
  );
});

test("event schemas decode timestamps, preserve record payloads, and reject invalid inputs", () => {
  const timestamp = new Date("2026-05-11T11:00:00.000Z");
  const event = parseSchema(relayCodexEventSchema, {
    type: "approval.requested",
    approvalId: "apr_schema",
    kind: "command",
    payload: { command: "npm test" },
    timestamp,
    eventExtra: "dropped"
  });

  assert.equal(event.timestamp, "2026-05-11T11:00:00.000Z");
  assert.equal("eventExtra" in (event as object), false);
  assert.deepEqual(event.type === "approval.requested" ? event.payload : null, { command: "npm test" });

  const logLine = parseSchema(runLogLineSchema, {
    schemaVersion: 1,
    timestamp,
    ticketId: "tkt_schema",
    runId: "run_schema",
    threadId: "thread_schema",
    type: "approval.requested",
    payload: { approvalId: "apr_schema" }
  });

  assert.equal(logLine.timestamp, "2026-05-11T11:00:00.000Z");
  assert.deepEqual(logLine.payload, { approvalId: "apr_schema" });

  const todoEvent = parseSchema(relayCodexEventSchema, {
    type: "todo.updated",
    items: [
      { text: "Inspect SDK stream", completed: true },
      { text: "Persist todo events", completed: false }
    ],
    timestamp
  });
  assert.equal(todoEvent.type, "todo.updated");
  if (todoEvent.type !== "todo.updated") assert.fail("Expected todo event");
  assert.deepEqual(todoEvent.items, [
    { text: "Inspect SDK stream", completed: true },
    { text: "Persist todo events", completed: false }
  ]);

  const mcpEvent = parseSchema(relayCodexEventSchema, {
    type: "mcp.tool_call",
    server: "github",
    tool: "search",
    status: "failed",
    error: "rate limited",
    result: { content: ["large result omitted"] },
    timestamp
  });
  assert.equal(mcpEvent.type, "mcp.tool_call");
  if (mcpEvent.type !== "mcp.tool_call") assert.fail("Expected MCP event");
  assert.equal(mcpEvent.server, "github");
  assert.equal(mcpEvent.tool, "search");
  assert.equal(mcpEvent.status, "failed");
  assert.equal(mcpEvent.error, "rate limited");
  assert.equal("result" in mcpEvent, false);

  assert.throws(
    () =>
      parseSchema(runLogLineSchema, {
        ...logLine,
        payload: []
      }),
    (error) => expectSchemaError(error, /Expected object/)
  );

  assert.throws(
    () =>
      parseSchema(relayCodexEventSchema, {
        type: "todo.updated",
        items: [{ text: "Missing completion flag" }],
        timestamp
      }),
    (error) => expectSchemaError(error)
  );

  assert.throws(
    () =>
      parseSchema(relayCodexEventSchema, {
        type: "mcp.tool_call",
        server: "github",
        tool: "search",
        status: "waiting",
        timestamp
      }),
    (error) => expectSchemaError(error)
  );

  assert.throws(
    () =>
      parseSchema(projectConfigSchema, {
        schemaVersion: 1,
        projectId: "",
        name: "Invalid project",
        createdAt: "2026-05-11T09:00:00.000Z",
        updatedAt: "2026-05-11T10:00:00.000Z",
        columns: [],
        settings: {
          defaultModel: null,
          defaultApprovalPolicy: "on-request",
          defaultSandboxMode: "workspace-write",
          allowNonGitCodexRuns: false,
          ticketDraftingEnabled: true,
          codexExecutionEnabled: true,
          agentConcurrency: 1
        }
      }),
    (error) => expectSchemaError(error)
  );
});

test("renderer run event schema preserves variant fields across HTTP encoding", () => {
  const event = {
    type: "clarification.requested" as const,
    questions: [],
    timestamp: "2026-05-11T11:00:00.000Z",
    projectPath: "/tmp/project",
    ticketId: "tkt_schema",
    runId: "run_schema"
  };
  const rendererRunEventCodec = rendererRunEventSchema as Schema.Codec<typeof event, unknown, never, never>;

  const encoded = Schema.encodeUnknownSync(rendererRunEventCodec)(event) as typeof event;
  assert.deepEqual(encoded.questions, []);

  const decoded = Schema.decodeUnknownSync(rendererRunEventCodec)(encoded);
  assert.deepEqual(decoded, event);
});
