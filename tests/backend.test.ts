import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { startCodexRun, type CodexRunDependencies } from "../src/main/services/codex";
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
});

test("project summaries include ordered swimlane counts including empty lanes", async () => {
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

  const summary = await summarizeProject(projectPath);

  assert.deepEqual(
    summary.swimlanes.map((swimlane) => [swimlane.id, swimlane.ticketCount]),
    [
      ["todo", 1],
      ["in_progress", 1],
      ["needs_clarification", 0],
      ["not_doing", 0],
      ["completed", 0]
    ]
  );
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
  const { window, events } = createFakeWindow();
  let capturedPrompt = "";
  let capturedWorkingDirectory = "";
  const dependencies: CodexRunDependencies = {
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

  await startCodexRun(window, { projectPath: secondProject, ticketId: secondTicket.frontMatter.id }, dependencies);
  await waitFor(() => events.some((event) => event.type === "run.completed"), "run completion");

  assert.equal(capturedWorkingDirectory, secondProject);
  assert.match(capturedPrompt, /Active second project ticket/);
  assert.doesNotMatch(capturedPrompt, /Stale first project ticket/);
  assert.equal(events.every((event) => event.projectPath === secondProject && event.ticketId === secondTicket.frontMatter.id), true);
  assert.equal((await readTicket(secondProject, secondTicket.frontMatter.id)).frontMatter.runStatus, "completed");
  await access(path.join(secondProject, ".relay", "runs", secondTicket.frontMatter.id, "run_project_scope.jsonl"));
  await assert.rejects(access(path.join(firstProject, ".relay", "runs", firstTicket.frontMatter.id, "run_project_scope.jsonl")));
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
