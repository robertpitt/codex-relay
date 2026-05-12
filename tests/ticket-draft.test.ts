import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  cancelCodexRun,
  createDraftIntake,
  createTicketDraft,
  draftToCreateInput,
  extractTicketDraftUrls,
  maybeResumeTicketDraftAfterClarification,
  startTicketDraftRun,
  TicketDraftServiceError,
  type TicketDraftCodexClient,
  type TicketDraftDependencies,
  type TicketDraftStartDependencies,
  type TicketDraftThread
} from "../src/main/services/codex";
import {
  answerClarificationQuestion,
  createTicket,
  initializeProject,
  readBoard,
  readClarificationQuestions,
  readProjectConfig,
  readTicket,
  writeProjectConfig
} from "../src/main/services/storage";
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
type TicketDraftThreadOptions = Parameters<TicketDraftCodexClient["startThread"]>[0];
type TicketDraftRunResult = Awaited<ReturnType<TicketDraftThread["run"]>>;
type TicketDraftRunResolver = (value: Pick<TicketDraftRunResult, "finalResponse">) => void;
type TicketDraftRunMock = (
  prompt: string,
  options: TicketDraftRunOptions
) => Promise<Pick<TicketDraftRunResult, "finalResponse">> | Pick<TicketDraftRunResult, "finalResponse">;

const createDraftCodexClient = (
  run: TicketDraftRunMock,
  onStartThread?: (options: TicketDraftThreadOptions) => void
): TicketDraftCodexClient => ({
  startThread: (options) => {
    onStartThread?.(options);
    return {
      run: async (input, runOptions) => {
        if (typeof input !== "string") throw new TypeError("Ticket draft tests expect string prompts.");
        if (!runOptions?.signal) throw new TypeError("Ticket draft tests expect an AbortSignal.");
        const result = await run(input, { ...runOptions, signal: runOptions.signal });
        return { items: [], usage: null, ...result };
      }
    };
  }
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

const validDraftJson = (title: string): string =>
  JSON.stringify({
    title,
    priority: "medium",
    labels: ["codex"],
    context: "Context from Codex.",
    researchFindings: ["Draft research found no blocking ambiguity."],
    requirements: ["Build the requested behavior."],
    implementationPlan: ["Apply the requested behavior using the existing project patterns."],
    testPlan: ["Run npm test."],
    acceptanceCriteria: ["The requested behavior is covered."],
    clarificationQuestions: [],
    assumptions: [],
    implementationNotes: ["Keep the change focused."]
  });

test("ticket draft output schema requires every declared property for strict response format", async () => {
  const projectPath = await createProject();
  let outputSchema: unknown;
  const dependencies: TicketDraftDependencies = {
    getStatus: async () => readyStatus,
    createRequestId: () => "tdr_schema_required",
    disableResearch: true,
    createCodexClient: () =>
      createDraftCodexClient(async (_prompt, options) => {
        outputSchema = options.outputSchema;
        return { finalResponse: validDraftJson("Schema-compatible draft") };
      })
  };

  await createTicketDraft({ projectPath, idea: "Draft a ticket" }, dependencies);

  assertStrictSchemaRequiresAllProperties(outputSchema);
});

const validDraftIntakeJson = (patch: Partial<Record<string, unknown>> = {}): string =>
  JSON.stringify({
    scope: "quick_bug",
    confidence: 0.82,
    knownFacts: ["The bug report names the settings dialog."],
    relatedTicketIds: ["tkt_related_settings"],
    questions: [
      {
        question: "Should the fix preserve the current dialog layout?",
        whyItMatters: "It decides whether the task is a surgical bug fix or a layout refactor.",
        recommendedAnswer: "Preserve the current layout and only fix the crash."
      }
    ],
    ...patch
  });

test("draft intake classifies scope, includes board context, and requires recommended answers", async () => {
  const projectPath = await createProject();
  const related = await createTicket(projectPath, {
    title: "Existing settings dialog ticket",
    priority: "medium",
    labels: ["settings"],
    markdown: "# Existing settings dialog ticket\n"
  });
  let prompt = "";
  let outputSchema: unknown;
  const dependencies: TicketDraftDependencies = {
    getStatus: async () => readyStatus,
    createRequestId: () => "din_scope",
    disableResearch: true,
    createCodexClient: () =>
      createDraftCodexClient(async (nextPrompt, options) => {
        prompt = nextPrompt;
        outputSchema = options.outputSchema;
        return {
          finalResponse: validDraftIntakeJson({
            relatedTicketIds: [related.frontMatter.id, "tkt_missing"]
          })
        };
      })
  };

  const intake = await createDraftIntake({ projectPath, idea: "Fix the settings dialog crash" }, dependencies);

  assert.equal(intake.scope, "quick_bug");
  assert.equal(intake.relatedTicketIds.length, 1);
  assert.equal(intake.relatedTicketIds[0], related.frontMatter.id);
  assert.equal(intake.questions[0].recommendedAnswer, "Preserve the current layout and only fix the crash.");
  assert.match(prompt, /Existing settings dialog ticket/);
  assert.match(prompt, /Do not ask questions answerable from local codebase files, current board tickets/);
  assertStrictSchemaRequiresAllProperties(outputSchema);
});

test("draft intake rejects blocker questions without recommended answers", async () => {
  const projectPath = await createProject();
  const dependencies: TicketDraftDependencies = {
    getStatus: async () => readyStatus,
    createRequestId: () => "din_invalid_question",
    disableResearch: true,
    createCodexClient: () =>
      createDraftCodexClient(async () => ({
        finalResponse: JSON.stringify({
          scope: "task",
          confidence: 0.6,
          knownFacts: [],
          relatedTicketIds: [],
          questions: [{ question: "Which mode?", whyItMatters: "It changes behavior." }]
        })
      }))
  };

  await assert.rejects(
    createDraftIntake({ projectPath, idea: "Add a mode toggle" }, dependencies),
    (error) => error instanceof TicketDraftServiceError && error.code === "invalid_response"
  );
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
    testPlan: ["Run the relevant account migration tests for each child ticket."],
    acceptanceCriteria: ["All generated subtickets can be reviewed before storage."],
    clarificationQuestions: [],
    assumptions: ["Use normal task tickets for every child scope."],
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
        testPlan: ["Run account API tests."],
        acceptanceCriteria: ["Account API tests pass."],
        clarificationQuestions: [],
        assumptions: [],
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
        testPlan: ["Run account UI tests."],
        acceptanceCriteria: ["Account UI can complete the migrated workflow."],
        clarificationQuestions: [],
        assumptions: [],
        implementationNotes: []
      }
    ]
  });

