import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectSidebar } from "../src/renderer/src/App";
import type { ProjectSummary } from "../src/shared/types";

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
  selectedPath: string | null = projectPath
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
      defaultExpandedProjectPaths={defaultExpandedProjectPaths}
    />
  );

test("project sidebar renders projects collapsed with an accessible disclosure control", () => {
  const markup = renderSidebar([project()], [], null);

  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /aria-label="Expand Sidebar Project swimlanes"/);
  assert.doesNotMatch(markup, /Review/);
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
