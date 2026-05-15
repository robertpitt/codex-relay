import test from "node:test";
import assert from "node:assert/strict";
import { ConfigProvider, Effect, Layer, ManagedRuntime, Sink, Stream } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { access, appendFile, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CodexOptions, Input, ThreadOptions } from "@openai/codex-sdk";
import {
  cancelCodexRun,
  createCodex,
  getCodexStatus,
  preflightCodexRun,
  readCodexRunEvents,
  reconcileTicketQueueState,
  sendRepositoryChatMessage,
  startCodexRun,
  startTicketDraftRun,
  type CodexRunDependencies,
  type CreateCodexDependencies,
  type RepositoryChatCodexClient,
  type RepositoryChatThread,
  type TicketDraftStartDependencies
} from "../src/services/codex";
import { resolveAvailableCodexCli, runCodexVersionEffect, type CodexCliCandidate } from "../src/services/codex/cli";
import {
  BackendWorkLive,
  markWorkRunStatus,
  TicketWorkService,
  WorkLedger,
  WorkLedgerLive,
  WorkNotFoundError,
  WorkEngine,
  WorkScheduler,
  WorkSchedulerLive
} from "../src/services/work";
import { BackendClock } from "../src/platform";
import { BackendConfig, BackendConfigDefaults, loadBackendConfig } from "../src/config/AppConfig";
import { runBackendEffect } from "../src/runtime";
import {
  answerClarificationQuestion,
  createClarificationQuestions,
  createSubticket,
  createTicket,
  deleteTicket,
  initializeProject,
  isTicketNotFoundError,
  listTicketReferenceCandidates,
  linkSubticket,
  moveTicket,
  readBoard,
  readClarificationQuestions,
  readProjectConfig,
  readTicket,
  saveTicketAttachment,
  Storage,
  StorageLive,
  summarizeProject,
  transitionTicketStatus,
  writeTicket,
  unlinkSubticket,
  writeProjectConfig
} from "../src/storage";
import type { CodexStatus, RendererRunEvent } from "../src/shared/schemas";

const readyCodexStatus: CodexStatus = {
  sdkAvailable: true,
  cliAvailable: true,
  cliVersion: "codex-test",
  authenticated: true,
  message: "Codex is available."
};

const createProject = async (): Promise<string> => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), "relay-backend-"));
  await initializeProject(projectPath);
  return projectPath;
};

const auditEvents = async (projectPath: string): Promise<Array<{ eventType: string; actor: string; source: string; payload: unknown }>> => {
  const raw = await readFile(path.join(projectPath, ".relay", "audit.jsonl"), "utf8");
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { eventType: string; actor: string; source: string; payload: unknown });
};

const allowNonGitRuns = async (projectPath: string): Promise<void> => {
  const config = await readProjectConfig(projectPath);
  await writeProjectConfig(projectPath, {
    ...config,
    settings: {
      ...config.settings,
      allowNonGitCodexRuns: true
    }
  });
};

const createFakeRunEventSink = (): { runEventSink: NonNullable<CodexRunDependencies["runEventSink"]>; events: RendererRunEvent[] } => {
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

const waitFor = async (predicate: () => boolean, label: string): Promise<void> => {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`Timed out waiting for ${label}`);
};

const waitForAsync = async (predicate: () => Promise<boolean>, label: string): Promise<void> => {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`Timed out waiting for ${label}`);
};

const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve!: () => void;
  const promise = new Promise<void>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
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

test("work ledger persists snapshots, event logs, and ignores corrupt trailing event lines", async () => {
  const projectPath = await createProject();
  const workId = "work_ledger";
  const submitInput = {
    workId,
    subject: "worker" as const,
    action: "dispatch" as const,
    kind: "worker.dispatch" as const,
    projectPath,
    idempotencyKey: "worker:test",
    executor: "worker" as const,
    runId: "run_work_ledger",
    ticketId: "tkt_work",
    payload: { workerType: "local", runId: "run_work_ledger" },
    metadata: { test: true }
  };

  const submitted = await runBackendEffect(
    Effect.provide(WorkLedger.use((ledger) => ledger.submit(submitInput)), WorkLedgerLive)
  );
  assert.equal(submitted.status, "created");

  const duplicate = await runBackendEffect(
    Effect.provide(WorkLedger.use((ledger) => ledger.submit(submitInput)), WorkLedgerLive)
  );
  assert.equal(duplicate.createdAt, submitted.createdAt);

  await runBackendEffect(
    Effect.provide(
      WorkLedger.use((ledger) => ledger.transition({ projectPath, workId, status: "queued", message: "Queued." })),
      WorkLedgerLive
    )
  );
  const running = await runBackendEffect(
    Effect.provide(
      WorkLedger.use((ledger) => ledger.transition({ projectPath, workId, status: "running", message: "Started." })),
      WorkLedgerLive
    )
  );
  assert.equal(running.status, "running");

  const snapshotPath = path.join(projectPath, ".relay", "work", "runs", workId, "snapshot.json");
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as { status: string; runId: string };
  assert.equal(snapshot.status, "running");
  assert.equal(snapshot.runId, "run_work_ledger");

  await appendFile(path.join(projectPath, ".relay", "work", "runs", workId, "events.jsonl"), "{not json}\n");
  const events = await runBackendEffect(
    Effect.provide(WorkLedger.use((ledger) => ledger.readEvents(projectPath, workId)), WorkLedgerLive)
  );
  assert.deepEqual(
    events.map((event) => event.type),
    ["work.submitted", "work.queued", "work.running", "work.corrupt_event_ignored"]
  );
});

test("work ledger keeps terminal snapshots immutable and reports typed missing-work errors", async () => {
  const projectPath = await createProject();
  const workId = "work_terminal";
  const submitInput = {
    workId,
    subject: "worker" as const,
    action: "dispatch" as const,
    kind: "worker.dispatch" as const,
    projectPath,
    idempotencyKey: "worker:terminal",
    executor: "worker" as const,
    runId: "run_work_terminal",
    ticketId: "tkt_work_terminal",
    payload: { workerType: "local", runId: "run_work_terminal" }
  };

  await runBackendEffect(
    Effect.provide(WorkLedger.use((ledger) => ledger.submit(submitInput)), WorkLedgerLive)
  );
  await runBackendEffect(
    Effect.provide(WorkLedger.use((ledger) => ledger.transition({ projectPath, workId, status: "queued" })), WorkLedgerLive)
  );
  await runBackendEffect(
    Effect.provide(WorkLedger.use((ledger) => ledger.transition({ projectPath, workId, status: "running" })), WorkLedgerLive)
  );
  const completed = await runBackendEffect(
    Effect.provide(
      WorkLedger.use((ledger) =>
        ledger.transition({ projectPath, workId, status: "completed", result: { ok: true }, message: "Done." })
      ),
      WorkLedgerLive
    )
  );
  assert.equal(completed.status, "completed");

  await assert.rejects(
    runBackendEffect(
      Effect.provide(
        WorkLedger.use((ledger) =>
          ledger.transition({ projectPath, workId, status: "failed", error: "late failure", message: "Too late." })
        ),
        WorkLedgerLive
      )
    )
  );
  const blocked = await runBackendEffect(
    Effect.provide(WorkLedger.use((ledger) => ledger.readSnapshot(projectPath, workId)), WorkLedgerLive)
  );
  assert.equal(blocked?.status, "completed");
  assert.deepEqual(blocked?.result, { ok: true });
  assert.equal(blocked?.message, "Done.");

  const events = await runBackendEffect(
    Effect.provide(WorkLedger.use((ledger) => ledger.readEvents(projectPath, workId)), WorkLedgerLive)
  );
  assert.deepEqual(
    events.map((event) => event.type),
    ["work.submitted", "work.queued", "work.running", "work.completed"]
  );

  await assert.rejects(
    runBackendEffect(
      Effect.provide(
        WorkLedger.use((ledger) => ledger.transition({ projectPath, workId: "work_missing", status: "running" })),
        WorkLedgerLive
      )
    ),
    (error) => error instanceof WorkNotFoundError && error.workId === "work_missing"
  );
});

test("ticket work service submits implementation work and exposes durable status transitions", async () => {
  const projectPath = await createProject();
  const handle = await runBackendEffect(
    Effect.provide(
      TicketWorkService.use((service) =>
        service.submitImplementation(
          { projectPath, ticketId: "tkt_work_supervisor" },
          { runId: "run_work_supervisor", resume: false }
        )
      ),
      BackendWorkLive
    )
  );

  assert.equal(handle.kind, "ticket.implementation");
  assert.equal(handle.providerId, "codex");
  assert.equal(handle.status, "queued");

  const running = await markWorkRunStatus(projectPath, "run_work_supervisor", "running", {
    message: "Started."
  });
  assert.ok(running?.currentAttempt?.attemptId);
  assert.ok(running.currentAttempt.leaseToken);
  await assert.rejects(
    markWorkRunStatus(projectPath, "run_work_supervisor", "completed", {
      result: { ok: true },
      message: "Done."
    })
  );
  const completed = await markWorkRunStatus(projectPath, "run_work_supervisor", "completed", {
    result: { ok: true },
    message: "Done.",
    attemptId: running.currentAttempt.attemptId,
    leaseToken: running.currentAttempt.leaseToken
  });
  assert.equal(completed?.status, "completed");

  const polled = await runBackendEffect(
    Effect.provide(WorkLedger.use((ledger) => ledger.readSnapshot(projectPath, handle.workId)), BackendWorkLive)
  );
  assert.equal(polled?.status, "completed");
  assert.deepEqual(polled?.result, { ok: true });
});

test("work scheduler owns live Codex lifecycle state", async () => {
  const projectPath = path.resolve(await createProject());
  const implementationAbort = new AbortController();
  const draftAbort = new AbortController();
  const updateAbort = new AbortController();

  await runBackendEffect(
    Effect.provide(
      WorkScheduler.use((registry) =>
        Effect.gen(function*() {
          yield* registry.enqueueImplementation("run_registry_impl", {
            input: { projectPath, ticketId: "tkt_registry_impl" },
            resume: false,
            dependencies: { source: "test" }
          });
          const queued = yield* registry.getQueuedImplementation("run_registry_impl");
          assert.equal(queued?.input.ticketId, "tkt_registry_impl");
          assert.deepEqual(queued?.dependencies, { source: "test" });

          yield* registry.markImplementationStarting("run_registry_impl", { projectPath, ticketId: "tkt_registry_impl" });
          assert.equal(yield* registry.activeImplementationRunCount(projectPath), 1);
          assert.equal(yield* registry.isImplementationActiveOrStarting("run_registry_impl"), true);

          yield* registry.registerImplementationActive("run_registry_impl", {
            abortController: implementationAbort,
            projectPath,
            ticketId: "tkt_registry_impl"
          });
          assert.equal(yield* registry.activeRunIdForTicket(projectPath, "tkt_registry_impl"), "run_registry_impl");
          assert.equal(yield* registry.getQueuedImplementation("run_registry_impl"), null);
          assert.equal(yield* registry.activeImplementationRunCount(projectPath), 1);

          yield* registry.registerDraft("run_registry_draft", {
            abortController: draftAbort,
            projectPath,
            ticketId: "tkt_registry_draft"
          });
          assert.equal(yield* registry.activeRunIdForTicket(projectPath, "tkt_registry_draft"), "run_registry_draft");

          const firstUpdate = yield* registry.beginTicketUpdate("run_registry_update", `${projectPath}:tkt_registry_update`, {
            abortController: updateAbort,
            projectPath,
            ticketId: "tkt_registry_update"
          });
          assert.deepEqual(firstUpdate, { started: true });
          assert.equal((yield* registry.getTicketUpdate("run_registry_update"))?.ticketId, "tkt_registry_update");
          const duplicateUpdate = yield* registry.beginTicketUpdate("run_registry_update_duplicate", `${projectPath}:tkt_registry_update`, {
            abortController: new AbortController(),
            projectPath,
            ticketId: "tkt_registry_update"
          });
          assert.deepEqual(duplicateUpdate, { started: false, existingRunId: "run_registry_update" });

          assert.equal(yield* registry.claimProjectSchedulerLoop(projectPath), true);
          assert.equal(yield* registry.claimProjectSchedulerLoop(projectPath), false);
          yield* registry.wakeProjectScheduler(projectPath);
          yield* registry.takeProjectSchedulerWake(projectPath);
          yield* registry.releaseProjectSchedulerLoop(projectPath);
          assert.equal(yield* registry.claimProjectSchedulerLoop(projectPath), true);
          yield* registry.releaseProjectSchedulerLoop(projectPath);

          yield* registry.completeImplementation("run_registry_impl");
          yield* registry.completeDraft("run_registry_draft");
          yield* registry.completeTicketUpdate("run_registry_update");
          assert.equal(yield* registry.activeImplementationRunCount(projectPath), 0);
          assert.equal(yield* registry.activeRunIdForTicket(projectPath, "tkt_registry_impl"), null);
          assert.equal(yield* registry.getTicketUpdate("run_registry_update"), null);
        })
      ),
      WorkSchedulerLive
    )
  );
});

