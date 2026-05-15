import { boardEndpoints } from "@shared/http";
import { BoardWorkflows } from "../../workflows";
import { route, type HttpResourceRoute } from "./types";

export const boardRoutes = [
  route(boardEndpoints.read, ({ projectPath }) => BoardWorkflows.readBoard(projectPath))
] satisfies ReadonlyArray<HttpResourceRoute>;
