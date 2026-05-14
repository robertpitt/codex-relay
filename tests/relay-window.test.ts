import test from "node:test";
import assert from "node:assert/strict";
import { Effect } from "effect";
import type { RendererRunEvent } from "../src/shared/types";
import { makeRelayWindowService, type RelayWindowOptions } from "../src/services/window/RelayWindow";
import type { ElectronMainWindowOptions, ElectronWindowService } from "../src/platform/electron";

const options: RelayWindowOptions = {
  preloadPath: "/tmp/preload.js",
  rendererHtmlPath: "/tmp/index.html"
};

test("RelayWindow revealOrCreateMain creates when absent and focuses when present", async () => {
  let open = false;
  let created = 0;
  let focused = 0;
  let lastOptions: ElectronMainWindowOptions | undefined;
  const electronWindow: ElectronWindowService = {
    createMainWindow: (createOptions) =>
      Effect.sync(() => {
        created += 1;
        open = true;
        lastOptions = createOptions;
      }),
    hasOpenWindows: () => Effect.sync(() => open),
    focusMainWindow: () =>
      Effect.sync(() => {
        focused += 1;
      }),
    sendRunEvent: () => Effect.void,
    destroyAll: () =>
      Effect.sync(() => {
        open = false;
      })
  };

  const relayWindow = makeRelayWindowService(electronWindow);

  await Effect.runPromise(relayWindow.revealOrCreateMain(options));
  assert.equal(created, 1);
  assert.equal(focused, 0);
  assert.equal(lastOptions?.preloadPath, options.preloadPath);
  assert.equal(typeof lastOptions?.onRendererError, "function");

  await Effect.runPromise(relayWindow.revealOrCreateMain(options));
  assert.equal(created, 1);
  assert.equal(focused, 1);
});

test("RelayWindow sends run events through the desktop window target", async () => {
  const events: RendererRunEvent[] = [];
  const electronWindow: ElectronWindowService = {
    createMainWindow: () => Effect.void,
    hasOpenWindows: () => Effect.succeed(true),
    focusMainWindow: () => Effect.void,
    sendRunEvent: (event) =>
      Effect.sync(() => {
        events.push(event);
      }),
    destroyAll: () => Effect.void
  };

  const relayWindow = makeRelayWindowService(electronWindow);
  const event = {
    projectPath: "/tmp/project",
    ticketId: "T-1",
    runId: "run-1",
    type: "run.started",
    timestamp: "2026-05-11T00:00:00.000Z"
  } as RendererRunEvent;

  await Effect.runPromise(relayWindow.sendRunEvent(event));
  assert.deepEqual(events, [event]);
});
