import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  activeRunElapsedLabel,
  canRedraftTicket,
  CreateTicketDraftMessage,
  DraftIntakeQuestionsPanel,
  DraftingTicketDetailLoading,
  emptyColumnMessage,
  FloatingTicketComposer,
  RepositoryChatPanelContent,
  TicketCardContent,
  TicketMarkdownTabs,
  TicketDetailPrimaryClarifications,
  TicketSuggestionsModalContent,
  TicketAuthoringStatePill,
  TicketChecklistPill,
  TicketRunElapsedPill,
  TicketRunStatusPill
} from "../src/renderer/src/App";
import {
  DEFAULT_COLUMNS,
  type ClarificationQuestion,
  type DraftIntakeResult,
  type TicketRecord,
  type TicketSuggestion,
  type TicketSummary
} from "../src/shared/schemas";

const renderWithQueryClient = (element: ReactElement): string => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return renderToStaticMarkup(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
};

const ticketSummary = (patch: Partial<TicketSummary> = {}): TicketSummary => ({
  schemaVersion: 1,
  id: "tkt_elapsed",
  title: "Elapsed runtime",
  ticketType: "task",
  status: "in_progress",
  position: 1000,
  priority: "medium",
  effort: "medium",
  labels: [],
  parentEpicId: null,
  subticketIds: [],
  blockedByIds: [],
  relatedTicketIds: [],
  createdAt: "2026-05-12T10:00:00.000Z",
  updatedAt: "2026-05-12T10:00:00.000Z",
  authoringState: "ready",
  codexThreadId: null,
  runStatus: "running",
  lastRunId: "run_elapsed",
  lastRunStartedAt: "2026-05-12T10:00:00.000Z",
  excerpt: "Runtime card",
  filePath: "/tmp/tkt_elapsed.md",
  checklist: { total: 0, completed: 0, open: 0 },
  ...patch
});

const clarificationQuestion = (patch: Partial<ClarificationQuestion> = {}): ClarificationQuestion => ({
  id: "clar_primary",
  ticketId: "tkt_elapsed",
  question: "Which datastore should this use?",
  answerType: "text",
  answer: null,
  createdAt: "2026-05-12T10:00:00.000Z",
  updatedAt: "2026-05-12T10:00:00.000Z",
  answeredAt: null,
  createdBy: "codex",
  source: "agent_execution",
  runId: "run_elapsed",
  codexThreadId: "thread_elapsed",
  ...patch
});

const ticketRecord = (patch: Partial<TicketRecord["frontMatter"]> = {}): TicketRecord => {
  const summary = ticketSummary({ runStatus: "idle", authoringState: "rough", ...patch });
  const { excerpt: _excerpt, filePath, checklist, ...frontMatter } = summary;
  return {
    frontMatter,
    markdown: "# Elapsed runtime\n",
    filePath,
    checklist
  };
};

test("empty column copy is status-aware for standard workflow columns", () => {
  assert.deepEqual(emptyColumnMessage("Todo"), {
    title: "No tickets to triage",
    detail: "New work appears here before it is prioritized."
  });
  assert.deepEqual(emptyColumnMessage("Ready"), {
    title: "Ready queue is empty",
    detail: "Prioritized tickets will wait here before implementation starts."
  });
  assert.deepEqual(emptyColumnMessage("In Progress"), {
    title: "Nothing in progress",
    detail: "Active implementation tickets will show here while work is underway."
  });
  assert.deepEqual(emptyColumnMessage("Needs Clarification"), {
    title: "No questions pending",
    detail: "Tickets needing product or implementation answers will pause here."
  });
  assert.deepEqual(emptyColumnMessage("Review"), {
    title: "Nothing awaiting review",
    detail: "Completed agent work will land here for final checks."
  });
  assert.deepEqual(emptyColumnMessage("Completed"), {
    title: "No completed tickets yet",
    detail: "Accepted tickets will appear here after review is finished."
  });

  const standardTitles = ["Todo", "Ready", "In Progress", "Needs Clarification", "Review", "Completed"].map(
    (columnName) => emptyColumnMessage(columnName).title
  );
  assert.equal(new Set(standardTitles).size, standardTitles.length);
});

test("empty column copy keeps a generic fallback for custom columns", () => {
  assert.deepEqual(emptyColumnMessage("Blocked Review"), {
    title: "Blocked Review is clear",
    detail: "Tickets will settle here when work reaches this stage."
  });
  assert.deepEqual(emptyColumnMessage("  ready  "), emptyColumnMessage("Ready"));
});

