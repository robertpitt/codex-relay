import type { Path } from "effect";

export const resolveProjectPath = (path: Path.Path, projectPath: string): string => path.resolve(projectPath);
export const projectRelayPath = (path: Path.Path, projectPath: string): string => path.join(resolveProjectPath(path, projectPath), ".relay");
export const projectConfigPath = (path: Path.Path, projectPath: string): string => path.join(projectRelayPath(path, projectPath), "project.json");
export const ticketsPath = (path: Path.Path, projectPath: string): string => path.join(projectRelayPath(path, projectPath), "tickets");
export const runsPath = (path: Path.Path, projectPath: string): string => path.join(projectRelayPath(path, projectPath), "runs");
export const kernelPath = (path: Path.Path, projectPath: string): string => path.join(projectRelayPath(path, projectPath), "kernel");
export const kernelJobsPath = (path: Path.Path, projectPath: string): string => path.join(kernelPath(path, projectPath), "jobs");
export const kernelJobPath = (path: Path.Path, projectPath: string, executionId: string): string =>
  path.join(kernelJobsPath(path, projectPath), executionId);
export const kernelJobSnapshotPath = (path: Path.Path, projectPath: string, executionId: string): string =>
  path.join(kernelJobPath(path, projectPath, executionId), "snapshot.json");
export const kernelJobEventsPath = (path: Path.Path, projectPath: string, executionId: string): string =>
  path.join(kernelJobPath(path, projectPath, executionId), "events.jsonl");
export const kernelAuditLogPath = (path: Path.Path, projectPath: string): string =>
  path.join(kernelPath(path, projectPath), "audit.jsonl");
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
