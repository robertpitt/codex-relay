/**
 * Branch state for an opened Git repository.
 */
import type { GitCommitSha } from "./GitRef";

export type GitBranch =
  | {
      readonly _tag: "NamedBranch";
      readonly name: string;
      readonly head: GitCommitSha | null;
    }
  | {
      readonly _tag: "DetachedHead";
      readonly head: GitCommitSha;
    }
  | {
      readonly _tag: "UnbornBranch";
      readonly name: string | null;
    };

export const namedBranch = (name: string, head: GitCommitSha | null): GitBranch => ({
  _tag: "NamedBranch",
  name,
  head
});

export const detachedHead = (head: GitCommitSha): GitBranch => ({
  _tag: "DetachedHead",
  head
});

export const unbornBranch = (name: string | null): GitBranch => ({
  _tag: "UnbornBranch",
  name
});