test("drafting ticket status pill renders an active spinner indicator", () => {
  const markup = renderToStaticMarkup(<TicketRunStatusPill status="drafting" />);

  assert.match(markup, /run-pill drafting/);
  assert.match(markup, /spin run-pill-icon/);
  assert.match(markup, /Drafting/);
});

test("ticket authoring and checklist metadata render as compact pills", () => {
  const authoringMarkup = renderToStaticMarkup(<TicketAuthoringStatePill state="reviewing" />);
  assert.match(authoringMarkup, /authoring-pill reviewing/);
  assert.match(authoringMarkup, /Reviewing/);

  const checklistMarkup = renderToStaticMarkup(<TicketChecklistPill completed={2} total={5} />);
  assert.match(checklistMarkup, /checklist-pill/);
  assert.match(checklistMarkup, /2\/5/);

  const cardMarkup = renderToStaticMarkup(
    <TicketCardContent
      ticket={ticketSummary({
        status: "todo",
        runStatus: "idle",
        authoringState: "reviewing",
        checklist: { total: 5, completed: 2, open: 3 }
      })}
      allTickets={[]}
      columns={DEFAULT_COLUMNS}
      now={Date.parse("2026-05-12T10:01:05.000Z")}
    />
  );
  assert.match(cardMarkup, /authoring-pill reviewing/);
  assert.match(cardMarkup, /checklist-pill/);
});

test("in-progress running ticket elapsed pill renders compact runtime", () => {
  const ticket = ticketSummary();
  const now = Date.parse("2026-05-12T10:01:05.000Z");
  const label = activeRunElapsedLabel(ticket, now);

  assert.equal(label, "01:05");
  if (!label) assert.fail("Expected an elapsed label.");
  const markup = renderToStaticMarkup(<TicketRunElapsedPill label={label} />);
  assert.match(markup, /run-elapsed-pill/);
  assert.match(markup, /Agent running for 01:05/);
  assert.match(markup, />01:05</);

  const cardMarkup = renderToStaticMarkup(<TicketCardContent ticket={ticket} allTickets={[ticket]} columns={DEFAULT_COLUMNS} now={now} />);
  assert.match(cardMarkup, /card-meta/);
  assert.match(cardMarkup, /run-pill running/);
  assert.match(cardMarkup, /Running/);
  assert.match(cardMarkup, /run-elapsed-pill/);
  assert.match(cardMarkup, /Agent running for 01:05/);
  assert.match(cardMarkup, />01:05</);
});

test("elapsed runtime label is hidden outside active in-progress implementation runs", () => {
  const now = Date.parse("2026-05-12T10:01:05.000Z");

  for (const ticket of [
    ticketSummary({ status: "ready" }),
    ticketSummary({ runStatus: "queued" }),
    ticketSummary({ runStatus: "blocked" }),
    ticketSummary({ runStatus: "completed" }),
    ticketSummary({ lastRunStartedAt: null }),
    ticketSummary({ lastRunStartedAt: "not-a-date" })
  ]) {
    assert.equal(activeRunElapsedLabel(ticket, now), null);
    const cardMarkup = renderToStaticMarkup(<TicketCardContent ticket={ticket} allTickets={[ticket]} columns={DEFAULT_COLUMNS} now={now} />);
    assert.doesNotMatch(cardMarkup, /run-elapsed-pill/);
  }
});

test("ticket card label overflow exposes hidden label names without rendering extra label chips", () => {
  const ticket = ticketSummary({
    labels: ["frontend", "accessibility", "regression", "polish"],
    runStatus: "idle",
    lastRunId: null,
    lastRunStartedAt: null
  });
  const markup = renderToStaticMarkup(<TicketCardContent ticket={ticket} allTickets={[ticket]} columns={DEFAULT_COLUMNS} now={Date.now()} />);

  assert.match(markup, /<div class="labels">/);
  assert.match(markup, />frontend</);
  assert.match(markup, />accessibility</);
  assert.match(markup, /class="label-overflow"/);
  assert.match(markup, /title="Hidden labels: regression, polish"/);
  assert.match(markup, /aria-label="2 hidden labels: regression, polish"/);
  assert.match(markup, />\+2</);
  assert.doesNotMatch(markup, />regression</);
  assert.doesNotMatch(markup, />polish</);
});

