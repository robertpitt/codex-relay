import { pathJoin, pathResolve } from "../io";

export const resolveProjectPath = (projectPath: string): string => pathResolve(projectPath);
export const projectRelayPath = (projectPath: string): string => pathJoin(resolveProjectPath(projectPath), ".relay");
export const projectConfigPath = (projectPath: string): string => pathJoin(projectRelayPath(projectPath), "project.json");
export const ticketsPath = (projectPath: string): string => pathJoin(projectRelayPath(projectPath), "tickets");
export const runsPath = (projectPath: string): string => pathJoin(projectRelayPath(projectPath), "runs");
export const auditLogPath = (projectPath: string): string => pathJoin(projectRelayPath(projectPath), "audit.jsonl");
export const clarificationsPath = (projectPath: string): string => pathJoin(projectRelayPath(projectPath), "clarifications");
export const trashPath = (projectPath: string): string => pathJoin(projectRelayPath(projectPath), "trash");
export const attachmentsPath = (projectPath: string): string => pathJoin(projectRelayPath(projectPath), "attachments");
export const backupsPath = (projectPath: string): string => pathJoin(projectRelayPath(projectPath), "backups");
export const ticketPath = (projectPath: string, ticketId: string): string => pathJoin(ticketsPath(projectPath), `${ticketId}.md`);
export const clarificationStorePath = (projectPath: string, ticketId: string): string =>
  pathJoin(clarificationsPath(projectPath), `${ticketId}.json`);
export const slashPath = (value: string): string => value.split(/[\\/]+/g).join("/");
