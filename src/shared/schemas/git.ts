import { Schema } from "effect";
import { isoString, numberSchema, passthroughStruct, type SchemaType } from "./common";

export const gitMetadataOptionsSchema = passthroughStruct({
  force: Schema.optional(Schema.Boolean)
});
export type GitMetadataOptions = SchemaType<typeof gitMetadataOptionsSchema>;

export const gitMetadataSchema = Schema.Struct({
  state: Schema.Literals(["loading", "ready", "not_git", "unavailable", "missing", "error"]),
  isGitRepository: Schema.Boolean,
  branchName: Schema.NullOr(Schema.String),
  isDetachedHead: Schema.Boolean,
  commitSha: Schema.NullOr(Schema.String),
  isDirty: Schema.Boolean,
  changedFileCount: Schema.NullOr(numberSchema),
  message: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
  updatedAt: isoString
});
export type GitMetadata = SchemaType<typeof gitMetadataSchema>;
export type GitMetadataState = GitMetadata["state"];
