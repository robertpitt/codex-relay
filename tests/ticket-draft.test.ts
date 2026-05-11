import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createTicketDraft, TicketDraftServiceError, type TicketDraftDependencies } from "../src/main/services/codex";
import { createTicket, initializeProject, readBoard } from "../src/main/services/storage";
import type { CodexStatus } from "../src/shared/types";

const readyStatus: CodexStatus = {
  sdkAvailable: true,
  cliAvailable: true,
  cliVersion: "codex-test",
  authenticated: true,
  message: "Codex is available."
};

const createProject = async (): Promise<string> => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), "relay-draft-"));
  await initializeProject(projectPath);
  return projectPath;
};

const validDraftJson = (title: string): string =>
  JSON.stringify({
    title,
    priority: "medium",
    labels: ["codex"],
    context: "Context from Codex.",
    requirements: ["Build the requested behavior."],
    acceptanceCriteria: ["The requested behavior is covered."],
    clarificationQuestions: [],
    implementationNotes: ["Keep the change focused."]
  });

test("ticket draft creation succeeds with a mocked Codex response", async () => {
  const projectPath = await createProject();
  let prompt = "";
  const signals: AbortSignal[] = [];
  const dependencies: TicketDraftDependencies = {
    getStatus: async () => readyStatus,
    createRequestId: () => "tdr_success",
    createCodexClient: () =>
      ({
        startThread: () => ({
          run: async (nextPrompt: string, options: { signal: AbortSignal }) => {
            prompt = nextPrompt;
            signals.push(options.signal);
            return { finalResponse: validDraftJson("Recoverable timeout handling") };
          }
        })
      }) as any
  };

  const draft = await createTicketDraft({ projectPath, idea: "Make timeouts recoverable" }, dependencies);

  assert.equal(draft.title, "Recoverable timeout handling");
  assert.match(prompt, /Make timeouts recoverable/);
  assert.equal(signals[0].aborted, false);
  assert.equal((await readBoard(projectPath)).tickets.length, 0);
});

test("ticket draft timeout is typed, recoverable, and aborts the Codex request", async () => {
  const projectPath = await createProject();
  const signals: AbortSignal[] = [];
  const dependencies: TicketDraftDependencies = {
    getStatus: async () => readyStatus,
    createRequestId: () => "tdr_timeout",
    draftTimeoutMs: 5,
    unrefTimeout: false,
    createCodexClient: () =>
      ({
        startThread: () => ({
          run: (_prompt: string, options: { signal: AbortSignal }) => {
            signals.push(options.signal);
            return new Promise(() => undefined);
          }
        })
      }) as any
  };

  await assert.rejects(
    createTicketDraft({ projectPath, idea: "Timeout this draft" }, dependencies),
    (error) => {
      assert.ok(error instanceof TicketDraftServiceError);
      assert.equal(error.code, "timeout");
      assert.equal(error.recoverable, true);
      assert.equal(error.requestId, "tdr_timeout");
      assert.equal(error.timeoutMs, 5);
      return true;
    }
  );
  assert.equal(signals[0].aborted, true);
  assert.equal((await readBoard(projectPath)).tickets.length, 0);
});

test("ticket draft retry after timeout uses an independent Codex request", async () => {
  const projectPath = await createProject();
  const signals: AbortSignal[] = [];
  let attempt = 0;
  const dependencies: TicketDraftDependencies = {
    getStatus: async () => readyStatus,
    createRequestId: () => `tdr_retry_${attempt + 1}`,
    draftTimeoutMs: 5,
    unrefTimeout: false,
    createCodexClient: () =>
      ({
        startThread: () => ({
          run: (_prompt: string, options: { signal: AbortSignal }) => {
            signals.push(options.signal);
            attempt += 1;
            if (attempt === 1) return new Promise(() => undefined);
            return Promise.resolve({ finalResponse: validDraftJson("Retry succeeded") });
          }
        })
      }) as any
  };

  await assert.rejects(createTicketDraft({ projectPath, idea: "Retry after timeout" }, dependencies), TicketDraftServiceError);
  const retryDraft = await createTicketDraft({ projectPath, idea: "Retry after timeout" }, dependencies);

  assert.equal(retryDraft.title, "Retry succeeded");
  assert.equal(signals.length, 2);
  assert.notEqual(signals[0], signals[1]);
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
  assert.equal((await readBoard(projectPath)).tickets.length, 0);
});

test("manual ticket save still works after a draft timeout", async () => {
  const projectPath = await createProject();
  const idea = "Preserve this rough idea\nwith more detail";
  const dependencies: TicketDraftDependencies = {
    getStatus: async () => readyStatus,
    createRequestId: () => "tdr_manual_fallback",
    draftTimeoutMs: 5,
    unrefTimeout: false,
    createCodexClient: () =>
      ({
        startThread: () => ({
          run: () => new Promise(() => undefined)
        })
      }) as any
  };

  await assert.rejects(createTicketDraft({ projectPath, idea }, dependencies), TicketDraftServiceError);
  const title = idea.split("\n")[0].trim();
  const ticket = await createTicket(projectPath, {
    title,
    priority: "medium",
    labels: [],
    markdown: `# ${title}\n\n${idea}\n`
  });

  const board = await readBoard(projectPath);
  assert.equal(board.tickets.length, 1);
  assert.equal(board.tickets[0].id, ticket.frontMatter.id);
  assert.equal(board.tickets[0].title, "Preserve this rough idea");
});
