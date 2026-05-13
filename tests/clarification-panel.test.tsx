import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ClarificationPanel } from "../src/renderer/src/components/ClarificationPanel";
import type { ClarificationQuestion } from "../src/shared/types";

const question = (patch: Partial<ClarificationQuestion>): ClarificationQuestion => ({
  id: "clar_1",
  ticketId: "tkt_1",
  question: "Which datastore should this use?",
  answerType: "text",
  answer: null,
  createdAt: "2026-05-11T10:00:00.000Z",
  updatedAt: "2026-05-11T10:00:00.000Z",
  answeredAt: null,
  createdBy: "codex",
  source: "agent_execution",
  runId: "run_1",
  codexThreadId: "thread_1",
  ...patch
});

test("clarification panel distinguishes unanswered and answered questions", () => {
  const markup = renderToStaticMarkup(
    <ClarificationPanel
      variant="primary"
      ariaLabel="Pending clarification questions"
      questions={[
        question({ id: "clar_pending", question: "Which datastore should this use?" }),
        question({
          id: "clar_answered",
          question: "Should this be automatic?",
          answer: "Codex should explicitly move it when resuming.",
          answeredAt: "2026-05-11T10:05:00.000Z"
        })
      ]}
      answerDrafts={{ clar_pending: "Use SQLite." }}
      submittingId={null}
      onDraftChange={() => undefined}
      onSubmit={() => undefined}
    />
  );

  assert.match(markup, /clarification-panel-primary/);
  assert.match(markup, /role="list"/);
  assert.match(markup, /aria-label="Pending clarification questions"/);
  assert.match(markup, /role="listitem"/);
  assert.match(markup, /data-status="unanswered"/);
  assert.match(markup, /data-status="answered"/);
  assert.match(markup, /Which datastore should this use\?/);
  assert.match(markup, /aria-label="Answer clarification question"/);
  assert.match(markup, /aria-label="Submit answer for clarification question"/);
  assert.match(markup, /Submit Answer/);
  assert.match(markup, /Codex should explicitly move it when resuming\./);
  assert.match(markup, /1\/2 answered/);
});

test("clarification panel renders answered questions as non-editable history", () => {
  const markup = renderToStaticMarkup(
    <ClarificationPanel
      questions={[
        question({
          id: "clar_answered",
          question: "Should this be automatic?",
          answer: "Codex should explicitly move it when resuming.",
          answeredAt: "2026-05-11T10:05:00.000Z"
        })
      ]}
      answerDrafts={{}}
      submittingId={null}
      onDraftChange={() => undefined}
      onSubmit={() => undefined}
    />
  );

  assert.match(markup, /data-status="answered"/);
  assert.match(markup, /Codex should explicitly move it when resuming\./);
  assert.match(markup, /1\/1 answered/);
  assert.doesNotMatch(markup, /<textarea/);
  assert.doesNotMatch(markup, /Submit Answer/);
});

test("clarification panel supports sidebar history classes and long content", () => {
  const longQuestion = [
    "Please confirm the rollout strategy for this exceptionally long clarification question.",
    "It includes markdown with `inline_code_that_should_wrap_without_horizontal_overflow` and enough prose to exercise contained layouts.",
    "- Keep answered history readable.",
    "- Keep pending questions independently scrollable."
  ].join("\n\n");

  const markup = renderToStaticMarkup(
    <ClarificationPanel
      variant="sidebar"
      className="ticket-detail-sidebar-clarifications"
      ariaLabel="Clarification history"
      questions={[
        question({
          id: "clar_history_1",
          question: longQuestion,
          answer: "Use the existing bounded list layout and preserve markdown rendering.",
          answeredAt: "2026-05-11T10:05:00.000Z"
        }),
        question({
          id: "clar_history_2",
          question: "Should answered clarification history stay in the sidebar?",
          answer: "Yes, according to the existing sidebar clarification rule.",
          answeredAt: "2026-05-11T10:06:00.000Z"
        })
      ]}
      answerDrafts={{}}
      submittingId={null}
      onDraftChange={() => undefined}
      onSubmit={() => undefined}
    />
  );

  assert.match(markup, /clarification-panel-sidebar/);
  assert.match(markup, /ticket-detail-sidebar-clarifications/);
  assert.match(markup, /aria-label="Clarification history"/);
  assert.match(markup, /inline_code_that_should_wrap_without_horizontal_overflow/);
  assert.match(markup, /2\/2 answered/);
  assert.doesNotMatch(markup, /data-status="unanswered"/);
});
