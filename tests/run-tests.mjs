import { spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(testsDir);
const outdir = path.join(os.tmpdir(), `relay-tests-${process.pid}`);
const entryPoints = [
  path.join(testsDir, "attachment-drop.test.ts"),
  path.join(testsDir, "agent-progress.test.tsx"),
  path.join(testsDir, "backend.test.ts"),
  path.join(testsDir, "clarification-panel.test.tsx"),
  path.join(testsDir, "create-ticket-mention-layout.test.ts"),
  path.join(testsDir, "electron-app-lifecycle.test.ts"),
  path.join(testsDir, "git-metadata.test.tsx"),
  path.join(testsDir, "import-boundaries.test.ts"),
  path.join(testsDir, "ipc-contract.test.ts"),
  path.join(testsDir, "keyboard-shortcuts.test.ts"),
  path.join(testsDir, "logger.test.ts"),
  path.join(testsDir, "markdown-block.test.tsx"),
  path.join(testsDir, "http-transport.test.ts"),
  path.join(testsDir, "project-sidebar.test.tsx"),
  path.join(testsDir, "renderer-query-hooks.test.tsx"),
  path.join(testsDir, "run-events.test.ts"),
  path.join(testsDir, "schemas.test.ts"),
  path.join(testsDir, "ticket-references.test.ts"),
  path.join(testsDir, "ticket-draft.test.ts"),
  path.join(testsDir, "ticket-suggestions.test.ts"),
  path.join(testsDir, "ticket-draft-ui.test.tsx"),
  path.join(testsDir, "ticket-update.test.ts")
];
const electronShimPlugin = {
  name: "electron-shim",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^electron$/ }, () => ({ path: "electron-shim", namespace: "electron-shim" }));
    pluginBuild.onLoad({ filter: /.*/, namespace: "electron-shim" }, () => ({
      contents: `
        const os = require("node:os");
        const shell = { showItemInFolder() {}, openPath: async () => "" };
        const app = { getPath: () => os.tmpdir() };
        module.exports = { app, shell, default: { app, shell } };
      `,
      loader: "js"
    }));
  }
};
const codexSdkShimPlugin = {
  name: "codex-sdk-shim",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^@openai\/codex-sdk$/ }, () => ({ path: "codex-sdk-shim", namespace: "codex-sdk-shim" }));
    pluginBuild.onLoad({ filter: /.*/, namespace: "codex-sdk-shim" }, () => ({
      contents: `
        class Codex {
          startThread() {
            throw new Error("Codex SDK is shimmed in tests; inject createCodexClient instead.");
          }
        }
        module.exports = { Codex };
      `,
      loader: "js"
    }));
  }
};

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await build({
  entryPoints,
  outdir,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  sourcemap: "inline",
  tsconfig: path.join(projectRoot, "tsconfig.json"),
  plugins: [electronShimPlugin, codexSdkShimPlugin]
});

const builtTests = entryPoints.map((entry) => path.join(outdir, `${path.basename(entry).replace(/\.(tsx|ts)$/, "")}.js`));
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...builtTests], {
  cwd: projectRoot,
  stdio: "inherit"
});

process.exit(result.status ?? 1);
