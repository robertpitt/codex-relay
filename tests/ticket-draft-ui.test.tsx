import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import {
  activeRunElapsedLabel,
  CreateTicketDraftMessage,
  DraftingTicketDetailLoading,
  emptyColumnMessage,
  TicketCardContent,
  TicketSuggestionsModalContent,
  TicketRunElapsedPill,
  TicketRunStatusPill
} from "../src/renderer/src/App";
import { DEFAULT_COLUMNS, type TicketSuggestion, type TicketSummary } from "../src/shared/types";

const ticketSummary = (patch: Partial<TicketSummary> = {}): TicketSummary => ({
  schemaVersion: 1,
  id: "tkt_elapsed",
  title: "Elapsed runtime",
  ticketType: "task",
  status: "in_progress",
  position: 1000,
  priority: "medium",
  labels: [],
  parentEpicId: null,
  subticketIds: [],
  blockedByIds: [],
  createdAt: "2026-05-12T10:00:00.000Z",
  updatedAt: "2026-05-12T10:00:00.000Z",
  codexThreadId: null,
  runStatus: "running",
  lastRunId: "run_elapsed",
  lastRunStartedAt: "2026-05-12T10:00:00.000Z",
  excerpt: "Runtime card",
  filePath: "/tmp/tkt_elapsed.md",
  ...patch
});

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
  assert.match(markup, /Codex is preparing the generated ticket content/);
  assert.doesNotMatch(markup, /Original Idea/);
  assert.doesNotMatch(markup, /Markdown/);
  assert.doesNotMatch(markup, /Preview/);
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
  assert.match(loadingMarkup, /Codex is reviewing the local project and current board/);
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