test("work scheduler state is shared across work runtimes", async () => {
  const projectPath = path.resolve(await createProject());
  const ticketId = "tkt_shared_scheduler";
  const handle = await runBackendEffect(
    Effect.provide(
      TicketWorkService.use((service) =>
        service.submitImplementation({ projectPath, ticketId }, { runId: "run_shared_scheduler", resume: false })
      ),
      BackendWorkLive
    )
  );

  await runBackendEffect(
    Effect.provide(
      WorkScheduler.use((scheduler) =>
        scheduler.enqueueImplementation(handle.workId, {
          input: { projectPath, ticketId },
          resume: false,
          dependencies: { source: "compatibility-helper" }
        })
      ),
      WorkSchedulerLive
    )
  );

  const claim = await runBackendEffect(
    Effect.provide(
      WorkEngine.use((engine) => engine.claimNext({ projectPath, executor: "agent", providerId: "codex" })),
      BackendWorkLive
    )
  );
  assert.equal(claim?.workId, handle.workId);
  assert.ok(claim?.attemptId);
  assert.ok(claim?.leaseToken);

  const starting = await runBackendEffect(
    Effect.provide(WorkScheduler.use((scheduler) => scheduler.getStartingImplementation(handle.workId)), WorkSchedulerLive)
  );
  assert.equal(starting?.attemptId, claim?.attemptId);
  assert.equal(starting?.leaseToken, claim?.leaseToken);
});

test("work ledger serializes idempotent submit and terminal races", async () => {
  const projectPath = await createProject();
  const workId = "work_concurrent";
  const submitInput = {
    workId,
    subject: "worker" as const,
    action: "dispatch" as const,
    kind: "worker.dispatch" as const,
    projectPath,
    idempotencyKey: "worker:concurrent",
    executor: "worker" as const,
    runId: "run_work_concurrent",
    payload: { workerType: "local", runId: "run_work_concurrent" }
  };

  const submitted = await Promise.all(
    Array.from({ length: 5 }, () =>
      runBackendEffect(Effect.provide(WorkLedger.use((ledger) => ledger.submit(submitInput)), WorkLedgerLive))
    )
  );
  assert.equal(new Set(submitted.map((snapshot) => snapshot.createdAt)).size, 1);
  let events = await runBackendEffect(
    Effect.provide(WorkLedger.use((ledger) => ledger.readEvents(projectPath, workId)), WorkLedgerLive)
  );
  assert.deepEqual(events.map((event) => event.type), ["work.submitted"]);

  await runBackendEffect(
    Effect.provide(WorkLedger.use((ledger) => ledger.transition({ projectPath, workId, status: "queued" })), WorkLedgerLive)
  );
  await runBackendEffect(
    Effect.provide(WorkLedger.use((ledger) => ledger.transition({ projectPath, workId, status: "running" })), WorkLedgerLive)
  );

  const terminalResults = await Promise.allSettled([
    runBackendEffect(
      Effect.provide(
        WorkLedger.use((ledger) => ledger.transition({ projectPath, workId, status: "completed", result: { winner: "completed" } })),
        WorkLedgerLive
      )
    ),
    runBackendEffect(
      Effect.provide(
        WorkLedger.use((ledger) => ledger.transition({ projectPath, workId, status: "failed", error: { winner: "failed" } })),
        WorkLedgerLive
      )
    )
  ]);
  assert.equal(terminalResults.filter((result) => result.status === "fulfilled").length, 1);
  const snapshot = await runBackendEffect(
    Effect.provide(WorkLedger.use((ledger) => ledger.readSnapshot(projectPath, workId)), WorkLedgerLive)
  );
  assert.ok(snapshot?.status === "completed" || snapshot?.status === "failed");
  events = await runBackendEffect(
    Effect.provide(WorkLedger.use((ledger) => ledger.readEvents(projectPath, workId)), WorkLedgerLive)
  );
  assert.equal(new Set(events.map((event) => event.sequence)).size, events.length);
  assert.deepEqual(events.map((event) => event.sequence), events.map((_, index) => index + 1));
});

test("work engine claims require leases and record claim heartbeat progress events", async () => {
  const projectPath = await createProject();
  const handle = await runBackendEffect(
    Effect.provide(
      WorkEngine.use((engine) =>
        engine.submit({
          workId: "work_claim_events",
          subject: "worker",
          action: "dispatch",
          kind: "worker.dispatch",
          projectPath,
          idempotencyKey: "worker:claim-events",
          executor: "worker",
          runId: "run_claim_events",
          payload: { runId: "run_claim_events" }
        })
      ),
      BackendWorkLive
    )
  );

  const claim = await runBackendEffect(
    Effect.provide(
      WorkEngine.use((engine) => engine.claimWork({ projectPath, workId: handle.workId, executor: "worker", providerId: "test" })),
      BackendWorkLive
    )
  );
  assert.ok(claim?.attemptId);
  assert.ok(claim?.leaseToken);

  await assert.rejects(
    runBackendEffect(
      Effect.provide(
        WorkEngine.use((engine) =>
          engine.reportCompleted({
            projectPath,
            workId: handle.workId,
            attemptId: claim.attemptId,
            leaseToken: "wrong",
            result: { ok: false }
          })
        ),
        BackendWorkLive
      )
    )
  );

  await runBackendEffect(
    Effect.provide(
      WorkEngine.use((engine) => engine.heartbeat({ projectPath, workId: handle.workId, attemptId: claim.attemptId, leaseToken: claim.leaseToken })),
      BackendWorkLive
    )
  );
  await runBackendEffect(
    Effect.provide(
      WorkEngine.use((engine) =>
        engine.reportProgress({
          projectPath,
          workId: handle.workId,
          attemptId: claim.attemptId,
          leaseToken: claim.leaseToken,
          payload: { step: "halfway" }
        })
      ),
      BackendWorkLive
    )
  );
  const completed = await runBackendEffect(
    Effect.provide(
      WorkEngine.use((engine) =>
        engine.reportCompleted({
          projectPath,
          workId: handle.workId,
          attemptId: claim.attemptId,
          leaseToken: claim.leaseToken,
          result: { ok: true }
        })
      ),
      BackendWorkLive
    )
  );
  assert.equal(completed.status, "completed");
  const duplicate = await runBackendEffect(
    Effect.provide(
      WorkEngine.use((engine) =>
        engine.reportCompleted({
          projectPath,
          workId: handle.workId,
          attemptId: claim.attemptId,
          leaseToken: claim.leaseToken,
          result: { ok: true }
        })
      ),
      BackendWorkLive
    )
  );
  assert.equal(duplicate.status, "completed");

  const events = await runBackendEffect(
    Effect.provide(WorkLedger.use((ledger) => ledger.readEvents(projectPath, handle.workId)), BackendWorkLive)
  );
  assert.deepEqual(
    events.map((event) => event.type),
    ["work.submitted", "work.queued", "work.claimed", "work.heartbeat", "work.progress", "work.completed"]
  );
});

test("work recovery restores queued implementation work into the scheduler", async () => {
  const projectPath = path.resolve(await createProject());
  const ticket = await createTicket(projectPath, {
    title: "Recover queued implementation",
    priority: "medium",
    labels: ["work"],
    markdown: "# Recover queued implementation\n\nRun the agent after restart.",
    status: "ready"
  });
  const handle = await runBackendEffect(
    Effect.provide(
      TicketWorkService.use((service) =>
        service.submitImplementation({ projectPath, ticketId: ticket.frontMatter.id }, { runId: "run_recover_queue", resume: false })
      ),
      BackendWorkLive
    )
  );

  assert.equal(
    await runBackendEffect(
      Effect.provide(WorkScheduler.use((scheduler) => scheduler.getQueuedImplementation(handle.workId)), WorkSchedulerLive)
    ),
    null
  );

  const report = await runBackendEffect(
    Effect.provide(WorkEngine.use((engine) => engine.recoverProject(projectPath)), BackendWorkLive)
  );
  assert.deepEqual(report.wakeProjectPaths, [projectPath]);
  const queued = await runBackendEffect(
    Effect.provide(WorkScheduler.use((scheduler) => scheduler.getQueuedImplementation(handle.workId)), WorkSchedulerLive)
  );
  assert.equal(queued?.input.ticketId, ticket.frontMatter.id);
  assert.deepEqual(queued?.dependencies, {});
  const events = await runBackendEffect(
    Effect.provide(WorkLedger.use((ledger) => ledger.readEvents(projectPath, handle.workId)), BackendWorkLive)
  );
  assert.ok(events.some((event) => event.type === "work.recovered"));
});

test("work recovery cancels orphaned ticket work and restores blocked ticket markers", async () => {
  const projectPath = path.resolve(await createProject());
  const orphan = await runBackendEffect(
    Effect.provide(
      TicketWorkService.use((service) =>
        service.submitDraft({ projectPath, idea: "Draft against a missing ticket" }, { runId: "run_orphan_work", ticketId: "missing_ticket" })
      ),
      BackendWorkLive
    )
  );

  await runBackendEffect(Effect.provide(WorkEngine.use((engine) => engine.recoverProject(projectPath)), BackendWorkLive));
  const orphanSnapshot = await runBackendEffect(
    Effect.provide(WorkLedger.use((ledger) => ledger.readSnapshot(projectPath, orphan.workId)), BackendWorkLive)
  );
  assert.equal(orphanSnapshot?.status, "cancelled");
  const orphanEvents = await runBackendEffect(
    Effect.provide(WorkLedger.use((ledger) => ledger.readEvents(projectPath, orphan.workId)), BackendWorkLive)
  );
  assert.ok(orphanEvents.some((event) => event.type === "work.recovery_conflict"));

  const ticket = await createTicket(projectPath, {
    title: "Restore blocked marker",
    priority: "medium",
    labels: ["work"],
    markdown: "# Restore blocked marker\n\nRecover needs-input state.",
    status: "todo"
  });
  const handle = await runBackendEffect(
    Effect.provide(
      TicketWorkService.use((service) =>
        service.submitUpdate({ projectPath, ticketId: ticket.frontMatter.id, request: "Ask for missing detail" }, { runId: "run_blocked_recover" })
      ),
      BackendWorkLive
    )
  );
  const running = await markWorkRunStatus(projectPath, handle.workId, "running", { message: "Started." });
  assert.ok(running?.currentAttempt?.attemptId);
  await markWorkRunStatus(projectPath, handle.workId, "blocked", {
    message: "Needs input.",
    attemptId: running.currentAttempt.attemptId,
    leaseToken: running.currentAttempt.leaseToken
  });
  await writeTicket(projectPath, {
    ...ticket,
    frontMatter: {
      ...ticket.frontMatter,
      runStatus: "idle",
      lastRunId: handle.runId ?? handle.workId
    }
  });

  await runBackendEffect(Effect.provide(WorkEngine.use((engine) => engine.recoverProject(projectPath)), BackendWorkLive));
  const recoveredTicket = await readTicket(projectPath, ticket.frontMatter.id);
  assert.equal(recoveredTicket.frontMatter.runStatus, "blocked");
  assert.equal(recoveredTicket.frontMatter.authoringState, "needs_input");
  assert.equal(recoveredTicket.frontMatter.lastRunId, handle.runId ?? handle.workId);
});

type RepositoryChatRunResult = Awaited<ReturnType<RepositoryChatThread["run"]>>;

