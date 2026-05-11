# Relay UI Theme Tokens

Relay uses a dark-first, CSS-variable theme in `src/renderer/src/styles.css`. New UI work should consume the `--relay-*` semantic tokens rather than hard-coding component colors, spacing, radii, shadows, or focus rings.

## Reference

- Reference project: `t3code`
- Repository: https://github.com/pingdotgg/t3code
- Reference commit: `b793401aee383e56a1e4663568d82cd848651e59`
- License: MIT License, copyright 2026 T3 Tools Inc.
- Reference files reviewed: `apps/web/src/index.css`, `apps/web/src/components/ui/button.tsx`, `apps/web/src/components/ui/sidebar.tsx`

The MIT license permits use, modification, and redistribution when the copyright and license notice are included with substantial copied portions. Relay does not copy `t3code` components or proprietary Codex assets; the redesign adapts broad token concepts such as semantic surface colors, compact radii, subtle borders, focus rings, and dense sidebar/button sizing into Relay-owned CSS.

## Token Structure

- Color tokens: `--relay-bg`, `--relay-chrome`, `--relay-sidebar`, `--relay-surface*`, `--relay-popover`, `--relay-input`, text, border, primary, primary text, info, success, warning, and danger tokens.
- Layout tokens: `--relay-space-*` and `--relay-radius-*` keep spacing and corners consistent across shell, cards, dialogs, and controls.
- Interaction tokens: `--relay-ring`, `--relay-focus-ring`, hover/active surface tokens, disabled opacity, and state-muted colors cover keyboard and pointer states.
- Elevation tokens: `--relay-shadow-sm`, `--relay-shadow-panel`, `--relay-shadow-modal`, and `--relay-inset-highlight` define restrained panel depth.
- Typography tokens: `--relay-font-sans`, `--relay-font-mono`, and `--relay-text-*` provide the app scale.

## Usage Guidelines

Prefer semantic tokens that match intent. For example, use `--relay-surface` for panels, `--relay-surface-2` for raised cards, `--relay-input` for editable controls, `--relay-border` for default separators, `--relay-primary` for primary action backgrounds or selected navigation, and `--relay-primary-text` for primary-accent foreground text and icons.

Relay's primary family is a muted dark red. Use the background-oriented primary tokens for filled or selected states, and use `--relay-primary-text` when the primary accent appears as foreground text or icons on dark surfaces.

Repeated UI primitives should inherit from the shared selectors already defined for `button`, `input`, `textarea`, `select`, `.ticket-card`, `.modal`, `.detail-panel`, badges, health alerts, and empty states. Add new class-level styling only when a component needs layout or behavior beyond those primitives.

Keep the design dark-first unless explicit light-mode support is added. If light mode is introduced later, override the same semantic `--relay-*` variables at the theme boundary instead of forking component CSS.
