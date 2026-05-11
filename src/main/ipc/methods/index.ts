import { boardIpcMethods } from "./board";
import { codexIpcMethods } from "./codex";
import { projectIpcMethods } from "./projects";
import { ticketIpcMethods } from "./tickets";

export const relayIpcMethods = [...projectIpcMethods, ...boardIpcMethods, ...ticketIpcMethods, ...codexIpcMethods] as const;
