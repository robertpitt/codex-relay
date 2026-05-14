import { Context, Effect, Layer } from "effect";
import type { RendererRunEvent } from "@shared/schemas";
import { ElectronWindow, type ElectronMainWindowOptions, type ElectronWindowService } from "../../platform/electron";
import { logError } from "../logger";

export type RelayWindowService = {
  readonly createMain: () => Effect.Effect<void, unknown>;
  readonly ensureMain: () => Effect.Effect<void, unknown>;
  readonly revealOrCreateMain: () => Effect.Effect<void, unknown>;
  readonly activate: () => Effect.Effect<void, unknown>;
  readonly sendRunEvent: (event: RendererRunEvent) => Effect.Effect<void>;
  readonly destroyAll: () => Effect.Effect<void>;
};

export const RelayWindow = Context.Service<RelayWindowService>("relay/RelayWindow");

export const makeRelayWindowService = (electronWindow: ElectronWindowService): RelayWindowService => {
  const mainWindowOptions = (): ElectronMainWindowOptions => ({
    onRendererError: (scope, error) => {
      void logError(scope, "renderer failure", error);
    }
  });

  const service: RelayWindowService = {
    createMain: () => electronWindow.createMainWindow(mainWindowOptions()),
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
