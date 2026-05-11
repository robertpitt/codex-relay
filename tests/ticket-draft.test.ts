import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createTicketDraft,
  draftToCreateInput,
  extractTicketDraftUrls,
  startTicketDraftRun,
  TicketDraftServiceError,
  type TicketDraftCodexClient,
  type TicketDraftDependencies,
  type TicketDraftStartDependencies,
  type TicketDraftThread
} from "../src/main/services/codex";
import { initializeProject, readBoard, readTicket } from "../src/main/services/storage";
import { ticketDraftDialogSubtext } from "../src/renderer/src/lib/markdown";
import type { CodexStatus, RendererRunEvent } from "../src/shared/types";

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

type TicketDraftRunOptions = NonNullable<Parameters<TicketDraftThread["run"]>[1]> & { signal: AbortSignal };
type TicketDraftRunResult = Awaited<ReturnType<TicketDraftThread["run"]>>;
type TicketDraftRunResolver = (value: Pick<TicketDraftRunResult, "finalResponse">) => void;
type TicketDraftRunMock = (
  prompt: string,
  options: TicketDraftRunOptions
) => Promise<Pick<TicketDraftRunResult, "finalResponse">> | Pick<TicketDraftRunResult, "finalResponse">;

const createDraftCodexClient = (run: TicketDraftRunMock): TicketDraftCodexClient => ({
  startThread: () => ({
    run: async (input, options) => {
      if (typeof input !== "string") throw new TypeError("Ticket draft tests expect string prompts.");
      if (!options?.signal) throw new TypeError("Ticket draft tests expect an AbortSignal.");
      const result = await run(input, { ...options, signal: options.signal });
      return { items: [], usage: null, ...result };
    }
  })
});

const createFakeRunEventSink = (): {
  runEventSink: NonNullable<TicketDraftStartDependencies["runEventSink"]>;
  events: RendererRunEvent[];
} => {
  const events: RendererRunEvent[] = [];
  return {
    runEventSink: {
      emit: (event: RendererRunEvent) => {
        events.push(event);
      }
    },
    events
  };
};

const waitFor = async (predicate: () => boolean | Promise<boolean>, label: string): Promise<void> => {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`Timed out waiting for ${label}`);
};

const validDraftJson = (title: string): string =>
  JSON.stringify({
    title,
    priority: "medium",
    labels: ["codex"],
    context: "Context from Codex.",
    researchFindings: [],
    requirements: ["Build the requested behavior."],
    implementationPlan: [],
    acceptanceCriteria: ["The requested behavior is covered."],
    clarificationQuestions: [],
    implementationNotes: ["Keep the change focused."]
  });

const validEpicDraftJson = (): string =>
  JSON.stringify({
    title: "Account migration epic",
    ticketType: "epic",
    priority: "high",
    labels: ["accounts"],
    context: "Move account management to the new API.",
    researchFindings: ["Inspected account service boundaries."],
    requirements: ["Coordinate API, UI, and persistence changes."],
    implementationPlan: ["Create child tickets for each independently shippable slice."],
    acceptanceCriteria: ["All generated subtickets can be reviewed before storage."],
    clarificationQuestions: [],
    implementationNotes: ["Nested epics are not supported."],
    subtickets: [
      {
        title: "Account API migration",
        priority: "high",
        labels: ["api"],
        context: "Move account endpoints to the new API.",
        researchFindings: ["API routes were identified."],
        requirements: ["Preserve existing account behavior."],
        implementationPlan: ["Update API handlers and tests."],
        acceptanceCriteria: ["Account API tests pass."],
        clarificationQuestions: [],
        implementationNotes: []
      },
      {
        title: "Account UI migration",
        priority: "medium",
        labels: ["frontend"],
        context: "Point account screens at the new API.",
        researchFindings: ["Account UI entry points were identified."],
        requirements: ["Keep account status and error states visible."],
        implementationPlan: ["Update data loading and interaction tests."],
        acceptanceCriteria: ["Account UI can complete the migrated workflow."],
        clarificationQuestions: [],
        implementationNotes: []
      }
    ]
  });