test("repository chat starts a read-only thread with project and board context", async () => {
  const projectPath = await createProject();
  const config = await readProjectConfig(projectPath);
  await writeProjectConfig(projectPath, {
    ...config,
    name: "Repository Chat Fixture",
    settings: {
      ...config.settings,
      defaultModel: "gpt-chat-test",
      defaultModelReasoningEffort: "high",
      defaultApprovalPolicy: "on-request",
      defaultSandboxMode: "danger-full-access",
      codexNetworkAccessEnabled: true,
      codexWebSearchMode: "live",
      codexAdditionalDirectories: [path.join(projectPath, "packages")]
    }
  });
  await createTicket(projectPath, {
    title: "Document board shortcuts",
    priority: "high",
    labels: ["docs"],
    markdown: "# Document board shortcuts\n\nExplain the keyboard flow for board navigation.",
    status: "todo"
  });

  let capturedPrompt = "";
  const capturedOptions: ThreadOptions[] = [];
  let startCalls = 0;
  const dependencies = {
    getStatus: async () => readyCodexStatus,
    createRequestId: () => "rch_start",
    createCodexClient: (): RepositoryChatCodexClient => ({
      startThread: (options) => {
        startCalls += 1;
        capturedOptions.push(options);
        return {
          id: "thread_repository_chat",
          run: async (input, turnOptions): Promise<RepositoryChatRunResult> => {
            if (typeof input !== "string") throw new TypeError("Repository chat tests expect string prompts.");
            capturedPrompt = input;
            assert.ok(turnOptions?.signal);
            return { items: [], usage: null, finalResponse: "  The shortcut docs should cover arrow and J/K navigation.  " };
          }
        };
      },
      resumeThread: () => {
        throw new Error("resumeThread should not be used for the first repository chat message.");
      }
    })
  };

  const response = await sendRepositoryChatMessage({ projectPath, message: "Where should shortcut docs go?" }, dependencies);

  assert.equal(startCalls, 1);
  assert.deepEqual(response, {
    threadId: "thread_repository_chat",
    message: "The shortcut docs should cover arrow and J/K navigation."
  });
  const options = capturedOptions[0];
  assert.equal(options.workingDirectory, projectPath);
  assert.equal(options.model, "gpt-chat-test");
  assert.equal(options.modelReasoningEffort, "high");
  assert.equal(options.approvalPolicy, "never");
  assert.equal(options.sandboxMode, "read-only");
  assert.equal(options.networkAccessEnabled, false);
  assert.equal(options.webSearchMode, "disabled");
  assert.equal(options.skipGitRepoCheck, true);
  assert.deepEqual(options.additionalDirectories, [path.join(projectPath, "packages")]);
  assert.match(capturedPrompt, /Project path:/);
  assert.match(capturedPrompt, /Repository Chat Fixture/);
  assert.match(capturedPrompt, /Workflow columns: Todo, Ready, In Progress/);
  assert.match(capturedPrompt, /Document board shortcuts/);
  assert.match(capturedPrompt, /status: Todo/);
  assert.match(capturedPrompt, /Explain the keyboard flow for board navigation/);
  assert.match(capturedPrompt, /Do not create, edit, move, rename, or delete files/);
  assert.match(capturedPrompt, /Do not create, edit, move, rename, or delete Relay tickets or board cards/);
  assert.match(capturedPrompt, /Network access and web search are disabled/);
  assert.match(capturedPrompt, /Where should shortcut docs go/);
});

test("repository chat resumes an existing thread without mutating board state", async () => {
  const projectPath = await createProject();
  await createTicket(projectPath, {
    title: "Keep chat read only",
    priority: "medium",
    labels: ["codex"],
    markdown: "# Keep chat read only\n\nRepository chat must not move or edit tickets.",
    status: "ready"
  });
  const boardBefore = await readBoard(projectPath);
  let resumedThreadId = "";
  let resumeCalls = 0;
  const dependencies = {
    getStatus: async () => readyCodexStatus,
    createRequestId: () => "rch_resume",
    createCodexClient: (): RepositoryChatCodexClient => ({
      startThread: () => {
        throw new Error("startThread should not be used when repository chat has a thread id.");
      },
      resumeThread: (threadId, options) => {
        resumeCalls += 1;
        resumedThreadId = threadId;
        assert.equal(options.approvalPolicy, "never");
        assert.equal(options.sandboxMode, "read-only");
        return {
          id: threadId,
          run: async (input, turnOptions): Promise<RepositoryChatRunResult> => {
            assert.equal(typeof input, "string");
            assert.ok(turnOptions?.signal);
            return { items: [], usage: null, finalResponse: "No board state changes are needed." };
          }
        };
      }
    })
  };

  const response = await sendRepositoryChatMessage(
    { projectPath, message: "What changed since my last question?", threadId: "thread_existing_chat" },
    dependencies
  );
  const boardAfter = await readBoard(projectPath);

  assert.equal(resumeCalls, 1);
  assert.equal(resumedThreadId, "thread_existing_chat");
  assert.deepEqual(response, { threadId: "thread_existing_chat", message: "No board state changes are needed." });
  assert.deepEqual(boardAfter, boardBefore);
});

test("repository chat rejects and aborts when the Codex turn never settles", async () => {
  const projectPath = await createProject();
  let runSignal: AbortSignal | undefined;
  const dependencies = {
    getStatus: async () => readyCodexStatus,
    createRequestId: () => "rch_timeout",
    chatTimeoutMs: 5,
    createCodexClient: (): RepositoryChatCodexClient => ({
      startThread: () => ({
        id: "thread_repository_chat_timeout",
        run: async (_input, turnOptions): Promise<RepositoryChatRunResult> => {
          runSignal = turnOptions?.signal;
          return new Promise<RepositoryChatRunResult>(() => undefined);
        }
      }),
      resumeThread: () => {
        throw new Error("resumeThread should not be used for a timeout regression.");
      }
    })
  };

  await assert.rejects(
    sendRepositoryChatMessage({ projectPath, message: "Will this hang?" }, dependencies),
    /Repository chat timed out after 5ms\./
  );
  assert.equal(runSignal?.aborted, true);
});

