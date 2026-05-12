---
schemaVersion: 1
id: tkt_01krebs5x4av65p7pns4fw58jy
title: Clean up README for concise onboarding
ticketType: task
status: todo
position: 19000
priority: low
labels:
  - docs
  - readme
  - developer-experience
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T15:09:42.180Z'
updatedAt: '2026-05-12T15:47:45.742Z'
codexThreadId: null
runStatus: idle
lastRunId: null
lastRunStartedAt: null
---
# Clean up README for concise onboarding

## Context

The current README is accurate but dense. Clean it up into a clearer onboarding and developer reference document without changing application behavior or source code.

## Codebase Findings

- README.md:1-5 currently introduces Relay as a local-first Electron desktop app for managing software work as kanban cards and running Codex from those cards.
- README.md:7-20 has an 11-item Contents section; update it after restructuring so every anchor matches the final headings.
- README.md:40-46 references three screenshots: assets/front.png, assets/front-2.png, and assets/ticket.png. Those files exist in assets/.
- README.md:48-85 covers prerequisites and local setup: Node.js 18+, npm/package-lock.json, Git recommended, optional Codex CLI/auth, npm install, npm run dev, and initial project setup steps.
- README.md:97-111 documents environment and secrets: no .env is required, Codex auth comes from ~/.codex/auth.json, OPENAI_API_KEY, or CODEX_API_KEY, and secrets must not be committed to .relay, tickets, run logs, or source files.
- README.md:113-142 documents local file storage and Electron userData logs, including the project-local .relay structure and macOS log path.
- README.md:144-161 contains the Development Commands table and notes that package.json has no lint or format scripts.
- package.json:8-19 confirms the available npm scripts: dev, dev:logs, build, clean:dist, package:binary, dist, logs, logs:dev, preview, test, and typecheck.
- README.md:163-184 documents local distribution and GitHub Actions release behavior; .github/workflows/build-binary.yml:34-41 runs npm ci, npm test, and npm run dist, while .github/workflows/release-binary.yml:45-54 runs npm ci, npm test, and npm run dist with RELAY_RELEASE_VERSION.
- README.md:186-236 contains a long repository structure, backend map, and test map. tests/run-tests.mjs:11-29 confirms the current test entry points for backend, IPC, renderer helper, UI, draft, update, and run-event tests.
- README.md:238-265 contains development workflow guidance, process-boundary notes, and coding-agent handoff instructions. This is a cleanup target because it makes the README read like internal runbook content rather than concise onboarding docs.
- README.md:267-325 contains troubleshooting for missing Codex CLI, missing Codex auth, non-Git project Codex blocking, invalid ticket files, blank app windows/logs, and dependency/build failures.
- SPEC.md:15-27 describes the product framing: Relay is a local-first, desktop-only, single-user app whose durable unit of work is a project board ticket that can be drafted, refined, executed, resumed, and reviewed through Codex.
- No external URLs were supplied for this draft. The initial bounded research stopped after scanning 160 candidate files; follow-up targeted reads covered README.md, package.json, SPEC.md, workflow files, assets, and tests/run-tests.mjs.
- Inspected tests/git-metadata.test.tsx (Matched terms: create, clean; symbols: GitCommandRunner, createProjectPath, metadata, output).
- Inspected src/main/ipc/methods/tickets.ts (Matched terms: create; symbols: AnyRelayIpcMethod, ticketIpcMethods, parsed, resolvedProjectPath).
- Inspected src/main/services/codex/index.ts (Matched terms: create; symbols: CodexOptions, Input, Thread, ThreadEvent).
- Inspected src/main/window/RelayWindow.ts (Matched terms: create; symbols: ElectronMainWindowOptions, ElectronWindowService, RelayWindowOptions, RelayWindowService).
- Inspected src/preload/index.ts (Matched terms: create; symbols: RelayIpcArgs, RelayIpcChannel, RelayIpcResult, invoke).
- Inspected src/shared/ipc.ts (Matched terms: create; symbols: RelayIpcContract, RelayIpcChannel, RelayIpcArgs, RelayIpcResult).
- Research limitation: Code search stopped after scanning 160 candidate files.

## Requirements

- Update README.md only. Do not modify application source, package.json, workflows, screenshots, or generated .relay files for this cleanup.
- Make the first screen explain what Relay is, who it is for, and the core workflow in concise language.
- Keep the existing screenshot section and preserve the current local image paths unless a referenced file is intentionally renamed, which is out of scope for this task.
- Replace the current dense structure with a cleaner README flow: overview, screenshots, quick start, basic usage, Codex/auth and secrets, local data, development commands, build/release, developer map, troubleshooting.
- Keep all command references accurate against package.json:8-19 and explicitly avoid documenting lint/format commands because they do not exist today.
- Condense the repository structure, backend map, test map, and process-boundary guidance into a shorter developer map that points readers to SPEC.md for deeper product and architecture context.
- Retain the important safety and operational details: .relay storage, no secrets in committed files or run logs, Codex availability/auth requirements, non-Git Codex blocking, and log commands for runtime troubleshooting.
- Trim or remove agent-specific process guidance from README.md:252-257; keep only Relay-specific ticket handoff expectations if needed.
- Improve scannability by shortening repeated explanations, using consistent heading names, and keeping tables readable in GitHub Markdown.
- Do not introduce new product promises, unsupported setup paths, hosted services, or dependency requirements.

## Implementation Plan

