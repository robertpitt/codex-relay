import { Schema } from "effect";
import {
  addProjectResultSchema,
  gitMetadataSchema,
  projectOpenInEditorInputSchema,
  projectOpenInEditorResultSchema,
  projectSummarySchema
} from "../schemas";
import { arrayOf, defineEndpoint } from "./contract";
import {
  addProjectPathRequestSchema,
  projectGitMetadataQuerySchema,
  projectPathRequestSchema
} from "./common";

export const projectEndpoints = {
  list: defineEndpoint({
    method: "GET",
    path: "/api/projects",
    response: arrayOf(projectSummarySchema)
  }),
  addFolder: defineEndpoint({
    method: "POST",
    path: "/api/projects/select-folder",
    response: Schema.NullOr(addProjectResultSchema)
  }),
  addPath: defineEndpoint({
    method: "POST",
    path: "/api/projects",
    request: { location: "body", schema: addProjectPathRequestSchema },
    response: addProjectResultSchema
  }),
  removeFromSidebar: defineEndpoint({
    method: "DELETE",
    path: "/api/projects",
    request: { location: "query", schema: projectPathRequestSchema },
    response: arrayOf(projectSummarySchema)
  }),
  read: defineEndpoint({
    method: "GET",
    path: "/api/projects/summary",
    request: { location: "query", schema: projectPathRequestSchema },
    response: projectSummarySchema
  }),
  gitMetadata: defineEndpoint({
    method: "GET",
    path: "/api/projects/git-metadata",
    request: { location: "query", schema: projectGitMetadataQuerySchema },
    response: gitMetadataSchema
  }),
  revealInFinder: defineEndpoint({
    method: "POST",
    path: "/api/projects/reveal",
    request: { location: "body", schema: projectPathRequestSchema }
  }),
  openInEditor: defineEndpoint({
    method: "POST",
    path: "/api/projects/open-editor",
    request: { location: "body", schema: projectOpenInEditorInputSchema },
    response: projectOpenInEditorResultSchema
  })
} as const;
