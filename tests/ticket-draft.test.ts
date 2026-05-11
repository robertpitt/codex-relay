import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createTicketDraft,
  draftToCreateInput,
  extractTicketDraftUrls,
  TicketDraftServiceError,
  type TicketDraftDependencies
} from "../src/main/services/codex";
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
    researchFindings: [],
    requirements: ["Build the requested behavior."],
    implementationPlan: [],
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
  assert.match(prompt, /Research context:/);
  assert.equal(signals[0].aborted, false);
  assert.equal((await readBoard(projectPath)).tickets.length, 0);
});

test("ticket draft prompt preserves markdown ticket references from the idea", async () => {
  const projectPath = await createProject();
  const idea = "Build on [Referenceable todo](./tkt_001.md) before adding the next flow.";
  let prompt = "";
  const dependencies: TicketDraftDependencies = {
    getStatus: async () => readyStatus,
    createRequestId: () => "tdr_ticket_reference",
    createCodexClient: () =>
      ({
        startThread: () => ({
          run: async (nextPrompt: string) => {
            prompt = nextPrompt;
            return { finalResponse: validDraftJson("Reference-aware draft") };
          }
        })
      }) as any
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
      ({
        startThread: () => ({
          run: async (nextPrompt: string) => {
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
          }
        })
      }) as any
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
      ({
        startThread: () => ({
          run: async (nextPrompt: string) => {
            prompt = nextPrompt;
            return { finalResponse: validDraftJson("Inspect draft code") };
          }
        })
      }) as any
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
      ({
        startThread: () => ({
          run: async () => ({ finalResponse: validDraftJson("Research limitations are visible") })
        })
      }) as any
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
