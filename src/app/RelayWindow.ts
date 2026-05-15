import { Context, Effect, Layer } from "effect";
import { ElectronWindow, type ElectronMainWindowOptions, type ElectronWindowService } from "../platform";
import { logError } from "../runtime/Logging";

export type RelayWindowCreateOptions = {
  readonly apiBaseUrl: string;
  readonly apiToken: string;
};

export type RelayWindowService = {
  readonly createMain: (options?: RelayWindowCreateOptions) => Effect.Effect<void, unknown>;
  readonly ensureMain: () => Effect.Effect<void, unknown>;
  readonly revealOrCreateMain: () => Effect.Effect<void, unknown>;
  readonly activate: () => Effect.Effect<void, unknown>;
  readonly destroyAll: () => Effect.Effect<void>;
};

export const RelayWindow = Context.Service<RelayWindowService>("relay/RelayWindow");

export const makeRelayWindowService = (electronWindow: ElectronWindowService): RelayWindowService => {
  let lastCreateOptions: RelayWindowCreateOptions | null = null;

  const mainWindowOptions = (): ElectronMainWindowOptions => ({
    onRendererError: (scope, error) => {
      void logError(scope, "renderer failure", error);
    },
    apiBaseUrl: lastCreateOptions?.apiBaseUrl ?? "http://127.0.0.1:17654",
    apiToken: lastCreateOptions?.apiToken ?? "relay-dev"
  });

  const service: RelayWindowService = {
    createMain: (options) => {
      if (options) lastCreateOptions = options;
      return electronWindow.createMainWindow(mainWindowOptions());
    },
    ensureMain: () =>
      Effect.gen(function*() {
        if (yield* electronWindow.hasOpenWindows()) return;
        yield* service.createMain();
      }),
    revealOrCreateMain: () =>
      Effect.gen(function*() {
        if (yield* electronWindow.hasOpenWindows()) {
          yield* electronWindow.focusMainWindow();
          return;
        }
        yield* service.createMain();
      }),
    activate: () => service.revealOrCreateMain(),
    destroyAll: () => electronWindow.destroyAll()
  };

  return service;
};

export const RelayWindowLive = Layer.effect(
  RelayWindow,
  Effect.gen(function*() {
    const electronWindow = yield* ElectronWindow;
    return makeRelayWindowService(electronWindow);
  })
);
