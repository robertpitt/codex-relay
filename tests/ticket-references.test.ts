import test from "node:test";
import assert from "node:assert/strict";
import type { TicketReferenceCandidate } from "../src/shared/types";
import {
  filterTicketReferenceCandidates,
  formatTicketReferenceMarkdown,
  getActiveTicketMention,
  replaceTicketMention
} from "../src/renderer/src/lib/ticketReferences";

const candidate = (patch: Partial<TicketReferenceCandidate>): TicketReferenceCandidate => ({
  id: "tkt_001",
  title: "Fix auth callback",
  status: "todo",
  columnName: "Todo",
  relativePath: ".relay/tickets/tkt_001.md",
  linkPath: "./tkt_001.md",
  ...patch
});

test("ticket mention detection tracks an @ token before the cursor", () => {
  assert.deepEqual(getActiveTicketMention("See @auth", 9), { start: 4, end: 9, query: "auth" });
  assert.deepEqual(getActiveTicketMention("@", 1), { start: 0, end: 1, query: "" });
  assert.equal(getActiveTicketMention("email test@example.com", 18), null);
  assert.equal(getActiveTicketMention("See @auth now", 13), null);
});

test("ticket reference filtering matches title, path, and column context", () => {
  const candidates = [
    candidate({ id: "tkt_001", title: "Fix auth callback", relativePath: ".relay/tickets/tkt_001.md" }),
    candidate({ id: "tkt_002", title: "Render markdown links", relativePath: ".relay/tickets/link-ticket.md" }),
    candidate({ id: "tkt_003", title: "Archived cleanup", status: "completed", columnName: "Completed" })
  ];

  assert.deepEqual(
    filterTicketReferenceCandidates(candidates, "render").map((item) => item.id),
    ["tkt_002"]
  );
  assert.deepEqual(
    filterTicketReferenceCandidates(candidates, "link-ticket").map((item) => item.id),
    ["tkt_002"]
  );
  assert.deepEqual(
    filterTicketReferenceCandidates(candidates, "completed").map((item) => item.id),
    ["tkt_003"]
  );
  assert.deepEqual(
    filterTicketReferenceCandidates(candidates, "", 2).map((item) => item.id),
    ["tkt_001", "tkt_002"]
  );
});

test("ticket reference insertion writes escaped portable Markdown links", () => {
  const reference = candidate({
    title: "Fix [auth] callback",
    linkPath: "./ticket docs/fix #1.md"
  });

  assert.equal(formatTicketReferenceMarkdown(reference), "[Fix \\[auth\\] callback](./ticket%20docs/fix%20%231.md)");

  const next = replaceTicketMention("Blocked by @auth.", { start: 11, end: 16, query: "auth" }, reference);
  assert.equal(next.value, "Blocked by [Fix \\[auth\\] callback](./ticket%20docs/fix%20%231.md).");
  assert.equal(next.cursor, "Blocked by [Fix \\[auth\\] callback](./ticket%20docs/fix%20%231.md)".length);
});