test("backend Effect runtime provides shared services", async () => {
  const timestamp = await runBackendEffect(
    Effect.gen(function*() {
      const clock = yield* BackendClock;
      return clock.nowIso();
    })
  );

  assert.match(timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test("backend config uses documented defaults when no overrides are provided", async () => {
  const config = await Effect.runPromise(loadBackendConfig(ConfigProvider.fromUnknown({})));

  assert.deepEqual(config, BackendConfigDefaults);
});

test("backend config reads explicit RELAY millisecond overrides", async () => {
  const config = await Effect.runPromise(
    loadBackendConfig(
      ConfigProvider.fromUnknown({
        RELAY_GIT_METADATA_CACHE_TTL_MS: 1_111,
        RELAY_GIT_COMMAND_TIMEOUT_MS: 2_222,
        RELAY_CODEX_STATUS_TIMEOUT_MS: 3_333
      })
    )
  );

  assert.deepEqual(config, {
    gitMetadataCacheTtlMs: 1_111,
    gitCommandTimeoutMs: 2_222,
    codexStatusTimeoutMs: 3_333,
    storageAdapter: "filesystem"
  });
});

test("storage service uses the configured filesystem adapter", async () => {
  const projectPath = await createProject();
  const ticket = await createTicket(projectPath, {
    title: "Exercise storage service",
    priority: "medium",
    labels: ["storage"],
    markdown: "# Exercise storage service\n\nRead through the configured storage adapter.",
    status: "todo"
  });

  const board = await runBackendEffect(
    Effect.provide(
      Effect.gen(function*() {
        const storage = yield* Storage;
        assert.equal(storage.adapter, "filesystem");
        return yield* storage.getBoard(projectPath);
      }),
      StorageLive.pipe(Layer.provide(Layer.succeed(BackendConfig)({ ...BackendConfigDefaults, storageAdapter: "filesystem" })))
    )
  );

  assert.equal(board.tickets.length, 1);
  assert.equal(board.tickets[0]?.id, ticket.frontMatter.id);
});

test("Codex CLI status command runs through ChildProcessSpawner", async () => {
  const captured: Array<{ command: string; args: readonly string[] }> = [];
  const output = new TextEncoder().encode("codex-cli 0.130.0\n");
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      Layer.succeed(BackendConfig)({
        ...BackendConfigDefaults,
        codexStatusTimeoutMs: 12_345
      }),
      Layer.succeed(
        ChildProcessSpawner.ChildProcessSpawner,
        ChildProcessSpawner.make(Effect.fnUntraced(function*(command) {
          if (command._tag !== "StandardCommand") throw new Error("Only standard commands are expected in this test.");
          captured.push({ command: command.command, args: command.args });
          return ChildProcessSpawner.makeHandle({
            pid: ChildProcessSpawner.ProcessId(12_345),
            stdin: Sink.drain,
            stdout: Stream.fromIterable([output]),
            stderr: Stream.empty,
            all: Stream.fromIterable([output]),
            exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
            isRunning: Effect.succeed(false),
            kill: () => Effect.void,
            getInputFd: () => Sink.drain,
            getOutputFd: () => Stream.empty,
            unref: Effect.succeed(Effect.void)
          });
        }))
      )
    )
  );

  try {
    const version = (await runtime.runPromise(runCodexVersionEffect({ source: "path", command: "codex-test" }))).trim();
    assert.equal(version, "codex-cli 0.130.0");
  } finally {
    await runtime.dispose();
  }

  assert.deepEqual(captured, [{ command: "codex-test", args: ["--version"] }]);
});

test("codex status uses the bundled CLI candidate without requiring PATH codex", async () => {
  const attempted: string[] = [];
  const status = await getCodexStatus({
    resolveCodexCli: () =>
      resolveAvailableCodexCli({
        resolveCandidates: () => [
          { source: "bundled", command: "/sdk/codex" },
          { source: "path", command: "codex" }
        ],
        runVersion: async (candidate) => {
          attempted.push(candidate.command);
          if (candidate.source === "path") throw new Error("PATH codex should not be required.");
          return "codex-cli 0.130.0\n";
        }
      })
  });

  assert.equal(status.cliAvailable, true);
  assert.equal(status.cliVersion, "codex-cli 0.130.0");
  assert.deepEqual(attempted, ["/sdk/codex"]);
});

test("codex status falls back to PATH when the bundled candidate fails", async () => {
  const attempted: string[] = [];
  const status = await getCodexStatus({
    resolveCodexCli: () =>
      resolveAvailableCodexCli({
        resolveCandidates: () => [
          { source: "bundled", command: "/sdk/codex" },
          { source: "path", command: "codex" }
        ],
        runVersion: async (candidate) => {
          attempted.push(candidate.command);
          if (candidate.source === "bundled") throw new Error("Bundled Codex failed.");
          return "codex-cli 0.130.0\n";
        }
      })
  });

  assert.equal(status.cliAvailable, true);
  assert.equal(status.cliVersion, "codex-cli 0.130.0");
  assert.deepEqual(attempted, ["/sdk/codex", "codex"]);
});

test("codex status reports unavailable when no CLI candidate works", async () => {
  const attempted: string[] = [];
  const status = await getCodexStatus({
    resolveCodexCli: () =>
      resolveAvailableCodexCli({
        resolveCandidates: () => [
          { source: "bundled", command: "/sdk/codex" },
          { source: "path", command: "codex" }
        ],
        runVersion: async (candidate) => {
          attempted.push(candidate.command);
          throw new Error(`${candidate.command} unavailable`);
        }
      })
  });

  assert.equal(status.cliAvailable, false);
  assert.equal(status.cliVersion, null);
  assert.match(status.message, /SDK bundle or on PATH/);
  assert.deepEqual(attempted, ["/sdk/codex", "codex"]);
});

test("createCodex passes the resolved CLI candidate as codexPathOverride", async () => {
  const candidates: CodexCliCandidate[] = [
    { source: "bundled", command: "/sdk/codex" },
    { source: "path", command: "codex" }
  ];
  const capturedOptions: CodexOptions[] = [];
  const client = {} as ReturnType<NonNullable<CreateCodexDependencies["createClient"]>>;

  await createCodex({
    resolveCodexCli: () =>
      resolveAvailableCodexCli({
        resolveCandidates: () => candidates,
        runVersion: async (candidate) => {
          if (candidate.source === "bundled") throw new Error("Bundled Codex failed.");
          return "codex-cli 0.130.0\n";
        }
      }),
    createEnv: () => ({ PATH: "/test/bin" }),
    createClient: (options) => {
      capturedOptions.push(options);
      return client;
    }
  });

  const options = capturedOptions[0];
  assert.ok(options);
  assert.equal(options.codexPathOverride, "codex");
  assert.deepEqual(options.env, { PATH: "/test/bin" });
});

test("automated ticket status transitions reuse ticket storage and append audit events", async () => {
  const projectPath = await createProject();
  const ticket = await createTicket(projectPath, {
    title: "Automated transition",
    priority: "medium",
    labels: ["codex"],
    markdown: "# Automated transition\n"
  });

  await transitionTicketStatus(projectPath, ticket.frontMatter.id, "in_progress", {
    actor: "codex",
    source: "agent_execution",
    runId: "run_status"
  });
  assert.equal((await readTicket(projectPath, ticket.frontMatter.id)).frontMatter.status, "in_progress");

  await transitionTicketStatus(projectPath, ticket.frontMatter.id, "completed", {
    actor: "codex",
    source: "agent_execution",
    runId: "run_status"
  });
  assert.equal((await readTicket(projectPath, ticket.frontMatter.id)).frontMatter.status, "completed");

  const events = await auditEvents(projectPath);
  assert.deepEqual(
    events.map((event) => [event.eventType, event.actor, event.source]),
    [
      ["ticket.status_changed", "codex", "agent_execution"],
      ["ticket.status_changed", "codex", "agent_execution"]
    ]
  );
});

test("manual ticket moves still work for existing columns", async () => {
  const projectPath = await createProject();
  const ticket = await createTicket(projectPath, {
    title: "Manual move",
    priority: "low",
    labels: [],
    markdown: "# Manual move\n"
  });

  const board = await moveTicket({
    projectPath,
    ticketId: ticket.frontMatter.id,
    targetStatus: "not_doing"
  });

  assert.equal(board.tickets.find((item) => item.id === ticket.frontMatter.id)?.status, "not_doing");
  assert.equal((await readTicket(projectPath, ticket.frontMatter.id)).frontMatter.status, "not_doing");
});

test("epic tickets persist ordered subticket relationships across board reloads", async () => {
  const projectPath = await createProject();
  const epic = await createTicket(projectPath, {
    title: "Epic parent",
    ticketType: "epic",
    priority: "high",
    labels: ["epic"],
    markdown: "# Epic parent\n",
    subtickets: [
      {
        title: "First child",
        priority: "medium",
        labels: ["child"],
        markdown: "# First child\n"
      },
      {
        title: "Second child",
        priority: "low",
        labels: [],
        markdown: "# Second child\n"
      }
    ]
  });

  const reloadedEpic = await readTicket(projectPath, epic.frontMatter.id);
  assert.equal(reloadedEpic.frontMatter.ticketType, "epic");
  assert.equal(reloadedEpic.frontMatter.subticketIds.length, 2);

  const [firstChildId, secondChildId] = reloadedEpic.frontMatter.subticketIds;
  const firstChild = await readTicket(projectPath, firstChildId);
  const secondChild = await readTicket(projectPath, secondChildId);
  assert.equal(firstChild.frontMatter.ticketType, "task");
  assert.equal(firstChild.frontMatter.parentEpicId, epic.frontMatter.id);
  assert.equal(secondChild.frontMatter.parentEpicId, epic.frontMatter.id);

  await transitionTicketStatus(projectPath, firstChildId, "in_progress", {
    actor: "user",
    source: "manual_board"
  });

  const board = await readBoard(projectPath);
  assert.equal(board.tickets.find((item) => item.id === epic.frontMatter.id)?.status, "todo");
  assert.equal(board.tickets.find((item) => item.id === firstChildId)?.status, "in_progress");
  assert.equal(board.tickets.find((item) => item.id === firstChildId)?.parentEpicId, epic.frontMatter.id);
  assert.deepEqual((await readTicket(projectPath, epic.frontMatter.id)).frontMatter.subticketIds, [firstChildId, secondChildId]);

  const rawEpic = await readFile(reloadedEpic.filePath, "utf8");
  const rawChild = await readFile(firstChild.filePath, "utf8");
  assert.match(rawEpic, /ticketType: epic/);
  assert.match(rawEpic, /subticketIds:/);
  assert.match(rawChild, new RegExp(`parentEpicId: ${epic.frontMatter.id}`));
});

test("epic subtickets can be created, linked, unlinked, and deleted without deleting the parent", async () => {
  const projectPath = await createProject();
  const epic = await createTicket(projectPath, {
    title: "Manual epic",
    ticketType: "epic",
    priority: "medium",
    labels: [],
    markdown: "# Manual epic\n"
  });
  const createdChild = await createSubticket({
    projectPath,
    epicId: epic.frontMatter.id,
    ticket: {
      title: "Created child",
      priority: "medium",
      labels: [],
      markdown: "# Created child\n"
    }
  });
  const looseTicket = await createTicket(projectPath, {
    title: "Loose child",
    priority: "low",
    labels: [],
    markdown: "# Loose child\n"
  });

  await linkSubticket(projectPath, epic.frontMatter.id, looseTicket.frontMatter.id);
  assert.deepEqual((await readTicket(projectPath, epic.frontMatter.id)).frontMatter.subticketIds, [
    createdChild.frontMatter.id,
    looseTicket.frontMatter.id
  ]);
  assert.equal((await readTicket(projectPath, looseTicket.frontMatter.id)).frontMatter.parentEpicId, epic.frontMatter.id);

  await unlinkSubticket(projectPath, epic.frontMatter.id, looseTicket.frontMatter.id);
  assert.equal((await readTicket(projectPath, looseTicket.frontMatter.id)).frontMatter.parentEpicId, null);
  assert.deepEqual((await readTicket(projectPath, epic.frontMatter.id)).frontMatter.subticketIds, [createdChild.frontMatter.id]);

  await deleteTicket(projectPath, createdChild.frontMatter.id);
  const board = await readBoard(projectPath);
  assert.ok(board.tickets.some((item) => item.id === epic.frontMatter.id));
  assert.ok(!board.tickets.some((item) => item.id === createdChild.frontMatter.id));
  assert.deepEqual((await readTicket(projectPath, epic.frontMatter.id)).frontMatter.subticketIds, []);

  const nestedEpic = await createTicket(projectPath, {
    title: "Nested candidate",
    ticketType: "epic",
    priority: "medium",
    labels: [],
    markdown: "# Nested candidate\n"
  });
  await assert.rejects(linkSubticket(projectPath, epic.frontMatter.id, nestedEpic.frontMatter.id), /Nested epics are not supported/);
  await assert.rejects(linkSubticket(projectPath, epic.frontMatter.id, epic.frontMatter.id), /itself/);
});

test("legacy tickets without epic metadata load as task tickets", async () => {
  const projectPath = await createProject();
  const now = new Date().toISOString();
  await writeFile(
    path.join(projectPath, ".relay", "tickets", "tkt_legacy.md"),
    `---
schemaVersion: 1
id: tkt_legacy
title: Legacy task
status: todo
position: 1000
priority: medium
labels: []
createdAt: ${now}
updatedAt: ${now}
codexThreadId:
runStatus: idle
lastRunId:
---
# Legacy task
`,
    "utf8"
  );

  const board = await readBoard(projectPath);
  const legacy = board.tickets.find((ticket) => ticket.id === "tkt_legacy");

  assert.ok(legacy);
  assert.equal(legacy.ticketType, "task");
  assert.equal(legacy.parentEpicId, null);
  assert.deepEqual(legacy.subticketIds, []);
  assert.deepEqual(legacy.blockedByIds, []);
});

test("ticket blocker metadata persists and rejects direct self blockers", async () => {
  const projectPath = await createProject();
  const blocker = await createTicket(projectPath, {
    title: "Blocker ticket",
    priority: "medium",
    labels: [],
    markdown: "# Blocker ticket\n"
  });
  const blocked = await createTicket(projectPath, {
    title: "Blocked ticket",
    priority: "medium",
    labels: [],
    markdown: "# Blocked ticket\n",
    blockedByIds: [blocker.frontMatter.id]
  });

  const reloaded = await readTicket(projectPath, blocked.frontMatter.id);
  assert.deepEqual(reloaded.frontMatter.blockedByIds, [blocker.frontMatter.id]);
  assert.equal((await readBoard(projectPath)).tickets.find((ticket) => ticket.id === blocked.frontMatter.id)?.blockedByIds[0], blocker.frontMatter.id);

  await assert.rejects(
    writeTicket(projectPath, {
      ...reloaded,
      frontMatter: {
        ...reloaded.frontMatter,
        blockedByIds: [reloaded.frontMatter.id]
      }
    }),
    /cannot block itself/
  );
});

test("codex preflight blocks active blockers and allows terminal blockers", async () => {
  const projectPath = await createProject();
  await allowNonGitRuns(projectPath);
  const config = await readProjectConfig(projectPath);
  await writeProjectConfig(projectPath, {
    ...config,
    columns: [
      ...config.columns,
      {
        id: "blocked_done",
        name: "Blocked Done",
        position: 7000,
        terminal: true
      }
    ]
  });
  const blocker = await createTicket(projectPath, {
    title: "Finish first",
    priority: "high",
    labels: [],
    markdown: "# Finish first\n"
  });
  const blocked = await createTicket(projectPath, {
    title: "Wait for blocker",
    priority: "medium",
    labels: [],
    markdown: "# Wait for blocker\n",
    blockedByIds: [blocker.frontMatter.id]
  });

  const blockedPreflight = await preflightCodexRun({ projectPath, ticketId: blocked.frontMatter.id });
  assert.equal(blockedPreflight.ok, false);
  assert.match(blockedPreflight.errors.join(" "), /Blocked by active blocker/);
  assert.match(blockedPreflight.errors.join(" "), /Finish first/);
  assert.match(blockedPreflight.errors.join(" "), /Todo/);

  await moveTicket({ projectPath, ticketId: blocker.frontMatter.id, targetStatus: "blocked_done" });
  const unblockedPreflight = await preflightCodexRun({ projectPath, ticketId: blocked.frontMatter.id });
  assert.equal(unblockedPreflight.ok, true);
});

test("missing blocker references warn without crashing board or preflight", async () => {
  const projectPath = await createProject();
  await allowNonGitRuns(projectPath);
  const ticket = await createTicket(projectPath, {
    title: "Stale blocker",
    priority: "medium",
    labels: [],
    markdown: "# Stale blocker\n",
    blockedByIds: ["tkt_missing_blocker"]
  });

  const board = await readBoard(projectPath);
  assert.equal(board.tickets.find((item) => item.id === ticket.frontMatter.id)?.blockedByIds[0], "tkt_missing_blocker");

  const preflight = await preflightCodexRun({ projectPath, ticketId: ticket.frontMatter.id });
  assert.equal(preflight.ok, true);
  assert.match(preflight.warnings.join(" "), /Missing blocker reference/);
});

test("project summaries include ordered swimlane counts and active runs including empty lanes", async () => {
  const projectPath = await createProject();
  const firstTicket = await createTicket(projectPath, {
    title: "Todo ticket",
    priority: "medium",
    labels: [],
    markdown: "# Todo ticket\n"
  });
  await createTicket(projectPath, {
    title: "Second todo ticket",
    priority: "low",
    labels: [],
    markdown: "# Second todo ticket\n"
  });

  await moveTicket({
    projectPath,
    ticketId: firstTicket.frontMatter.id,
    targetStatus: "in_progress"
  });
  const runningTicket = await readTicket(projectPath, firstTicket.frontMatter.id);
  await writeTicket(projectPath, {
    ...runningTicket,
    frontMatter: {
      ...runningTicket.frontMatter,
      runStatus: "running"
    }
  });

  const summary = await summarizeProject(projectPath);

  assert.deepEqual(
    summary.swimlanes.map((swimlane) => [swimlane.id, swimlane.ticketCount, swimlane.activeRunCount]),
    [
      ["todo", 1, 0],
      ["ready", 0, 0],
      ["in_progress", 1, 1],
      ["needs_clarification", 0, 0],
      ["review", 0, 0],
      ["not_doing", 0, 0],
      ["completed", 0, 0]
    ]
  );
});

test("new projects include Ready between Todo and In Progress", async () => {
  const projectPath = await createProject();
  const config = await readProjectConfig(projectPath);

  assert.deepEqual(
    config.columns.map((column) => column.id),
    ["todo", "ready", "in_progress", "needs_clarification", "review", "not_doing", "completed"]
  );
  assert.equal(config.settings.defaultModelReasoningEffort, null);
  assert.equal(config.settings.defaultTicketEffort, "medium");
  assert.equal(config.settings.codexNetworkAccessEnabled, false);
  assert.equal(config.settings.codexWebSearchMode, "disabled");
  assert.deepEqual(config.settings.codexAdditionalDirectories, []);
  assert.equal(config.settings.agentConcurrency, 1);
});

test("ticket effort defaults from project settings and can be overridden per ticket", async () => {
  const projectPath = await createProject();
  const config = await readProjectConfig(projectPath);
  await writeProjectConfig(projectPath, {
    ...config,
    settings: {
      ...config.settings,
      defaultTicketEffort: "high"
    }
  });

  const defaulted = await createTicket(projectPath, {
    title: "Default effort ticket",
    priority: "medium",
    labels: [],
    markdown: "# Default effort ticket\n"
  });
  const overridden = await createTicket(projectPath, {
    title: "Override effort ticket",
    priority: "medium",
    effort: "xhigh",
    labels: [],
    markdown: "# Override effort ticket\n"
  });

  assert.equal(defaulted.frontMatter.effort, "high");
  assert.equal(overridden.frontMatter.effort, "xhigh");
});

test("ticket image attachments save under project attachments with unique sanitized Markdown paths", async () => {
  const projectPath = await createProject();
  const first = await saveTicketAttachment({
    projectPath,
    fileName: "../../Screenshot 1.PNG",
    mimeType: "image/png",
    contentBase64: Buffer.from("first image").toString("base64")
  });
  const second = await saveTicketAttachment({
    projectPath,
    fileName: "../../Screenshot 1.PNG",
    mimeType: "image/png",
    contentBase64: Buffer.from("second image").toString("base64")
  });

  assert.notEqual(first.markdownPath, second.markdownPath);
  assert.match(first.markdownPath, /^\.relay\/attachments\/Screenshot-1-att_[a-z0-9]+\.png$/);
  assert.equal(path.isAbsolute(first.markdownPath), false);
  assert.equal(first.markdownPath.includes(".."), false);
  assert.equal(first.absolutePath, path.join(projectPath, first.markdownPath));
  assert.equal(await readFile(first.absolutePath, "utf8"), "first image");
  assert.equal(await readFile(second.absolutePath, "utf8"), "second image");
});

test("ticket image attachments reject unsupported dropped files", async () => {
  const projectPath = await createProject();

  await assert.rejects(
    saveTicketAttachment({
      projectPath,
      fileName: "notes.txt",
      mimeType: "text/plain",
      contentBase64: Buffer.from("not an image").toString("base64")
    }),
    /Only image attachments/
  );
});

test("legacy project configs are normalized with ready and review lanes without rewriting the file", async () => {
  const projectPath = await createProject();
  const config = await readProjectConfig(projectPath);
  const legacyConfig = {
    ...config,
    columns: config.columns.filter((column) => column.id !== "ready" && column.id !== "review")
  };
  await writeFile(path.join(projectPath, ".relay", "project.json"), JSON.stringify(legacyConfig, null, 2));

  const normalized = await readProjectConfig(projectPath);
  assert.deepEqual(
    normalized.columns.map((column) => column.id),
    ["todo", "ready", "in_progress", "needs_clarification", "review", "not_doing", "completed"]
  );
  assert.equal(normalized.settings.defaultModelReasoningEffort, null);
  assert.equal(normalized.settings.defaultTicketEffort, "medium");
  assert.equal(normalized.settings.codexNetworkAccessEnabled, false);
  assert.equal(normalized.settings.codexWebSearchMode, "disabled");
  assert.deepEqual(normalized.settings.codexAdditionalDirectories, []);
  assert.equal(normalized.settings.agentConcurrency, 1);

  const raw = await readFile(path.join(projectPath, ".relay", "project.json"), "utf8");
  assert.doesNotMatch(raw, /"id": "ready"/);
  assert.doesNotMatch(raw, /"id": "review"/);
});

test("ticket reads stay scoped to the requested project after switching projects", async () => {
  const firstProject = await createProject();
  const secondProject = await createProject();
  const firstTicket = await createTicket(firstProject, {
    title: "First project ticket",
    priority: "medium",
    labels: [],
    markdown: "# First project ticket\n"
  });
  const secondTicket = await createTicket(secondProject, {
    title: "Second project ticket",
    priority: "medium",
    labels: [],
    markdown: "# Second project ticket\n"
  });

  assert.equal((await readTicket(firstProject, firstTicket.frontMatter.id)).filePath, path.join(firstProject, ".relay", "tickets", `${firstTicket.frontMatter.id}.md`));

  await assert.rejects(
    readTicket(secondProject, firstTicket.frontMatter.id),
    (error) => {
      assert.equal(isTicketNotFoundError(error), true);
      if (isTicketNotFoundError(error)) {
        assert.equal(error.projectPath, secondProject);
        assert.equal(error.ticketId, firstTicket.frontMatter.id);
        assert.match(error.message, new RegExp(secondProject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
      return true;
    }
  );

  const scopedRecord = await readTicket(secondProject, secondTicket.frontMatter.id);
  assert.equal(scopedRecord.frontMatter.title, "Second project ticket");
  assert.equal(scopedRecord.filePath, path.join(secondProject, ".relay", "tickets", `${secondTicket.frontMatter.id}.md`));
});

test("ticket reference candidates expose local display paths and sibling-relative links", async () => {
  const projectPath = await createProject();
  const todoTicket = await createTicket(projectPath, {
    title: "Referenceable todo",
    priority: "medium",
    labels: [],
    markdown: "# Referenceable todo\n"
  });
  const completedTicket = await createTicket(projectPath, {
    title: "Completed reference",
    priority: "low",
    labels: [],
    markdown: "# Completed reference\n"
  });
  await moveTicket({
    projectPath,
    ticketId: completedTicket.frontMatter.id,
    targetStatus: "completed"
  });

  const references = await listTicketReferenceCandidates(projectPath);

  assert.deepEqual(
    references.map((reference) => ({
      id: reference.id,
      title: reference.title,
      columnName: reference.columnName,
      relativePath: reference.relativePath,
      linkPath: reference.linkPath
    })),
    [
      {
        id: todoTicket.frontMatter.id,
        title: "Referenceable todo",
        columnName: "Todo",
        relativePath: `.relay/tickets/${todoTicket.frontMatter.id}.md`,
        linkPath: `./${todoTicket.frontMatter.id}.md`
      },
      {
        id: completedTicket.frontMatter.id,
        title: "Completed reference",
        columnName: "Completed",
        relativePath: `.relay/tickets/${completedTicket.frontMatter.id}.md`,
        linkPath: `./${completedTicket.frontMatter.id}.md`
      }
    ]
  );
});

test("codex runs preserve the selected project context after a cross-project switch", async () => {
  const firstProject = await createProject();
  const secondProject = await createProject();
  await allowNonGitRuns(secondProject);
  const firstTicket = await createTicket(firstProject, {
    title: "Stale first project ticket",
    priority: "medium",
    labels: [],
    markdown: "# Stale first project ticket\n\nThis content must not be used.\n"
  });
  const secondTicket = await createTicket(secondProject, {
    title: "Active second project ticket",
    priority: "medium",
    labels: [],
    markdown: "# Active second project ticket\n\nRun this ticket only.\n"
  });
  const { runEventSink, events } = createFakeRunEventSink();
  let capturedPrompt = "";
  let capturedWorkingDirectory = "";
  const dependencies: CodexRunDependencies = {
    runEventSink,
    createRunId: () => "run_project_scope",
    createCodexClient: () =>
      ({
        startThread: (options: { workingDirectory?: string }) => {
          capturedWorkingDirectory = options.workingDirectory ?? "";
          return {
            id: "thread_project_scope",
            runStreamed: async (prompt: string) => {
              capturedPrompt = prompt;
              return {
                events: (async function* () {
                  yield { type: "thread.started", thread_id: "thread_project_scope" };
                  yield { type: "turn.completed", usage: { total_tokens: 1 } };
                })()
              };
            }
          };
        },
        resumeThread: () => {
          throw new Error("resumeThread should not be used for a fresh run.");
        }
      }) as CodexRunDependencies["createCodexClient"] extends () => infer Client ? Client : never
  };

  await startCodexRun({ projectPath: secondProject, ticketId: secondTicket.frontMatter.id }, dependencies);
  await waitFor(() => events.some((event) => event.type === "run.completed"), "run completion");

  assert.equal(capturedWorkingDirectory, secondProject);
  assert.match(capturedPrompt, /Active second project ticket/);
  assert.doesNotMatch(capturedPrompt, /Stale first project ticket/);
  assert.match(capturedPrompt, /Subagent guidance:/);
  assert.match(capturedPrompt, /Use subagents only when available and useful/);
  assert.match(capturedPrompt, /independent sidecar tasks/);
  assert.match(capturedPrompt, /blocking critical-path work local/);
  assert.match(capturedPrompt, /disjoint file or module ownership/);
  assert.match(capturedPrompt, /Subagent usage: which subagents were launched/);
  assert.match(capturedPrompt, /none used/);
  assert.equal(events.every((event) => event.projectPath === secondProject && event.ticketId === secondTicket.frontMatter.id), true);
  const completedRunTicket = await readTicket(secondProject, secondTicket.frontMatter.id);
  assert.equal(completedRunTicket.frontMatter.runStatus, "completed");
  assert.equal(completedRunTicket.frontMatter.status, "review");
  await access(path.join(secondProject, ".relay", "runs", secondTicket.frontMatter.id, "run_project_scope.jsonl"));
  await assert.rejects(access(path.join(firstProject, ".relay", "runs", firstTicket.frontMatter.id, "run_project_scope.jsonl")));
});

test("codex implementation runs pass local Markdown images as structured SDK input", async () => {
  const projectPath = await createProject();
  await allowNonGitRuns(projectPath);
  await writeFile(path.join(projectPath, ".relay", "attachments", "ui.png"), "png");
  await writeFile(path.join(projectPath, "diagram.jpg"), "jpg");
  const ticket = await createTicket(projectPath, {
    title: "Local image ticket",
    priority: "medium",
    labels: [],
    markdown:
      "# Local image ticket\n\n![screenshot](.relay/attachments/ui.png)\n![duplicate](.relay/attachments/ui.png)\n![diagram](diagram.jpg)\n"
  });
  const { runEventSink, events } = createFakeRunEventSink();
  let capturedInput: Input | null = null;
  const dependencies: CodexRunDependencies = {
    runEventSink,
    createRunId: () => "run_local_images",
    createCodexClient: () =>
      ({
        startThread: () => ({
          id: "thread_local_images",
          runStreamed: async (input: Input) => {
            capturedInput = input;
            return {
              events: (async function*() {
                yield { type: "thread.started", thread_id: "thread_local_images" };
                yield { type: "turn.completed", usage: { total_tokens: 1 } };
              })()
            };
          }
        }),
        resumeThread: () => {
          throw new Error("resumeThread should not be used for a fresh run.");
        }
      }) as CodexRunDependencies["createCodexClient"] extends () => infer Client ? Client : never
  };

  await startCodexRun({ projectPath, ticketId: ticket.frontMatter.id }, dependencies);
  await waitFor(() => events.some((event) => event.type === "run.completed"), "local image run completion");

  assert.ok(Array.isArray(capturedInput));
  const inputItems = capturedInput as Exclude<Input, string>;
  assert.equal(inputItems[0]?.type, "text");
  assert.match(inputItems[0]?.type === "text" ? inputItems[0].text : "", /Local image ticket/);
  assert.deepEqual(inputItems.slice(1), [
    { type: "local_image", path: path.join(projectPath, ".relay", "attachments", "ui.png") },
    { type: "local_image", path: path.join(projectPath, "diagram.jpg") }
  ]);
});

test("codex implementation runs ignore unsafe or remote Markdown image references", async () => {
  const projectPath = await createProject();
  await allowNonGitRuns(projectPath);
  const ticket = await createTicket(projectPath, {
    title: "Ignored image ticket",
    priority: "medium",
    labels: [],
    markdown:
      "# Ignored image ticket\n\n![remote](https://example.com/ui.png)\n![data](data:image/png;base64,abc)\n![fragment](#preview)\n![outside](../outside.png)\n"
  });
  const { runEventSink, events } = createFakeRunEventSink();
  let capturedInput: Input | null = null;
  const dependencies: CodexRunDependencies = {
    runEventSink,
    createRunId: () => "run_ignored_images",
    createCodexClient: () =>
      ({
        startThread: () => ({
          id: "thread_ignored_images",
          runStreamed: async (input: Input) => {
            capturedInput = input;
            return {
              events: (async function*() {
                yield { type: "thread.started", thread_id: "thread_ignored_images" };
                yield { type: "turn.completed", usage: { total_tokens: 1 } };
              })()
            };
          }
        }),
        resumeThread: () => {
          throw new Error("resumeThread should not be used for a fresh run.");
        }
      }) as CodexRunDependencies["createCodexClient"] extends () => infer Client ? Client : never
  };

  await startCodexRun({ projectPath, ticketId: ticket.frontMatter.id }, dependencies);
  await waitFor(() => events.some((event) => event.type === "run.completed"), "ignored image run completion");

  if (typeof capturedInput !== "string") assert.fail("Expected invalid image references to preserve string input.");
  assert.match(capturedInput, /Ignored image ticket/);
});

test("codex implementation runs keep string input when no local images are found", async () => {
  const projectPath = await createProject();
  await allowNonGitRuns(projectPath);
  const ticket = await createTicket(projectPath, {
    title: "Plain text ticket",
    priority: "medium",
    labels: [],
    markdown: "# Plain text ticket\n\nNo screenshots here.\n"
  });
  const { runEventSink, events } = createFakeRunEventSink();
  let capturedInput: Input | null = null;
  const dependencies: CodexRunDependencies = {
    runEventSink,
    createRunId: () => "run_plain_string_input",
    createCodexClient: () =>
      ({
        startThread: () => ({
          id: "thread_plain_string_input",
          runStreamed: async (input: Input) => {
            capturedInput = input;
            return {
              events: (async function*() {
                yield { type: "thread.started", thread_id: "thread_plain_string_input" };
                yield { type: "turn.completed", usage: { total_tokens: 1 } };
              })()
            };
          }
        }),
        resumeThread: () => {
          throw new Error("resumeThread should not be used for a fresh run.");
        }
      }) as CodexRunDependencies["createCodexClient"] extends () => infer Client ? Client : never
  };

  await startCodexRun({ projectPath, ticketId: ticket.frontMatter.id }, dependencies);
  await waitFor(() => events.some((event) => event.type === "run.completed"), "plain string input run completion");

  if (typeof capturedInput !== "string") assert.fail("Expected tickets without local images to preserve string input.");
  assert.match(capturedInput, /Plain text ticket/);
});

test("codex implementation runs pass configured SDK thread options", async () => {
  const projectPath = await createProject();
  const additionalDirectory = path.join(projectPath, "external-worktree");
  const config = await readProjectConfig(projectPath);
  await writeProjectConfig(projectPath, {
    ...config,
    settings: {
      ...config.settings,
      defaultModel: "gpt-5.4",
      defaultModelReasoningEffort: "high",
      defaultTicketEffort: "xhigh",
      defaultApprovalPolicy: "on-failure",
      allowNonGitCodexRuns: true,
      codexNetworkAccessEnabled: true,
      codexWebSearchMode: "live",
      codexAdditionalDirectories: [additionalDirectory]
    }
  });
  const ticket = await createTicket(projectPath, {
    title: "Configured SDK options",
    priority: "medium",
    effort: "low",
    labels: ["codex"],
    markdown: "# Configured SDK options\n"
  });
  const { runEventSink, events } = createFakeRunEventSink();
  const capturedOptions: ThreadOptions[] = [];
  const dependencies: CodexRunDependencies = {
    runEventSink,
    createRunId: () => "run_configured_sdk_options",
    createCodexClient: () =>
      ({
        startThread: (options: ThreadOptions) => {
          capturedOptions.push(options);
          return {
            id: "thread_configured_sdk_options",
            runStreamed: async () => ({
              events: (async function*() {
                yield { type: "thread.started", thread_id: "thread_configured_sdk_options" };
                yield { type: "turn.completed", usage: { total_tokens: 1 } };
              })()
            })
          };
        },
        resumeThread: () => {
          throw new Error("resumeThread should not be used for a fresh run.");
        }
      }) as CodexRunDependencies["createCodexClient"] extends () => infer Client ? Client : never
  };

  await startCodexRun({ projectPath, ticketId: ticket.frontMatter.id }, dependencies);
  await waitFor(() => events.some((event) => event.type === "run.completed"), "configured SDK options run completion");

  const options = capturedOptions[0];
  assert.ok(options);
  assert.equal(options.workingDirectory, projectPath);
  assert.equal(options.model, "gpt-5.4");
  assert.equal(ticket.frontMatter.effort, "low");
  assert.equal(options.modelReasoningEffort, "low");
  assert.equal(options.approvalPolicy, "on-failure");
  assert.equal(options.sandboxMode, "workspace-write");
  assert.equal(options.skipGitRepoCheck, true);
  assert.equal(options.networkAccessEnabled, true);
  assert.equal(options.webSearchMode, "live");
  assert.deepEqual(options.additionalDirectories, [additionalDirectory]);
});

test("successful codex runs move to review before human acceptance", async () => {
  const projectPath = await createProject();
  await allowNonGitRuns(projectPath);
  const ticket = await createTicket(projectPath, {
    title: "Review gate",
    priority: "medium",
    labels: ["codex"],
    markdown: "# Review gate\n"
  });
  const { runEventSink, events } = createFakeRunEventSink();
  const dependencies: CodexRunDependencies = {
    runEventSink,
    createRunId: () => "run_review_gate",
    createCodexClient: () =>
      ({
        startThread: () => ({
          id: "thread_review_gate",
          runStreamed: async () => ({
            events: (async function*() {
              yield { type: "thread.started", thread_id: "thread_review_gate" };
              yield { type: "item.completed", item: { type: "agent_message", text: "Ready for review." } };
              yield { type: "turn.completed", usage: { total_tokens: 1 } };
            })()
          })
        }),
        resumeThread: () => {
          throw new Error("resumeThread should not be used for a fresh run.");
        }
      }) as CodexRunDependencies["createCodexClient"] extends () => infer Client ? Client : never
  };

  await startCodexRun({ projectPath, ticketId: ticket.frontMatter.id }, dependencies);
  await waitFor(() => events.some((event) => event.type === "run.completed"), "review-gated completion");

  const readyForReview = await readTicket(projectPath, ticket.frontMatter.id);
  assert.equal(readyForReview.frontMatter.runStatus, "completed");
  assert.equal(readyForReview.frontMatter.status, "review");

  await moveTicket({ projectPath, ticketId: ticket.frontMatter.id, targetStatus: "completed" });
  assert.equal((await readTicket(projectPath, ticket.frontMatter.id)).frontMatter.status, "completed");
});

test("codex runs persist structured todo and MCP tool-call SDK events", async () => {
  const projectPath = await createProject();
  await allowNonGitRuns(projectPath);
  const ticket = await createTicket(projectPath, {
    title: "Structured SDK events",
    priority: "medium",
    labels: ["codex"],
    markdown: "# Structured SDK events\n"
  });
  const { runEventSink, events } = createFakeRunEventSink();
  const dependencies: CodexRunDependencies = {
    runEventSink,
    createRunId: () => "run_structured_sdk_events",
    createCodexClient: () =>
      ({
        startThread: () => ({
          id: "thread_structured_sdk_events",
          runStreamed: async () => ({
            events: (async function*() {
              yield { type: "thread.started", thread_id: "thread_structured_sdk_events" };
              yield {
                type: "item.started",
                item: {
                  id: "todo_structured",
                  type: "todo_list",
                  items: [
                    { text: "Inspect SDK stream", completed: false },
                    { text: "Persist structured events", completed: false }
                  ]
                }
              };
              yield {
                type: "item.updated",
                item: {
                  id: "todo_structured",
                  type: "todo_list",
                  items: [
                    { text: "Inspect SDK stream", completed: true },
                    { text: "Persist structured events", completed: false }
                  ]
                }
              };
              yield {
                type: "item.started",
                item: {
                  id: "mcp_structured",
                  type: "mcp_tool_call",
                  server: "github",
                  tool: "search",
                  arguments: { query: "Relay SDK events" },
                  status: "in_progress"
                }
              };
              yield {
                type: "item.completed",
                item: {
                  id: "mcp_structured",
                  type: "mcp_tool_call",
                  server: "github",
                  tool: "search",
                  arguments: { query: "Relay SDK events" },
                  result: { content: [{ type: "text", text: "large result" }], structured_content: { matches: [1, 2, 3] } },
                  status: "completed"
                }
              };
              yield {
                type: "item.completed",
                item: {
                  id: "mcp_failed",
                  type: "mcp_tool_call",
                  server: "filesystem",
                  tool: "read_file",
                  arguments: { path: "/tmp/missing" },
                  error: { message: "File not found." },
                  status: "failed"
                }
              };
              yield { type: "turn.completed", usage: { total_tokens: 1 } };
            })()
          })
        }),
        resumeThread: () => {
          throw new Error("resumeThread should not be used for a fresh run.");
        }
      }) as CodexRunDependencies["createCodexClient"] extends () => infer Client ? Client : never
  };

  await startCodexRun({ projectPath, ticketId: ticket.frontMatter.id }, dependencies);
  await waitFor(() => events.some((event) => event.type === "run.completed"), "structured SDK event run completion");

  const emittedTodoEvents = events.filter(
    (event): event is Extract<RendererRunEvent, { type: "todo.updated" }> => event.type === "todo.updated"
  );
  assert.equal(emittedTodoEvents.length, 2);
  assert.deepEqual(emittedTodoEvents.at(-1)?.items, [
    { text: "Inspect SDK stream", completed: true },
    { text: "Persist structured events", completed: false }
  ]);

  const emittedMcpEvents = events.filter(
    (event): event is Extract<RendererRunEvent, { type: "mcp.tool_call" }> => event.type === "mcp.tool_call"
  );
  assert.deepEqual(
    emittedMcpEvents.map((event) => [event.server, event.tool, event.status, event.error ?? null]),
    [
      ["github", "search", "in_progress", null],
      ["github", "search", "completed", null],
      ["filesystem", "read_file", "failed", "File not found."]
    ]
  );
  assert.equal(events.some((event) => event.type === "agent.message.delta" && /github\.search/.test(event.text)), false);

  const persistedEvents = await readCodexRunEvents(projectPath, ticket.frontMatter.id, "run_structured_sdk_events");
  const persistedTodo = persistedEvents.filter(
    (event): event is Extract<RendererRunEvent, { type: "todo.updated" }> => event.type === "todo.updated"
  );
  assert.deepEqual(persistedTodo.at(-1)?.items, emittedTodoEvents.at(-1)?.items);

  const persistedMcp = persistedEvents.filter(
    (event): event is Extract<RendererRunEvent, { type: "mcp.tool_call" }> => event.type === "mcp.tool_call"
  );
  const completedMcp = persistedMcp.find((event) => event.status === "completed");
  const failedMcp = persistedMcp.find((event) => event.status === "failed");
  assert.ok(completedMcp);
  assert.ok(failedMcp);
  assert.equal(completedMcp.server, "github");
  assert.equal(completedMcp.tool, "search");
  assert.equal("arguments" in completedMcp, false);
  assert.equal("result" in completedMcp, false);
  assert.equal(failedMcp.error, "File not found.");
});

test("codex scheduler runs Ready queue one implementation at a time in board order", async () => {
  const projectPath = await createProject();
  const config = await readProjectConfig(projectPath);
  await writeProjectConfig(projectPath, {
    ...config,
    settings: {
      ...config.settings,
      allowNonGitCodexRuns: true,
      agentConcurrency: 2
    }
  });
  const firstTicket = await createTicket(projectPath, {
    title: "First queued run",
    priority: "medium",
    labels: ["codex"],
    markdown: "# First queued run\n"
  });
  const secondTicket = await createTicket(projectPath, {
    title: "Second queued run",
    priority: "medium",
    labels: ["codex"],
    markdown: "# Second queued run\n"
  });
  const { runEventSink, events } = createFakeRunEventSink();
  const gates = [deferred(), deferred()];
  const startedThreads: string[] = [];
  const runIds = ["run_scheduler_first", "run_scheduler_second"];
  const dependencies: CodexRunDependencies = {
    runEventSink,
    createRunId: () => runIds.shift() ?? "run_scheduler_extra",
    createCodexClient: () =>
      ({
        startThread: () => {
          const index = startedThreads.length;
          const threadId = index === 0 ? "thread_scheduler_first" : "thread_scheduler_second";
          startedThreads.push(threadId);
          return {
            id: threadId,
            runStreamed: async () => ({
              events: (async function*() {
                yield { type: "thread.started", thread_id: threadId };
                await gates[index].promise;
                yield { type: "item.completed", item: { type: "agent_message", text: `Done ${index + 1}.` } };
                yield { type: "turn.completed", usage: { total_tokens: index + 1 } };
              })()
            })
          };
        },
        resumeThread: () => {
          throw new Error("resumeThread should not be used for a fresh run.");
        }
      }) as CodexRunDependencies["createCodexClient"] extends () => infer Client ? Client : never
  };

  const firstResult = await startCodexRun({ projectPath, ticketId: firstTicket.frontMatter.id }, dependencies);
  const secondResult = await startCodexRun({ projectPath, ticketId: secondTicket.frontMatter.id }, dependencies);

  assert.equal(firstResult.state, "queued");
  assert.equal(secondResult.state, "queued");
  await waitFor(() => startedThreads.length === 1, "first queued run to start");
  assert.deepEqual(startedThreads, ["thread_scheduler_first"]);
  await waitForAsync(async () => {
    const current = await readTicket(projectPath, firstTicket.frontMatter.id);
    return current.frontMatter.runStatus === "running" && current.frontMatter.status === "in_progress";
  }, "first run marked running in progress");
  const runningFirst = await readTicket(projectPath, firstTicket.frontMatter.id);
  assert.equal(runningFirst.frontMatter.runStatus, "running");
  assert.equal(runningFirst.frontMatter.status, "in_progress");
  assert.equal(typeof runningFirst.frontMatter.lastRunStartedAt, "string");
  assert.equal(Number.isNaN(Date.parse(runningFirst.frontMatter.lastRunStartedAt ?? "")), false);
  const queuedSecond = await readTicket(projectPath, secondTicket.frontMatter.id);
  assert.equal(queuedSecond.frontMatter.status, "ready");
  assert.equal(queuedSecond.frontMatter.runStatus, "queued");
  assert.equal(queuedSecond.frontMatter.lastRunStartedAt, null);

  const duplicatePreflight = await preflightCodexRun({ projectPath, ticketId: secondTicket.frontMatter.id });
  assert.equal(duplicatePreflight.ok, false);
  assert.match(duplicatePreflight.errors.join(" "), /already queued/);

  gates[0].resolve();
  await waitFor(() => startedThreads.length === 2, "second queued run to start after first completion");
  assert.deepEqual(startedThreads, ["thread_scheduler_first", "thread_scheduler_second"]);
  await waitForAsync(async () => (await readTicket(projectPath, secondTicket.frontMatter.id)).frontMatter.runStatus === "running", "second run marked running");
  const runningSecond = await readTicket(projectPath, secondTicket.frontMatter.id);
  assert.equal(Number.isNaN(Date.parse(runningSecond.frontMatter.lastRunStartedAt ?? "")), false);
  const completedFirst = await readTicket(projectPath, firstTicket.frontMatter.id);
  assert.equal(completedFirst.frontMatter.status, "review");
  assert.equal(completedFirst.frontMatter.runStatus, "completed");

  gates[1].resolve();
  await waitFor(() => events.some((event) => event.runId === "run_scheduler_second" && event.type === "run.completed"), "second run completion");
});

test("active ticket drafts do not occupy the Ready implementation worker lane", async () => {
  const projectPath = await createProject();
  await allowNonGitRuns(projectPath);
  const firstTicket = await createTicket(projectPath, {
    title: "First implementation while drafting",
    priority: "medium",
    labels: ["codex"],
    markdown: "# First implementation while drafting\n"
  });
  const secondTicket = await createTicket(projectPath, {
    title: "Second implementation while drafting",
    priority: "medium",
    labels: ["codex"],
    markdown: "# Second implementation while drafting\n"
  });
  const draftGate = deferred();
  let draftStarted = false;
  const { runEventSink: draftRunEventSink } = createFakeRunEventSink();
  const draftDependencies: TicketDraftStartDependencies = {
    getStatus: async () => ({
      sdkAvailable: true,
      cliAvailable: true,
      cliVersion: "codex-test",
      authenticated: true,
      message: "Codex is available."
    }),
    createRunId: () => "run_scheduler_draft",
    createRequestId: () => "tdr_scheduler_draft",
    runEventSink: draftRunEventSink,
    createCodexClient: () => ({
      startThread: () => ({
        run: async () => {
          draftStarted = true;
          await draftGate.promise;
          return { items: [], usage: null, finalResponse: validDraftJson("Completed scheduler draft") };
        }
      })
    })
  };
  const draft = await startTicketDraftRun({ projectPath, idea: "Draft a ticket while implementations run" }, draftDependencies);
  await waitFor(() => draftStarted, "draft request to start");

  const { runEventSink, events } = createFakeRunEventSink();
  const gates = [deferred(), deferred()];
  const startedThreads: string[] = [];
  const runIds = ["run_scheduler_draft_lane_first", "run_scheduler_draft_lane_second"];
  const implementationDependencies: CodexRunDependencies = {
    runEventSink,
    createRunId: () => runIds.shift() ?? "run_scheduler_draft_lane_extra",
    createCodexClient: () =>
      ({
        startThread: () => {
          const index = startedThreads.length;
          const threadId = index === 0 ? "thread_scheduler_draft_lane_first" : "thread_scheduler_draft_lane_second";
          startedThreads.push(threadId);
          return {
            id: threadId,
            runStreamed: async () => ({
              events: (async function*() {
                yield { type: "thread.started", thread_id: threadId };
                await gates[index].promise;
                yield { type: "item.completed", item: { type: "agent_message", text: `Draft lane done ${index + 1}.` } };
                yield { type: "turn.completed", usage: { total_tokens: index + 1 } };
              })()
            })
          };
        },
        resumeThread: () => {
          throw new Error("resumeThread should not be used for a fresh run.");
        }
      }) as CodexRunDependencies["createCodexClient"] extends () => infer Client ? Client : never
  };

  const firstResult = await startCodexRun({ projectPath, ticketId: firstTicket.frontMatter.id }, implementationDependencies);
  const secondResult = await startCodexRun({ projectPath, ticketId: secondTicket.frontMatter.id }, implementationDependencies);

  assert.equal(firstResult.state, "queued");
  assert.equal(secondResult.state, "queued");
  await waitFor(() => startedThreads.length === 1, "first implementation to start while draft is active");
  assert.deepEqual(startedThreads, ["thread_scheduler_draft_lane_first"]);
  const runningDraft = await readTicket(projectPath, draft.ticket.frontMatter.id);
  assert.equal(runningDraft.frontMatter.runStatus, "drafting");
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(startedThreads, ["thread_scheduler_draft_lane_first"]);
  const queuedSecond = await readTicket(projectPath, secondTicket.frontMatter.id);
  assert.equal(queuedSecond.frontMatter.status, "ready");
  assert.equal(queuedSecond.frontMatter.runStatus, "queued");
  assert.equal(queuedSecond.frontMatter.lastRunStartedAt, null);

  gates[0].resolve();
  await waitFor(() => startedThreads.length === 2, "second implementation to start after first completion");
  gates[1].resolve();
  await waitFor(
    () => events.some((event) => event.runId === "run_scheduler_draft_lane_second" && event.type === "run.completed"),
    "second implementation completion"
  );

  draftGate.resolve();
  await waitForAsync(
    async () => (await readTicket(projectPath, draft.ticket.frontMatter.id)).frontMatter.runStatus === "draft_complete",
    "draft completion"
  );
});

test("queued codex cancellation returns the ticket to Todo without SDK startup", async () => {
  const projectPath = await createProject();
  await allowNonGitRuns(projectPath);
  const firstTicket = await createTicket(projectPath, {
    title: "Occupy scheduler",
    priority: "medium",
    labels: ["codex"],
    markdown: "# Occupy scheduler\n"
  });
  const secondTicket = await createTicket(projectPath, {
    title: "Cancel while queued",
    priority: "medium",
    labels: ["codex"],
    markdown: "# Cancel while queued\n"
  });
  const { runEventSink, events } = createFakeRunEventSink();
  const gate = deferred();
  let startedCount = 0;
  const runIds = ["run_cancel_queue_active", "run_cancel_queue_waiting"];
  const dependencies: CodexRunDependencies = {
    runEventSink,
    createRunId: () => runIds.shift() ?? "run_cancel_queue_extra",
    createCodexClient: () =>
      ({
        startThread: () => {
          startedCount += 1;
          return {
            id: `thread_cancel_queue_${startedCount}`,
            runStreamed: async () => ({
              events: (async function*() {
                yield { type: "thread.started", thread_id: `thread_cancel_queue_${startedCount}` };
                await gate.promise;
                yield { type: "turn.completed", usage: { total_tokens: 1 } };
              })()
            })
          };
        },
        resumeThread: () => {
          throw new Error("resumeThread should not be used for a fresh run.");
        }
      }) as CodexRunDependencies["createCodexClient"] extends () => infer Client ? Client : never
  };

  await startCodexRun({ projectPath, ticketId: firstTicket.frontMatter.id }, dependencies);
  const queued = await startCodexRun({ projectPath, ticketId: secondTicket.frontMatter.id }, dependencies);
  await waitFor(() => startedCount === 1, "active run to occupy scheduler");

  await cancelCodexRun(queued.runId);
  const cancelledQueued = await readTicket(projectPath, secondTicket.frontMatter.id);
  assert.equal(cancelledQueued.frontMatter.status, "todo");
  assert.equal(cancelledQueued.frontMatter.runStatus, "idle");
  assert.equal(cancelledQueued.frontMatter.lastRunId, null);

  gate.resolve();
  await waitFor(() => events.some((event) => event.runId === "run_cancel_queue_active" && event.type === "run.completed"), "active run completion");
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(startedCount, 1);
  assert.deepEqual(await readCodexRunEvents(projectPath, secondTicket.frontMatter.id, queued.runId), []);
});

test("manual Ready moves enqueue idle tickets and moving out clears queued state", async () => {
  const projectPath = await createProject();
  await allowNonGitRuns(projectPath);
  const activeTicket = await createTicket(projectPath, {
    title: "Active manual queue blocker",
    priority: "medium",
    labels: ["codex"],
    markdown: "# Active manual queue blocker\n"
  });
  const queuedTicket = await createTicket(projectPath, {
    title: "Manual queued ticket",
    priority: "medium",
    labels: ["codex"],
    markdown: "# Manual queued ticket\n"
  });
  const { runEventSink } = createFakeRunEventSink();
  const gate = deferred();
  let startedCount = 0;
  const dependencies: CodexRunDependencies = {
    runEventSink,
    createRunId: () => (startedCount === 0 ? "run_manual_active" : "run_manual_ready"),
    createCodexClient: () =>
      ({
        startThread: () => {
          startedCount += 1;
          return {
            id: `thread_manual_${startedCount}`,
            runStreamed: async () => ({
              events: (async function*() {
                yield { type: "thread.started", thread_id: `thread_manual_${startedCount}` };
                await gate.promise;
                yield { type: "turn.completed", usage: { total_tokens: 1 } };
              })()
            })
          };
        },
        resumeThread: () => {
          throw new Error("resumeThread should not be used for a fresh run.");
        }
      }) as CodexRunDependencies["createCodexClient"] extends () => infer Client ? Client : never
  };

  await startCodexRun({ projectPath, ticketId: activeTicket.frontMatter.id }, dependencies);
  await waitFor(() => startedCount === 1, "manual queue active run to start");

  await moveTicket({ projectPath, ticketId: queuedTicket.frontMatter.id, targetStatus: "ready" });
  const queued = await reconcileTicketQueueState(projectPath, queuedTicket.frontMatter.id, dependencies);
  assert.equal(queued.frontMatter.status, "ready");
  assert.equal(queued.frontMatter.runStatus, "queued");
  assert.equal(queued.frontMatter.lastRunId, "run_manual_ready");

  await moveTicket({ projectPath, ticketId: queuedTicket.frontMatter.id, targetStatus: "todo" });
  const cleared = await reconcileTicketQueueState(projectPath, queuedTicket.frontMatter.id, dependencies);
  assert.equal(cleared.frontMatter.status, "todo");
  assert.equal(cleared.frontMatter.runStatus, "idle");
  assert.equal(cleared.frontMatter.lastRunId, null);

  gate.resolve();
  await waitForAsync(async () => (await readTicket(projectPath, activeTicket.frontMatter.id)).frontMatter.runStatus === "completed", "manual active run completion");
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(startedCount, 1);
});

test("codex runs reject non-git projects until explicitly allowed", async () => {
  const projectPath = await createProject();
  const ticket = await createTicket(projectPath, {
    title: "Non git run",
    priority: "medium",
    labels: [],
    markdown: "# Non git run\n"
  });
  const { runEventSink, events } = createFakeRunEventSink();
  const dependencies: CodexRunDependencies = {
    runEventSink,
    createCodexClient: () => {
      throw new Error("Codex client should not be created for disallowed non-git runs.");
    }
  };

  const preflight = await preflightCodexRun({ projectPath, ticketId: ticket.frontMatter.id });
  assert.equal(preflight.ok, false);
  assert.match(preflight.errors.join(" "), /not a Git repository/);

  await assert.rejects(
    startCodexRun({ projectPath, ticketId: ticket.frontMatter.id }, dependencies),
    /not a Git repository/
  );

  assert.equal(events.length, 0);
  assert.equal((await readTicket(projectPath, ticket.frontMatter.id)).frontMatter.runStatus, "idle");
});

test("codex run preflight blocks invalid workflow states", async () => {
  const projectPath = await createProject();
  await allowNonGitRuns(projectPath);

  const completedTicket = await createTicket(projectPath, {
    title: "Accepted work",
    priority: "medium",
    labels: [],
    markdown: "# Accepted work\n"
  });
  await moveTicket({ projectPath, ticketId: completedTicket.frontMatter.id, targetStatus: "completed" });
  const completedPreflight = await preflightCodexRun({ projectPath, ticketId: completedTicket.frontMatter.id });
  assert.equal(completedPreflight.ok, false);
  assert.match(completedPreflight.errors.join(" "), /Completed tickets are human accepted/);

  const notDoingTicket = await createTicket(projectPath, {
    title: "Rejected work",
    priority: "medium",
    labels: [],
    markdown: "# Rejected work\n"
  });
  await moveTicket({ projectPath, ticketId: notDoingTicket.frontMatter.id, targetStatus: "not_doing" });
  const notDoingPreflight = await preflightCodexRun({ projectPath, ticketId: notDoingTicket.frontMatter.id });
  assert.equal(notDoingPreflight.ok, false);
  assert.match(notDoingPreflight.errors.join(" "), /Not Doing/);

  const epic = await createTicket(projectPath, {
    title: "Planning container",
    priority: "medium",
    labels: [],
    markdown: "# Planning container\n",
    ticketType: "epic"
  });
  const epicPreflight = await preflightCodexRun({ projectPath, ticketId: epic.frontMatter.id });
  assert.equal(epicPreflight.ok, false);
  assert.match(epicPreflight.errors.join(" "), /Epics are planning containers/);

  const clarificationTicket = await createTicket(projectPath, {
    title: "Open question",
    priority: "medium",
    labels: [],
    markdown: "# Open question\n"
  });
  await createClarificationQuestions(projectPath, clarificationTicket.frontMatter.id, [{ question: "Which API should this target?" }], {
    actor: "codex",
    source: "agent_execution",
    runId: "run_open_question",
    codexThreadId: "thread_open_question"
  });
  const clarificationPreflight = await preflightCodexRun({ projectPath, ticketId: clarificationTicket.frontMatter.id });
  assert.equal(clarificationPreflight.ok, false);
  assert.equal(clarificationPreflight.unansweredClarificationCount, 1);
  assert.match(clarificationPreflight.errors.join(" "), /clarification question/);

  const staleRunningTicket = await createTicket(projectPath, {
    title: "Stale running state",
    priority: "medium",
    labels: [],
    markdown: "# Stale running state\n"
  });
  await writeTicket(projectPath, {
    ...staleRunningTicket,
    frontMatter: {
      ...staleRunningTicket.frontMatter,
      runStatus: "running"
    }
  });
  const staleRunningPreflight = await preflightCodexRun({ projectPath, ticketId: staleRunningTicket.frontMatter.id });
  assert.equal(staleRunningPreflight.ok, false);
  assert.match(staleRunningPreflight.errors.join(" "), /already marked as running/);

  const queuedTicket = await createTicket(projectPath, {
    title: "Already queued",
    priority: "medium",
    labels: [],
    markdown: "# Already queued\n"
  });
  await writeTicket(projectPath, {
    ...queuedTicket,
    frontMatter: {
      ...queuedTicket.frontMatter,
      runStatus: "queued",
      lastRunId: "run_already_queued"
    }
  });
  const queuedPreflight = await preflightCodexRun({ projectPath, ticketId: queuedTicket.frontMatter.id });
  assert.equal(queuedPreflight.ok, false);
  assert.match(queuedPreflight.errors.join(" "), /already queued/);
});

test("codex run failures preserve failed run status and renderer-facing events", async () => {
  const projectPath = await createProject();
  await allowNonGitRuns(projectPath);
  const ticket = await createTicket(projectPath, {
    title: "Failing run",
    priority: "high",
    labels: ["codex"],
    markdown: "# Failing run\n"
  });
  const { runEventSink, events } = createFakeRunEventSink();
  const dependencies: CodexRunDependencies = {
    runEventSink,
    createRunId: () => "run_backend_failure",
    createCodexClient: () =>
      ({
        startThread: () => ({
          id: "thread_backend_failure",
          runStreamed: async () => ({
            events: (async function*() {
              yield { type: "thread.started", thread_id: "thread_backend_failure" };
              yield { type: "turn.failed", error: { message: "SDK stream failed." } };
            })()
          })
        }),
        resumeThread: () => {
          throw new Error("resumeThread should not be used for a fresh run.");
        }
      }) as CodexRunDependencies["createCodexClient"] extends () => infer Client ? Client : never
  };

  await startCodexRun({ projectPath, ticketId: ticket.frontMatter.id }, dependencies);
  await waitFor(() => events.some((event) => event.type === "run.failed"), "run failure");

  const updated = await readTicket(projectPath, ticket.frontMatter.id);
  assert.equal(updated.frontMatter.runStatus, "failed");
  assert.equal(events.some((event) => event.type === "run.failed" && event.message === "SDK stream failed."), true);

  const persistedEvents = await readCodexRunEvents(projectPath, ticket.frontMatter.id, "run_backend_failure");
  assert.equal(persistedEvents.some((event) => event.type === "run.failed" && event.message === "SDK stream failed."), true);
});

test("codex run startup failures finalize active run state", async () => {
  const projectPath = await createProject();
  await allowNonGitRuns(projectPath);
  const ticket = await createTicket(projectPath, {
    title: "Startup failure",
    priority: "high",
    labels: ["codex"],
    markdown: "# Startup failure\n"
  });
  const { runEventSink, events } = createFakeRunEventSink();
  const dependencies: CodexRunDependencies = {
    runEventSink,
    createRunId: () => "run_stream_start_failure",
    createCodexClient: () =>
      ({
        startThread: () => ({
          id: "thread_stream_start_failure",
          runStreamed: async () => {
            throw new Error("Stream could not start.");
          }
        }),
        resumeThread: () => {
          throw new Error("resumeThread should not be used for a fresh run.");
        }
      }) as CodexRunDependencies["createCodexClient"] extends () => infer Client ? Client : never
  };

  const queued = await startCodexRun({ projectPath, ticketId: ticket.frontMatter.id }, dependencies);
  assert.equal(queued.state, "queued");
  await waitFor(() => events.some((event) => event.type === "run.failed"), "startup failure event");

  assert.equal((await readTicket(projectPath, ticket.frontMatter.id)).frontMatter.runStatus, "failed");

  await cancelCodexRun("run_stream_start_failure");
  assert.equal((await readTicket(projectPath, ticket.frontMatter.id)).frontMatter.runStatus, "failed");

  const persistedEvents = await readCodexRunEvents(projectPath, ticket.frontMatter.id, "run_stream_start_failure");
  assert.equal(persistedEvents.some((event) => event.type === "run.failed" && event.message === "Stream could not start."), true);
});

test("codex run cancellation aborts the stream and cleans up the active run", async () => {
  const projectPath = await createProject();
  await allowNonGitRuns(projectPath);
  const ticket = await createTicket(projectPath, {
    title: "Cancellation cleanup",
    priority: "medium",
    labels: ["codex"],
    markdown: "# Cancellation cleanup\n"
  });
  const { runEventSink, events } = createFakeRunEventSink();
  let capturedSignal: AbortSignal | undefined;
  const dependencies: CodexRunDependencies = {
    runEventSink,
    createRunId: () => "run_cancel_cleanup",
    createCodexClient: () =>
      ({
        startThread: () => ({
          id: "thread_cancel_cleanup",
          runStreamed: async (_prompt: string, options?: { signal?: AbortSignal }) => {
            capturedSignal = options?.signal;
            return {
              events: (async function*() {
                yield { type: "thread.started", thread_id: "thread_cancel_cleanup" };
                await new Promise<void>((_resolve, reject) => {
                  if (capturedSignal?.aborted) {
                    const error = new Error("The operation was aborted.");
                    error.name = "AbortError";
                    reject(error);
                    return;
                  }
                  capturedSignal?.addEventListener(
                    "abort",
                    () => {
                      const error = new Error("The operation was aborted.");
                      error.name = "AbortError";
                      reject(error);
                    },
                    { once: true }
                  );
                });
              })()
            };
          }
        }),
        resumeThread: () => {
          throw new Error("resumeThread should not be used for a fresh run.");
        }
      }) as CodexRunDependencies["createCodexClient"] extends () => infer Client ? Client : never
  };

  await startCodexRun({ projectPath, ticketId: ticket.frontMatter.id }, dependencies);
  await waitFor(() => events.some((event) => event.type === "run.started"), "run start before cancellation");
  const duplicatePreflight = await preflightCodexRun({ projectPath, ticketId: ticket.frontMatter.id });
  assert.equal(duplicatePreflight.ok, false);
  assert.match(duplicatePreflight.errors.join(" "), /active agent run/);
  await cancelCodexRun("run_cancel_cleanup");

  assert.equal(capturedSignal?.aborted, true);
  await waitFor(() => events.some((event) => event.type === "run.failed"), "run cancellation finalizer");
  assert.equal((await readTicket(projectPath, ticket.frontMatter.id)).frontMatter.runStatus, "cancelled");

  const cancelled = await readTicket(projectPath, ticket.frontMatter.id);
  await writeTicket(projectPath, {
    ...cancelled,
    frontMatter: {
      ...cancelled.frontMatter,
      runStatus: "failed"
    }
  });
  await cancelCodexRun("run_cancel_cleanup");
  assert.equal((await readTicket(projectPath, ticket.frontMatter.id)).frontMatter.runStatus, "failed");

  const persistedEvents = await readCodexRunEvents(projectPath, ticket.frontMatter.id, "run_cancel_cleanup");
  assert.equal(persistedEvents.some((event) => event.type === "run.failed" && /aborted/i.test(event.message)), true);
});

test("codex run cancellation reconciles stale implementation state after restart", async () => {
  const projectPath = await createProject();
  await allowNonGitRuns(projectPath);
  const ticket = await createTicket(projectPath, {
    title: "Stale implementation run",
    priority: "medium",
    labels: ["codex"],
    markdown: "# Stale implementation run\n"
  });

  await writeTicket(projectPath, {
    ...ticket,
    frontMatter: {
      ...ticket.frontMatter,
      status: "in_progress",
      authoringState: "ready",
      codexThreadId: "thread_stale_impl",
      runStatus: "running",
      lastRunId: "run_stale_impl",
      lastRunStartedAt: new Date().toISOString()
    }
  });

  await cancelCodexRun({ projectPath, ticketId: ticket.frontMatter.id, runId: "run_stale_impl" });

  const cancelled = await readTicket(projectPath, ticket.frontMatter.id);
  assert.equal(cancelled.frontMatter.runStatus, "cancelled");
  assert.equal(cancelled.frontMatter.status, "in_progress");

  const preflight = await preflightCodexRun({ projectPath, ticketId: ticket.frontMatter.id });
  assert.equal(preflight.ok, true);

  const events = await readCodexRunEvents(projectPath, ticket.frontMatter.id, "run_stale_impl");
  const terminal = events.find((event) => event.type === "run.failed");
  assert.equal(terminal?.type, "run.failed");
  if (terminal?.type === "run.failed") {
    assert.equal(terminal.finalStatus, "cancelled");
    assert.match(terminal.message, /Stale Codex implementation run cancelled/);
  }
});

test("codex run cancellation reconciles stale draft state after restart", async () => {
  const projectPath = await createProject();
  const ticket = await createTicket(projectPath, {
    title: "Pending stale draft",
    priority: "medium",
    labels: [],
    markdown: "# Pending stale draft\n"
  });

  await writeTicket(projectPath, {
    ...ticket,
    frontMatter: {
      ...ticket.frontMatter,
      authoringState: "drafting",
      runStatus: "drafting",
      lastRunId: "run_stale_draft",
      lastRunStartedAt: new Date().toISOString()
    }
  });

  await cancelCodexRun({ projectPath, ticketId: ticket.frontMatter.id, runId: "run_stale_draft" });

  const cancelled = await readTicket(projectPath, ticket.frontMatter.id);
  assert.equal(cancelled.frontMatter.runStatus, "cancelled");
  assert.equal(cancelled.frontMatter.authoringState, "rough");

  const events = await readCodexRunEvents(projectPath, ticket.frontMatter.id, "run_stale_draft");
  const terminal = events.find((event) => event.type === "run.failed");
  assert.equal(terminal?.type, "run.failed");
  if (terminal?.type === "run.failed") {
    assert.equal(terminal.finalStatus, "cancelled");
    assert.match(terminal.message, /Stale ticket draft run cancelled/);
  }
});

test("clarification questions and answers persist with auditable events", async () => {
  const projectPath = await createProject();
  const ticket = await createTicket(projectPath, {
    title: "Clarification flow",
    priority: "high",
    labels: ["clarification"],
    markdown: "# Clarification flow\n"
  });

  await transitionTicketStatus(projectPath, ticket.frontMatter.id, "needs_clarification", {
    actor: "codex",
    source: "agent_execution",
    runId: "run_clarification"
  });
  const questions = await createClarificationQuestions(
    projectPath,
    ticket.frontMatter.id,
    [{ question: "Which datastore should this use?" }],
    {
      actor: "codex",
      source: "agent_execution",
      runId: "run_clarification",
      codexThreadId: "thread_clarification"
    }
  );

  assert.equal((await readBoard(projectPath)).tickets.find((item) => item.id === ticket.frontMatter.id)?.status, "needs_clarification");
  assert.equal(questions.length, 1);
  assert.equal(questions[0].answer, null);

  const answered = await answerClarificationQuestion(projectPath, ticket.frontMatter.id, questions[0].id, "Use SQLite.");
  assert.equal(answered.answer, "Use SQLite.");
  assert.ok(answered.answeredAt);
  assert.equal((await readClarificationQuestions(projectPath, ticket.frontMatter.id))[0].answer, "Use SQLite.");

  const events = await auditEvents(projectPath);
  assert.deepEqual(
    events.map((event) => event.eventType),
    ["ticket.status_changed", "clarification.question_created", "clarification.answer_submitted"]
  );
});
