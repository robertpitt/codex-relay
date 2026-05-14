import { Context, Effect, Layer } from "effect";
import type { RendererRunEvent } from "@shared/types";
import { ElectronWindow, type ElectronMainWindowOptions, type ElectronWindowService } from "../../platform/electron";
import { pathJoin } from "../../io";
import { logError } from "../logger";

export type RelayWindowOptions = Pick<ElectronMainWindowOptions, "preloadPath" | "rendererHtmlPath" | "rendererUrl">;

export type RelayWindowService = {
  readonly createMain: (options: RelayWindowOptions) => Effect.Effect<void, unknown>;
  readonly ensureMain: (options: RelayWindowOptions) => Effect.Effect<void, unknown>;
  readonly revealOrCreateMain: (options: RelayWindowOptions) => Effect.Effect<void, unknown>;
  readonly activate: (options: RelayWindowOptions) => Effect.Effect<void, unknown>;
  readonly sendRunEvent: (event: RendererRunEvent) => Effect.Effect<void>;
  readonly destroyAll: () => Effect.Effect<void>;
};

export const RelayWindow = Context.Service<RelayWindowService>("relay/RelayWindow");

export const makeRelayWindowService = (electronWindow: ElectronWindowService): RelayWindowService => {
  const withLogging = (options: RelayWindowOptions): ElectronMainWindowOptions => ({
    ...options,
    onRendererError: (scope, error) => {
      void logError(scope, "renderer failure", error);
    }
  });

  const service: RelayWindowService = {
    createMain: (options) => electronWindow.createMainWindow(withLogging(options)),
    ensureMain: (options) =>
      Effect.gen(function*() {
        if (yield* electronWindow.hasOpenWindows()) return;
        yield* service.createMain(options);
      }),
    revealOrCreateMain: (options) =>
      Effect.gen(function*() {
        if (yield* electronWindow.hasOpenWindows()) {
          yield* electronWindow.focusMainWindow();
          return;
        }
        yield* service.createMain(options);
      }),
    activate: (options) => service.revealOrCreateMain(options),
    sendRunEvent: (event) => electronWindow.sendRunEvent(event),
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

export const relayWindowPaths = (dirname: string, rendererUrl?: string): RelayWindowOptions => ({
  preloadPath: pathJoin(dirname, "../preload/index.mjs"),
  rendererHtmlPath: pathJoin(dirname, "../renderer/index.html"),
  rendererUrl
});
