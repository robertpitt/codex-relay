import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourceRoots = [path.join(projectRoot, "src", "main"), path.join(projectRoot, "src", "preload")];

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

test("backend IO and Electron imports stay behind approved service boundaries", async () => {
  const files = (await Promise.all(sourceRoots.map(sourceFiles))).flat();
  const violations: string[] = [];

  for (const file of files) {
    const relativePath = relativeSourcePath(file);
    const content = await readFile(file, "utf8");
    const ioBoundary = relativePath.startsWith("src/main/services/io/");
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
  }

  assert.deepEqual(violations, []);
});
