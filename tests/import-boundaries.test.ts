import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourceEntries = [
  path.join(projectRoot, "src", "app"),
  path.join(projectRoot, "src", "config"),
  path.join(projectRoot, "src", "domain"),
  path.join(projectRoot, "src", "platform"),
  path.join(projectRoot, "src", "runtime"),
  path.join(projectRoot, "src", "services"),
  path.join(projectRoot, "src", "workflows"),
  path.join(projectRoot, "src", "http"),
  path.join(projectRoot, "src", "storage"),
  path.join(projectRoot, "src", "main.app.ts"),
  path.join(projectRoot, "src", "preload.app.ts")
];
const preloadAllowedImports = new Set(["electron"]);
const unstableWorkflowImportPattern =
  /(?:from\s+["']effect\/unstable\/workflow(?:\/[^"']*)?["']|import\s+["']effect\/unstable\/workflow(?:\/[^"']*)?["']|import\s*\(\s*["']effect\/unstable\/workflow(?:\/[^"']*)?["']\s*\)|require\s*\(\s*["']effect\/unstable\/workflow(?:\/[^"']*)?["']\s*\))/;
const codexLifecycleMapNames = [
  "activeImplementationRuns",
  "activeDraftRuns",
  "queuedRunIntents",
  "startingRuns",
  "projectSchedulers",
  "activeTicketUpdateRuns",
  "activeTicketUpdateRunsByTicket"
];

const sourceFiles = async (entryPath: string): Promise<string[]> => {
  const entryStat = await stat(entryPath);
  if (entryStat.isFile()) return /\.(ts|tsx)$/.test(entryPath) ? [entryPath] : [];

  const entries = await readdir(entryPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(entryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(absolutePath)));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name)) files.push(absolutePath);
  }
  return files;
};

const relativeSourcePath = (absolutePath: string): string => path.relative(projectRoot, absolutePath).split(path.sep).join("/");

test("backend Node, Electron, and unstable Workflow imports stay behind approved service boundaries", async () => {
  const files = (await Promise.all(sourceEntries.map(sourceFiles))).flat();
  const violations: string[] = [];

  for (const file of files) {
    const relativePath = relativeSourcePath(file);
    const content = await readFile(file, "utf8");
    const platformBoundary = relativePath.startsWith("src/platform/");
    const rawNodeIoBoundary = relativePath.startsWith("src/http/");
    const directNodeBoundary =
      rawNodeIoBoundary ||
      relativePath === "src/platform/ElectronApp.ts" ||
      relativePath === "src/main.app.ts" ||
      relativePath === "src/preload.app.ts";
    const rawFetchBoundary = relativePath === "src/platform/fetch.ts";
    const workRuntimeBoundary = relativePath.startsWith("src/services/work/runtime/");
    const workBoundary = relativePath.startsWith("src/services/work/");
    const electronBoundary =
      [
        "src/platform/BrowserWindows.ts",
        "src/platform/ElectronApp.ts",
        "src/platform/ElectronDialog.ts",
        "src/platform/ElectronShell.ts"
      ].includes(relativePath) || relativePath === "src/preload.app.ts";

    if (!rawNodeIoBoundary && /from\s+["'](?:node:fs|node:fs\/promises|fs\/promises|node:path|node:child_process|node:net|node:tls|net|tls)["']/.test(content)) {
      violations.push(`${relativePath}: raw Node IO import`);
    }
    if (!directNodeBoundary && /\bfrom\s+["']node:[^"']+["']/.test(content)) {
      violations.push(`${relativePath}: direct node:* import`);
    }
    if (!rawFetchBoundary && /(?:\bglobalThis\.fetch\s*\(|(^|[^\w.])fetch\s*\()/.test(content)) {
      violations.push(`${relativePath}: raw fetch call`);
    }
    if (!platformBoundary && /\bWebSocket\b/.test(content)) {
      violations.push(`${relativePath}: raw WebSocket usage`);
    }
    if (!rawNodeIoBoundary && /\bBuffer\b/.test(content)) {
      violations.push(`${relativePath}: direct Node Buffer usage`);
    }
    if (!electronBoundary && /^import\s+(?!type\b)[\s\S]*?from\s+["']electron["']/m.test(content)) {
      violations.push(`${relativePath}: direct Electron import`);
    }
    if (!workRuntimeBoundary && unstableWorkflowImportPattern.test(content)) {
      violations.push(
        `${relativePath}: production import from effect/unstable/workflow must stay behind src/services/work/runtime`
      );
    }
    if (workBoundary && /\bWorkflowEngine\.layerMemory\b/.test(content)) {
      violations.push(`${relativePath}: work production code must not use WorkflowEngine.layerMemory`);
    }
    if (workBoundary && /from\s+["'](?:\.\.\/)*codex(?:\/[^"']*)?["']/.test(content)) {
      violations.push(`${relativePath}: WorkEngine code must not import Codex services`);
    }
    if (relativePath === "src/services/codex/index.ts") {
      for (const name of codexLifecycleMapNames) {
        if (new RegExp(`\\bconst\\s+${name}\\s*=\\s*new\\s+Map\\b`).test(content)) {
          violations.push(`${relativePath}: Codex lifecycle map ${name} must live in WorkScheduler`);
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("production source does not reintroduce removed renderer/main transports", async () => {
  const files = (await Promise.all(sourceEntries.map(sourceFiles))).flat();
  const violations: string[] = [];
  const removedTransport = "r" + "pc";
  const removedElectronBridge = "i" + "pc";
  const forbiddenPatterns = [
    new RegExp(`effect\\/unstable\\/${removedTransport}`),
    new RegExp(`@shared\\/${removedTransport}`),
    new RegExp(`\\brelayR${removedTransport.slice(1)}\\b`),
    new RegExp(`\\bRelayR${removedTransport.slice(1)}\\b`),
    new RegExp(`\\bI${removedElectronBridge.slice(1)}MainRouter\\b`),
    new RegExp(`\\bRelayI${removedElectronBridge.slice(1)}\\b`),
    new RegExp(`relay:${removedTransport}`)
  ];

  for (const file of files) {
    const relativePath = relativeSourcePath(file);
    const content = await readFile(file, "utf8");
    if (forbiddenPatterns.some((pattern) => pattern.test(content))) {
      violations.push(`${relativePath}: removed renderer/main transport reference`);
    }
  }

  assert.deepEqual(violations, []);
});

test("preload imports stay limited to Electron preload-safe modules", async () => {
  const preloadPath = path.join(projectRoot, "src", "preload.app.ts");
  const content = await readFile(preloadPath, "utf8");
  const imports = [...content.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
  const violations = imports.filter((specifier) => !preloadAllowedImports.has(specifier));

  assert.deepEqual(violations, []);
});
