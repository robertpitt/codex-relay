import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourceEntries = [
  path.join(projectRoot, "src", "domain"),
  path.join(projectRoot, "src", "platform"),
  path.join(projectRoot, "src", "io"),
  path.join(projectRoot, "src", "runtime"),
  path.join(projectRoot, "src", "services"),
  path.join(projectRoot, "src", "workflows"),
  path.join(projectRoot, "src", "ipc"),
  path.join(projectRoot, "src", "http"),
  path.join(projectRoot, "src", "storage"),
  path.join(projectRoot, "src", "main.app.ts"),
  path.join(projectRoot, "src", "preload.app.ts")
];
const preloadAllowedImports = new Set(["electron", "@platform/electron/Protocol", "@shared/schemas"]);
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

test("backend IO, Electron, and unstable Workflow imports stay behind approved service boundaries", async () => {
  const files = (await Promise.all(sourceEntries.map(sourceFiles))).flat();
  const violations: string[] = [];

  for (const file of files) {
    const relativePath = relativeSourcePath(file);
    const content = await readFile(file, "utf8");
    const platformBoundary = relativePath.startsWith("src/platform/");
    const rawNodeBoundary =
      platformBoundary ||
      relativePath.startsWith("src/http/") ||
      relativePath === "src/main.app.ts" ||
      relativePath === "src/preload.app.ts";
    const kernelBoundary = relativePath.startsWith("src/services/kernel/");
    const electronBoundary =
      relativePath.startsWith("src/platform/electron/") ||
      relativePath === "src/preload.app.ts";

    if (!platformBoundary && /from\s+["'](?:node:fs|node:fs\/promises|fs\/promises|node:path|node:child_process|node:net|node:tls|net|tls)["']/.test(content)) {
      violations.push(`${relativePath}: raw Node IO import`);
    }
    if (!rawNodeBoundary && /\bfrom\s+["']node:[^"']+["']/.test(content)) {
      violations.push(`${relativePath}: direct node:* import`);
    }
    if (!platformBoundary && /(?:\bglobalThis\.fetch\s*\(|(^|[^\w.])fetch\s*\()/.test(content)) {
      violations.push(`${relativePath}: raw fetch call`);
    }
    if (!platformBoundary && /\bWebSocket\b/.test(content)) {
      violations.push(`${relativePath}: raw WebSocket usage`);
    }
    if (!rawNodeBoundary && /\bBuffer\b/.test(content)) {
      violations.push(`${relativePath}: direct Node Buffer usage`);
    }
    if (!electronBoundary && /^import\s+(?!type\b)[\s\S]*?from\s+["']electron["']/m.test(content)) {
      violations.push(`${relativePath}: direct Electron import`);
    }
    if (!kernelBoundary && unstableWorkflowImportPattern.test(content)) {
      violations.push(
        `${relativePath}: production import from effect/unstable/workflow must stay behind src/services/kernel`
      );
    }
    if (kernelBoundary && /\bWorkflowEngine\.layerMemory\b/.test(content)) {
      violations.push(`${relativePath}: kernel production code must not use WorkflowEngine.layerMemory`);
    }
    if (relativePath === "src/services/codex/index.ts") {
      for (const name of codexLifecycleMapNames) {
        if (new RegExp(`\\bconst\\s+${name}\\s*=\\s*new\\s+Map\\b`).test(content)) {
          violations.push(`${relativePath}: Codex lifecycle map ${name} must live in KernelRunRegistry`);
        }
      }
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
