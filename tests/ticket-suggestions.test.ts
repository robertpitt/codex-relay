import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  generateTicketSuggestions,
  TicketDraftServiceError,
  type TicketDraftCodexClient,
  type TicketDraftThread,
  type TicketSuggestionDependencies
} from "../src/services/codex";
import { createTicket, initializeProject } from "../src/storage";
import type { CodexStatus, TicketSuggestion } from "../src/shared/schemas";

const readyStatus: CodexStatus = {
  sdkAvailable: true,
  cliAvailable: true,
  cliVersion: "codex-test",
  authenticated: true,
  message: "Codex is available."
};

const createProject = async (): Promise<string> => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), "relay-suggestions-"));
  await initializeProject(projectPath);
  return projectPath;
};

type TicketSuggestionRunOptions = NonNullable<Parameters<TicketDraftThread["run"]>[1]> & { signal: AbortSignal };
type TicketSuggestionThreadOptions = Parameters<TicketDraftCodexClient["startThread"]>[0];
type TicketSuggestionRunResult = Awaited<ReturnType<TicketDraftThread["run"]>>;
type TicketSuggestionRunMock = (
  prompt: string,
  options: TicketSuggestionRunOptions
) => Promise<Pick<TicketSuggestionRunResult, "finalResponse">> | Pick<TicketSuggestionRunResult, "finalResponse">;

const createSuggestionCodexClient = (
  run: TicketSuggestionRunMock,
  onStartThread?: (options: TicketSuggestionThreadOptions) => void
): TicketDraftCodexClient => ({
  startThread: (options) => {
    onStartThread?.(options);
    return {
      run: async (input, runOptions) => {
        if (typeof input !== "string") throw new TypeError("Ticket suggestion tests expect string prompts.");
        if (!runOptions?.signal) throw new TypeError("Ticket suggestion tests expect an AbortSignal.");
        const result = await run(input, { ...runOptions, signal: runOptions.signal });
        return { items: [], usage: null, ...result };
      }
    };
  }
});

const assertStrictSchemaRequiresAllProperties = (schema: unknown, label = "$"): void => {
  if (!schema || typeof schema !== "object") return;
  const objectSchema = schema as { properties?: Record<string, unknown>; required?: unknown; items?: unknown };
  if (objectSchema.properties) {
    assert.ok(Array.isArray(objectSchema.required), `${label}.required must be an array`);
    const required = new Set(objectSchema.required);
    for (const key of Object.keys(objectSchema.properties)) {
      assert.ok(required.has(key), `${label}.required is missing ${key}`);
      assertStrictSchemaRequiresAllProperties(objectSchema.properties[key], `${label}.${key}`);
    }
  }
  if (objectSchema.items) assertStrictSchemaRequiresAllProperties(objectSchema.items, `${label}[]`);
};

const suggestionsJson = (suggestions: TicketSuggestion[]): string => JSON.stringify({ suggestions });

