---
schemaVersion: 1
id: tkt_01krb6n793qx3npdqbg8jhnf00
title: Tone Down Relay Primary Brand Colour
status: completed
position: 13000
priority: medium
labels:
  - frontend
  - design-system
  - branding
  - ui-polish
createdAt: '2026-05-11T09:42:26.339Z'
updatedAt: '2026-05-11T10:11:25.240Z'
codexThreadId: 019e167d-821a-7511-9a70-97734e748111
runStatus: completed
lastRunId: run_01krb82xrw6k06t4qzcg64926t
---
# Tone Down Relay Primary Brand Colour

## Context

Found the completed ticket `tkt_01krb4f6v4q61cz7v694g53prq` titled "Update Relay Primary Brand Colour". That work changed Relay's primary theme tokens to the prominent brand red `#D82927` in `src/renderer/src/styles.css`. Create a follow-up implementation to replace that bright red with a subtler, darker red so primary UI elements feel less dominant in the dark Relay interface while still retaining a red brand direction.

## Requirements

- Update the central primary colour tokens rather than editing individual component styles ad hoc.
- Replace `--relay-primary: #D82927` with an approved subtler dark red, or propose 2-3 darker red options for approval before final implementation if no exact value is provided.
- Update related explicit tokens consistently, including primary hover, active, muted, primary text, ring, button contrast, and any documented theme references.
- Keep the scope limited to primary brand/accent styling; do not change danger/error, success, warning, neutral, layout, copy, or unrelated component styling unless they directly depend on the primary token.
- Ensure primary buttons, links, selected states, focus rings, navigation highlights, badges, and primary-accent text remain visually coherent and less prominent than the current `#D82927` treatment.
- Preserve accessible contrast for primary button text, primary links, selected states, and focus indicators against the existing dark theme surfaces.

## Acceptance Criteria

- The bright primary brand red `#D82927` no longer appears as the app's primary UI colour in source theme tokens or visible primary UI surfaces.
- Primary UI elements use a darker, subtler red palette consistently through the shared token system.
- Primary button default, hover, active, disabled, and focus states remain readable and distinguishable.
- Primary-accent links/icons still meet WCAG AA contrast where applicable on dark surfaces.
- No unrelated palette, layout, or component refactors are introduced.
- Theme documentation is updated if it currently references the prior `#D82927` primary colour behaviour.
- Existing tests, typecheck, and build pass, or any failures are documented as unrelated.

## Clarification Questions

- What exact darker red should replace `#D82927`, or should the implementer propose 2-3 subtle red options for approval?
- Should the target still read clearly as Relay/Foodhub brand red, or is the goal primarily to reduce visual prominence even if it becomes more muted?
- Should the earlier muted sage palette from `tkt_01krb0hkb6gk5518gqwh594rdw` remain out of scope, with this follow-up staying in the red colour family?

## Implementation Notes

- Start from the completed ticket `tkt_01krb4f6v4q61cz7v694g53prq` and inspect its handoff for the previous token changes.
- Primary tokens currently live near the top of `src/renderer/src/styles.css`; update that source of truth first.
- Check `docs/ui-theme.md` for primary token documentation that may need to reflect the toned-down red.
- Prefer a darker red such as a deep oxblood/brick direction over saturated brand red; derive hover/active states using the existing pattern of slightly lighter hover and darker active colours.
- Run contrast checks for primary button text, primary text on dark surfaces, and focus ring visibility before finalizing.
- Search for remaining `#D82927`, `#C92422`, `#B8201F`, `216 41 39`, and related explicit red values after the update to catch stale references.

## Codex Handoff

### 5/11/2026, 11:11:25 AM

**Summary of changes made**
- Updated the central primary theme token family to the approved darker red `#9F1D1B` in [styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css:23).
- Derived coherent hover, active, muted, foreground accent, and focus ring tokens from that darker red.
- Added a short theme-doc note that primary is now a muted dark red and `--relay-primary-text` should be used for foreground accents on dark surfaces.

**Files changed**
- [src/renderer/src/styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css:23)
- [docs/ui-theme.md](/Users/robertpitt/Projects/relay/docs/ui-theme.md:27)

**Commands run**
- `git status --short`
- `sed` / `nl` inspections of `styles.css`, `docs/ui-theme.md`, and `package.json`
- `git grep` / `grep` searches for old red values and prior sage values
- `node` contrast-check script
- `npm test`
- `npm run typecheck`
- `npm run build`
- `git diff -- src/renderer/src/styles.css docs/ui-theme.md`

**Tests run and results**
- `npm test`: passed, 25/25 tests.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Contrast checks passed:
  - Primary button: `7.88:1`
  - Hover: `6.53:1`
  - Active: `9.93:1`
  - Primary text on raised surface: `4.72:1`
  - Focus ring on app bg: `3.48:1`

**Remaining risks or follow-up work**
- No product follow-up identified.
- `rg` is not installed in this environment, so searches used `git grep`/`grep`.
- Historical Relay ticket/run logs still mention `#D82927`; tracked source/docs/tests and the current built renderer CSS referenced by `out/renderer/index.html` no longer use it for the primary UI palette.
- Existing `.relay` metadata changes were present in the worktree; I left them alone and did not mark the ticket completed.


### 5/11/2026, 11:03:25 AM

I need the primary red value approved before editing the shared theme tokens.

```relay-clarification
{"questions":[{"question":"Which darker primary red should replace #D82927? Suggested options: #9F1D1B deep brand red, #8F241F brick red, or #7A1E1E oxblood red."}]}
```


No Codex run has been started.
