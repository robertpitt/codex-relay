/**
 * Git reference value helpers.
 */
export type GitCommitSha = {
  readonly short: string;
};

export type GitRef = {
  readonly name: string;
};

export const GitCommitSha = (short: string): GitCommitSha => ({ short });
export const GitRef = (name: string): GitRef => ({ name });
