---
schemaVersion: 1
id: tkt_01krb3r7cej86saa0k90cftzan
title: Set primary brand color to Foodhub LTD Red
status: todo
position: 10000
priority: medium
labels:
  - frontend
  - branding
  - theme
  - design-system
createdAt: '2026-05-11T08:51:39.022Z'
updatedAt: '2026-05-11T08:51:39.022Z'
codexThreadId: null
runStatus: idle
lastRunId: null
---
# Set primary brand color to Foodhub LTD Red

## Context

Relay should use Foodhub LTD Red as its primary UI color. The change should be made through the app's shared theme/design-token layer so primary buttons, links, focus states, highlights, and other primary-colored UI elements update consistently without broad hard-coded edits.

## Requirements

- Identify the central color/theme configuration used by the Relay frontend.
- Replace the existing primary color token/value with Foodhub LTD Red once the exact brand color is confirmed.
- Update primary color variants where applicable, including hover, active, disabled, focus ring, and contrast text colors.
- Check for hard-coded references to the previous primary color and migrate them to the shared token where appropriate.
- Ensure the updated primary color remains accessible for text, buttons, focus states, and interactive controls.
- Update any relevant visual snapshots, Storybook examples, or documentation if the project uses them.

## Acceptance Criteria

- Primary UI elements across the app render using Foodhub LTD Red via shared theme tokens.
- No user-facing primary buttons, links, badges, or active states continue using the previous primary color unless intentionally scoped as non-primary styling.
- Hover, active, disabled, and focus states remain visually consistent and accessible.
- Automated tests, linting, and type checks pass for the affected frontend package.
- Any visual regression snapshots or design references affected by the color change are updated deliberately.

## Clarification Questions

- What is the exact Foodhub LTD Red value to use, such as a hex, RGB, or design-token reference?
- Should this apply globally across all Relay frontend surfaces or only to a specific app/brand context?
- Should logos, illustrations, and static assets be updated too, or only UI theme colors?

## Implementation Notes

- Prefer changing the central theme/design-token source instead of editing individual components.
- If Foodhub LTD Red is not already defined in the codebase, add it with a clear token name such as `foodhubRed` or update the existing `primary` token directly, matching local naming conventions.
- Validate contrast against WCAG AA for primary button text and focus indicators before finalizing the color variants.

## Codex Handoff

No Codex run has been started.
