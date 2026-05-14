import test from "node:test";
import assert from "node:assert/strict";
import { Effect, Layer } from "effect";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { Git, GitCliFromRunner, GitLive, GitMetadataCacheLive } from "../src/services/git";
import {
  parsePorcelainChangedFileCount,
  readGitMetadata,
  type GitCommandRunner
} from "../src/services/git";
import { BackendConfig, BackendConfigDefaults, runBackendEffect } from "../src/runtime";
import { GitMetadataPill } from "../src/renderer/src/components/GitMetadata";
import type { GitMetadata } from "../src/shared/schemas";

const createProjectPath = (): Promise<string> => mkdtemp(path.join(os.tmpdir(), "relay-git-metadata-"));

const metadata = (patch: Partial<GitMetadata>): GitMetadata => ({
  state: "ready",
  isGitRepository: true,
  branchName: "main",
  isDetachedHead: false,
  commitSha: "abc12345",
  isDirty: false,
  changedFileCount: 0,
  message: "Working tree clean.",
  error: null,
  updatedAt: "2026-05-11T10:00:00.000Z",
  ...patch
});

test("porcelain parser counts staged, unstaged, untracked, and renamed files once", () => {
  const output = [
    " M src/App.tsx",
    "M  src/main.app.ts",
    "?? src/new-file.ts",
    "R  src/new-name.ts",
    "src/old-name.ts"
  ].join("\0");

  assert.equal(parsePorcelainChangedFileCount(`${output}\0`), 4);
});

test("readGitMetadata reports a clean branch without a misleading change count", async () => {
  const projectPath = await createProjectPath();
  const execGit: GitCommandRunner = async (_projectPath, args) => {
    if (args.join(" ") === "rev-parse --is-inside-work-tree") return { stdout: "true\n", stderr: "" };
    if (args.join(" ") === "branch --show-current") return { stdout: "main\n", stderr: "" };
    if (args.join(" ") === "rev-parse --short=8 HEAD") return { stdout: "abc12345\n", stderr: "" };
    if (args.join(" ") === "status --porcelain=v1 -z --untracked-files=all") return { stdout: "", stderr: "" };
    throw new Error(`Unexpected git command: ${args.join(" ")}`);
  };

  const result = await readGitMetadata(projectPath, { execGit, now: () => "2026-05-11T10:00:00.000Z" });

  assert.equal(result.state, "ready");
  assert.equal(result.isGitRepository, true);
  assert.equal(result.branchName, "main");
  assert.equal(result.isDirty, false);
  assert.equal(result.changedFileCount, 0);
  assert.equal(result.message, "Working tree clean.");
});

test("readGitMetadata reports detached dirty repositories with a short commit SHA", async () => {
  const projectPath = await createProjectPath();
  const statusOutput = [" M src/App.tsx", "?? src/new-file.ts"].join("\0");
  const execGit: GitCommandRunner = async (_projectPath, args) => {
    if (args.join(" ") === "rev-parse --is-inside-work-tree") return { stdout: "true\n", stderr: "" };
    if (args.join(" ") === "branch --show-current") return { stdout: "\n", stderr: "" };
    if (args.join(" ") === "rev-parse --short=8 HEAD") return { stdout: "deadbeef\n", stderr: "" };
    if (args.join(" ") === "status --porcelain=v1 -z --untracked-files=all") return { stdout: `${statusOutput}\0`, stderr: "" };
    throw new Error(`Unexpected git command: ${args.join(" ")}`);
  };

  const result = await readGitMetadata(projectPath, { execGit, now: () => "2026-05-11T10:00:00.000Z" });

  assert.equal(result.state, "ready");
  assert.equal(result.branchName, null);
  assert.equal(result.isDetachedHead, true);
  assert.equal(result.commitSha, "deadbeef");
  assert.equal(result.isDirty, true);
  assert.equal(result.changedFileCount, 2);
});

test("readGitMetadata handles an unborn branch without failing the repository", async () => {
  const projectPath = await createProjectPath();
  const execGit: GitCommandRunner = async (_projectPath, args) => {
    if (args.join(" ") === "rev-parse --is-inside-work-tree") return { stdout: "true\n", stderr: "" };
    if (args.join(" ") === "branch --show-current") return { stdout: "main\n", stderr: "" };
    if (args.join(" ") === "rev-parse --short=8 HEAD") {
      throw Object.assign(new Error("fatal: ambiguous argument 'HEAD'"), {
        stderr: "fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree."
      });
    }
    if (args.join(" ") === "status --porcelain=v1 -z --untracked-files=all") return { stdout: "", stderr: "" };
    throw new Error(`Unexpected git command: ${args.join(" ")}`);
  };

  const result = await readGitMetadata(projectPath, { execGit, now: () => "2026-05-11T10:00:00.000Z" });

  assert.equal(result.state, "ready");
  assert.equal(result.isGitRepository, true);
  assert.equal(result.branchName, "main");
  assert.equal(result.commitSha, null);
  assert.equal(result.isDetachedHead, false);
});

