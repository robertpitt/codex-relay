# Relay Desktop Application Specification

Status: Draft v1

Last updated: 2026-05-10

## Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, `RECOMMENDED`, `MAY`, and `OPTIONAL` in this document are to be interpreted as described in RFC 2119.

`Implementation-defined` means the implementation MUST document the selected behavior.

## 1. Problem Statement

Relay is a local-first desktop application for managing software work as kanban cards and executing that work with Codex.

Relay is similar in spirit to the OpenAI Codex desktop app, but its primary surface is a project board rather than a chat list. A user opens Relay, sees local projects in a sidebar, selects a project, and works from a Trello-style board. Each board card is a concrete implementation ticket that can be drafted, refined, executed, resumed, and reviewed through Codex.

Relay solves these user problems:

- Users often have multiple local projects but no lightweight local-first place to organize implementation work.
- Coding agent sessions are usually chat-centric; Relay makes the ticket and project board the durable unit of work.
- Users need a repeatable way to turn rough ideas into well-scoped tickets before asking Codex to implement them.
- Users need visibility into the agent run attached to each ticket, including command approvals, file changes, failures, and final handoff notes.
- Users should not have to adopt a team issue tracker such as Linear, Jira, or GitHub Issues just to drive local Codex work.

Relay v1 is single-user, local-first, project-folder based, and desktop-only.

## 2. Goals and Non-Goals

### 2.1 Goals

- Provide an Electron + React desktop app for managing local projects in a sidebar.
- Let users add existing local folders as Relay projects.
- Store each project's authoritative board state inside the project's `.relay/` directory.
- Render a kanban board with default columns:
  - `Todo`
  - `In Progress`
  - `Needs Clarification`
  - `Not Doing`
  - `Completed`
- Let users create tickets manually or through a Codex-powered ticket drafting chat.
- Use Codex under the hood through `@openai/codex-sdk` in the Electron main process.
- Let users start and resume Codex execution sessions from a ticket.
- Persist Codex thread IDs and local run metadata so ticket work can continue across app restarts.
- Stream Codex progress into the ticket detail view.
- Surface approval prompts for command execution, file changes, network access, and other Codex-controlled actions when the SDK or app-server path exposes them.
- Warn clearly when a project is not a Git repository, Codex is unavailable, or Codex authentication is missing.
- Keep the architecture compatible with future direct Codex app-server JSON-RPC integration.

### 2.2 Non-Goals

- Relay v1 MUST NOT require Linear, GitHub Issues, Jira, or another hosted issue tracker.
- Relay v1 MUST NOT provide team accounts, cloud sync, comments from multiple users, or multi-tenant access control.
- Relay v1 MUST NOT run a background daemon that automatically picks up tickets without explicit user action.
- Relay v1 MUST NOT hide Codex command approvals or file-change approvals from the user.
- Relay v1 MUST NOT invent a full workflow engine. Columns and card state are enough for v1.
- Relay v1 SHOULD NOT require a project to be a Git repository, but it MUST warn that Codex works best inside Git workspaces.
- Relay v1 MUST NOT store OpenAI API keys, Codex auth tokens, or other secrets in `.relay/`.

## 3. Product Overview

### 3.1 Primary User

Relay v1 is designed for one developer working on multiple local projects. The user wants to:

- Track work per project.
- Convert vague ideas into implementable tickets.
- Ask Codex to work on one ticket at a time.
- Review progress and outcomes from a board-first UI.
- Keep all project planning artifacts local and portable.

### 3.2 Main Screens

Relay v1 has these screens:

1. `Project Sidebar`
   - Lists added local projects.
   - Shows project name, path, health badges, and active-run indicator.
   - Provides `Add Project`, `Remove From Sidebar`, and `Reveal in Finder`.

2. `Project Board`
   - Shows the selected project's columns.
   - Supports card creation, drag and drop, column filtering, and card search.
   - Shows ticket status, title, priority, labels, run status, and last updated time.

3. `Ticket Detail`
   - Opens as a side panel or modal from a board card.
   - Shows editable ticket markdown sections.
   - Shows metadata fields.
   - Provides `Start Codex`, `Resume Codex`, `Stop`, `Mark Completed`, and `Move` controls.
   - Shows the run console and final Codex handoff.

4. `Create Ticket`
   - Opens a chat-like drafting panel.
   - Accepts a rough idea from the user.
   - Asks Codex to produce a well-defined ticket using structured output.
   - Lets the user accept, edit, regenerate, or discard the draft.

5. `Settings`
   - App settings: Codex binary detection, inherited environment, model defaults, app theme.
   - Project settings: columns, default model, approval defaults, `.relay` health, and export/import actions.

### 3.3 Default Workflow

