import { projectEndpoints } from "@shared/http";
import { ProjectWorkflows } from "../../workflows";
import { route, type HttpResourceRoute } from "./types";

const gitMetadataOptionsFromQuery = (force: string | undefined): { readonly force?: boolean } => {
  if (force === undefined) return {};
  return { force: force === "true" || force === "1" };
};

export const projectRoutes = [
  route(projectEndpoints.list, () => ProjectWorkflows.listProjects()),
  route(projectEndpoints.addFolder, () => ProjectWorkflows.addProjectFolder()),
  route(projectEndpoints.addPath, (input) => ProjectWorkflows.addProjectPath(input)),
  route(projectEndpoints.removeFromSidebar, ({ projectPath }) => ProjectWorkflows.removeProjectFromSidebar(projectPath)),
  route(projectEndpoints.read, ({ projectPath }) => ProjectWorkflows.readProject(projectPath)),
  route(projectEndpoints.gitMetadata, ({ projectPath, force }) =>
    ProjectWorkflows.readProjectGitMetadata(projectPath, gitMetadataOptionsFromQuery(force))
  ),
  route(projectEndpoints.revealInFinder, ({ projectPath }) => ProjectWorkflows.revealProjectInFinder(projectPath)),
  route(projectEndpoints.openInEditor, (input) => ProjectWorkflows.openProjectInEditorWorkflow(input))
] satisfies ReadonlyArray<HttpResourceRoute>;
