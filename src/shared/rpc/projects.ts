import { Schema } from "effect";
import { Rpc } from "effect/unstable/rpc";
import {
  addProjectResultSchema,
  gitMetadataSchema,
  projectOpenInEditorInputSchema,
  projectOpenInEditorResultSchema,
  projectSummarySchema,
  relayRpcErrorSchema,
  type ProjectSummary
} from "../schemas";
import { arrayOf, gitMetadataPayload, projectPathPayload } from "./common";
import { relayRpcTags } from "./tags";

export class ProjectsList extends Rpc.make(relayRpcTags.projectsList, {
  success: arrayOf<ProjectSummary>(projectSummarySchema),
  error: relayRpcErrorSchema
}) {}

export class ProjectsAddFolder extends Rpc.make(relayRpcTags.projectsAddFolder, {
  success: Schema.NullOr(addProjectResultSchema),
  error: relayRpcErrorSchema
}) {}

export class ProjectsRemoveFromSidebar extends Rpc.make(relayRpcTags.projectsRemoveFromSidebar, {
  payload: projectPathPayload,
  success: arrayOf<ProjectSummary>(projectSummarySchema),
  error: relayRpcErrorSchema
}) {}

export class ProjectsRead extends Rpc.make(relayRpcTags.projectsRead, {
  payload: projectPathPayload,
  success: projectSummarySchema,
  error: relayRpcErrorSchema
}) {}

export class ProjectsGitMetadata extends Rpc.make(relayRpcTags.projectsGitMetadata, {
  payload: gitMetadataPayload,
  success: gitMetadataSchema,
  error: relayRpcErrorSchema
}) {}

export class ProjectsRevealInFinder extends Rpc.make(relayRpcTags.projectsRevealInFinder, {
  payload: projectPathPayload,
  success: Schema.Void,
  error: relayRpcErrorSchema
}) {}

export class ProjectsOpenInEditor extends Rpc.make(relayRpcTags.projectsOpenInEditor, {
  payload: projectOpenInEditorInputSchema,
  success: projectOpenInEditorResultSchema,
  error: relayRpcErrorSchema
}) {}