1. User opens Relay.
2. User adds a local folder as a project.
3. Relay creates `.relay/` if missing.
4. User clicks `Create Ticket`.
5. Relay opens a ticket drafting chat.
6. User describes the task.
7. Codex returns a structured ticket draft.
8. User accepts the ticket.
9. Relay writes `.relay/tickets/<ticket-id>.md`.
10. Ticket appears in `Todo`.
11. User opens the ticket and clicks `Start Codex`.
12. Relay starts a Codex thread in the project folder.
13. Relay streams Codex progress into the ticket detail view.
14. Relay persists the Codex thread ID and run metadata.
15. User reviews output and moves the card to `Completed`, `Needs Clarification`, or another column.

## 4. System Architecture

### 4.1 Technology Choices

Relay v1 MUST use:

- Electron for the desktop shell.
- React for the renderer UI.
- TypeScript across main, preload, renderer, and shared modules.
- `@openai/codex-sdk` for Codex integration in v1.
- A typed IPC layer between renderer and main process.
- Project-local `.relay/` files as the source of truth for board state.

Recommended implementation packages:

- Vite for renderer development.
- Electron Forge, electron-builder, or equivalent for packaging.
- Zod for runtime schema validation.
- A markdown/front matter parser for ticket files.
- A drag and drop library such as `@dnd-kit`.
- Vitest for unit tests.
- Playwright for Electron end-to-end tests.

### 4.2 Process Boundaries

The Electron main process MUST own:

- Filesystem reads and writes.
- Dialogs for choosing project folders.
- `.relay` initialization and migrations.
- Codex SDK lifecycle.
- Codex environment construction.
- Run log writes.
- Typed IPC handlers.
- Security checks that cannot be trusted to renderer code.

The React renderer MUST own:

- Project sidebar UI.
- Kanban board UI.
- Ticket editor UI.
- Ticket drafting chat UI.
- Run console UI.
- Approval prompts and decisions.
- User-facing error states.
- Drag and drop interactions.

The preload script MUST expose a minimal typed API. It MUST NOT expose unrestricted Node.js or filesystem primitives to the renderer.

### 4.3 Codex Integration Boundary

Relay MUST define a `CodexClient` abstraction. v1 MUST implement it with `@openai/codex-sdk`.

The abstraction exists so Relay can later replace or augment the SDK path with direct Codex app-server JSON-RPC for richer approval and event handling.

Minimal interface:

```ts
export type RelayCodexInput =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "local_image"; path: string }
    >;

export type RelayCodexThreadOptions = {
  projectPath: string;
  model?: string;
  approvalPolicy?: "untrusted" | "on-request" | "never";
  sandboxMode?: "read-only" | "workspace-write" | "danger-full-access";
  skipGitRepoCheck?: boolean;
};

export type RelayCodexRunOptions = {
  outputSchema?: Record<string, unknown>;
  effort?: "low" | "medium" | "high" | "xhigh";
};

export type RelayCodexEvent =
  | { type: "run.started"; runId: string; threadId: string }
  | { type: "agent.message.delta"; text: string }
  | { type: "agent.message.completed"; text: string }
  | { type: "command.started"; command: string; cwd?: string }
  | { type: "command.output"; stream: "stdout" | "stderr"; text: string }
  | { type: "command.completed"; status: "completed" | "failed" | "declined" }
  | { type: "file.change"; path: string; summary?: string }
  | { type: "approval.requested"; approvalId: string; kind: "command" | "file-change" | "network" | "other"; payload: unknown }
  | { type: "approval.resolved"; approvalId: string; decision: string }
  | { type: "run.completed"; finalResponse: string; usage?: unknown }
  | { type: "run.failed"; message: string; details?: unknown };

export interface CodexClient {
  createThread(options: RelayCodexThreadOptions): Promise<{ threadId: string }>;
  resumeThread(threadId: string, options: RelayCodexThreadOptions): Promise<{ threadId: string }>;
  runThread(
    threadId: string,
    input: RelayCodexInput,
    options: RelayCodexRunOptions,
  ): AsyncIterable<RelayCodexEvent>;
  cancelRun(runId: string): Promise<void>;
  submitApproval(approvalId: string, decision: RelayApprovalDecision): Promise<void>;
}
```

If the SDK does not expose a specific event or approval surface required by this interface, the v1 adapter MUST map available SDK events into this interface and mark unsupported approval types as `unsupported` in the run log. The application architecture MUST keep the renderer independent from SDK-specific event shapes.

### 4.4 Codex SDK Requirements

Relay MUST treat these Codex SDK facts as implementation constraints:

- The TypeScript SDK is server-side and requires Node.js 18 or later.
- The SDK wraps local Codex execution and is appropriate for internal tools and applications.
- Threads can be started, run repeatedly, and resumed by thread ID.
- Codex runs in a working directory; Relay MUST set the selected project folder as the working directory.
- Codex works best in Git repositories. Relay MAY allow non-Git folders only after warning the user.
- Structured output SHOULD be used for ticket drafting.
- Streaming SHOULD be used for user-visible execution progress.
- Relay MUST NOT rely on renderer-side Codex execution.

