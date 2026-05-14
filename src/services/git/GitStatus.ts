/**
 * Parsing and models for `git status --porcelain=v1 -z`.
 */
export type GitFileStatus = {
  readonly stagedStatus: string;
  readonly unstagedStatus: string;
  readonly path: string;
  readonly originalPath?: string;
};

export type GitWorkingTreeStatus = {
  readonly changedFiles: readonly GitFileStatus[];
  readonly changedFileCount: number;
  readonly isDirty: boolean;
};

export const parsePorcelainStatus = (output: string): GitWorkingTreeStatus => {
  const records = output.split("\0").filter((record) => record.length > 0);
  const changedFiles: GitFileStatus[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.length < 3) continue;

    const stagedStatus = record[0];
    const unstagedStatus = record[1];
    const path = record.slice(3);
    const isRenameOrCopy = stagedStatus === "R" || stagedStatus === "C" || unstagedStatus === "R" || unstagedStatus === "C";
    const originalPath = isRenameOrCopy ? records[index + 1] : undefined;
    if (isRenameOrCopy) index += 1;

    changedFiles.push({
      stagedStatus,
      unstagedStatus,
      path,
      ...(originalPath ? { originalPath } : {})
    });
  }

  return {
    changedFiles,
    changedFileCount: changedFiles.length,
    isDirty: changedFiles.length > 0
  };
};

export const parsePorcelainChangedFileCount = (output: string): number => parsePorcelainStatus(output).changedFileCount;
