import clsx from "clsx";
import { AlertTriangle, Check, GitBranch, GitCommitHorizontal, Loader2 } from "lucide-react";
import type { ReactElement } from "react";
import type { GitMetadata } from "@shared/types";

export const loadingGitMetadata = (): GitMetadata => ({
  state: "loading",
  isGitRepository: false,
  branchName: null,
  isDetachedHead: false,
  commitSha: null,
  isDirty: false,
  changedFileCount: null,
  message: "Loading Git metadata.",
  error: null,
  updatedAt: new Date().toISOString()
});

const gitRefLabel = (metadata: GitMetadata): string | null => {
  if (metadata.branchName) return metadata.branchName;
  if (metadata.isDetachedHead && metadata.commitSha) return `detached ${metadata.commitSha}`;
  if (metadata.commitSha) return metadata.commitSha;
  return null;
};

export const gitMetadataLabel = (metadata: GitMetadata, compact = false): string => {
  if (metadata.state === "loading") return compact ? "Git..." : "Git loading";
  if (metadata.state === "not_git") return "No Git";
  if (metadata.state === "unavailable") return compact ? "Git unavailable" : "Git unavailable";
  if (metadata.state === "missing") return compact ? "Missing path" : "Project path missing";
  if (metadata.state === "error") return compact ? "Git error" : "Git error";

  const ref = gitRefLabel(metadata) ?? "Git";
  if (metadata.isDirty) {
    const count = metadata.changedFileCount ?? 0;
    return compact ? `${ref} · ${count} changed` : `${ref} · Dirty · ${count} changed`;
  }
  return compact ? `${ref} · clean` : `${ref} · Clean`;
};

const gitMetadataTitle = (metadata: GitMetadata): string => {
  if (metadata.error) return metadata.error;
  if (metadata.message) return metadata.message;
  return gitMetadataLabel(metadata);
};

function GitMetadataIcon({ metadata }: { metadata: GitMetadata }): ReactElement {
  if (metadata.state === "loading") return <Loader2 className="spin" size={13} />;
  if (metadata.state === "ready" && metadata.isDetachedHead) return <GitCommitHorizontal size={13} />;
  if (metadata.state === "ready" && !metadata.isDirty) return <Check size={13} />;
  if (metadata.state === "ready") return <GitBranch size={13} />;
  if (metadata.state === "not_git") return <GitBranch size={13} />;
  return <AlertTriangle size={13} />;
}

export function GitMetadataPill({
  metadata,
  compact = false
}: {
  metadata: GitMetadata;
  compact?: boolean;
}): ReactElement {
  return (
    <span
      className={clsx("git-metadata", `git-${metadata.state}`, metadata.isDirty && "dirty", compact && "compact")}
      title={gitMetadataTitle(metadata)}
      aria-label={`Git status: ${gitMetadataLabel(metadata)}`}
    >
      <GitMetadataIcon metadata={metadata} />
      <span>{gitMetadataLabel(metadata, compact)}</span>
    </span>
  );
}
