import test from "node:test";
import assert from "node:assert/strict";
import { Effect } from "effect";
import { makeRelayWindowService } from "../src/app/RelayWindow";
import type { ElectronMainWindowOptions, ElectronWindowService } from "../src/platform";

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
    destroyAll: () =>
      Effect.sync(() => {
        open = false;
      })
  };

  const relayWindow = makeRelayWindowService(electronWindow);

  await Effect.runPromise(relayWindow.revealOrCreateMain());
  assert.equal(created, 1);
  assert.equal(focused, 0);
  assert.equal(typeof lastOptions?.onRendererError, "function");
  assert.equal(lastOptions?.apiBaseUrl, "http://127.0.0.1:17654");
  assert.equal(lastOptions?.apiToken, "relay-dev");

  await Effect.runPromise(relayWindow.revealOrCreateMain());
  assert.equal(created, 1);
  assert.equal(focused, 1);
});
