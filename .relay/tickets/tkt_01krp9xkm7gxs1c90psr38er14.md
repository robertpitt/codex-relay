---
schemaVersion: 1
id: tkt_01krp9xkm7gxs1c90psr38er14
title: Correct README Source Map and Stale Technical References
ticketType: task
status: todo
position: 25000
priority: low
effort: medium
labels:
  - documentation
  - readme
  - developer-experience
parentEpicId: null
subticketIds: []
blockedByIds: []
relatedTicketIds: []
createdAt: '2026-05-15T17:11:05.607Z'
updatedAt: '2026-05-15T17:13:35.489Z'
authoringState: reviewing
codexThreadId: null
runStatus: draft_complete
lastRunId: run_01krp9zha0bqvex6jjsf2dbgpk
lastRunStartedAt: null
---
# Correct README Source Map and Stale Technical References

## Context

Create a narrow README follow-up that fixes stale or misleading technical references in the current root `README.md`. Existing open README tickets already cover layout/scannability and copy polish, so this task should focus only on factual accuracy against the current repository structure and scripts.

## Goal

Edit only `README.md` unless a referenced path must be confirmed in a minimal adjacent docs note; no application source or package script changes.

## Decisions / Assumptions

- The user’s clarification answer means this should be drafted as a distinct follow-up only for a gap not already covered by open README tickets.
- The safest distinct gap is README factual accuracy against the current repository structure, not another broad README improvement pass.
- Manual Markdown/path validation is sufficient because `package.json` defines no markdown lint or link-check script.
- Priority is low because the work is documentation-only and does not affect runtime behavior.

## Requirements

- Edit only `README.md` unless a referenced path must be confirmed in a minimal adjacent docs note; no application source or package script changes.
- Update the Repository Map to match the current source layout, including root-level `src/storage/`, `src/services/`, `src/workflows/`, `src/domain/`, `src/config/`, and current shared schema/http locations where useful.
- Fix stale path references, especially the invalid-ticket troubleshooting note that points to nonexistent `src/shared/types.ts`.
- Preserve existing setup, Codex, local data, command, distribution, and troubleshooting content unless a sentence needs a small factual correction tied to current files.
- Avoid overlapping with the open scannability and punctuation tickets: do not reorder major sections, change product positioning, or do sentence-level copy polish beyond necessary accuracy fixes.

## Acceptance Criteria

- `README.md` no longer points readers to nonexistent source paths such as `src/shared/types.ts` or `src/services/storage/`.
- The Repository Map accurately reflects the current top-level `src/` organization and does not invent directories that are absent from the checkout.
- Existing quick start, command table, Codex setup, screenshots, local data description, and distribution instructions remain technically unchanged except for factual path corrections.
- The change is documentation-only and does not duplicate the scope of the existing README layout/scannability or punctuation tickets.
- Markdown remains valid and readable in a GitHub-style renderer.

## Test Plan

- Run `git diff -- README.md` and confirm the diff is limited to factual README corrections, not layout or copy-polish scope creep.
- Manually verify every source path named in the updated Repository Map exists in the current checkout.
- Manually verify the corrected troubleshooting schema path exists and no `src/shared/types.ts` reference remains in `README.md`.
- Preview or read-render `README.md` to confirm headings, fenced blocks, tables, and image links still render cleanly.
- No full app test suite is required for README-only changes; run `npm run typecheck` only if any non-README file is touched unexpectedly.

## Implementation Notes

- Codebase finding: `README.md:143-165` contains the Repository Map. It currently places storage under `src/services/storage/`, but the current source tree uses root-level `src/storage/` with store files under `src/storage/stores/`.
- Codebase finding: `README.md:249-251` says invalid ticket front matter fields are defined in `src/shared/types.ts`; that file does not exist. Ticket schemas now live under `src/shared/schemas/ticket.ts`, with shared schema exports under `src/shared/schemas/index.ts`.
- Codebase finding: `README.md:124-141` documents commands that match `package.json:9-20`: `dev`, `dev:logs`, `logs:dev`, `logs`, `test`, `typecheck`, `build`, `clean:dist`, `package:binary`, `dist`, and `preview`; it also correctly notes there is no lint or format script.
- Codebase finding: `README.md:27-33` references showcase images `assets/front.png`, `assets/front-2.png`, and `assets/ticket.png`; all three files exist in `assets/`.
- Codebase finding: Open related README work exists: `.relay/tickets/tkt_01krp8bgc21nq0pp3bz0w89gfm.md` covers README layout/scannability, and `.relay/tickets/tkt_01krp8anc2mptpgfv41z3cr591.md` covers punctuation/minor copy, so this ticket should not restructure or rewrite prose broadly.
- Implementation: Update `README.md` Repository Map so the directory bullets reflect the current `src/` tree: `http/`, `services/`, `storage/`, `workflows/`, `runtime/`, `platform/`, `renderer/`, `shared/`, plus top-level app/config/domain entries if included.
- Implementation: Replace the troubleshooting reference to `src/shared/types.ts` with the current ticket schema location, `src/shared/schemas/ticket.ts`, and mention shared schema exports only if needed for clarity.
- Implementation: Check README-local references to commands and showcase images while editing; leave them unchanged unless the final diff exposes a factual mismatch.
- Implementation: Keep the diff intentionally documentation-only and accuracy-focused, with no source code, package manifest, lockfile, generated output, or ticket-file edits.
- Implementation: Perform a final README pass for broken relative paths introduced by the edit and for accurate Markdown code fence/list rendering.
- The working tree is already dirty, including `README.md`; implementation should preserve unrelated in-flight changes and avoid reverting user edits.
- `rg` is unavailable in this shell, so research used `find`, `grep`, `sed`, and `nl`.
- No external sources were needed; the ticket is grounded in local repository files and existing Relay tickets.
- Do not edit `.relay/tickets/*` as part of implementation; related tickets are referenced only to keep scope distinct.

## Codex Handoff

No Codex run has been started.
