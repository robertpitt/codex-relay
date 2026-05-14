/**
 * Lightweight working tree model used by Relay's Git metadata service.
 */
import type { GitWorkingTreeStatus } from "./GitStatus";

export type GitTree = {
  readonly projectPath: string;
  readonly status: GitWorkingTreeStatus;
};

export const GitTree = (projectPath: string, status: GitWorkingTreeStatus): GitTree => ({
  projectPath,
  status
});
