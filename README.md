# Relay

Relay is a local-first desktop app for managing software work as kanban cards and running Codex against those cards. It is built with Electron, React, TypeScript, and `@openai/codex-sdk`.

Relay is designed for one developer working across local project folders. Each project keeps its board state in a `.relay/` directory inside that project, so tickets and run history remain portable with the codebase.

## Contents

- [Project Overview](#project-overview)
- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Environment Variables and Secrets](#environment-variables-and-secrets)
- [Local Data and Services](#local-data-and-services)
- [Development Commands](#development-commands)
- [Repository Structure](#repository-structure)
- [Development Workflow](#development-workflow)
- [Troubleshooting](#troubleshooting)

## Project Overview

Relay has three main runtime pieces:

- Electron main process in `src/main/`: owns filesystem access, project initialization, app registry storage, logging, and Codex SDK lifecycle.
- Preload bridge in `src/preload/`: exposes a typed `window.relay` API to the renderer through Electron IPC.
- React renderer in `src/renderer/`: renders the project sidebar, board, ticket editor, draft flow, run console, and user-facing errors.

Project state is file-based:

- `.relay/project.json` stores project metadata, columns, and settings.
- `.relay/tickets/<ticket-id>.md` stores tickets as Markdown with YAML front matter.
- `.relay/runs/<ticket-id>/<run-id>.jsonl` stores streamed Codex run events.

There is no database server, container stack, or hosted issue tracker requirement for local development.

## Prerequisites

- Node.js 18 or newer. The Codex SDK integration requires Node 18+.
- npm. The current lockfile is `package-lock.json`.
- Git, strongly recommended. Relay can manage boards for non-Git folders, but Codex execution is disabled by default for non-Git projects.
- Codex CLI and Codex authentication for agent-backed ticket drafting or execution.

Manual board and ticket management works without Codex. Codex-backed features require `codex` to be available on `PATH` and an authenticated Codex session or API key.

## Local Setup

From a clean checkout:

```sh
npm install
```

If you want to use Codex-backed drafting or execution, verify Codex before starting the app:

```sh
codex --version
codex login
```

Then start the Electron development app:

```sh
npm run dev
```

In the app:

1. Click `Add Project`.
2. Choose a local project folder.
3. Confirm initialization when Relay asks to create `.relay/`.
4. Create a manual ticket or use Codex to draft one.
5. Open a ticket and start or resume a Codex run when needed.

## Environment Variables and Secrets

Relay does not require a `.env` file for basic local development, and no example env file currently exists in the repo.

Codex authentication is discovered from one of these sources:

- `~/.codex/auth.json`, usually created by `codex login`.
- `OPENAI_API_KEY`
- `CODEX_API_KEY`

The app inherits environment variables from the shell that launched it. If you use an API key, export it in your terminal before running `npm run dev`.

Do not store API keys, Codex auth tokens, bearer tokens, or other secrets in `.relay/`, ticket Markdown, run logs, or committed files.

`ELECTRON_RENDERER_URL` is used internally by `electron-vite` during development. You should not need to set it manually for normal local work.

## Local Data and Services

Relay is local-first and uses the filesystem instead of a database.

Each project initialized by Relay gets this structure:

```text
<project>/
  .relay/
    project.json
    tickets/
      <ticket-id>.md
    runs/
      <ticket-id>/
        <run-id>.jsonl
    attachments/
    backups/
```

The Electron app also stores an app-level registry and log under Electron `userData`. On macOS with the current package name, the log script tails:

```text
~/Library/Application Support/relay/relay.log
```

The registry is a cache of known project folders. Removing a project from the sidebar should not delete that project folder or its `.relay/` data.

## Development Commands

| Command | Purpose |
| --- | --- |
| `npm install` | Install dependencies from `package-lock.json`. |
| `npm run dev` | Start the Electron app in development mode with `electron-vite`. |
| `npm run dev:logs` | Start development mode and tee process output to `/tmp/relay-dev.log`. |
| `npm run logs:dev` | Tail `/tmp/relay-dev.log` from a separate terminal. |
| `npm run logs` | Tail the Relay app log at `~/Library/Application Support/relay/relay.log` on macOS. |
| `npm test` | Run the Node test suite in `tests/`. |
| `npm run typecheck` | Run TypeScript with `tsc --noEmit`. |
| `npm run build` | Run TypeScript checks and build Electron main, preload, and renderer output. |
| `npm run preview` | Preview the built Electron app with `electron-vite preview`. |

There are currently no `lint` or `format` scripts in `package.json`. Use `npm test`, `npm run typecheck`, and `npm run build` as the available verification commands until those workflows are added.

## Repository Structure

```text
.
  SPEC.md                    Product and architecture specification.
  electron.vite.config.ts    Electron Vite build configuration.
  package.json               npm scripts and dependencies.
  src/
    main/                    Electron main process and services.
    preload/                 Typed IPC bridge exposed to the renderer.
    renderer/                React app, styles, and renderer entrypoint.
    shared/                  Shared TypeScript types.
```

Generated or local-only directories such as `node_modules/`, `out/`, and project `.relay/runs/` logs should not be edited as source.

## Development Workflow

Before changing behavior, read `SPEC.md` and the relevant service or renderer code. The spec is the source for product intent, while the TypeScript implementation is the source for current commands and runtime behavior.

Keep process boundaries intact:

- Filesystem access, dialogs, logging, `.relay` initialization, and Codex work belong in the Electron main process.
- Renderer code should call the typed API exposed by `src/preload/index.ts`.
- Shared request and response shapes should live in `src/shared/types.ts`.

For changes that touch ticket files or run state, verify the `.relay` schema in `src/main/services/storage.ts` and `src/main/services/schemas.ts`.

For coding agents working from Relay tickets:

- Follow the ticket text exactly and ask for clarification when a required product or implementation decision is missing.
- Do not mark tickets completed yourself unless explicitly asked.
- End with a handoff that includes changes made, files changed, commands run, tests run, and remaining risks.

Before handing off a code change, run at least:

```sh
npm run typecheck
```

Run `npm run build` when changes affect Electron, Vite, packaging, or cross-process behavior.

## Troubleshooting

### `Codex CLI was not found on PATH`

Install or expose the Codex CLI in the shell that starts Relay. Verify with:

```sh
codex --version
```

Manual ticket creation still works without Codex.

### `Codex is not authenticated`

Run:

```sh
codex login
```

Alternatively, export `OPENAI_API_KEY` or `CODEX_API_KEY` before launching Relay.

### Codex execution is blocked for a project

Relay disables Codex execution by default when the selected project is not a Git repository. Use a Git-backed project folder for Codex runs, or intentionally enable non-Git runs in that project's `.relay/project.json` by setting `settings.allowNonGitCodexRuns` to `true`.

### The board shows invalid ticket files

Check `.relay/tickets/*.md`. Ticket front matter must include the fields defined in `src/shared/types.ts`, and each ticket `status` must match a column ID in `.relay/project.json`.

### Runtime errors or blank app window

Start the app with log capture:

```sh
npm run dev:logs
```

Then inspect the development log:

```sh
npm run logs:dev
```

For app-level logs on macOS, use:

```sh
npm run logs
```

### TypeScript or build failures after dependency changes

Reinstall dependencies from the lockfile, then rerun verification:

```sh
npm install
npm run typecheck
npm run build
```
