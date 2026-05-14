import { Effect, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { HostRuntime, pathDirname, pathJoin } from "../../io";
import { BackendConfig, runBackendEffect } from "../../runtime";

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

export const resolveBundledCodexPath = (options: ResolveBundledCodexPathOptions = {}): string | null => {
  if (!options.platform || !options.arch || !options.resolvePackageJson) return null;
  const platform = options.platform;
  const arch = options.arch;
  const targetTriple = targetTripleForPlatform(platform, arch);
  if (!targetTriple) return null;

  const platformPackage = PLATFORM_PACKAGE_BY_TARGET[targetTriple];
  if (!platformPackage) return null;

  try {
    const codexPackageJsonPath = options.resolvePackageJson(`${CODEX_NPM_NAME}/package.json`);
    const platformPackageJsonPath = options.resolvePackageJson(`${platformPackage}/package.json`, codexPackageJsonPath);
    const codexBinaryName = platform === "win32" ? "codex.exe" : "codex";
    return pathJoin(pathDirname(platformPackageJsonPath), "vendor", targetTriple, "codex", codexBinaryName);
  } catch {
    return null;
  }
};

export const resolveBundledCodexPathEffect = (
  options: ResolveBundledCodexPathOptions = {}
) =>
  Effect.gen(function*() {
    const host = yield* HostRuntime;
    const runtime = options.platform && options.arch ? { platform: options.platform, arch: options.arch } : yield* host.platform;
    const targetTriple = targetTripleForPlatform(runtime.platform, runtime.arch);
    if (!targetTriple) return null;

    const platformPackage = PLATFORM_PACKAGE_BY_TARGET[targetTriple];
    if (!platformPackage) return null;

    return yield* Effect.gen(function*() {
      const codexPackageJsonPath = options.resolvePackageJson
        ? options.resolvePackageJson(`${CODEX_NPM_NAME}/package.json`)
        : yield* host.resolvePackageJson(`${CODEX_NPM_NAME}/package.json`);
      const platformPackageJsonPath = options.resolvePackageJson
        ? options.resolvePackageJson(`${platformPackage}/package.json`, codexPackageJsonPath)
        : yield* host.resolvePackageJson(`${platformPackage}/package.json`, codexPackageJsonPath);
      const codexBinaryName = runtime.platform === "win32" ? "codex.exe" : "codex";
      return pathJoin(pathDirname(platformPackageJsonPath), "vendor", targetTriple, "codex", codexBinaryName);
    }).pipe(Effect.catch(() => Effect.succeed(null)));
  });

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

export const resolveCodexCliCandidatesEffect = (
  options: ResolveCodexCliCandidatesOptions = {}
) =>
  Effect.gen(function*() {
    const pathCommand = options.pathCommand ?? CODEX_PATH_COMMAND;
    const bundledPath = yield* resolveBundledCodexPathEffect(options);
    const candidates: CodexCliCandidate[] = [];
    if (bundledPath) candidates.push({ source: "bundled", command: bundledPath });
    candidates.push({ source: "path", command: pathCommand });
    return candidates;
  });

const streamText = (stream: Stream.Stream<Uint8Array, unknown>): Effect.Effect<string, unknown> =>
  stream.pipe(Stream.decodeText(), Stream.mkString);

const codexVersionError = (
  command: string,
  exitCode: ChildProcessSpawner.ExitCode,
  stdout: string,
  stderr: string
): Error & { readonly exitCode: ChildProcessSpawner.ExitCode; readonly stdout: string; readonly stderr: string } =>
  Object.assign(new Error(`Codex CLI \`${command} --version\` exited with code ${exitCode}.`), {
    exitCode,
    stdout,
    stderr
  });

const runCodexVersionWithTimeoutEffect = (candidate: CodexCliCandidate, timeoutMs: number) =>
  Effect.scoped(
    Effect.gen(function*() {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(ChildProcess.make(candidate.command, ["--version"]));
      const output = yield* Effect.all({
        stdout: streamText(handle.stdout),
        stderr: streamText(handle.stderr),
        exitCode: handle.exitCode
      }, { concurrency: "unbounded" });

      if (output.exitCode !== ChildProcessSpawner.ExitCode(0)) {
        return yield* Effect.fail(codexVersionError(candidate.command, output.exitCode, output.stdout, output.stderr));
      }

      return output.stdout;
    })
  ).pipe(Effect.timeout(timeoutMs));

export const runCodexVersionEffect = (candidate: CodexCliCandidate) =>
  Effect.gen(function*() {
    const config = yield* BackendConfig;
    return yield* runCodexVersionWithTimeoutEffect(candidate, config.codexStatusTimeoutMs);
  });

export const runCodexVersion = async (candidate: CodexCliCandidate): Promise<string> => {
  const stdout = await runBackendEffect(runCodexVersionEffect(candidate));
  return stdout.trim();
};

export const resolveAvailableCodexCli = async (
  dependencies: ResolveAvailableCodexCliDependencies = {}
): Promise<CodexCliResolution | null> => {
  const candidates = dependencies.resolveCandidates?.() ?? (await runBackendEffect(resolveCodexCliCandidatesEffect()));
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
