import { boardRoutes } from "./board";
import { codexRoutes } from "./codex";
import { projectRoutes } from "./projects";
import { ticketRoutes } from "./tickets";

export const httpResourceRoutes = [
  ...projectRoutes,
  ...boardRoutes,
  ...ticketRoutes,
  ...codexRoutes
] as const;

export * from "./types";