test("readGitMetadata distinguishes not-git, missing-git, missing-path, and command failures", async () => {
  const projectPath = await createProjectPath();

  const notGit = await readGitMetadata(projectPath, {
    execGit: async () => {
      throw Object.assign(new Error("not a repository"), {
        stderr: "fatal: not a git repository (or any of the parent directories): .git"
      });
    },
    now: () => "2026-05-11T10:00:00.000Z"
  });
  assert.equal(notGit.state, "not_git");
  assert.equal(notGit.isGitRepository, false);

  const unavailable = await readGitMetadata(projectPath, {
    execGit: async () => {
      throw Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" });
    },
    now: () => "2026-05-11T10:00:00.000Z"
  });
  assert.equal(unavailable.state, "unavailable");

  const missing = await readGitMetadata(path.join(projectPath, "missing"), { now: () => "2026-05-11T10:00:00.000Z" });
  assert.equal(missing.state, "missing");

  const failed = await readGitMetadata(projectPath, {
    execGit: async (_projectPath, args) => {
      if (args.join(" ") === "rev-parse --is-inside-work-tree") return { stdout: "true\n", stderr: "" };
      throw Object.assign(new Error("status failed"), { stderr: "fatal: unable to read index" });
    },
    now: () => "2026-05-11T10:00:00.000Z"
  });
  assert.equal(failed.state, "error");
  assert.equal(failed.isGitRepository, true);
  assert.equal(failed.error, "fatal: unable to read index");
});

test("GitMetadataPill renders clean, dirty, detached, loading, and non-Git states", () => {
  const cleanMarkup = renderToStaticMarkup(<GitMetadataPill metadata={metadata({})} />);
  assert.match(cleanMarkup, /main · Clean/);
  assert.doesNotMatch(cleanMarkup, /0 changed/);

  const dirtyMarkup = renderToStaticMarkup(
    <GitMetadataPill metadata={metadata({ isDirty: true, changedFileCount: 3, message: "3 uncommitted file change(s)." })} />
  );
  assert.match(dirtyMarkup, /main · Dirty · 3 changed/);

  const detachedMarkup = renderToStaticMarkup(
    <GitMetadataPill metadata={metadata({ branchName: null, isDetachedHead: true, commitSha: "deadbeef" })} compact />
  );
  assert.match(detachedMarkup, /detached deadbeef · clean/);

  const loadingMarkup = renderToStaticMarkup(<GitMetadataPill metadata={metadata({ state: "loading", isGitRepository: false })} />);
  assert.match(loadingMarkup, /Git loading/);

  const notGitMarkup = renderToStaticMarkup(
    <GitMetadataPill metadata={metadata({ state: "not_git", isGitRepository: false, branchName: null, commitSha: null })} />
  );
  assert.match(notGitMarkup, /No Git/);
});

test("Git service opens repositories and caches metadata in a Ref-backed layer", async () => {
  const projectPath = await createProjectPath();
  let statusReads = 0;
  const execGit: GitCommandRunner = async (_projectPath, args) => {
    if (args.join(" ") === "rev-parse --is-inside-work-tree") return { stdout: "true\n", stderr: "" };
    if (args.join(" ") === "branch --show-current") return { stdout: "main\n", stderr: "" };
    if (args.join(" ") === "rev-parse --short=8 HEAD") return { stdout: "abc12345\n", stderr: "" };
    if (args.join(" ") === "status --porcelain=v1 -z --untracked-files=all") {
      statusReads += 1;
      return { stdout: "", stderr: "" };
    }
    throw new Error(`Unexpected git command: ${args.join(" ")}`);
  };
  const layer = Layer.mergeAll(
    GitLive,
    GitCliFromRunner(execGit),
    GitMetadataCacheLive,
    Layer.succeed(BackendConfig)({
      ...BackendConfigDefaults,
      gitMetadataCacheTtlMs: 60_000
    })
  );

  await runBackendEffect(
    Effect.provide(
      Effect.gen(function*() {
        const git = yield* Git;
        const repository = yield* git.open(projectPath);
        assert.equal(repository.projectPath, path.resolve(projectPath));

        const first = yield* git.readCachedMetadata(projectPath, { now: () => "2026-05-11T10:00:00.000Z" });
        const second = yield* git.readCachedMetadata(projectPath, { now: () => "2026-05-11T10:00:01.000Z" });
        assert.equal(first.commitSha, "abc12345");
        assert.equal(second.commitSha, "abc12345");

        const forced = yield* git.readCachedMetadata(projectPath, { force: true, now: () => "2026-05-11T10:00:02.000Z" });
        assert.equal(forced.commitSha, "abc12345");
      }),
      layer
    )
  );

  assert.equal(statusReads, 2);
});