test("ticket draft creation succeeds with a mocked Codex response", async () => {
  const projectPath = await createProject();
  let prompt = "";
  const signals: AbortSignal[] = [];
  const dependencies: TicketDraftDependencies = {
    getStatus: async () => readyStatus,
    createRequestId: () => "tdr_success",
    createCodexClient: () =>
      createDraftCodexClient(async (nextPrompt, options) => {
        prompt = nextPrompt;
        signals.push(options.signal);
        return { finalResponse: validDraftJson("Recoverable timeout handling") };
      })
  };

  const draft = await createTicketDraft({ projectPath, idea: "Make timeouts recoverable" }, dependencies);

  assert.equal(draft.title, "Recoverable timeout handling");
  assert.match(prompt, /Make timeouts recoverable/);
  assert.match(prompt, /Research context:/);
  assert.equal(signals[0].aborted, false);
  assert.equal((await readBoard(projectPath)).tickets.length, 0);
  const draftWithSummary = { ...draft, summary: "**Generated** [summary](https://example.test)." };
  assert.equal(ticketDraftDialogSubtext(draftWithSummary), "Generated summary.");
  const fallbackSubtext = ticketDraftDialogSubtext(draft, 80);
  assert.match(fallbackSubtext, /^Context from Codex\./);
  assert.doesNotMatch(fallbackSubtext, /Recoverable timeout handling/);
  assert.doesNotMatch(fallbackSubtext, /[#*\[\]]/);
  assert.ok(fallbackSubtext.length <= 83);
});

test("async ticket draft creates a Todo placeholder before Codex completes and applies the draft later", async () => {
  const projectPath = await createProject();
  const { runEventSink, events } = createFakeRunEventSink();
  let resolveDraft: TicketDraftRunResolver | null = null;
  const dependencies: TicketDraftStartDependencies = {
    getStatus: async () => readyStatus,
    createRunId: () => "run_async_draft",
    createRequestId: () => "tdr_async_draft",
    disableResearch: true,
    runEventSink,
    createCodexClient: () =>
      createDraftCodexClient(
        () =>
          new Promise((resolve) => {
            resolveDraft = resolve;
          })
      )
  };

  const started = await startTicketDraftRun({ projectPath, idea: "Make ticket drafting asynchronous" }, dependencies);
  const pending = await readTicket(projectPath, started.ticket.frontMatter.id);
  const pendingBoard = await readBoard(projectPath);

  assert.equal(started.runId, "run_async_draft");
  assert.equal(pending.frontMatter.status, "todo");
  assert.equal(pending.frontMatter.runStatus, "drafting");
  assert.equal(pending.frontMatter.lastRunId, "run_async_draft");
  assert.match(pending.frontMatter.title, /^Draft: Make ticket drafting asynchronous/);
  assert.match(pending.markdown, /Original Idea/);
  assert.match(pending.markdown, /Make ticket drafting asynchronous/);
  assert.equal(pendingBoard.tickets.length, 1);
  assert.equal(pendingBoard.tickets[0].runStatus, "drafting");
  assert.equal(events[0]?.type, "run.started");

  await waitFor(() => resolveDraft !== null, "Codex draft request to start");
  const completeDraft = resolveDraft as unknown as TicketDraftRunResolver;
  completeDraft({ finalResponse: validDraftJson("Asynchronous ticket drafting") });

  await waitFor(async () => (await readTicket(projectPath, pending.frontMatter.id)).frontMatter.runStatus === "draft_complete", "draft completion");
  const completed = await readTicket(projectPath, pending.frontMatter.id);
  const completedBoard = await readBoard(projectPath);

  assert.equal(completed.frontMatter.title, "Asynchronous ticket drafting");
  assert.equal(completed.frontMatter.runStatus, "draft_complete");
  assert.equal(completed.frontMatter.lastRunId, "run_async_draft");
  assert.match(completed.markdown, /## Requirements/);
  assert.equal(completedBoard.tickets.length, 1);
  assert.equal(completedBoard.tickets[0].id, pending.frontMatter.id);
  assert.equal(events.at(-1)?.type, "run.completed");
});

test("async ticket draft keeps the pending ticket visible when Codex drafting fails", async () => {
  const projectPath = await createProject();
  const { runEventSink, events } = createFakeRunEventSink();
  const dependencies: TicketDraftStartDependencies = {
    getStatus: async () => readyStatus,
    createRunId: () => "run_async_failed_draft",
    createRequestId: () => "tdr_async_failed_draft",
    disableResearch: true,
    runEventSink,
    createCodexClient: () =>
      createDraftCodexClient(async () => {
        throw new Error("model unavailable");
      })
  };

  const started = await startTicketDraftRun({ projectPath, idea: "Preserve failed draft ideas" }, dependencies);

  await waitFor(async () => (await readTicket(projectPath, started.ticket.frontMatter.id)).frontMatter.runStatus === "draft_failed", "draft failure");
  const failed = await readTicket(projectPath, started.ticket.frontMatter.id);
  const board = await readBoard(projectPath);

  assert.equal(failed.frontMatter.status, "todo");
  assert.equal(failed.frontMatter.runStatus, "draft_failed");
  assert.match(failed.markdown, /Recoverable Error/);
  assert.match(failed.markdown, /model unavailable/);
  assert.match(failed.markdown, /Preserve failed draft ideas/);
  assert.equal(board.tickets.length, 1);
  assert.equal(board.tickets[0].id, started.ticket.frontMatter.id);
  assert.equal(events.at(-1)?.type, "run.failed");
});

test("async ticket drafts can run concurrently and update only their own placeholder tickets", async () => {
  const projectPath = await createProject();
  const { runEventSink } = createFakeRunEventSink();
  const resolvers: Array<(value: Pick<TicketDraftRunResult, "finalResponse">) => void> = [];
  let runCounter = 0;
  let requestCounter = 0;
  const dependencies: TicketDraftStartDependencies = {
    getStatus: async () => readyStatus,
    createRunId: () => `run_async_${++runCounter}`,
    createRequestId: () => `tdr_async_${++requestCounter}`,
    disableResearch: true,
    runEventSink,
    createCodexClient: () =>
      createDraftCodexClient(
        () =>
          new Promise((resolve) => {
            resolvers.push(resolve);
          })
      )
  };

  const first = await startTicketDraftRun({ projectPath, idea: "Draft the first ticket" }, dependencies);
  const second = await startTicketDraftRun({ projectPath, idea: "Draft the second ticket" }, dependencies);
  const pendingBoard = await readBoard(projectPath);

  assert.equal(pendingBoard.tickets.length, 2);
  assert.deepEqual(
    pendingBoard.tickets.map((ticket) => ticket.runStatus),
    ["drafting", "drafting"]
  );
  assert.notEqual(first.ticket.frontMatter.id, second.ticket.frontMatter.id);

  await waitFor(() => resolvers.length === 2, "both Codex draft requests to start");
  resolvers[1]({ finalResponse: validDraftJson("Second async draft") });

  await waitFor(async () => (await readTicket(projectPath, second.ticket.frontMatter.id)).frontMatter.runStatus === "draft_complete", "second draft completion");
  assert.equal((await readTicket(projectPath, first.ticket.frontMatter.id)).frontMatter.runStatus, "drafting");
  assert.equal((await readTicket(projectPath, second.ticket.frontMatter.id)).frontMatter.title, "Second async draft");

  resolvers[0]({ finalResponse: validDraftJson("First async draft") });

  await waitFor(async () => (await readTicket(projectPath, first.ticket.frontMatter.id)).frontMatter.runStatus === "draft_complete", "first draft completion");
  const finalBoard = await readBoard(projectPath);
  assert.equal(finalBoard.tickets.length, 2);
  assert.deepEqual(
    finalBoard.tickets.map((ticket) => ticket.title).sort(),
    ["First async draft", "Second async draft"]
  );
});

test("ticket draft prompt preserves markdown ticket references from the idea", async () => {
  const projectPath = await createProject();
  const idea = "Build on [Referenceable todo](./tkt_001.md) before adding the next flow.";
  let prompt = "";
  const dependencies: TicketDraftDependencies = {
    getStatus: async () => readyStatus,
    createRequestId: () => "tdr_ticket_reference",
    createCodexClient: () =>
      createDraftCodexClient(async (nextPrompt) => {
        prompt = nextPrompt;
        return { finalResponse: validDraftJson("Reference-aware draft") };
      })
  };

  await createTicketDraft({ projectPath, idea }, dependencies);

  assert.match(prompt, /\[Referenceable todo\]\(\.\/tkt_001\.md\)/);
});

test("ticket draft URL research fetches detected URLs and renders source metadata", async () => {
  const projectPath = await createProject();
  const idea = "Use the behavior described at https://example.test/spec?draft=1.";
  let prompt = "";
  const dependencies: TicketDraftDependencies = {
    getStatus: async () => readyStatus,
    createRequestId: () => "tdr_url_research",
    researchLimits: { maxUrlContentChars: 200, maxFilesToScan: 4 },
    fetchUrl: async (url) => {
      assert.equal(url, "https://example.test/spec?draft=1");
      return new Response(
        "<html><head><title>External Draft Spec</title></head><body><h1>Research-aware drafting</h1><p>Fetch URLs before producing the ticket.</p></body></html>",
        { headers: { "content-type": "text/html" } }
      );
    },
    createCodexClient: () =>
      createDraftCodexClient(async (nextPrompt) => {
        prompt = nextPrompt;
        return {
          finalResponse: JSON.stringify({
            title: "Research-aware drafting",
            priority: "medium",
            labels: ["drafts"],
            context: "Ground draft generation in researched sources.",
            researchFindings: ["External Draft Spec says URLs should be fetched before ticket writing."],
            requirements: ["Fetch URLs detected in the rough idea."],
            implementationPlan: ["Extract URLs, fetch bounded content, and pass summarized findings to Codex."],
            acceptanceCriteria: ["The generated markdown references fetched URLs."],
            clarificationQuestions: [],
            implementationNotes: []
          })
        };
      })
  };

  const draft = await createTicketDraft({ projectPath, idea }, dependencies);
  const markdown = draftToCreateInput(draft).markdown;

  assert.deepEqual(extractTicketDraftUrls(idea), ["https://example.test/spec?draft=1"]);
  assert.equal(draft.research.checkedUrls[0].status, "fetched");
  assert.equal(draft.research.checkedUrls[0].title, "External Draft Spec");
  assert.match(prompt, /External Draft Spec/);
  assert.match(prompt, /Research-aware drafting/);
  assert.match(markdown, /## Research Findings/);
  assert.match(markdown, /External Draft Spec says URLs should be fetched/);
  assert.match(markdown, /URL fetched: https:\/\/example\.test\/spec\?draft=1 \(External Draft Spec\)/);
});

test("ticket draft codebase research inspects matching project files before prompting Codex", async () => {
  const projectPath = await createProject();
  await mkdir(path.join(projectPath, "src", "main", "services"), { recursive: true });
  await mkdir(path.join(projectPath, "tests"), { recursive: true });
  await writeFile(
    path.join(projectPath, "src", "main", "services", "codex.ts"),
    "export const createTicketDraft = async () => 'draft';\nexport const draftToCreateInput = () => 'markdown';\n",
    "utf8"
  );
  await writeFile(
    path.join(projectPath, "tests", "ticket-draft.test.ts"),
    "test('ticket draft research', () => assert.ok(true));\n",
    "utf8"
  );
  let prompt = "";
  const dependencies: TicketDraftDependencies = {
    getStatus: async () => readyStatus,
    createRequestId: () => "tdr_code_research",
    researchLimits: { maxFilesToScan: 12, maxFilesToRead: 3 },
    createCodexClient: () =>
      createDraftCodexClient(async (nextPrompt) => {
        prompt = nextPrompt;
        return { finalResponse: validDraftJson("Inspect draft code") };
      })
  };

  const draft = await createTicketDraft(
    { projectPath, idea: "Make AI draft generation research aware in createTicketDraft and tests" },
    dependencies
  );

  assert.ok(draft.research.inspectedFiles.some((file) => file.path === "src/main/services/codex.ts"));
  assert.ok(draft.research.inspectedFiles.some((file) => file.path === "tests/ticket-draft.test.ts"));
  assert.match(prompt, /src\/main\/services\/codex\.ts/);
  assert.match(prompt, /createTicketDraft/);
  assert.match(prompt, /tests\/ticket-draft\.test\.ts/);
});

test("ticket draft research records URL and codebase limitations in generated markdown", async () => {
  const projectPath = await createProject();
  const dependencies: TicketDraftDependencies = {
    getStatus: async () => readyStatus,
    createRequestId: () => "tdr_research_failure",
    researchLimits: { maxFilesToScan: 2, maxFilesToRead: 1 },
    fetchUrl: async () => {
      throw new Error("network blocked");
    },
    createCodexClient: () =>
      createDraftCodexClient(async () => ({ finalResponse: validDraftJson("Research limitations are visible") }))
  };

  const draft = await createTicketDraft({ projectPath, idea: "Use https://example.test/missing for a frobnicate workflow" }, dependencies);
  const markdown = draftToCreateInput(draft).markdown;

  assert.equal(draft.research.checkedUrls[0].status, "failed");
  assert.match(draft.research.checkedUrls[0].reason ?? "", /network blocked/);
  assert.ok(draft.research.limitations.some((limitation) => /Code search found no searchable project files|Code search found no matches/.test(limitation)));
  assert.match(markdown, /Could not fetch https:\/\/example\.test\/missing: network blocked/);
  assert.match(markdown, /## Research Metadata/);
  assert.match(markdown, /Limitation:/);
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
      createDraftCodexClient((_prompt, options) => {
        signals.push(options.signal);
        return new Promise<never>(() => undefined);
      })
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
      createDraftCodexClient((_prompt, options) => {
        signals.push(options.signal);
        attempt += 1;
        if (attempt === 1) return new Promise<never>(() => undefined);
        return Promise.resolve({ finalResponse: validDraftJson("Retry succeeded") });
      })
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

test("ticket draft creation supports epic output with reviewable subtickets", async () => {
  const projectPath = await createProject();
  let prompt = "";
  const dependencies: TicketDraftDependencies = {
    getStatus: async () => readyStatus,
    createRequestId: () => "tdr_epic",
    createCodexClient: () =>
      createDraftCodexClient(async (nextPrompt) => {
        prompt = nextPrompt;
        return { finalResponse: validEpicDraftJson() };
      })
  };

  const draft = await createTicketDraft({ projectPath, idea: "Plan the account migration", preferredTicketType: "epic" }, dependencies);
  const createInput = draftToCreateInput(draft);

  assert.match(prompt, /selected Epic mode/);
  assert.equal(draft.ticketType, "epic");
  assert.equal(draft.subtickets.length, 2);
  assert.equal(createInput.ticketType, "epic");
  assert.equal(createInput.subtickets?.length, 2);
  assert.match(createInput.markdown, /# Account migration epic/);
  assert.match(createInput.subtickets?.[0].markdown ?? "", /# Account API migration/);
  assert.match(createInput.subtickets?.[0].markdown ?? "", /## Parent Epic/);
  assert.doesNotMatch(createInput.subtickets?.[0].markdown ?? "", /## Research Metadata/);
  assert.equal((await readBoard(projectPath)).tickets.length, 0);
});

test("ticket draft rejects malformed task output that contains subtickets", async () => {
  const projectPath = await createProject();
  const dependencies: TicketDraftDependencies = {
    getStatus: async () => readyStatus,
    createRequestId: () => "tdr_bad_task_children",
    createCodexClient: () =>
      createDraftCodexClient(async () => ({
        finalResponse: JSON.stringify({
          title: "Malformed task",
          ticketType: "task",
          priority: "medium",
          labels: [],
          context: "",
          researchFindings: [],
          requirements: [],
          implementationPlan: [],
          acceptanceCriteria: [],
          clarificationQuestions: [],
          implementationNotes: [],
          subtickets: [
            {
              title: "Should not be here",
              priority: "medium",
              labels: [],
              context: "",
              researchFindings: [],
              requirements: [],
              implementationPlan: [],
              acceptanceCriteria: [],
              clarificationQuestions: [],
              implementationNotes: []
            }
          ]
        })
      }))
  };

  await assert.rejects(
    createTicketDraft({ projectPath, idea: "Return an invalid task with children" }, dependencies),
    (error) => {
      assert.ok(error instanceof TicketDraftServiceError);
      assert.equal(error.code, "invalid_response");
      return true;
    }
  );
});
