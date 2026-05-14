import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { openProjectInEditorFromHeader, ProjectEditorDropdown, ProjectSidebar } from "../src/renderer/src/App";
import type { ProjectEditorId, ProjectOpenInEditorInput, ProjectSummary } from "../src/shared/schemas";

const projectPath = "/tmp/relay-sidebar-project";

const project = (patch: Partial<ProjectSummary> = {}): ProjectSummary => ({
  projectId: "prj_sidebar",
  name: "Sidebar Project",
  path: projectPath,
  exists: true,
  isGitRepository: true,
  relayInitialized: true,
  health: "ok",
  healthMessages: [],
  activeRunCount: 0,
  swimlanes: [
    { id: "todo", name: "Todo", position: 1000, ticketCount: 2, activeRunCount: 0 },
    { id: "review", name: "Review", position: 2000, ticketCount: 0, activeRunCount: 0 }
  ],
  ...patch
});

const renderSidebar = (
  projects: ProjectSummary[],
  defaultExpandedProjectPaths: string[] = [],
  selectedPath: string | null = projectPath,
  toggleShortcutLabel = "Ctrl B"
): string =>
  renderToStaticMarkup(
    <ProjectSidebar
      projects={projects}
      selectedPath={selectedPath}
      loading={false}
      onAdd={() => undefined}
      onSelect={() => undefined}
      onRemove={() => undefined}
      onReveal={() => undefined}
      onToggleVisibility={() => undefined}
      toggleShortcutLabel={toggleShortcutLabel}
      defaultExpandedProjectPaths={defaultExpandedProjectPaths}
    />
  );

test("project sidebar renders projects collapsed with an accessible disclosure control", () => {
  const markup = renderSidebar([project()], [], null);

  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /aria-label="Expand Sidebar Project swimlanes"/);
  assert.doesNotMatch(markup, /Review/);
});

test("project sidebar heading exposes hide and add project controls", () => {
  const markup = renderSidebar([project()], [], null);

  assert.match(markup, /<aside id="project-sidebar" class="sidebar" aria-label="Projects">/);
  assert.match(markup, /class="sidebar-heading-actions"/);
  assert.match(markup, /aria-label="Hide sidebar \(Ctrl B\)"/);
  assert.match(markup, /title="Hide sidebar \(Ctrl B\)"/);
  assert.match(markup, /aria-controls="project-sidebar"/);
  assert.match(markup, /aria-expanded="true"/);
  assert.match(markup, /aria-keyshortcuts="Meta\+B Control\+B"/);
  assert.match(markup, /aria-label="Add project"/);
});

test("expanded project sidebar shows all swimlanes including zero-count lanes", () => {
  const markup = renderSidebar([project()], [projectPath]);

  assert.match(markup, /aria-expanded="true"/);
  assert.match(markup, /aria-label="Collapse Sidebar Project swimlanes"/);
  assert.match(markup, /Todo/);
  assert.match(markup, /Review/);
  assert.match(markup, /aria-label="Todo: 2 tasks"/);
  assert.match(markup, /aria-label="Review: 0 tasks"/);
});

test("expanded project sidebar marks swimlanes with active task runs", () => {
  const markup = renderSidebar(
    [
      project({
        activeRunCount: 1,
        swimlanes: [
          { id: "todo", name: "Todo", position: 1000, ticketCount: 1, activeRunCount: 0 },
          { id: "in_progress", name: "In Progress", position: 2000, ticketCount: 2, activeRunCount: 1 }
        ]
      })
    ],
    [projectPath]
  );

  assert.match(markup, /aria-label="In Progress: 2 tasks, 1 active task"/);
  assert.match(markup, /project-swimlane-row active/);
});

test("expanded project sidebar keeps long labels, counts, and active indicators renderable", () => {
  const longProjectName = "Sidebar Project With A Very Long Name That Should Truncate Without Losing Disclosure Labels";
  const longSwimlaneName = "Review Lane With A Very Long Name That Should Preserve Counts And Active Indicators";
  const markup = renderSidebar(
    [
      project({
        name: longProjectName,
        activeRunCount: 2,
        swimlanes: [
          {
            id: "long_review_lane",
            name: longSwimlaneName,
            position: 1000,
            ticketCount: 123,
            activeRunCount: 1
          }
        ]
      })
    ],
    [projectPath]
  );

  assert.ok(markup.includes(`aria-label="Collapse ${longProjectName} swimlanes, 2 active tasks"`));
  assert.ok(markup.includes(`aria-label="${longSwimlaneName}: 123 tasks, 1 active task"`));
  assert.match(markup, /project-folder-active/);
  assert.match(markup, /project-swimlane-active/);
  assert.match(markup, /class="project-swimlane-count" aria-hidden="true">123<\/span>/);
});

test("project header editor dropdown replaces raw path subtitle", () => {
  const markup = renderToStaticMarkup(<ProjectEditorDropdown projectPath={projectPath} onOpen={() => undefined} />);

  assert.match(markup, /aria-label="Open project in editor"/);
  assert.match(markup, /Open in editor/);
  assert.match(markup, /VS Code/);
  assert.match(markup, /Cursor/);
  assert.doesNotMatch(markup, new RegExp(projectPath));
  assert.doesNotMatch(markup, /project-header-path/);
});

test("project header open-in-editor handler sends editor id and active project path", async () => {
  const calls: ProjectOpenInEditorInput[] = [];

  const openInEditor = async (input: ProjectOpenInEditorInput) => {
    calls.push(input);
    return { ok: true } as const;
  };

  const toasts: unknown[] = [];
  const setToast = (toast: unknown): void => {
    toasts.push(toast);
  };
  await openProjectInEditorFromHeader(projectPath, "vscode", setToast, openInEditor);
  await openProjectInEditorFromHeader(projectPath, "cursor", setToast, openInEditor);

  assert.deepEqual(calls, [
    { projectPath, editorId: "vscode" },
    { projectPath, editorId: "cursor" }
  ]);
  assert.deepEqual(toasts, []);
});

test("project header open-in-editor handler shows returned failures as toast errors", async () => {
  const openInEditor = async (_input: ProjectOpenInEditorInput) => ({
    ok: false,
    message: "Relay could not open this project in Cursor."
  } as const);

  const toasts: unknown[] = [];
  await openProjectInEditorFromHeader(projectPath, "cursor" satisfies ProjectEditorId, (toast) => {
    toasts.push(toast);
  }, openInEditor);

  assert.deepEqual(toasts, [{ kind: "error", message: "Relay could not open this project in Cursor." }]);
});
