---
schemaVersion: 1
id: tkt_01krdw9ngjt2n2rzvynwvdvwd1
title: Polish toast and Codex status feedback chrome
ticketType: task
status: todo
position: 18000
priority: medium
labels:
  - frontend
  - feedback
  - accessibility
  - ui-polish
parentEpicId: tkt_01krdtm7bz1j098hdxjvj2js8m
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T10:39:05.234Z'
updatedAt: '2026-05-12T10:39:05.234Z'
codexThreadId: null
runStatus: idle
lastRunId: null
lastRunStartedAt: null
---
# Polish toast and Codex status feedback chrome

## Parent Epic

Frontend refinement and completion pass

## Context

Make global feedback feel intentional by improving toast structure, dismissal behavior, accessibility, and coexistence with the Codex status rail.

## Codebase Findings

- `src/renderer/src/App.tsx:2923`-`2935` declares global `toast` and `codexStatus` state in `RelayApp`.
- `src/renderer/src/App.tsx:3170`-`3181` renders `.status-rail` with `.codex-status`, a Codex label/version message, and a refresh button.
- `src/renderer/src/App.tsx:3209`-`3217` renders `.toast` as plain text with click-to-dismiss and `role="alert"` only for error toasts, `role="status"` otherwise.
- `src/renderer/src/styles.css:1066`-`1120` styles `.status-rail` and `.codex-status`.
- `src/renderer/src/styles.css:2761`-`2788` styles `.toast`; it has no inner layout, icon, close button, or width behavior beyond max-width.
- `src/renderer/src/styles.css:2985`-`2993` makes `.status-rail` full-width at max-width 700px, which can overlap the bottom-centered toast.
- `src/renderer/src/components/GitMetadata.tsx:56`-`72` shows the established compact status-pill pattern: lucide icon, title, and `aria-label`.
- `package.json:18`-`19` provides the available test/typecheck commands.

## Requirements

- Render toasts with an icon, message text, and explicit dismiss button while preserving `role="alert"` for errors and `role="status"` for info/success.
- Auto-dismiss success and info toasts after a conservative delay; keep error toasts visible until dismissed.
- Prevent the Codex status rail and toast from overlapping on desktop and narrow layouts.
- Codex status rail must keep the existing refresh behavior and visible CLI version/message.
- Do not change how callers set toast messages or how Codex status is fetched.

## Implementation Plan

- Add an exported `ToastView` component or equivalent small presentational helper in `src/renderer/src/App.tsx` near the `Toast` type at line 90, using existing lucide icons and accepting `toast` plus `onDismiss`.
- Update `RelayApp` at `src/renderer/src/App.tsx:2923`-`2935` and `3209`-`3217` to render `ToastView` and add an effect that clears non-error toasts after the chosen delay while cleaning up timers on toast change/unmount.
- Add a `has-toast` class to the app shell at `src/renderer/src/App.tsx:3131` when a toast is present so CSS can offset `.status-rail` without changing status behavior.
- Update `.status-rail`, `.codex-status`, `.toast`, and new toast child selectors in `src/renderer/src/styles.css:1066`-`1120`, `2761`-`2788`, and relevant responsive rules at `2985`-`2993` so toast/status rail do not overlap and long messages wrap cleanly.
- Add static-render tests for `ToastView` in `tests/ticket-draft-ui.test.tsx` or a new focused renderer test, covering info/success/error roles, icon/close button rendering, and long message text.
- Run `npm run typecheck` and `npm test`.

## Test Plan

- Run `npm test -- tests/ticket-draft-ui.test.tsx` if the toast tests are added there; otherwise run `npm test`.
- Run `npm run typecheck`.
- Manual check with `npm run dev`: trigger info, success, and error toasts; verify info/success clear automatically, error persists, dismiss button works, and the Codex status rail stays visible without overlapping the toast at desktop and narrow widths.

## Acceptance Criteria

- Toasts have structured content with an icon, readable message, and accessible dismiss button.
- Info and success toasts auto-dismiss; error toasts persist until dismissed.
- Toast and Codex status rail do not overlap at desktop, 700px, or 520px widths.
- Codex status refresh still calls `getRelayApi().codex.status().then(setCodexStatus)` and keeps the current message/version display.
- New toast static-render tests pass along with existing renderer tests.

## Assumptions / Open Questions

- A five-second auto-dismiss delay is appropriate for non-error toasts unless implementation finds an existing local convention.
- Error toasts should persist because they often contain actionable failure text.

## Implementation Notes

- Avoid changing all toast call sites; keep the existing `{ kind, message }` shape and improve only the rendering/lifecycle around it.

## Codex Handoff

No Codex run has been started.
