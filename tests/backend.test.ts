import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { startCodexRun, type CodexRunDependencies } from "../src/main/services/codex";
import {
  answerClarificationQuestion,
  createClarificationQuestions,
  createTicket,
  initializeProject,
  isTicketNotFoundError,
  moveTicket,
  readBoard,
  readClarificationQuestions,
  readProjectConfig,
  readTicket,
  summarizeProject,
  transitionTicketStatus,
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
