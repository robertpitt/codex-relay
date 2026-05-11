import test from "node:test";
import assert from "node:assert/strict";
import { Effect } from "effect";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CodexOptions } from "@openai/codex-sdk";
import {
  cancelCodexRun,
  createCodex,
  getCodexStatus,
  preflightCodexRun,
  readCodexRunEvents,
  startCodexRun,
  type CodexRunDependencies,
  type CreateCodexDependencies
} from "../src/main/services/codex";
import { resolveAvailableCodexCli, type CodexCliCandidate } from "../src/main/services/codex/cli";
import { BackendClock, runBackendEffect } from "../src/main/services/runtime";
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
  summarizeProject,
  transitionTicketStatus,
  writeTicket,
  unlinkSubticket,
  writeProjectConfig
} from "../src/main/services/storage";
import type { RendererRunEvent } from "../src/shared/types";

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

test("backend Effect runtime provides shared services", async () => {
  const timestamp = await runBackendEffect(
    Effect.gen(function*() {
      const clock = yield* BackendClock;
      return clock.nowIso();
    })
  );

  assert.match(timestamp, /^\d{4}-\d{2}-\d{2}T/);
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
      ["in_progress", 1, 1],
      ["needs_clarification", 0, 0],
      ["review", 0, 0],
      ["not_doing", 0, 0],
      ["completed", 0, 0]
    ]
  );
});

test("legacy project configs are normalized with review lane without rewriting the file", async () => {
  const projectPath = await createProject();
  const config = await readProjectConfig(projectPath);
  const legacyConfig = {
    ...config,
    columns: config.columns.filter((column) => column.id !== "review")
  };
  await writeFile(path.join(projectPath, ".relay", "project.json"), JSON.stringify(legacyConfig, null, 2));

  const normalized = await readProjectConfig(projectPath);
  assert.deepEqual(
    normalized.columns.map((column) => column.id),
    ["todo", "in_progress", "needs_clarification", "review", "not_doing", "completed"]
  );

  const raw = await readFile(path.join(projectPath, ".relay", "project.json"), "utf8");
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
  assert.equal(events.every((event) => event.projectPath === secondProject && event.ticketId === secondTicket.frontMatter.id), true);
  const completedRunTicket = await readTicket(secondProject, secondTicket.frontMatter.id);
  assert.equal(completedRunTicket.frontMatter.runStatus, "completed");
  assert.equal(completedRunTicket.frontMatter.status, "review");
  await access(path.join(secondProject, ".relay", "runs", secondTicket.frontMatter.id, "run_project_scope.jsonl"));
  await assert.rejects(access(path.join(firstProject, ".relay", "runs", firstTicket.frontMatter.id, "run_project_scope.jsonl")));
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
  const { runEventSink } = createFakeRunEventSink();
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

  await assert.rejects(
    startCodexRun({ projectPath, ticketId: ticket.frontMatter.id }, dependencies),
    /Stream could not start/
  );

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
  assert.match(duplicatePreflight.errors.join(" "), /active Codex run/);
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