- Rewrite the opening under # Relay into a short product description plus a small core-workflow list: add project, create/refine ticket, run or resume Codex, review outcome.
- Replace the Contents section with a shorter table of contents that exactly matches the final top-level headings.
- Keep the Showcase section near the top and preserve the three existing image references to assets/front.png, assets/front-2.png, and assets/ticket.png.
- Convert Prerequisites and Local Setup into a Quick Start section with the essential commands and a short optional Codex-auth subsection.
- Consolidate Environment Variables and Secrets plus Local Data and Services into focused sections that preserve auth sources, the secrets warning, the .relay directory shape, and app log location.
- Rebuild the Development Commands table from the package.json scripts confirmed in research, keeping the note that lint and format scripts are not currently defined.
- Condense Distribution into a Build and Release section covering npm run dist, artifact naming, RELAY_RELEASE_VERSION, and the two GitHub Actions workflows at a high level.
- Collapse Repository Structure, Backend Map, Test Map, and Development Workflow into a concise Developer Map that names the main directories, key entry points, test command, and SPEC.md as the deeper reference.
- Shorten Troubleshooting while preserving the existing issue coverage: Codex CLI missing, Codex auth missing, Codex blocked for non-Git projects, invalid ticket files, blank window/log capture, and build/dependency failures.
- Run a final pass over README.md for duplicate statements, stale anchors, overlong tables, and command accuracy.

## Test Plan

- Run `test -f assets/front.png && test -f assets/front-2.png && test -f assets/ticket.png` to verify the README image paths still resolve locally.
- Run `npm run typecheck` as a low-cost repository smoke check after the docs-only edit.
- Compare the README command table against package.json:8-19 and confirm every documented `npm run ...` command exists and no nonexistent lint/format script is introduced.
- Preview README.md in a Markdown renderer and verify headings, table formatting, fenced code blocks, local image rendering, and table-of-contents anchors.

## Acceptance Criteria

- README.md is the only source file changed for this ticket.
- The README is materially shorter and easier to scan, with no duplicate long-form architecture/test explanations that are better represented by SPEC.md or the source tree.
- The opening section quickly communicates Relay's purpose, target user, and core workflow.
- Quick start instructions work from a clean checkout and include npm install, optional Codex setup, npm run dev, and initial in-app project creation.
- All documented npm scripts match package.json, and the README still states that lint/format scripts are not currently defined.
- Local data, secrets, Codex auth, and troubleshooting guidance remain present and accurate.
- All local screenshot references render successfully.
- Markdown preview shows valid headings, anchors, tables, and code fences.

## Assumptions / Open Questions

- “Clean up the README” means improve clarity, structure, and accuracy, not change product behavior or add new features.
- README.md should remain the primary contributor onboarding document; deeper product and architecture detail can be referenced through SPEC.md rather than duplicated in full.
- The existing screenshots are current enough to keep; refreshing image assets is out of scope.
- A docs-only change does not require npm test or npm run build unless implementation changes files beyond README.md.

## Implementation Notes

- rg was not available in this environment, so targeted research used find, grep, sed, and nl.
- git status during drafting showed generated Relay draft/run metadata under .relay/ as modified or untracked; leave unrelated .relay files out of the implementation change unless the ticket workflow explicitly updates them.
- No dedicated Markdown lint or docs test script exists in package.json, so validation relies on command/path checks plus Markdown preview.

## Research Metadata

- File inspected: tests/git-metadata.test.tsx - Matched terms: create, clean; characters read: 6079; symbols: GitCommandRunner, createProjectPath, metadata, output, projectPath, execGit
  Matched lines:
  - 15: const createProjectPath = (): Promise<string> => mkdtemp(path.join(os.tmpdir(), "relay-git-metadata-"));
  - 25: message: "Working tree clean.",
  - 43: test("readGitMetadata reports a clean branch without a misleading change count", async () => {
- File inspected: src/main/ipc/methods/tickets.ts - Matched terms: create; characters read: 8237; symbols: AnyRelayIpcMethod, ticketIpcMethods, parsed, resolvedProjectPath, meta, saved
  Matched lines:
  - 17: createDraftInputSchema,
  - 18: epicSubticketCreateInputSchema,
  - 22: ticketCreateInputSchema,
- File inspected: src/main/services/codex/index.ts - Matched terms: create; characters read: 12000; symbols: CodexOptions, Input, Thread, ThreadEvent, ThreadItem, ThreadOptions
  Matched lines:
  - 11: type CreateDraftInput,
  - 24: type TicketCreateInput,
  - 54: createClarificationQuestions,
- File inspected: src/main/window/RelayWindow.ts - Matched terms: create; characters read: 2547; symbols: ElectronMainWindowOptions, ElectronWindowService, RelayWindowOptions, RelayWindowService, RelayWindow, makeRelayWindowService
  Matched lines:
  - 10: readonly createMain: (options: RelayWindowOptions) => Effect.Effect<void, unknown>;
  - 12: readonly revealOrCreateMain: (options: RelayWindowOptions) => Effect.Effect<void, unknown>;
  - 29: createMain: (options) => electronWindow.createMainWindow(withLogging(options)),
- File inspected: src/preload/index.ts - Matched terms: create; characters read: 4719; symbols: RelayIpcArgs, RelayIpcChannel, RelayIpcResult, invoke, api, wrapped
  Matched lines:
  - 6: CreateDraftInput,
  - 7: EpicSubticketCreateInput,
  - 16: TicketCreateInput,
- File inspected: src/shared/ipc.ts - Matched terms: create; characters read: 5470; symbols: RelayIpcContract, RelayIpcChannel, RelayIpcArgs, RelayIpcResult, relayIpcChannels, satisfies
  Matched lines:
  - 11: CreateDraftInput,
  - 12: EpicSubticketCreateInput,
  - 24: TicketCreateInput,
- Limitation: Code search stopped after scanning 160 candidate files.

## Codex Handoff

No Codex run has been started.
