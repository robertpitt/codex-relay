import { boardSnapshotSchema } from "../schemas";
import { defineEndpoint } from "./contract";
import { projectPathRequestSchema } from "./common";

export const boardEndpoints = {
  read: defineEndpoint({
    method: "GET",
    path: "/api/board",
    request: { location: "query", schema: projectPathRequestSchema },
    response: boardSnapshotSchema
  })
} as const;