test("ticket suggestions use strict output schema, read-only options, and board context", async () => {
  const projectPath = await createProject();
  await createTicket(projectPath, {
    title: "Add login audit trail",
    priority: "high",
    labels: ["auth"],
    markdown: "# Add login audit trail\n\nRecord login events for account security reviews.",
    status: "todo"
  });

  let capturedPrompt = "";
  let capturedOutputSchema: unknown;
  let capturedThreadOptions: Partial<TicketSuggestionThreadOptions> = {};
  const dependencies: TicketSuggestionDependencies = {
    getStatus: async () => readyStatus,
    createRequestId: () => "tsg_schema",
    createCodexClient: () =>
      createSuggestionCodexClient(
        async (prompt, options) => {
          capturedPrompt = prompt;
          capturedOutputSchema = options.outputSchema;
          return {
            finalResponse: suggestionsJson([
              {
                title: "Harden session expiry",
                priority: "medium",
                labels: ["auth", "security"],
                rationale: "The auth area has adjacent security work but no session expiry follow-up.",
                request: "Review session expiry behavior and draft a task to harden stale-session handling."
              }
            ])
          };
        },
        (options) => {
          capturedThreadOptions = options;
        }
      )
  };

  const suggestions = await generateTicketSuggestions(projectPath, dependencies);

  assertStrictSchemaRequiresAllProperties(capturedOutputSchema);
  assert.equal((capturedOutputSchema as { properties?: { suggestions?: { maxItems?: number } } }).properties?.suggestions?.maxItems, 10);
  assert.equal(capturedThreadOptions.approvalPolicy, "never");
  assert.equal(capturedThreadOptions.sandboxMode, "read-only");
  assert.equal(capturedThreadOptions.networkAccessEnabled, false);
  assert.equal(capturedThreadOptions.webSearchMode, "disabled");
  assert.match(capturedPrompt, /Add login audit trail/);
  assert.match(capturedPrompt, /status: Todo/);
  assert.match(capturedPrompt, /Record login events for account security reviews/);
  assert.match(capturedPrompt, /Do not create, edit, move, rename, or delete tickets or project files/);
  assert.deepEqual(suggestions, [
    {
      title: "Harden session expiry",
      priority: "medium",
      labels: ["auth", "security"],
      rationale: "The auth area has adjacent security work but no session expiry follow-up.",
      request: "Review session expiry behavior and draft a task to harden stale-session handling."
    }
  ]);
});

test("ticket suggestions are normalized, filtered, and capped at ten", async () => {
  const projectPath = await createProject();
  const returnedSuggestions: TicketSuggestion[] = [
    {
      title: "   ",
      priority: "medium",
      labels: ["ignored"],
      rationale: "Missing title.",
      request: "Draft a missing title task."
    },
    {
      title: "Missing request",
      priority: "medium",
      labels: ["ignored"],
      rationale: "Missing request.",
      request: "   "
    },
    ...Array.from({ length: 12 }, (_, index): TicketSuggestion => ({
      title: `  Suggestion ${index + 1}\n title  `,
      priority: index === 0 ? "high" : "medium",
      labels: [" frontend ", "frontend", `area-${index + 1}`],
      rationale: index === 0 ? "   " : `Reason ${index + 1}\nwith whitespace.`,
      request: ` Draft suggestion ${index + 1}\nfrom the project. `
    }))
  ];
  const dependencies: TicketSuggestionDependencies = {
    getStatus: async () => readyStatus,
    createCodexClient: () => createSuggestionCodexClient(async () => ({ finalResponse: suggestionsJson(returnedSuggestions) }))
  };

  const suggestions = await generateTicketSuggestions(projectPath, dependencies);

  assert.equal(suggestions.length, 10);
  assert.equal(suggestions[0].title, "Suggestion 1 title");
  assert.equal(suggestions[0].request, "Draft suggestion 1 from the project.");
  assert.deepEqual(suggestions[0].labels, ["frontend", "area-1"]);
  assert.equal(suggestions[0].rationale, "Suggested after reviewing the local project and current board.");
  assert.equal(suggestions[9].title, "Suggestion 10 title");
});

test("invalid ticket suggestion responses fail with a recoverable draft-style payload", async () => {
  const projectPath = await createProject();
  const dependencies: TicketSuggestionDependencies = {
    getStatus: async () => readyStatus,
    createRequestId: () => "tsg_invalid",
    createCodexClient: () =>
      createSuggestionCodexClient(async () => ({
        finalResponse: JSON.stringify({
          suggestions: [
            {
              title: "Invalid suggestion",
              priority: "immediate",
              labels: [],
              rationale: "Priority is outside the accepted enum.",
              request: "Draft an invalid suggestion."
            }
          ]
        })
      }))
  };

  await assert.rejects(
    () => generateTicketSuggestions(projectPath, dependencies),
    (error) => {
      assert.ok(error instanceof TicketDraftServiceError);
      assert.equal(error.code, "invalid_response");
      assert.equal(error.requestId, "tsg_invalid");
      assert.equal(error.recoverable, true);
      assert.match(error.message, /invalid ticket suggestions/i);
      return true;
    }
  );
});
