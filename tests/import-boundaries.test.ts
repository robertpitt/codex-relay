import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourceRoots = [path.join(projectRoot, "src", "main"), path.join(projectRoot, "src", "preload")];
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

const sourceFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
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
  const files = (await Promise.all(sourceRoots.map(sourceFiles))).flat();
  const violations: string[] = [];

  for (const file of files) {
    const relativePath = relativeSourcePath(file);
    const content = await readFile(file, "utf8");
    const ioBoundary = relativePath.startsWith("src/main/services/io/");
    const kernelBoundary = relativePath.startsWith("src/main/services/kernel/");
    const electronBoundary = relativePath.startsWith("src/main/electron/") || relativePath === "src/preload/index.ts";

    if (!ioBoundary && /from\s+["'](?:node:fs|node:fs\/promises|fs\/promises|node:path|node:child_process|node:net|node:tls|net|tls)["']/.test(content)) {
      violations.push(`${relativePath}: raw Node IO import`);
    }
    if (!ioBoundary && /\b(?:globalThis\.)?fetch\s*\(/.test(content)) {
      violations.push(`${relativePath}: raw fetch call`);
    }
    if (!ioBoundary && /\bWebSocket\b/.test(content)) {
      violations.push(`${relativePath}: raw WebSocket usage`);
    }
    if (!electronBoundary && /^import\s+(?!type\b)[\s\S]*?from\s+["']electron["']/m.test(content)) {
      violations.push(`${relativePath}: direct Electron import`);
    }
    if (!kernelBoundary && unstableWorkflowImportPattern.test(content)) {
      violations.push(
        `${relativePath}: production import from effect/unstable/workflow must stay behind src/main/services/kernel`
      );
    }
    if (kernelBoundary && /\bWorkflowEngine\.layerMemory\b/.test(content)) {
      violations.push(`${relativePath}: kernel production code must not use WorkflowEngine.layerMemory`);
    }
    if (relativePath === "src/main/services/codex/index.ts") {
      for (const name of codexLifecycleMapNames) {
        if (new RegExp(`\\bconst\\s+${name}\\s*=\\s*new\\s+Map\\b`).test(content)) {
          violations.push(`${relativePath}: Codex lifecycle map ${name} must live in KernelRunRegistry`);
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});
