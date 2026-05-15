import type { Path } from "effect";

export const resolveProjectPath = (path: Path.Path, projectPath: string): string => path.resolve(projectPath);
export const projectRelayPath = (path: Path.Path, projectPath: string): string => path.join(resolveProjectPath(path, projectPath), ".relay");
export const projectConfigPath = (path: Path.Path, projectPath: string): string => path.join(projectRelayPath(path, projectPath), "project.json");
export const ticketsPath = (path: Path.Path, projectPath: string): string => path.join(projectRelayPath(path, projectPath), "tickets");
export const runsPath = (path: Path.Path, projectPath: string): string => path.join(projectRelayPath(path, projectPath), "runs");
export const workPath = (path: Path.Path, projectPath: string): string => path.join(projectRelayPath(path, projectPath), "work");
export const workRunsPath = (path: Path.Path, projectPath: string): string => path.join(workPath(path, projectPath), "runs");
export const workRunPath = (path: Path.Path, projectPath: string, workId: string): string =>
  path.join(workRunsPath(path, projectPath), workId);
export const workRunSnapshotPath = (path: Path.Path, projectPath: string, workId: string): string =>
  path.join(workRunPath(path, projectPath, workId), "snapshot.json");
export const workRunEventsPath = (path: Path.Path, projectPath: string, workId: string): string =>
  path.join(workRunPath(path, projectPath, workId), "events.jsonl");
export const workAuditLogPath = (path: Path.Path, projectPath: string): string =>
  path.join(workPath(path, projectPath), "audit.jsonl");
export const auditLogPath = (path: Path.Path, projectPath: string): string => path.join(projectRelayPath(path, projectPath), "audit.jsonl");
export const clarificationsPath = (path: Path.Path, projectPath: string): string =>
  path.join(projectRelayPath(path, projectPath), "clarifications");
export const trashPath = (path: Path.Path, projectPath: string): string => path.join(projectRelayPath(path, projectPath), "trash");
export const attachmentsPath = (path: Path.Path, projectPath: string): string =>
  path.join(projectRelayPath(path, projectPath), "attachments");
export const backupsPath = (path: Path.Path, projectPath: string): string => path.join(projectRelayPath(path, projectPath), "backups");
export const ticketPath = (path: Path.Path, projectPath: string, ticketId: string): string =>
  path.join(ticketsPath(path, projectPath), `${ticketId}.md`);
export const clarificationStorePath = (path: Path.Path, projectPath: string, ticketId: string): string =>
  path.join(clarificationsPath(path, projectPath), `${ticketId}.json`);
export const slashPath = (value: string): string => value.split(/[\\/]+/g).join("/");