const clarificationDraftJson = (question = "Which storage backend should this target?"): string =>
  JSON.stringify({
    draftState: "needs_clarification",
    blockingClarificationQuestions: [question],
    title: "Blocked implementation draft",
    ticketType: "task",
    priority: "medium",
    labels: ["clarification"],
    context: "Codex needs one product decision before drafting the implementation ticket.",
    researchFindings: ["The codebase research completed enough to identify a blocking decision."],
    requirements: [],
    implementationPlan: [],
    testPlan: [],
    acceptanceCriteria: [],
    clarificationQuestions: [question],
    assumptions: [],
    implementationNotes: ["Drafting is blocked until the user answers the clarification question."],
    subtickets: []
  });

test("ticket draft creation succeeds with a mocked Codex response", async () => {
  const projectPath = await createProject();
  const config = await readProjectConfig(projectPath);
  await writeProjectConfig(projectPath, {
    ...config,
    settings: {
      ...config.settings,
      codexNetworkAccessEnabled: true,
      codexWebSearchMode: "live"
    }
  });
  let prompt = "";
  let capturedOptions: Partial<TicketDraftThreadOptions> = {};
  const signals: AbortSignal[] = [];
  const dependencies: TicketDraftDependencies = {
    getStatus: async () => readyStatus,
    createRequestId: () => "tdr_success",
    createCodexClient: () =>
      createDraftCodexClient(
        async (nextPrompt, options) => {
          prompt = nextPrompt;
          signals.push(options.signal);
          return { finalResponse: validDraftJson("Recoverable timeout handling") };
        },
        (options) => {
          capturedOptions = options;
        }
      )
  };

  const draft = await createTicketDraft({ projectPath, idea: "Make timeouts recoverable" }, dependencies);

  assert.equal(draft.title, "Recoverable timeout handling");
  assert.match(prompt, /Make timeouts recoverable/);
  assert.match(prompt, /Research context:/);
  assert.equal(signals[0].aborted, false);
  assert.equal(capturedOptions.networkAccessEnabled, false);
  assert.equal(capturedOptions.webSearchMode, "disabled");
  assert.equal((await readBoard(projectPath)).tickets.length, 0);
  const draftWithSummary = { ...draft, summary: "**Generated** [summary](https://example.test)." };
  assert.equal(ticketDraftDialogSubtext(draftWithSummary), "Generated summary.");
  const fallbackSubtext = ticketDraftDialogSubtext(draft, 80);
  assert.match(fallbackSubtext, /^Context from Codex\./);
  assert.doesNotMatch(fallbackSubtext, /Recoverable timeout handling/);
  assert.doesNotMatch(fallbackSubtext, /[#*\[\]]/);
  assert.ok(fallbackSubtext.length <= 83);
});

test("ticket draft prompt includes intake answers and applies lean scope budgets", async () => {
  const projectPath = await createProject();
  let prompt = "";
  const dependencies: TicketDraftDependencies = {
    getStatus: async () => readyStatus,
    createRequestId: () => "tdr_intake_context",
    disableResearch: true,
    createCodexClient: () =>
      createDraftCodexClient(async (nextPrompt) => {
        prompt = nextPrompt;
        return {
          finalResponse: JSON.stringify({
            title: "Lean crash fix",
            priority: "medium",
            labels: ["bug"],
            context: "Fix a crash in the settings dialog.",
            researchFindings: ["Settings dialog lives in src/renderer/src/App.tsx."],
            requirements: ["Prevent the crash.", "Keep the existing layout.", "Preserve keyboard behavior.", "Show a useful error."],
            implementationPlan: ["Add a guard.", "Add a focused regression test.", "Run validation.", "Avoid unrelated layout changes."],
            testPlan: ["Run settings dialog test.", "Run npm test.", "Run npm run typecheck."],
            acceptanceCriteria: ["Dialog no longer crashes.", "Existing layout remains.", "Regression is covered.", "No unrelated UI changes."],
            clarificationQuestions: [],
            assumptions: ["Preserve current layout."],
            implementationNotes: ["Keep the fix surgical."],
            draftState: "ready",
            blockingClarificationQuestions: [],
            ticketType: "task",
            subtickets: []
          })
        };
      })
  };

  const draft = await createTicketDraft(
    {
      projectPath,
      idea: "Fix the settings dialog crash",
      draftScope: "quick_bug",
      intakeKnownFacts: ["The crash is reproducible from Settings."],
      intakeAnswers: [
        {
          question: "Should the current layout be preserved?",
          whyItMatters: "It decides whether this is a bug fix or redesign.",
          recommendedAnswer: "Preserve layout.",
          answer: "Preserve the current layout and only fix the crash."
        }
      ]
    },
    dependencies
  );

  assert.match(prompt, /Draft scope: quick_bug/);
  assert.match(prompt, /The crash is reproducible from Settings/);
  assert.match(prompt, /User answer: Preserve the current layout and only fix the crash/);
  assert.equal(draft.requirements.length, 3);
  assert.equal(draft.implementationPlan.length, 3);
  assert.equal(draft.acceptanceCriteria.length, 3);
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
  await waitFor(
    () => events.some((event) => event.type === "agent.message.completed" && /Codex is writing the implementation-ready ticket draft/.test(event.text)),
    "draft progress events"
  );
  assert.ok(events.some((event) => event.type === "agent.message.completed" && /Draft research completed/.test(event.text)));
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

test("async ticket draft can run intake in the background after creating the pending ticket", async () => {
  const projectPath = await createProject();
  const { runEventSink, events } = createFakeRunEventSink();
  let resolveIntake: TicketDraftRunResolver | null = null;
  const prompts: string[] = [];
  const dependencies: TicketDraftStartDependencies = {
    getStatus: async () => readyStatus,
    createRunId: () => "run_background_intake",
    createRequestId: () => "tdr_background_intake",
    disableResearch: true,
    runEventSink,
    createCodexClient: () =>
      createDraftCodexClient((prompt) => {
        prompts.push(prompt);
        if (prompts.length === 1) {
          return new Promise((resolve) => {
            resolveIntake = resolve;
          });
        }
        return { finalResponse: validDraftJson("Background intake draft") };
      })
  };

  const started = await startTicketDraftRun({ projectPath, idea: "Fix a settings modal crash", runIntake: true }, dependencies);
  const pending = await readTicket(projectPath, started.ticket.frontMatter.id);

  assert.equal(pending.frontMatter.runStatus, "drafting");
  assert.match(pending.frontMatter.title, /^Draft: Fix a settings modal crash/);
  await waitFor(() => resolveIntake !== null, "background intake request");
  assert.ok(events.some((event) => event.type === "agent.message.completed" && /Running draft intake/.test(event.text)));

  const completeIntake = resolveIntake as unknown as TicketDraftRunResolver;
  completeIntake({
    finalResponse: validDraftIntakeJson({
      questions: [],
      knownFacts: ["Settings modal crashes when opened without saved preferences."],
      relatedTicketIds: []
    })
  });

  await waitFor(async () => (await readTicket(projectPath, pending.frontMatter.id)).frontMatter.runStatus === "draft_complete", "draft completion");
  const completed = await readTicket(projectPath, pending.frontMatter.id);

  assert.equal(completed.frontMatter.title, "Background intake draft");
  assert.match(prompts[0], /fast intake pass/);
  assert.match(prompts[1], /Draft scope: quick_bug/);
  assert.match(prompts[1], /Settings modal crashes when opened without saved preferences/);
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

test("async ticket draft can be cancelled through the shared run cancellation flow", async () => {
  const projectPath = await createProject();
  const { runEventSink, events } = createFakeRunEventSink();
  const dependencies: TicketDraftStartDependencies = {
    getStatus: async () => readyStatus,
    createRunId: () => "run_cancel_draft",
    createRequestId: () => "tdr_cancel_draft",
    disableResearch: true,
    runEventSink,
    createCodexClient: () =>
      createDraftCodexClient((_prompt, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => {
              const error = new Error("The operation was aborted.");
              error.name = "AbortError";
              reject(error);
            },
            { once: true }
          );
        })
      )
  };

  const started = await startTicketDraftRun({ projectPath, idea: "Cancel this draft" }, dependencies);
  await waitFor(() => events.some((event) => event.type === "agent.message.completed" && /Codex is writing/.test(event.text)), "draft model wait");

  await cancelCodexRun(started.runId);

  await waitFor(async () => (await readTicket(projectPath, started.ticket.frontMatter.id)).frontMatter.runStatus === "cancelled", "draft cancellation");
  await waitFor(() => events.some((event) => event.type === "run.failed"), "draft cancellation event");
  const cancelled = await readTicket(projectPath, started.ticket.frontMatter.id);
  const failureEvents = events.filter((event): event is RendererRunEvent & { type: "run.failed" } => event.type === "run.failed");

  assert.equal(cancelled.frontMatter.runStatus, "cancelled");
  assert.equal(failureEvents.at(-1)?.finalStatus, "cancelled");
});

test("async ticket draft stores formal clarification questions when drafting is blocked", async () => {
  const projectPath = await createProject();
  const { runEventSink, events } = createFakeRunEventSink();
  const dependencies: TicketDraftStartDependencies = {
    getStatus: async () => readyStatus,
    createRunId: () => "run_draft_clarification",
    createRequestId: () => "tdr_draft_clarification",
    disableResearch: true,
    runEventSink,
    createCodexClient: () =>
      createDraftCodexClient(async () => ({ finalResponse: clarificationDraftJson("Which database should this use?") }))
  };

  const started = await startTicketDraftRun({ projectPath, idea: "Draft a storage migration ticket" }, dependencies);

  await waitFor(async () => (await readTicket(projectPath, started.ticket.frontMatter.id)).frontMatter.runStatus === "blocked", "draft clarification");
  const blocked = await readTicket(projectPath, started.ticket.frontMatter.id);
  const questions = await readClarificationQuestions(projectPath, started.ticket.frontMatter.id);

  assert.equal(blocked.frontMatter.status, "needs_clarification");
  assert.match(blocked.markdown, /Open Clarification Questions/);
  assert.match(blocked.markdown, /Which database should this use\?/);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].source, "draft_generation");
  assert.equal(questions[0].createdBy, "codex");
  assert.equal(events.at(-1)?.type, "clarification.requested");
});

test("background intake blocks the pending draft with recommended clarification answers", async () => {
  const projectPath = await createProject();
  const { runEventSink, events } = createFakeRunEventSink();
  let codexCalls = 0;
  const dependencies: TicketDraftStartDependencies = {
    getStatus: async () => readyStatus,
    createRunId: () => "run_intake_clarification",
    createRequestId: () => "tdr_intake_clarification",
    disableResearch: true,
    runEventSink,
    createCodexClient: () =>
      createDraftCodexClient(async () => {
        codexCalls += 1;
        if (codexCalls > 1) throw new Error("Full drafting should not start while intake is blocked.");
        return {
          finalResponse: validDraftIntakeJson({
            scope: "product_feature",
            questions: [
              {
                question: "Should the new setting be enabled by default?",
                whyItMatters: "The default changes rollout risk and acceptance criteria.",
                recommendedAnswer: "Keep it disabled by default and let users opt in."
              }
            ]
          })
        };
      })
  };

  const started = await startTicketDraftRun({ projectPath, idea: "Add a workspace setting", runIntake: true }, dependencies);

  await waitFor(async () => (await readTicket(projectPath, started.ticket.frontMatter.id)).frontMatter.runStatus === "blocked", "intake clarification");
  const blocked = await readTicket(projectPath, started.ticket.frontMatter.id);
  const questions = await readClarificationQuestions(projectPath, started.ticket.frontMatter.id);

  assert.equal(codexCalls, 1);
  assert.equal(blocked.frontMatter.status, "needs_clarification");
  assert.equal(questions.length, 1);
  assert.match(questions[0].question, /Should the new setting be enabled by default/);
  assert.match(questions[0].question, /Why it matters: The default changes rollout risk/);
  assert.match(questions[0].question, /Recommended answer: Keep it disabled by default/);
  assert.equal(events.at(-1)?.type, "clarification.requested");
});

test("answering all draft clarification questions auto-resumes drafting on the same ticket", async () => {
  const projectPath = await createProject();
  const prompts: string[] = [];
  let runCounter = 0;
  let requestCounter = 0;
  let codexAttempt = 0;
  const dependencies: TicketDraftStartDependencies = {
    getStatus: async () => readyStatus,
    createRunId: () => `run_auto_resume_${++runCounter}`,
    createRequestId: () => `tdr_auto_resume_${++requestCounter}`,
    disableResearch: true,
    createCodexClient: () =>
      createDraftCodexClient(async (prompt) => {
        prompts.push(prompt);
        codexAttempt += 1;
        if (codexAttempt === 1) return { finalResponse: clarificationDraftJson("Which storage backend should this target?") };
        return { finalResponse: validDraftJson("Storage backend migration") };
      })
  };

  const started = await startTicketDraftRun({ projectPath, idea: "Draft a storage migration ticket" }, dependencies);
  const ticketId = started.ticket.frontMatter.id;

  await waitFor(async () => (await readTicket(projectPath, ticketId)).frontMatter.runStatus === "blocked", "blocked draft");
  const [question] = await readClarificationQuestions(projectPath, ticketId);
  await answerClarificationQuestion(projectPath, ticketId, question.id, "Use SQLite for the first implementation.");

  const resumed = await maybeResumeTicketDraftAfterClarification(projectPath, ticketId, dependencies);
  assert.equal(resumed?.ticket.frontMatter.id, ticketId);
  assert.equal(resumed?.runId, "run_auto_resume_2");

  await waitFor(async () => (await readTicket(projectPath, ticketId)).frontMatter.runStatus === "draft_complete", "resumed draft completion");
  const completed = await readTicket(projectPath, ticketId);

  assert.equal(completed.frontMatter.title, "Storage backend migration");
  assert.equal(completed.frontMatter.lastRunId, "run_auto_resume_2");
  assert.match(completed.markdown, /## Goal/);
  assert.match(prompts[1], /Answer: Use SQLite for the first implementation\./);
  assert.match(prompts[1], /Existing draft ticket markdown/);
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
            testPlan: ["Run ticket draft URL research tests."],
            acceptanceCriteria: ["The generated markdown references fetched URLs."],
            clarificationQuestions: [],
            assumptions: [],
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
  assert.match(markdown, /## Implementation Notes/);
  assert.match(markdown, /External Draft Spec says URLs should be fetched/);
  assert.match(markdown, /Fetched "External Draft Spec" \(https:\/\/example\.test\/spec\?draft=1\) for external context/);
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
  assert.doesNotMatch(markdown, /## Research Metadata/);
  assert.match(markdown, /Research limitation:/);
});

test("ticket draft waits for slow Codex responses without an internal timeout", async () => {
  const projectPath = await createProject();
  const signals: AbortSignal[] = [];
  const resolvers: TicketDraftRunResolver[] = [];
  const draftPromises: ReturnType<typeof createTicketDraft>[] = [];
  const runStarted = new Promise<void>((resolve) => {
    const dependencies: TicketDraftDependencies = {
      getStatus: async () => readyStatus,
      createRequestId: () => "tdr_slow_draft",
      draftTimeoutMs: 1,
      unrefTimeout: false,
      createCodexClient: () =>
        createDraftCodexClient((_prompt, options) => {
          signals.push(options.signal);
          resolve();
          return new Promise((nextResolve) => {
            resolvers.push(nextResolve);
          });
        })
    };

    draftPromises.push(createTicketDraft({ projectPath, idea: "Wait for this draft" }, dependencies));
  });

  await runStarted;
  assert.equal(signals[0].aborted, false);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(signals[0].aborted, false);
  resolvers[0]({ finalResponse: validDraftJson("Slow draft completed") });
  const draft = await draftPromises[0];

  assert.equal(draft.title, "Slow draft completed");
  assert.equal(signals[0].aborted, false);
  assert.equal((await readBoard(projectPath)).tickets.length, 0);
});

test("ticket draft retry after backend failure uses an independent Codex request", async () => {
  const projectPath = await createProject();
  const signals: AbortSignal[] = [];
  let attempt = 0;
  const dependencies: TicketDraftDependencies = {
    getStatus: async () => readyStatus,
    createRequestId: () => `tdr_retry_${attempt + 1}`,
    createCodexClient: () =>
      createDraftCodexClient((_prompt, options) => {
        signals.push(options.signal);
        attempt += 1;
        if (attempt === 1) throw new Error("temporary backend failure");
        return Promise.resolve({ finalResponse: validDraftJson("Retry succeeded") });
      })
  };

  await assert.rejects(createTicketDraft({ projectPath, idea: "Retry after backend failure" }, dependencies), TicketDraftServiceError);
  const retryDraft = await createTicketDraft({ projectPath, idea: "Retry after backend failure" }, dependencies);

  assert.equal(retryDraft.title, "Retry succeeded");
  assert.equal(signals.length, 2);
  assert.notEqual(signals[0], signals[1]);
  assert.equal(signals[0].aborted, false);
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
  assert.match(createInput.subtickets?.[0].markdown ?? "", /Parent epic: Account migration epic/);
  assert.doesNotMatch(createInput.subtickets?.[0].markdown ?? "", /## Research Metadata/);
  assert.equal((await readBoard(projectPath)).tickets.length, 0);
});

test("ticket draft rejects ready plans that defer core research to implementation", async () => {
  const projectPath = await createProject();
  const dependencies: TicketDraftDependencies = {
    getStatus: async () => readyStatus,
    createRequestId: () => "tdr_deferred_research",
    disableResearch: true,
    createCodexClient: () =>
      createDraftCodexClient(async () => ({
        finalResponse: JSON.stringify({
          title: "Deferred research ticket",
          ticketType: "task",
          priority: "medium",
          labels: ["drafts"],
          context: "This draft is intentionally too weak.",
          researchFindings: ["No useful codebase findings were recorded."],
          requirements: ["Improve ticket drafting."],
          implementationPlan: ["Inspect the current flow to find the relevant files."],
          testPlan: ["Run npm test."],
          acceptanceCriteria: ["The ticket is stronger."],
          clarificationQuestions: [],
          assumptions: [],
          implementationNotes: [],
          subtickets: []
        })
      }))
  };

  await assert.rejects(
    createTicketDraft({ projectPath, idea: "Make ticket drafting stronger" }, dependencies),
    (error) => {
      assert.ok(error instanceof TicketDraftServiceError);
      assert.equal(error.code, "invalid_response");
      return true;
    }
  );
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
