import test from "node:test";
import assert from "node:assert/strict";
import { getTicketReferenceMenuLayout } from "../src/renderer/src/App";

test("create ticket mention menu flips above the footer when below space is constrained", () => {
  const layout = getTicketReferenceMenuLayout({
    anchorRect: { left: 120, top: 520, bottom: 604, width: 560 },
    footerTop: 620,
    viewportWidth: 1000,
    viewportHeight: 760
  });

  assert.equal(layout.placement, "above");
  assert.equal(layout.style.top, "auto");
  assert.equal(layout.style.bottom, 246);
  assert.equal(layout.style.maxHeight, 260);
  assert.equal(layout.style.zIndex, 80);
});

test("create ticket mention menu uses the space above the footer when there is room below", () => {
  const layout = getTicketReferenceMenuLayout({
    anchorRect: { left: 96, top: 120, bottom: 208, width: 480 },
    footerTop: 620,
    viewportWidth: 900,
    viewportHeight: 720
  });

  assert.equal(layout.placement, "below");
  assert.equal(layout.style.top, 214);
  assert.equal(layout.style.bottom, "auto");
  assert.equal(layout.style.maxHeight, 260);
  assert.equal(layout.style.left, 96);
  assert.equal(layout.style.width, 480);
});
