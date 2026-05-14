import { ManagedRuntime } from "effect";
import { ElectronAppLive, ElectronDialogLive, ElectronIpcLive, ElectronShellLive, ElectronWindowLive } from "../platform/electron";
import { AtomicFileLive } from "../storage";
import { RelayWindowLive } from "../services/window/RelayWindow";
import { BackendLoggerLive, RelayEffectLoggerLive } from "../services/logger";
import { GitServiceLive } from "../services/git";
import { BackendKernelLive } from "../services/kernel";
import { RegistryStoreLive } from "../services/registry";
import { RunEventSinkLive } from "../services/run-events";
import { RelayRpcHandlersLive } from "../services/rpc/handlers";
import { StorageLive } from "../storage";
import { BackendServicesBaseLive, configureBackendRuntime, disposeBackendRuntime } from ".";
import { Layer } from "effect";
import { IoLive } from "../io";

const ElectronDesktopLive = Layer.mergeAll(
  ElectronAppLive,
  ElectronWindowLive,
  ElectronDialogLive,
  ElectronShellLive,
  ElectronIpcLive
);

export const AppLayerLive = Layer.mergeAll(
  BackendServicesBaseLive,
  IoLive,
  ElectronDesktopLive,
  RelayRpcHandlersLive,
  RelayWindowLive.pipe(Layer.provide(ElectronDesktopLive)),
  RelayEffectLoggerLive.pipe(Layer.provide(IoLive)),
  BackendLoggerLive,
  AtomicFileLive,
  GitServiceLive,
  RegistryStoreLive,
  BackendKernelLive,
  StorageLive.pipe(Layer.provide(BackendServicesBaseLive)),
  RunEventSinkLive
) as Layer.Layer<any, any, never>;

export const installAppRuntime = (): void => {
  configureBackendRuntime(ManagedRuntime.make(AppLayerLive));
  runtimeDisposed = false;
};

let runtimeDisposed = false;

export const disposeAppRuntime = async (): Promise<void> => {
  if (runtimeDisposed) return;
  runtimeDisposed = true;
  await disposeBackendRuntime();
};
