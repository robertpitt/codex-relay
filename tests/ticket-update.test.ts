import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { cancelTicketUpdateRun, startTicketUpdateRun, type TicketUpdateDependencies } from "../src/main/services/codex";
import { createTicket, initializeProject, readClarificationQuestions, readTicket } from "../src/main/services/storage";
import type { AgentTicketUpdate, RendererRunEvent } from "../src/shared/types";

const createProject = async (): Promise<string> => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), "relay-ticket-update-"));
  await initializeProject(projectPath);
  return projectPath;
};

const createFakeWindow = (): { window: BrowserWindow; events: RendererRunEvent[] } => {
  const events: RendererRunEvent[] = [];
  return {
    window: {
      webContents: {
        send: (_channel: string, event: RendererRunEvent) => {
          events.push(event);
        }
      }
    } as unknown as BrowserWindow,
    events
  };
};

const waitFor = async (predicate: () => boolean, label: string): Promise<void> => {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`Timed out waiting for ${label}`);
};

const updateJson = (patch: Partial<AgentTicketUpdate> = {}): string =>
  JSON.stringify({
    title: "Agent revised ticket",
    priority: "high",
    labels: ["agent", "updated"],
    markdown: "# Agent revised ticket\n\n## Context\n\nExpanded context from the user request.\n",
    clarificationQuestions: ["Which release should this target?"],
    ...patch
  });

test("ticket update agent applies validated structured output and preserves unrelated metadata", async () => {
  const projectPath = await createProject();
  const ticket = await createTicket(projectPath, {
    title: "Original ticket",
    priority: "medium",
    labels: ["original"],
    markdown: "# Original ticket\n\n## Context\n\nOriginal body.\n"
  });
  const original = await readTicket(projectPath, ticket.frontMatter.id);
  const { window, events } = createFakeWindow();
  let capturedPrompt = "";
  let capturedOptions: Record<string, unknown> = {};

  const dependencies: TicketUpdateDependencies = {
    createRunId: () => "run_ticket_update_success",
    createCodexClient: () =>
      ({
        startThread: (options: Record<string, unknown>) => {
          capturedOptions = options;
          return {
            id: "thread_ticket_update_success",
            runStreamed: async (prompt: string, options: { signal: AbortSignal }) => {
              capturedPrompt = prompt;
              assert.equal(options.signal.aborted, false);
              return {
                events: (async function* () {
                  yield { type: "thread.started", thread_id: "thread_ticket_update_success" };
                  yield { type: "item.completed", item: { type: "agent_message", text: updateJson() } };
                  yield { type: "turn.completed", usage: { total_tokens: 1 } };
                })()
              };
            }
          };
        }
      }) as any
  };

  await startTicketUpdateRun(window, { projectPath, ticketId: ticket.frontMatter.id, request: "Add release targeting detail." }, dependencies);
  await waitFor(() => events.some((event) => event.type === "run.completed"), "ticket update completion");

  const updated = await readTicket(projectPath, ticket.frontMatter.id);
  assert.match(capturedPrompt, /Add release targeting detail/);
  assert.match(capturedPrompt, /Original body/);
  assert.equal(capturedOptions.sandboxMode, "read-only");
  assert.equal(capturedOptions.approvalPolicy, "never");
  assert.equal(capturedOptions.networkAccessEnabled, false);
  assert.equal(updated.frontMatter.id, original.frontMatter.id);
  assert.equal(updated.frontMatter.status, original.frontMatter.status);
  assert.equal(updated.frontMatter.position, original.frontMatter.position);
  assert.equal(updated.frontMatter.createdAt, original.frontMatter.createdAt);
  assert.equal(updated.frontMatter.codexThreadId, original.frontMatter.codexThreadId);
  assert.equal(updated.frontMatter.runStatus, original.frontMatter.runStatus);
  assert.equal(updated.frontMatter.lastRunId, original.frontMatter.lastRunId);
  assert.equal(updated.frontMatter.title, "Agent revised ticket");
  assert.equal(updated.frontMatter.priority, "high");
  assert.deepEqual(updated.frontMatter.labels, ["agent", "updated"]);
  assert.match(updated.markdown, /Expanded context/);

  const clarifications = await readClarificationQuestions(projectPath, ticket.frontMatter.id);
  assert.equal(clarifications.length, 1);
  assert.equal(clarifications[0].question, "Which release should this target?");
  assert.equal(clarifications[0].createdBy, "codex");
  assert.equal(clarifications[0].source, "manual_ticket_edit");
});

test("ticket update agent leaves the ticket unchanged when output validation fails", async () => {
  const projectPath = await createProject();
  const ticket = await createTicket(projectPath, {
    title: "Invalid output guard",
    priority: "low",
    labels: ["keep"],
    markdown: "# Invalid output guard\n\nDo not mutate this body.\n"
  });
  const original = await readTicket(projectPath, ticket.frontMatter.id);
  const { window, events } = createFakeWindow();
  const dependencies: TicketUpdateDependencies = {
    createRunId: () => "run_ticket_update_invalid",
    createCodexClient: () =>
      ({
        startThread: () => ({
          id: "thread_ticket_update_invalid",
          runStreamed: async () => ({
            events: (async function* () {
              yield { type: "thread.started", thread_id: "thread_ticket_update_invalid" };
              yield { type: "item.completed", item: { type: "agent_message", text: updateJson({ title: "" }) } };
              yield { type: "turn.completed", usage: { total_tokens: 1 } };
            })()
          })
        })
      }) as any
  };

  await startTicketUpdateRun(window, { projectPath, ticketId: ticket.frontMatter.id, request: "Break the schema." }, dependencies);
  await waitFor(() => events.some((event) => event.type === "run.failed"), "ticket update failure");

  const unchanged = await readTicket(projectPath, ticket.frontMatter.id);
  assert.deepEqual(unchanged.frontMatter, original.frontMatter);
  assert.equal(unchanged.markdown, original.markdown);
  assert.deepEqual(await readClarificationQuestions(projectPath, ticket.frontMatter.id), []);
  assert.match(events.find((event) => event.type === "run.failed")?.message ?? "", /invalid/i);
});

test("ticket update agent prevents duplicate active runs for the same ticket", async () => {
  const projectPath = await createProject();
  const ticket = await createTicket(projectPath, {
    title: "Duplicate guard",
    priority: "medium",
    labels: [],
    markdown: "# Duplicate guard\n"
  });
  const { window, events } = createFakeWindow();
  const dependencies: TicketUpdateDependencies = {
    createRunId: () => "run_ticket_update_duplicate",
    createCodexClient: () =>
      ({
        startThread: () => ({
          id: "thread_ticket_update_duplicate",
          runStreamed: async (_prompt: string, options: { signal: AbortSignal }) => ({
            events: (async function* () {
              yield { type: "thread.started", thread_id: "thread_ticket_update_duplicate" };
              await new Promise((_resolve, reject) => {
                options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
              });
            })()
          })
        })
      }) as any
  };

  await startTicketUpdateRun(window, { projectPath, ticketId: ticket.frontMatter.id, request: "Keep running." }, dependencies);
  await assert.rejects(
    startTicketUpdateRun(window, { projectPath, ticketId: ticket.frontMatter.id, request: "Duplicate." }, dependencies),
    /already running/
  );

  await cancelTicketUpdateRun("run_ticket_update_duplicate");
  await waitFor(() => events.some((event) => event.type === "run.failed"), "ticket update cancellation");
});
