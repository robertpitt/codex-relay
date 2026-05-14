import { Schema } from "effect";
import { isoString, mutableArray, nonEmptyString, numberSchema, passthroughStruct, type SchemaType } from "./common";
import { themePreferenceSchema } from "./primitives";

export const appRegistrySchema = passthroughStruct({
  schemaVersion: Schema.Literal(1),
  projects: mutableArray(
    Schema.Struct({
      path: nonEmptyString,
      pinned: Schema.Boolean,
      lastOpenedAt: isoString,
      sidebarPosition: numberSchema
    })
  ),
  ui: Schema.Struct({
    lastProjectPath: Schema.NullOr(Schema.String),
    theme: themePreferenceSchema
  })
});
export type AppRegistry = SchemaType<typeof appRegistrySchema>;