test("drafting ticket detail loading state hides placeholder draft content", () => {
  const markup = renderToStaticMarkup(<DraftingTicketDetailLoading title="Draft: Async flow" />);

  assert.match(markup, /Ticket draft loading state/);
  assert.match(markup, /Drafting ticket/);
  assert.match(markup, /The agent is preparing the generated ticket content/);
  assert.doesNotMatch(markup, /Original Idea/);
  assert.doesNotMatch(markup, /Markdown/);
  assert.doesNotMatch(markup, /Preview/);
});

test("redraft eligibility is limited to failed placeholders and generated drafts", () => {
  assert.equal(canRedraftTicket(ticketRecord({ runStatus: "draft_failed" })), true);
  assert.equal(canRedraftTicket(ticketRecord({ runStatus: "draft_complete" })), true);
  assert.equal(canRedraftTicket(ticketRecord({ authoringState: "reviewing" })), true);
  assert.equal(canRedraftTicket(ticketRecord({ runStatus: "drafting", authoringState: "drafting" })), false);
  assert.equal(canRedraftTicket(ticketRecord({ runStatus: "idle", authoringState: "rough" })), false);
  assert.equal(canRedraftTicket(ticketRecord({ runStatus: "completed", authoringState: "ready" })), false);
});

test("ticket markdown tabs render preview by default without source textarea", () => {
  const markup = renderToStaticMarkup(
    <TicketMarkdownTabs markdown={"# Ticket body\n\nRun **focused** validation."} onModeChange={() => undefined} />
  );

  assert.match(markup, /role="tablist"/);
  assert.match(markup, /id="ticket-markdown-preview-tab"[^>]*aria-selected="true"/);
  assert.match(markup, /ticket-markdown-preview-panel collapsed/);
  assert.match(markup, /aria-label="Expand markdown preview"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /ticket-markdown-preview/);
  assert.match(markup, /Ticket body/);
  assert.match(markup, /focused/);
  assert.doesNotMatch(markup, /detail-markdown/);
  assert.doesNotMatch(markup, /<textarea/);
});

test("ticket markdown tabs render expanded preview mode", () => {
  const markup = renderToStaticMarkup(
    <TicketMarkdownTabs markdown={"# Ticket body\n\nRun **focused** validation."} previewExpanded onModeChange={() => undefined} />
  );

  assert.match(markup, /ticket-markdown-tabs preview-expanded/);
  assert.match(markup, /ticket-markdown-preview-panel expanded/);
  assert.match(markup, /aria-label="Collapse markdown preview"/);
  assert.match(markup, /aria-expanded="true"/);
  assert.match(markup, /Ticket body/);
  assert.doesNotMatch(markup, /detail-markdown/);
  assert.doesNotMatch(markup, /<textarea/);
});

