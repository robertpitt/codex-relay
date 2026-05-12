import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import {
  activeRunElapsedLabel,
  DraftingTicketDetailLoading,
  TicketCardContent,
  TicketRunElapsedPill,
  TicketRunStatusPill
} from "../src/renderer/src/App";
import { DEFAULT_COLUMNS, type TicketSummary } from "../src/shared/types";

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

test("drafting ticket detail loading state hides placeholder draft content", () => {
  const markup = renderToStaticMarkup(<DraftingTicketDetailLoading title="Draft: Async flow" />);

  assert.match(markup, /Ticket draft loading state/);
  assert.match(markup, /Drafting ticket/);
  assert.match(markup, /Codex is preparing the generated ticket content/);
  assert.doesNotMatch(markup, /Original Idea/);
  assert.doesNotMatch(markup, /Markdown/);
  assert.doesNotMatch(markup, /Preview/);
});
