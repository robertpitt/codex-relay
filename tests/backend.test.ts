import test from "node:test";
import assert from "node:assert/strict";
import { Effect } from "effect";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
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
  saveTicketAttachment,
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
  assert.equal(config.settings.codexNetworkAccessEnabled, false);
  assert.equal(config.settings.codexWebSearchMode, "disabled");
  assert.deepEqual(config.settings.codexAdditionalDirectories, []);
  assert.equal(config.settings.agentConcurrency, 1);
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
  assert.equal(options.modelReasoningEffort, "high");
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
  await allowNonGitRuns(projectPath);
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
  const { runEventSink, events } = createFakeRunEventSink();
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
