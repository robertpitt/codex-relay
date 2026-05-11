---
schemaVersion: 1
id: tkt_01krb4f6v4q61cz7v694g53prq
title: Update Relay Primary Brand Colour
status: completed
position: 12000
priority: high
labels:
  - frontend
  - design-system
  - branding
createdAt: '2026-05-11T09:04:12.132Z'
updatedAt: '2026-05-11T09:09:53.026Z'
codexThreadId: 019e1648-2f5c-7aa3-91a9-462583f43764
runStatus: completed
lastRunId: run_01krb4gbqqm3cwncv0xp34hqkf
---
# Update Relay Primary Brand Colour

## Context

Update Relay's primary colour across the application to the new brand red: HEX #D82927, RGB 216/41/39, CMYK 9/97/100/1. The change should be made through the existing theme, design token, or CSS variable system wherever possible so primary UI surfaces remain consistent and maintainable.

## Requirements

- Locate the existing source of truth for primary brand colour usage, such as theme config, design tokens, CSS variables, Tailwind config, component library theme, or shared style constants.
- Replace the current primary colour value with #D82927 in the appropriate source of truth rather than changing individual component styles ad hoc.
- Update any derived primary colour references required by the existing styling system, such as hover, active, focus, border, disabled, or contrast variants, only if they are explicitly defined separately.
- Ensure primary buttons, links, focus states, selected states, badges, navigation highlights, and other primary-accent UI elements use the updated colour consistently.
- Check that text and icon contrast remains accessible on primary-coloured backgrounds, especially white or dark text over #D82927.
- Avoid changing unrelated secondary, success, warning, danger, or neutral colour tokens unless they currently alias the primary colour by design.

## Acceptance Criteria

- The application's primary colour is visibly updated to #D82927 wherever the primary brand/accent colour is used.
- There is a single maintainable source of truth for the updated primary colour, or the implementation follows the existing project pattern if multiple theme files are already required.
- Primary button default, hover, active, and focus styles still render correctly and remain readable.
- No unrelated colour palette changes are introduced.
- Relevant visual or component tests are updated if snapshots or expected styles reference the old primary colour.
- A local run or build completes successfully after the change.

## Clarification Questions

- Should #D82927 also replace any existing danger/error red if the current palette treats brand primary and error as separate colours?
- Are logo, favicon, app icons, email templates, or generated image assets in scope, or only the web/app UI theme?
- Do you have approved hover/active/focus variants for #D82927, or should the implementation derive them using the project's existing colour adjustment pattern?

## Implementation Notes

- Start by searching for the current primary colour token names and theme files before editing components.
- Prefer updating semantic tokens such as primary, brand, accent, or theme.primary over raw colour replacements across the codebase.
- If the project uses Tailwind, check tailwind config, global CSS variables, and any component-library theme adapter.
- If the project uses CSS custom properties, update the root token and confirm dark mode or alternate themes do not override it unexpectedly.
- If accessibility contrast is insufficient for existing foreground text on #D82927, adjust only the foreground token or documented paired text colour according to the existing design system pattern.

## Codex Handoff

### 5/11/2026, 10:09:53 AM

Summary of changes made:
- Updated Relay’s primary theme token to `#D82927` in [styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css:23).
- Updated explicit primary hover, active, muted, focus ring, and foreground tokens.
- Switched primary button text to white for AA contrast.
- Added `--relay-primary-text` for accessible primary-accent links/icons on dark surfaces.
- Updated theme docs to describe `--relay-primary-text`.

Files changed:
- [src/renderer/src/styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css:23)
- [docs/ui-theme.md](/Users/robertpitt/Projects/relay/docs/ui-theme.md:17)

Commands run:
- `git status --short`
- `find ... grep ...` searches for primary tokens and old colour values
- `sed` inspections of relevant CSS sections
- `node` contrast-check script
- `npm test`
- `npm run build`

Tests run and results:
- `npm test`: passed, 25/25 tests.
- `npm run build`: passed, including `tsc --noEmit` and `electron-vite build`.
- Contrast spot checks passed: primary button `4.92:1`, hover `5.59:1`, active `6.43:1`, primary text on raised surface `4.93:1`, focus ring on app background `4.02:1`.

Remaining risks or follow-up:
- No known follow-up for this ticket.
- The worktree already had unrelated modified/untracked files before this work; I left them in place and did not mark the ticket complete.


No Codex run has been started.