### 4.5 Future App-Server Compatibility

The Codex app-server protocol uses JSON-RPC-style messages for actions such as `thread/start`, `thread/resume`, and `turn/start`. It also supports notifications for thread, turn, item, command, file-change, and approval activity.

Relay v1 MAY use only `@openai/codex-sdk`, but the spec requires these compatibility rules:

- Internal run events MUST be normalized to Relay event types, not raw SDK or app-server event types.
- Stored ticket metadata MUST save `codexThreadId` but MUST NOT assume a specific Codex session file path.
- Approval UI MUST be generic enough to show command, file change, network, and other request types.
- The `CodexClient` interface MUST be the only renderer-facing Codex integration boundary.
- The app MUST be able to add an `AppServerCodexClient` later without changing ticket file formats.

## 5. Local-First Storage

### 5.1 Source of Truth

For each project, the project folder's `.relay/` directory is the source of truth.

Relay MAY maintain an app-level registry of known project paths, recent projects, sidebar ordering, and UI preferences. The app-level registry MUST NOT be required to reconstruct a project's board if the user adds the folder again on another machine.

### 5.2 Directory Layout

Relay MUST use this project-local layout:

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
      <ticket-id>/
        <file>
    backups/
      <timestamp>/
        project.json
        tickets/
```

Rules:

- `.relay/project.json` is REQUIRED.
- `.relay/tickets/` is REQUIRED.
- `.relay/runs/` is REQUIRED.
- `.relay/attachments/` is OPTIONAL in v1 but reserved.
- `.relay/backups/` is OPTIONAL and used before migrations or recovery operations.
- Relay MUST create missing required directories during initialization.

### 5.3 App-Level Registry

Relay MAY store an app-level registry outside project folders.

Recommended registry paths:

- macOS: `~/Library/Application Support/Relay/registry.json`
- Windows: `%APPDATA%\Relay\registry.json`
- Linux: `~/.config/Relay/registry.json`

Registry shape:

```json
{
  "schemaVersion": 1,
  "projects": [
    {
      "path": "/Users/example/Projects/my-website",
      "pinned": true,
      "lastOpenedAt": "2026-05-10T20:00:00.000Z",
      "sidebarPosition": 1000
    }
  ],
  "ui": {
    "lastProjectPath": "/Users/example/Projects/my-website",
    "theme": "system"
  }
}
```

The registry MUST be treated as a cache of known projects. If it is deleted, users can re-add folders and recover project boards from `.relay/`.

### 5.4 Project Metadata

`.relay/project.json` MUST use this schema in v1:

```json
{
  "schemaVersion": 1,
  "projectId": "prj_01HX0000000000000000000000",
  "name": "My Website",
  "createdAt": "2026-05-10T20:00:00.000Z",
  "updatedAt": "2026-05-10T20:00:00.000Z",
  "columns": [
    { "id": "todo", "name": "Todo", "position": 1000, "terminal": false },
    { "id": "in_progress", "name": "In Progress", "position": 2000, "terminal": false },
    { "id": "needs_clarification", "name": "Needs Clarification", "position": 3000, "terminal": false },
    { "id": "not_doing", "name": "Not Doing", "position": 4000, "terminal": true },
    { "id": "completed", "name": "Completed", "position": 5000, "terminal": true }
  ],
  "settings": {
    "defaultModel": null,
    "defaultApprovalPolicy": "on-request",
    "defaultSandboxMode": "workspace-write",
    "allowNonGitCodexRuns": false,
    "ticketDraftingEnabled": true,
    "codexExecutionEnabled": true
  }
}
```

Rules:

- `schemaVersion` MUST be an integer.
- `projectId` MUST be stable after initialization.
- `name` SHOULD default to the folder basename.
- Column IDs MUST be stable because ticket status references them.
- Column order MUST be sorted by numeric `position`.
- Terminal columns mark work that should not show active-run controls by default.
- Unknown settings MUST be ignored and preserved when possible.

### 5.5 Ticket Files

Each ticket MUST be stored as markdown with YAML front matter:

```markdown
---
schemaVersion: 1
id: tkt_01HX0000000000000000000000
title: Add contact form validation
status: todo
position: 1000
priority: medium
labels:
  - frontend
createdAt: 2026-05-10T20:00:00.000Z
updatedAt: 2026-05-10T20:00:00.000Z
codexThreadId: null
runStatus: idle
lastRunId: null
---

# Add contact form validation

## Context

Describe the product or codebase context needed to understand the task.

## Requirements

- Add client-side validation for required fields.
- Show useful validation messages.

## Acceptance Criteria

- Submitting an empty form shows validation messages.
- Valid submission still succeeds.

## Clarification Questions

- None.

## Implementation Notes

- Prefer existing form helpers if present.

## Codex Handoff