test("expanded ticket markdown preview is contained above the update composer", () => {
  const styles = readFileSync("src/renderer/src/styles.css", "utf8");

  assert.match(styles, /\.ticket-detail-primary\.markdown-preview-expanded\s*{[^}]*overflow:\s*hidden;/s);
  assert.match(
    styles,
    /\.ticket-detail-primary\.markdown-preview-expanded \.ticket-markdown-tabs\.preview-expanded,\s*\.ticket-detail-primary\.markdown-preview-expanded \.ticket-markdown-preview-panel\.expanded\s*{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;/s
  );
  assert.match(
    styles,
    /\.ticket-detail-primary\.markdown-preview-expanded \.ticket-update-panel\s*{[^}]*flex:\s*0 0 auto;/s
  );
});

test("ticket markdown tabs render source editor without simultaneous preview", () => {
  const markup = renderToStaticMarkup(
    <TicketMarkdownTabs mode="edit" markdown={"# Ticket body\n\nRun **focused** validation."} onModeChange={() => undefined} />
  );

  assert.match(markup, /id="ticket-markdown-edit-tab"[^>]*aria-selected="true"/);
  assert.match(markup, /detail-markdown/);
  assert.match(markup, /# Ticket body/);
  assert.doesNotMatch(markup, /class="markdown-block ticket-markdown-preview/);
  assert.doesNotMatch(markup, /<strong>focused<\/strong>/);
});

test("ticket detail primary clarifications render pending answer composer", () => {
  const markup = renderToStaticMarkup(
    <TicketDetailPrimaryClarifications
      questions={[clarificationQuestion()]}
      answerDrafts={{ clar_primary: "" }}
      submittingId={null}
      onDraftChange={() => undefined}
      onSubmit={() => undefined}
    />
  );

  assert.match(markup, /ticket-detail-primary-clarifications/);
  assert.match(markup, /Pending Clarifications/);
  assert.match(markup, /1 pending/);
  assert.match(markup, /Which datastore should this use\?/);
  assert.match(markup, /placeholder="Answer"/);
  assert.match(markup, /Submit Answer/);
});

const suggestion: TicketSuggestion = {
  title: "Tighten board keyboard focus",
  priority: "medium",
  labels: ["frontend", "accessibility"],
  rationale: "Board navigation has adjacent shortcut behavior that should stay predictable.",
  request: "Draft a task to tighten board keyboard focus handling."
};

test("ticket suggestions modal content renders loading, error, and empty states", () => {
  const noop = (): void => undefined;
  const loadingMarkup = renderToStaticMarkup(
    <TicketSuggestionsModalContent
      state="loading"
      suggestions={[]}
      errorMessage={null}
      createStates={{}}
      createErrors={{}}
      onCreate={noop}
    />
  );
  assert.match(loadingMarkup, /role="status"/);
  assert.match(loadingMarkup, /aria-busy="true"/);
  assert.match(loadingMarkup, /The agent is reviewing the local project and current board/);
  assert.match(loadingMarkup, /spin/);

  const errorMarkup = renderToStaticMarkup(
    <TicketSuggestionsModalContent
      state="error"
      suggestions={[]}
      errorMessage="Codex is not authenticated."
      createStates={{}}
      createErrors={{}}
      onCreate={noop}
      onRetry={noop}
    />
  );
  assert.match(errorMarkup, /role="alert"/);
  assert.match(errorMarkup, /Codex is not authenticated/);
  assert.match(errorMarkup, /Retry/);

  const emptyMarkup = renderToStaticMarkup(
    <TicketSuggestionsModalContent
      state="ready"
      suggestions={[]}
      errorMessage={null}
      createStates={{}}
      createErrors={{}}
      onCreate={noop}
    />
  );
  assert.match(emptyMarkup, /No suggestions returned/);
});

test("ticket suggestions rows render create, creating, created, and error semantics", () => {
  const markup = renderToStaticMarkup(
    <TicketSuggestionsModalContent
      state="ready"
      suggestions={[
        suggestion,
        { ...suggestion, title: "Refresh draft status", request: "Draft a task to refresh draft status." },
        { ...suggestion, title: "Stabilize generation retry", request: "Draft a task to stabilize generation retry." }
      ]}
      errorMessage={null}
      createStates={{ 1: "created", 2: "creating" }}
      createErrors={{ 0: "Codex draft failed to start." }}
      onCreate={() => undefined}
    />
  );

  assert.match(markup, /ticket-suggestions-list/);
  assert.match(markup, /Tighten board keyboard focus/);
  assert.match(markup, /Draft a task to tighten board keyboard focus handling/);
  assert.match(markup, />Create</);
  assert.match(markup, />Creating\.\.\.</);
  assert.match(markup, />Created</);
  assert.match(markup, /aria-label="Create draft for Tighten board keyboard focus"/);
  assert.match(markup, /aria-label="Created draft for Refresh draft status"/);
  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /disabled=""/);
  assert.match(markup, /role="alert"/);
  assert.match(markup, /Codex draft failed to start/);
  assert.match(markup, /title="Draft a task to stabilize generation retry\."/);
});

test("create ticket draft messages expose status and alert roles", () => {
  const infoMarkup = renderToStaticMarkup(<CreateTicketDraftMessage kind="info" message="Creating a pending ticket." busy />);

  assert.match(infoMarkup, /class="draft-message info"/);
  assert.match(infoMarkup, /role="status"/);
  assert.match(infoMarkup, /spin/);
  assert.match(infoMarkup, /Creating a pending ticket/);

  const errorMarkup = renderToStaticMarkup(<CreateTicketDraftMessage kind="error" message="Codex draft failed." />);

  assert.match(errorMarkup, /class="draft-message error"/);
  assert.match(errorMarkup, /role="alert"/);
  assert.doesNotMatch(errorMarkup, /spin/);
  assert.match(errorMarkup, /Codex draft failed/);
});

test("floating ticket composer renders compact drafting controls without create modal chrome", () => {
  const markup = renderWithQueryClient(
    <FloatingTicketComposer
      projectPath="/tmp/project"
      defaultEffort="medium"
      onCreated={() => undefined}
      setToast={() => undefined}
    />
  );

  assert.match(markup, /floating-ticket-composer/);
  assert.match(markup, /aria-label="Draft ticket idea"/);
  assert.match(markup, /aria-label="Ticket idea"/);
  assert.match(markup, />Type</);
  assert.match(markup, />Mode</);
  assert.match(markup, />Priority</);
  assert.match(markup, />Effort</);
  assert.match(markup, /value="task" selected="">Task/);
  assert.match(markup, /Product Feature/);
  assert.match(markup, /Rewrite/);
  assert.match(markup, /aria-label="Draft ticket with agent"/);
  assert.doesNotMatch(markup, /modal-backdrop/);
  assert.doesNotMatch(markup, /Create Ticket/);
});

test("floating ticket composer submit button is disabled for blank ideas", () => {
  const markup = renderWithQueryClient(
    <FloatingTicketComposer
      projectPath="/tmp/project"
      defaultEffort="medium"
      onCreated={() => undefined}
      setToast={() => undefined}
    />
  );

  assert.match(markup, /floating-ticket-submit" disabled=""/);
});

test("draft intake question panel renders editable recommended answers", () => {
  const intake: DraftIntakeResult = {
    scope: "product_feature",
    confidence: 0.74,
    knownFacts: ["Existing tickets mention the settings dialog."],
    relatedTicketIds: ["tkt_settings"],
    questions: [
      {
        question: "Should this preserve the current settings layout?",
        whyItMatters: "It keeps the scope to a feature change instead of a redesign.",
        recommendedAnswer: "Preserve the layout and add only the new control."
      }
    ]
  };

  const markup = renderToStaticMarkup(
    <DraftIntakeQuestionsPanel
      intake={intake}
      answerDrafts={{ 0: intake.questions[0].recommendedAnswer }}
      onAnswerChange={() => undefined}
      onContinue={() => undefined}
    />
  );

  assert.match(markup, /Draft intake questions/);
  assert.match(markup, /Product Feature intake/);
  assert.match(markup, /Existing tickets mention the settings dialog/);
  assert.match(markup, /Should this preserve the current settings layout/);
  assert.match(markup, /Preserve the layout and add only the new control/);
  assert.match(markup, /Continue Draft/);
});

test("repository chat panel content renders transcript, pending state, and controls", () => {
  const noop = (): void => undefined;
  const markup = renderToStaticMarkup(
    <RepositoryChatPanelContent
      projectName="Relay"
      messages={[
        { id: "user-1", role: "user", text: "Where is the board rendered?" },
        { id: "assistant-1", role: "assistant", text: "The board is rendered in `BoardView`." }
      ]}
      draft="What owns selected project state?"
      pending
      errorMessage="Codex is not authenticated."
      onDraftChange={noop}
      onSubmit={noop}
      onClose={noop}
    />
  );

  assert.match(markup, /id="repository-chat-panel"/);
  assert.match(markup, /aria-label="Repository chat for Relay"/);
  assert.match(markup, /aria-label="Close repository chat"/);
  assert.match(markup, />You</);
  assert.match(markup, /Where is the board rendered/);
  assert.match(markup, />Agent</);
  assert.match(markup, /BoardView/);
  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /Reading repository context/);
  assert.match(markup, /role="alert"/);
  assert.match(markup, /Codex is not authenticated/);
  assert.match(markup, /aria-label="Repository chat question"/);
  assert.match(markup, /aria-label="Send repository chat question"/);
  assert.match(markup, /disabled=""/);
});

test("repository chat send button is disabled for blank drafts", () => {
  const noop = (): void => undefined;
  const markup = renderToStaticMarkup(
    <RepositoryChatPanelContent
      projectName="Relay"
      messages={[]}
      draft="   "
      pending={false}
      errorMessage={null}
      onDraftChange={noop}
      onSubmit={noop}
      onClose={noop}
    />
  );

  assert.match(markup, /Ask a read-only question about this repository/);
  assert.match(markup, /repository-chat-send" disabled=""/);
  assert.match(markup, /aria-label="Send repository chat question"/);
});
