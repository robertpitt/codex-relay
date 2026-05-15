export * from "./auth";
export * from "./cors";
export * from "./json";
export * from "./types";

import { authMiddleware } from "./auth";
import { corsMiddleware } from "./cors";
import { jsonResponseMiddleware } from "./json";
import type { HttpMiddleware } from "./types";

export const defaultHttpMiddlewares = (): ReadonlyArray<HttpMiddleware> => [
  corsMiddleware(),
  authMiddleware(),
  jsonResponseMiddleware()
];