No Codex run has been started.
```

Required front matter fields:

- `schemaVersion`
- `id`
- `title`
- `status`
- `position`
- `priority`
- `labels`
- `createdAt`
- `updatedAt`
- `codexThreadId`
- `runStatus`
- `lastRunId`

Required markdown sections:

- `Context`
- `Requirements`
- `Acceptance Criteria`
- `Clarification Questions`
- `Implementation Notes`
- `Codex Handoff`

Rules:

- File names MUST be `<ticket-id>.md`.
- Ticket IDs MUST be globally unique enough for local use. ULID-style IDs prefixed with `tkt_` are RECOMMENDED.
- `status` MUST match an existing column ID in `.relay/project.json`.
- `position` MUST be numeric and sorted ascending within a column.
- Positions SHOULD be allocated in increments of 1000 and compacted when necessary.
- `priority` MUST be one of `low`, `medium`, `high`, or `urgent`.
- `runStatus` MUST be one of `idle`, `drafting`, `running`, `blocked`, `failed`, `completed`, or `cancelled`.
- Relay MUST preserve unknown front matter fields when rewriting a ticket.
- Relay MUST preserve user-authored markdown content when updating metadata.

### 5.6 Run Logs

Each Codex run attached to a ticket MUST create a JSONL file:

```text
.relay/runs/<ticket-id>/<run-id>.jsonl
```

Each line MUST be a JSON object:

```json
{
  "schemaVersion": 1,
  "timestamp": "2026-05-10T20:01:00.000Z",
  "ticketId": "tkt_01HX0000000000000000000000",
  "runId": "run_01HX0000000000000000000000",
  "threadId": "thr_123",
  "type": "agent.message.delta",
  "payload": {
    "text": "I will inspect the form component."
  }
}
```

Rules:

- Relay MUST append run events in chronological order.
- Relay MUST flush run log writes regularly so progress survives app crashes.
- Run logs SHOULD contain enough detail to reconstruct the visible run console.
- Run logs MUST NOT store API keys, bearer tokens, shell environment dumps, or secrets.
- Relay MAY redact obvious secret-like values from command output before storing logs.
- Final run state MUST be reflected both in the run log and in the ticket front matter.

### 5.7 Migrations

Relay MUST version all `.relay` file formats.

Migration rules:

- On opening a project with an older supported schema, Relay MUST create a backup before migrating.
- Backups MUST be written to `.relay/backups/<timestamp>/`.
- Migrations MUST be atomic where practical: write temp file, fsync or flush when available, then rename.
- If migration fails, Relay MUST keep the project read-only and show recovery guidance.
- Relay MUST reject future schema versions it does not understand and open the project read-only.

## 6. Board and Ticket Behavior

### 6.1 Project Initialization

When a user adds a folder:

1. Relay validates that the path exists and is a directory.
2. Relay checks whether `.relay/project.json` exists.
3. If missing, Relay asks for confirmation before initializing `.relay/`.
4. Relay creates required directories.
5. Relay writes default `project.json`.
6. Relay scans `.relay/tickets/*.md`.
7. Relay validates tickets and reports invalid files.
8. Relay adds the project to the app-level registry.
9. Relay opens the project board.

If the folder is not a Git repository:

- Relay MUST display a warning.
- Relay MUST allow board management.
- Relay MUST disable Codex execution by default unless `allowNonGitCodexRuns` is enabled or the user accepts a per-run warning.

### 6.2 Board Ordering

Cards MUST be grouped by `status` and sorted by `position`.

When moving a card:

- If moved within the same column, Relay updates `position`.
- If moved to a new column, Relay updates `status` and `position`.
- Relay MUST update `updatedAt`.
- Relay SHOULD use midpoint positioning between adjacent cards.
- Relay MUST compact positions if no midpoint is available.

### 6.3 Column Behavior

Default columns:

| ID | Name | Purpose |
| --- | --- | --- |
| `todo` | `Todo` | Work not started. |
| `in_progress` | `In Progress` | Work currently being executed or manually implemented. |
| `needs_clarification` | `Needs Clarification` | Work blocked by unresolved questions or missing decisions. |
| `not_doing` | `Not Doing` | Explicitly rejected or deferred work. |
| `completed` | `Completed` | Work accepted as done. |

Relay v1 MAY allow users to rename, reorder, add, or hide columns. Relay MUST NOT delete a column that still has tickets unless the user first chooses a target column for those tickets.

### 6.4 Ticket Editing

Relay MUST support:

- Editing ticket title.
- Editing markdown sections.
- Editing priority.
- Editing labels.
- Moving between columns.
- Deleting a ticket with confirmation.

Relay SHOULD support:

- Duplicate ticket.
- Copy ticket markdown.
- Reveal ticket file in Finder.

Relay MUST write ticket edits to the markdown file. There MUST NOT be a hidden database-only copy of ticket content.

### 6.5 Ticket Deletion

Deleting a ticket MUST be reversible by default.

Recommended behavior:

- Move ticket files to `.relay/trash/<timestamp>/<ticket-id>.md`.
- Keep run logs unless the user explicitly deletes associated run history.
- Offer `Undo` immediately after deletion.

Permanent deletion MAY be added later.

## 7. Codex Ticket Drafting

### 7.1 Drafting Goal

The `Create Ticket` flow turns a rough idea into a ticket with enough detail for either a human or Codex to implement.

The drafting flow MUST prioritize:

- Clear task title.
- Context.
- Requirements.
- Acceptance criteria.
- Known constraints.
- Clarification questions.
- Suggested labels and priority.

### 7.2 Drafting UX

The `Create Ticket` panel MUST:

- Let the user type a rough idea.
- Show Codex's draft response.
- Let the user edit the draft before saving.
- Let the user regenerate the draft.
- Let the user save without using Codex if Codex is unavailable.
- Show clear errors for missing authentication, SDK failure, or structured output validation failure.

The drafting panel SHOULD behave like a focused chat, but the durable output is a ticket file, not a long chat transcript.

### 7.3 Drafting Prompt

Relay MUST send Codex a prompt equivalent to:

```text
You are helping create a local software implementation ticket for Relay.

The user will provide a rough idea. Convert it into a clear, actionable ticket for a coding agent and human developer.

Return only data matching the requested schema. Do not implement the task.

Project path: <projectPath>
Project name: <projectName>
Current board columns: <columns>

User idea:
<userIdea>
```

Relay MAY include project context such as file tree snippets or README excerpts in a later version. v1 SHOULD avoid scanning large project contents during ticket drafting unless the user explicitly attaches context.

### 7.4 Drafting Structured Output

Relay SHOULD request structured output with this shape:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "title",
    "priority",
    "labels",
    "context",
    "requirements",
    "acceptanceCriteria",
    "clarificationQuestions",
    "implementationNotes"
  ],
  "properties": {
    "title": { "type": "string" },
    "priority": { "type": "string", "enum": ["low", "medium", "high", "urgent"] },
    "labels": { "type": "array", "items": { "type": "string" } },
    "context": { "type": "string" },
    "requirements": { "type": "array", "items": { "type": "string" } },
    "acceptanceCriteria": { "type": "array", "items": { "type": "string" } },
    "clarificationQuestions": { "type": "array", "items": { "type": "string" } },
    "implementationNotes": { "type": "array", "items": { "type": "string" } }
  }
}
```

If structured output fails validation:

- Relay MUST show the raw final response in an error detail section.
- Relay MAY allow the user to convert it manually into a ticket.
- Relay MUST NOT write an invalid ticket file without explicit user edits.

### 7.5 Saving Drafts

When a draft is accepted:

- Relay MUST create a new ticket ID.
- Relay MUST set `status` to `todo`.
- Relay MUST set `position` to the end of the `todo` column.
- Relay MUST set `runStatus` to `idle`.
- Relay MUST write the ticket markdown file.
- Relay MUST refresh the board.

## 8. Codex Ticket Execution

### 8.1 Execution Goal

Ticket execution asks Codex to work on a selected ticket in the selected project folder.

Relay MUST treat execution as an explicit user action. v1 MUST NOT automatically start execution just because a card enters `Todo` or `In Progress`.

### 8.2 Starting a Run

When the user clicks `Start Codex`:

1. Relay validates the project path.
2. Relay validates `.relay/project.json`.
3. Relay validates the ticket file.
4. Relay checks Codex availability.
5. Relay checks whether the project is a Git repository.
6. Relay warns or blocks according to project settings.
7. Relay creates or resumes a Codex thread.
8. Relay creates a `runId`.
9. Relay sets ticket `runStatus` to `running`.
10. Relay sets ticket `status` to `in_progress` unless the user disabled automatic movement.
11. Relay writes the run log header.
12. Relay starts streaming Codex events.

### 8.3 Execution Prompt

Relay MUST send Codex a prompt equivalent to:

```text
You are working inside the local project folder for this Relay ticket.

Follow the ticket exactly. Ask for clarification if the ticket is missing a required product or implementation decision.

Subagent guidance:
- Use subagents only when available and useful for this ticket; skip them for small or tightly coupled work where delegation adds overhead.
- Plan locally first, keep urgent blocking critical-path work local, and delegate only independent sidecar tasks that can run in parallel.
- Give each subagent a concrete bounded responsibility; for code-editing workers, assign disjoint file or module ownership and avoid duplicate delegation.
- Integrate subagent results before finalizing, and wait only when their result is needed.

Do not mark the ticket completed yourself. At the end, provide:
- Summary of changes made
- Files changed
- Commands run
- Tests run and their results
- Subagent usage: which subagents were launched, what they owned, what files they changed, how results were integrated, or "none used"
- Any remaining risks or follow-up work

Ticket:
<full ticket markdown>
```

Relay MUST provide this as prompt-level guidance only; Relay does not directly spawn, limit, or orchestrate subagents. Relay MAY prepend project-specific instructions in a future version, such as `.relay/WORKFLOW.md` or repository `AGENTS.md` content, but v1 MUST rely on Codex's normal project instruction discovery and the ticket prompt.

### 8.4 Thread Persistence

Relay MUST store Codex thread IDs in ticket front matter:

- `codexThreadId` stores the active or most recent Codex thread.
- `lastRunId` stores the last Relay run ID.

Rules:

- If `codexThreadId` is null, Relay starts a new thread.
- If `codexThreadId` is present, Relay resumes the thread by default.
- The user MAY choose `Start Fresh Thread`, which creates a new thread and overwrites `codexThreadId` only after the new thread starts successfully.
- Relay MUST NOT delete Codex's own persisted session files.
- Relay MUST survive app restart by using the stored thread ID.

### 8.5 Run State

Run state values:

| State | Meaning |
| --- | --- |
| `idle` | No run has started. |
| `drafting` | Ticket is being drafted by Codex. |
| `running` | Codex is actively working on the ticket. |
| `blocked` | Codex requested clarification or approval that has not been resolved. |
| `failed` | The run ended with an error. |
| `completed` | Codex completed its turn and produced a handoff. |
| `cancelled` | The user cancelled the active run. |

The board card MUST display run state.

### 8.6 Streaming and Run Console

The ticket detail view MUST show:

- Agent message deltas.
- Command start and completion events.
- Command output, collapsed by default after completion.
- File change summaries.
- Approval prompts.
- Final response.
- Errors.

Relay MUST append normalized events to the run log as they arrive.

The run console SHOULD support:

- Pause autoscroll.
- Copy output.
- Filter by event type.
- Collapse command output.

### 8.7 Approvals

Relay MUST surface approval requests to the user when Codex requests them.

Approval UI MUST show:

- Request type.
- Thread ID.
- Ticket title.
- Command or file path when available.
- Working directory when available.
- Reason when available.
- Available decisions.

Supported decisions:

- `accept`
- `acceptForSession`
- `decline`
- `cancel`

If Codex exposes a more specific decision shape, the `CodexClient` adapter MUST translate the UI decision into the underlying protocol decision.

Relay MUST NOT silently auto-approve destructive actions in v1.

### 8.8 Completion and Handoff

When a Codex run completes:

- Relay MUST set `runStatus` to `completed`.
- Relay MUST write `lastRunId`.
- Relay MUST append the final response to `Codex Handoff`.
- Relay SHOULD leave the card in `In Progress` until the user marks it completed.
- Relay MAY offer a `Mark Completed` button after a successful run.

If Codex asks for clarification:

- Relay SHOULD set `runStatus` to `blocked`.
- Relay SHOULD move the ticket to `Needs Clarification`.
- Relay MUST preserve the clarification request in `Codex Handoff`.

If the run fails:

- Relay MUST set `runStatus` to `failed`.
- Relay MUST show a retry/resume option.
- Relay MUST keep the run log.

## 9. IPC API

Relay MUST define typed IPC contracts shared between main, preload, and renderer.

### 9.1 Project IPC

```ts
type ProjectSummary = {
  projectId: string;
  name: string;
  path: string;
  exists: boolean;
  isGitRepository: boolean;
  relayInitialized: boolean;
  health: "ok" | "warning" | "error";
  healthMessages: string[];
  activeRunCount: number;
  lastOpenedAt?: string;
};

type AddProjectResult = {
  project: ProjectSummary;
  initialized: boolean;
};
```

Required channels:

| Channel | Direction | Description |
| --- | --- | --- |
| `projects:list` | renderer -> main | Return registered projects. |
| `projects:addFolder` | renderer -> main | Open folder picker, initialize or load project, add to registry. |
| `projects:removeFromSidebar` | renderer -> main | Remove path from app registry only. |
| `projects:read` | renderer -> main | Read one project summary and health. |
| `projects:revealInFinder` | renderer -> main | Reveal project folder in OS file manager. |

### 9.2 Board IPC

```ts
type BoardSnapshot = {
  project: ProjectSummary;
  columns: RelayColumn[];
  tickets: RelayTicketSummary[];
  invalidTickets: InvalidTicket[];
};
```

Required channels:

| Channel | Direction | Description |
| --- | --- | --- |
| `board:read` | renderer -> main | Read project columns and ticket summaries. |
| `board:updateColumns` | renderer -> main | Rename, reorder, add, or remove columns. |
| `board:repair` | renderer -> main | Attempt safe repair for known `.relay` issues. |

### 9.3 Ticket IPC

Required channels:

| Channel | Direction | Description |
| --- | --- | --- |
| `ticket:createDraft` | renderer -> main | Use Codex structured output to draft a ticket. |
| `ticket:createManual` | renderer -> main | Create an empty or user-authored ticket. |
| `ticket:read` | renderer -> main | Read one ticket markdown file. |
| `ticket:save` | renderer -> main | Save metadata and markdown content. |
| `ticket:move` | renderer -> main | Move ticket between or within columns. |
| `ticket:delete` | renderer -> main | Move ticket to trash with confirmation. |
| `ticket:duplicate` | renderer -> main | Duplicate ticket content into a new ticket. |
| `ticket:revealFile` | renderer -> main | Reveal ticket markdown file in OS file manager. |

### 9.4 Codex IPC

Required channels:

| Channel | Direction | Description |
| --- | --- | --- |
| `codex:status` | renderer -> main | Check SDK, CLI, auth, and model availability. |
| `codex:startRun` | renderer -> main | Start execution for a ticket. |
| `codex:resumeRun` | renderer -> main | Resume execution for a ticket thread. |
| `codex:cancelRun` | renderer -> main | Cancel active run. |
| `codex:approveAction` | renderer -> main | Resolve pending approval request. |
| `codex:runEvent` | main -> renderer | Push normalized Codex run event. |

The renderer MUST subscribe to `codex:runEvent` by project path, ticket ID, and run ID.

## 10. UI Requirements

### 10.1 Visual Direction

Relay should feel like a focused developer operations tool:

- Dense but readable.
- Fast to scan.
- Board-first, not marketing-first.
- Minimal decorative UI.
- Clear status indicators for Codex activity.
- Keyboard-accessible core workflows.

### 10.2 Sidebar

Sidebar requirements:

- Add project button.
- Search/filter projects.
- Project rows with name and path hint.
- Badge for missing folder.
- Badge for uninitialized `.relay`.
- Badge for active run.
- Context menu for remove, reveal, rename display name, and project settings.

Removing a project from the sidebar MUST NOT delete `.relay/`.

### 10.3 Board

Board requirements:

- One vertical column per project column.
- Horizontal scroll if columns exceed viewport.
- Drag cards within and across columns.
- Create ticket button visible from board.
- Empty states per column.
- Search/filter by title, label, and text.
- Card counts per column.

Card requirements:

- Title.
- Priority indicator.
- Labels.
- Run status indicator.
- Last updated relative time.
- Optional Codex thread indicator.

### 10.4 Ticket Detail

Ticket detail requirements:

- Editable title.
- Metadata controls.
- Markdown section editor.
- Preview mode.
- Run console.
- Codex controls.
- Save state indicator.
- Dirty-state protection before closing.

Ticket detail SHOULD support keyboard shortcuts for save and close.

### 10.5 Create Ticket

Create Ticket requirements:

- Rough idea text input.
- Drafting progress state.
- Generated draft preview.
- Manual edit before save.
- Regenerate.
- Save to board.
- Cancel.

If Codex is unavailable, the UI MUST offer manual ticket creation instead of dead-ending.

### 10.6 Approval Prompts

Approval prompts MUST be modal or pinned in a way that cannot be missed.

Approval prompt requirements:

- Show clear action summary.
- Show command/file details in monospace where relevant.
- Provide explicit accept/decline/cancel controls.
- Record decision in run log.

## 11. Security and Privacy

### 11.1 Local-First Security Posture

Relay v1 stores project data locally. It does not operate a Relay cloud service.

Relay MUST:

- Keep project board data in `.relay/`.
- Keep project registry local to the user's machine.
- Use Codex authentication through the local Codex environment.
- Avoid storing secrets in `.relay/`.
- Avoid sending project data to non-Codex services.

Relay SHOULD:

- Make it clear that Codex model requests may send prompt and project context to OpenAI according to the user's Codex configuration.
- Let users inspect the exact ticket prompt used for execution.
- Let users disable Codex drafting or execution per project.

### 11.2 Renderer Isolation

Electron security requirements:

- `contextIsolation` MUST be enabled.
- `nodeIntegration` MUST be disabled in renderer windows.
- Preload MUST expose only typed Relay APIs.
- IPC handlers MUST validate all renderer inputs.
- Project paths MUST be normalized and checked before filesystem operations.
- File operations MUST be limited to registered project paths and app registry paths.

### 11.3 Codex Permissions

Default v1 Codex settings:

- Approval policy: `on-request`.
- Sandbox mode: `workspace-write`.
- Working directory: selected project folder.
- Network access for agent shell commands: disabled unless the user explicitly enables it in Codex/project settings.

Relay MUST distinguish between:

- Network access required by Codex itself to call OpenAI services.
- Network access requested by agent-generated shell commands.

Relay MUST NOT silently grant the latter.

## 12. Error Handling and Recovery

### 12.1 Project Errors

Relay MUST handle:

- Missing project folder.
- Permission denied reading project folder.
- Missing `.relay/project.json`.
- Invalid project JSON.
- Unsupported schema version.
- Invalid ticket front matter.
- Duplicate ticket IDs.
- Ticket status referencing a missing column.

Errors MUST appear in project health and, where possible, offer repair actions.

### 12.2 Codex Errors

Relay MUST handle:

- Codex SDK package missing or failed to load.
- Codex CLI missing or incompatible.
- User not authenticated.
- Model unavailable.
- Context window exceeded.
- Usage limit exceeded.
- Network/API failure.
- Sandbox failure.
- Run cancellation.
- Approval declined.

Relay MUST keep failed run logs and show retry/resume options where safe.

### 12.3 File Write Failures

Relay MUST write files defensively:

- Validate data before writing.
- Write to temp file.
- Rename temp file into place.
- Preserve previous file on failure.
- Surface errors to the user.

## 13. Testing Requirements

### 13.1 Unit Tests

Unit tests MUST cover:

- `project.json` validation.
- Project initialization.
- Ticket markdown parse and serialize.
- Front matter preservation.
- Required markdown section detection.
- Board ordering.
- Card movement within a column.
- Card movement across columns.
- Position compaction.
- Schema version handling.
- App registry read/write.
- Corrupted file handling.

### 13.2 Codex Adapter Tests

Codex integration tests MUST use a mocked `CodexClient` by default.

Tests MUST cover:

- Ticket drafting success.
- Structured output validation failure.
- Draft save after manual edit.
- Start run with no existing thread.
- Resume run with existing thread.
- Thread ID persistence.
- Event streaming into run logs.
- Approval request and resolution.
- Run failure.
- Run cancellation.
- Final response appended to `Codex Handoff`.

### 13.3 Electron and UI Tests

Playwright or equivalent Electron tests SHOULD cover:

- Add a folder as a project.
- Initialize `.relay/`.
- Create a manual ticket.
- Create a Codex-drafted ticket with mocked Codex.
- Move card between columns.
- Open and edit ticket detail.
- Restart app and reload board from `.relay/`.
- Show missing folder state.
- Show invalid ticket state.
- Show approval prompt.

### 13.4 Manual Acceptance Tests

Before v1 release, manually verify:

- Fresh install with no projects.
- Existing project with no `.relay/`.
- Existing project with valid `.relay/`.
- Non-Git folder warning.
- Missing Codex authentication.
- Codex ticket drafting.
- Codex ticket execution.
- Approval prompt for a command or file change.
- Run failure and retry.
- App restart during or after a run.
- Project folder copied to another machine and re-added.

## 14. Release Milestones

### 14.1 Milestone 1: Local Board Foundation

Deliver:

- Electron + React shell.
- Project sidebar.
- Add folder.
- `.relay` initialization.
- Project registry.
- Board render.
- Manual ticket creation.
- Ticket markdown storage.
- Drag and drop status changes.

Exit criteria:

- User can manage tickets locally without Codex.
- Project can be removed from sidebar and re-added without losing board state.

### 14.2 Milestone 2: Codex Ticket Drafting

Deliver:

- `CodexClient` abstraction.
- SDK-backed drafting adapter.
- Structured output schema.
- Create Ticket drafting panel.
- Draft validation and save.
- Codex status checks.

Exit criteria:

- User can turn a rough idea into a valid ticket file through Codex.
- Manual fallback works when Codex is unavailable.

### 14.3 Milestone 3: Codex Ticket Execution

Deliver:

- Start/resume Codex run from ticket.
- Thread ID persistence.
- Run log JSONL.
- Streamed run console.
- Final handoff append.
- Failure states.

Exit criteria:

- User can run Codex against a ticket and resume that ticket after app restart.

### 14.4 Milestone 4: Approvals and Hardening

Deliver:

- Approval prompt UI.
- Event normalization improvements.
- Project health repair actions.
- Schema migration backup path.
- Electron security review.
- End-to-end test coverage.

Exit criteria:

- Relay is safe enough for daily local project use with explicit Codex action visibility.

## 15. Open Questions for Future Versions

These questions are intentionally out of scope for v1 implementation decisions:

- Should Relay support optional GitHub Issues sync?
- Should Relay support optional Linear sync?
- Should Relay support project templates?
- Should Relay support multiple boards per project?
- Should Relay support background automations?
- Should Relay expose direct Codex app-server controls for full thread history browsing?
- Should Relay provide a local web UI in addition to the desktop app?
- Should `.relay/` be committed to Git by default or ignored by default?

## 16. Source References

This specification is informed by:

- OpenAI Codex SDK documentation: https://developers.openai.com/codex/sdk
- OpenAI Codex app-server documentation: https://developers.openai.com/codex/app-server
- OpenAI Codex approvals and security documentation: https://developers.openai.com/codex/agent-approvals-security
- OpenAI Codex configuration reference: https://developers.openai.com/codex/config-reference
- Symphony service specification: https://raw.githubusercontent.com/openai/symphony/refs/heads/main/SPEC.md
