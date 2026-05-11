# Relay

Relay is a local-first desktop app for managing software work as kanban cards and running Codex against those cards. It is built with Electron, React, TypeScript, and `@openai/codex-sdk`.

Relay is designed for one developer working across local project folders. Each project keeps its board state in a `.relay/` directory inside that project, so tickets and run history remain portable with the codebase.

## Contents

- [Project Overview](#project-overview)
- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Environment Variables and Secrets](#environment-variables-and-secrets)
- [Local Data and Services](#local-data-and-services)
- [Development Commands](#development-commands)
- [Repository Structure](#repository-structure)
- [Development Workflow](#development-workflow)
- [Troubleshooting](#troubleshooting)

## Project Overview

Relay has three main runtime pieces:

- Electron main process in `src/main/`: owns IPC handlers, filesystem access, project initialization, app registry storage, logging, run events, and Codex SDK lifecycle.
- Preload bridge in `src/preload/`: exposes a typed `window.relay` API to the renderer through Electron IPC.
- React renderer in `src/renderer/`: renders the project sidebar, board, ticket editor, draft flow, run console, and user-facing errors.

Project state is file-based:

- `.relay/project.json` stores project metadata, columns, and settings.
- `.relay/tickets/<ticket-id>.md` stores tickets as Markdown with YAML front matter.
- `.relay/clarifications/<ticket-id>.json` stores formal clarification questions and answers.
- `.relay/runs/<ticket-id>/<run-id>.jsonl` stores streamed Codex run events.
- `.relay/audit.jsonl` records status changes and clarification events.

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

## Keyboard Shortcuts

Relay keeps `Tab` for normal accessibility focus traversal. Ticket browsing uses Arrow keys or `J`/`K` when focus is on the board, a ticket card, or the page body.

| Shortcut | Action |
| --- | --- |
| `Esc` | Close the topmost dialog, modal, or ticket drawer when there is no unsaved input. |
| `Cmd`+`Space` on macOS, `Ctrl`+`Space` elsewhere | Open Create Ticket from the main board context. |
| `Arrow Down` / `Arrow Right` / `J` | Focus the next ticket on the board. |
| `Arrow Up` / `Arrow Left` / `K` | Focus the previous ticket on the board. |

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

Relay uses this project-local structure; some files and directories are created on demand:

```text
<project>/
  .relay/
    project.json
    tickets/
      <ticket-id>.md
    clarifications/
      <ticket-id>.json
    runs/
      <ticket-id>/
        <run-id>.jsonl
    audit.jsonl
    attachments/
    backups/
    trash/
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
  tests/                     Node test suite for backend, IPC, renderer helpers, and UI flows.
  src/
    main/                    Electron main process, IPC registration, window lifecycle, and services.
      electron/              Effect-wrapped Electron app, dialog, shell, IPC, and window adapters.
      ipc/                   Typed IPC definitions, schemas, registration, and method handlers.
        methods/projects.ts  Project registry, initialization, summaries, Git metadata, and reveal actions.
        methods/tickets.ts   Ticket creation, drafts, subtickets, moves, clarifications, updates, and file actions.
        methods/board.ts     Board snapshot reads.
        methods/codex.ts     Codex status, run lifecycle, approvals, and run event reads.
      services/
        storage/             .relay project config, ticket Markdown, clarification, audit, and trash helpers.
        registry/            App-level project registry persisted under Electron userData.
        codex/               Codex drafting, ticket update, execution, status, and bounded research flows.
        run-events/          JSONL run log writing and renderer event fan-out.
        git/                 Cached project Git metadata.
        io/                  File, path, process, HTTP, and socket boundaries for backend code.
        logger/              App log helpers.
        runtime/             Effect runtime and app layer composition.
      window/                Main window orchestration and run event delivery.
    preload/                 Typed window.relay bridge exposed to the renderer.
    renderer/                React app, styles, components, and renderer helper libraries.
      src/components/        UI components such as agent activity, clarifications, Git metadata, and Markdown.
      src/lib/               Renderer-only API, keyboard, Markdown, ticket reference, and progress helpers.
    shared/                  Shared runtime types and IPC contract.
```

Generated or local-only directories such as `node_modules/`, `out/`, and project `.relay/runs/` logs should not be edited as source.

### Backend Map

- Project management starts in `src/main/ipc/methods/projects.ts`, which calls `readRegistry`, `upsertProjectPath`, and `removeProjectPath` from `src/main/services/registry/`, plus `initializeProject` and `summarizeProject` from `src/main/services/storage/`.
- Board and ticket management are exposed through `src/main/ipc/methods/board.ts` and `src/main/ipc/methods/tickets.ts`. Ticket storage lives in `src/main/services/storage/index.ts` and covers Markdown parsing, ticket creation, epic/subticket relationships, moves, saves, deletes to `.relay/trash/`, duplicates, clarification records, and audit events.
- Codex-backed draft, ticket update, and execution flows live in `src/main/services/codex/`. `index.ts` owns `createTicketDraft`, `draftToCreateInput`, `startTicketUpdateRun`, `startCodexRun`, `resumeCodexRun`, cancellation, and run-state transitions. `research.ts` does bounded URL and repository research for ticket drafts, and `status.ts` checks CLI/auth availability.
- Run event persistence and renderer fan-out are in `src/main/services/run-events/`; events are written to `.relay/runs/<ticket-id>/<run-id>.jsonl` and emitted to the renderer as `RendererRunEvent`.
- Shared data shapes live in `src/shared/types.ts`. The channel contract lives in `src/shared/ipc.ts`, with runtime IPC payload/result validation in `src/main/ipc/schema.ts` and handler registration in `src/main/ipc/RelayIpc.ts`.

### Test Map

- `tests/backend.test.ts` covers storage, tickets, subtickets, clarification questions, Codex run dependencies, and backend behavior.
- `tests/ticket-draft.test.ts` covers Codex draft generation, `draftToCreateInput`, valid draft JSON, and epic draft behavior.
- `tests/ticket-update.test.ts` covers agent ticket update persistence and clarification creation.
- `tests/ipc-contract.test.ts` keeps every shared IPC channel backed by exactly one schema-validated main-process method.
- `tests/import-boundaries.test.ts` protects backend IO and Electron import boundaries.
- Renderer-focused tests cover keyboard shortcuts, project sidebar behavior, Markdown rendering, ticket references, agent progress, Git metadata, and clarification UI.

## Development Workflow

Before changing behavior, read `SPEC.md` and the relevant service or renderer code. The spec is the source for product intent, while the TypeScript implementation is the source for current commands and runtime behavior.

Keep process boundaries intact:

- Filesystem access, dialogs, logging, `.relay` initialization, and Codex work belong in the Electron main process.
- Renderer code should call the typed API exposed by `src/preload/index.ts`.
- Shared request and response shapes should live in `src/shared/types.ts`; shared IPC channel signatures should live in `src/shared/ipc.ts`.

For changes that touch ticket files or run state, verify the `.relay` schema in `src/main/services/storage/` and validation schemas in `src/main/services/schemas.ts`. For IPC changes, update both `src/shared/ipc.ts` and the matching method module under `src/main/ipc/methods/`, then keep `src/preload/index.ts` aligned with the exposed renderer API.

For Codex flows, start in `src/main/services/codex/index.ts`. Ticket drafting uses `CreateDraftInput`, `TicketDraft`, `TicketCreateInput`, and `draftToCreateInput`; ticket update uses `AgentTicketUpdateInput` and `AgentTicketUpdate`; execution uses `StartRunInput`, ticket run state, clarification records, and run events.

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
