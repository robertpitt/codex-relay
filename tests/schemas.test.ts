import test from "node:test";
import assert from "node:assert/strict";
import {
  agentTicketUpdateSchema,
  isRelaySchemaError,
  parseSchema,
  projectConfigSchema,
  relayCodexEventSchema,
  runLogLineSchema,
  ticketDraftSchema,
  ticketFrontMatterSchema
} from "../src/main/services/schemas";
import type { TicketDraftSubticket } from "../src/shared/types";

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
  assert.equal(parsed.labels.length, 0);
  assert.equal(parsed.parentEpicId, null);
  assert.equal(parsed.subticketIds.length, 0);
  assert.equal(parsed.blockedByIds.length, 0);
  assert.equal(parsed.codexThreadId, null);
  assert.equal(parsed.lastRunId, null);
  assert.deepEqual((parsed as typeof parsed & { legacyField: unknown }).legacyField, { preserved: true });

  parsed.labels.push("mutable");
  assert.deepEqual(parsed.labels, ["mutable"]);
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
  assert.equal("columnExtra" in (config.columns[0] as object), false);
  assert.equal("settingsExtra" in (config.settings as object), false);

  assert.throws(
    () =>
      parseSchema(agentTicketUpdateSchema, {
        title: "Strict update",
        priority: "high",
        labels: [],
        markdown: "Updated markdown.",
        clarificationQuestions: [],
        extra: "rejected"
      }),
    (error) => expectSchemaError(error, /Unexpected key/)
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
          codexExecutionEnabled: true
        }
      }),
    (error) => expectSchemaError(error)
  );
});
