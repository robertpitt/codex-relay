import { createRequire } from "node:module";
import { Effect } from "effect";
import { CommandExecutor, pathDirname, pathJoin } from "../io";
import { BackendConfig, runBackendEffect } from "../runtime";

export type CodexCliCandidateSource = "bundled" | "path";

export type CodexCliCandidate = {
  source: CodexCliCandidateSource;
  command: string;
};

export type CodexCliResolution = {
  candidate: CodexCliCandidate;
  version: string;
};

export type ResolvePackageJson = (specifier: string, fromPackageJsonPath?: string) => string;

export type ResolveBundledCodexPathOptions = {
  platform?: NodeJS.Platform;
  arch?: NodeJS.Architecture;
  resolvePackageJson?: ResolvePackageJson;
};

export type ResolveCodexCliCandidatesOptions = ResolveBundledCodexPathOptions & {
  pathCommand?: string;
};

export type ResolveAvailableCodexCliDependencies = {
  resolveCandidates?: () => readonly CodexCliCandidate[];
  runVersion?: (candidate: CodexCliCandidate) => Promise<string>;
};

const CODEX_NPM_NAME = "@openai/codex";
const CODEX_PATH_COMMAND = "codex";

const PLATFORM_PACKAGE_BY_TARGET: Record<string, string> = {
  "x86_64-unknown-linux-musl": "@openai/codex-linux-x64",
  "aarch64-unknown-linux-musl": "@openai/codex-linux-arm64",
  "x86_64-apple-darwin": "@openai/codex-darwin-x64",
  "aarch64-apple-darwin": "@openai/codex-darwin-arm64",
  "x86_64-pc-windows-msvc": "@openai/codex-win32-x64",
  "aarch64-pc-windows-msvc": "@openai/codex-win32-arm64"
};

export const targetTripleForPlatform = (platform: NodeJS.Platform, arch: NodeJS.Architecture): string | null => {
  switch (platform) {
    case "linux":
    case "android":
      switch (arch) {
        case "x64":
          return "x86_64-unknown-linux-musl";
        case "arm64":
          return "aarch64-unknown-linux-musl";
        default:
          return null;
      }
    case "darwin":
      switch (arch) {
        case "x64":
          return "x86_64-apple-darwin";
        case "arm64":
          return "aarch64-apple-darwin";
        default:
          return null;
      }
    case "win32":
      switch (arch) {
        case "x64":
          return "x86_64-pc-windows-msvc";
        case "arm64":
          return "aarch64-pc-windows-msvc";
        default:
          return null;
      }
    default:
      return null;
  }
};

const defaultResolvePackageJson: ResolvePackageJson = (specifier, fromPackageJsonPath) => {
  const requireFrom = fromPackageJsonPath ?? (typeof __filename === "string" ? __filename : import.meta.url);
  return createRequire(requireFrom).resolve(specifier);
};

export const resolveBundledCodexPath = (options: ResolveBundledCodexPathOptions = {}): string | null => {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const targetTriple = targetTripleForPlatform(platform, arch);
  if (!targetTriple) return null;

  const platformPackage = PLATFORM_PACKAGE_BY_TARGET[targetTriple];
  if (!platformPackage) return null;

  const resolvePackageJson = options.resolvePackageJson ?? defaultResolvePackageJson;
  try {
    const codexPackageJsonPath = resolvePackageJson(`${CODEX_NPM_NAME}/package.json`);
    const platformPackageJsonPath = resolvePackageJson(`${platformPackage}/package.json`, codexPackageJsonPath);
    const codexBinaryName = platform === "win32" ? "codex.exe" : "codex";
    return pathJoin(pathDirname(platformPackageJsonPath), "vendor", targetTriple, "codex", codexBinaryName);
  } catch {
    return null;
  }
};

export const resolveCodexCliCandidates = (options: ResolveCodexCliCandidatesOptions = {}): CodexCliCandidate[] => {
  const pathCommand = options.pathCommand ?? CODEX_PATH_COMMAND;
  const bundledPath = resolveBundledCodexPath(options);
  const candidates: CodexCliCandidate[] = [];
  if (bundledPath) {
    candidates.push({ source: "bundled", command: bundledPath });
  }
  candidates.push({ source: "path", command: pathCommand });
  return candidates;
};

export const runCodexVersion = async (candidate: CodexCliCandidate): Promise<string> => {
  const { stdout } = await runBackendEffect(
    Effect.gen(function*() {
      const config = yield* BackendConfig;
      return yield* CommandExecutor.use((executor) =>
        executor.execFile(candidate.command, ["--version"], { timeoutMs: config.codexStatusTimeoutMs })
      );
    })
  );
  return stdout.trim();
};

export const resolveAvailableCodexCli = async (
  dependencies: ResolveAvailableCodexCliDependencies = {}
): Promise<CodexCliResolution | null> => {
  const candidates = dependencies.resolveCandidates?.() ?? resolveCodexCliCandidates();
  const runVersion = dependencies.runVersion ?? runCodexVersion;

  for (const candidate of candidates) {
    try {
      const version = (await runVersion(candidate)).trim();
      return { candidate, version };
    } catch {
      // Try the next candidate.
    }
  }

  return null;
};
