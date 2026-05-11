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
    { id: "todo", name: "Todo", position: 1000, ticketCount: 2 },
    { id: "review", name: "Review", position: 2000, ticketCount: 0 }
  ],
  ...patch
});

const renderSidebar = (projects: ProjectSummary[], defaultExpandedProjectPaths: string[] = []): string =>
  renderToStaticMarkup(
    <ProjectSidebar
      projects={projects}
      selectedPath={projectPath}
      gitMetadataByPath={{}}
      loading={false}
      onAdd={() => undefined}
      onSelect={() => undefined}
      onRemove={() => undefined}
      onReveal={() => undefined}
      defaultExpandedProjectPaths={defaultExpandedProjectPaths}
    />
  );

test("project sidebar renders projects collapsed with an accessible disclosure control", () => {
  const markup = renderSidebar([project()]);

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
  assert.match(markup, /aria-label="Todo: 2 tickets"/);
  assert.match(markup, /aria-label="Review: 0 tickets"/);
});
